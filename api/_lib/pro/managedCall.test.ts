// What binds hosted NoaCG Pro's money to its allowance, tested at the seam where the money is
// actually spent. `api/_lib/aiGenerate.test.ts` covers the endpoint's pre-existing gates; this
// covers the one that is new, and the deployment shapes it must NOT change.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { GatewayError } from '../aiGateway.js';
import { admitManagedProCall, proAllowanceEnforceable, settleManagedProCall } from './managedCall.js';
import { MemoryLiteGenerationStore } from '../aiLiteStore.js';
import { proProfile } from '../aiProProfile.js';
import { proTaskProfile } from '../aiTaskRegistry.js';
import { taskConfigured } from '../aiTaskRegistry.js';
import { PRO_MAX_GENERATION_COST_USD, PRO_STANDARD_ROUTES } from '../../../src/ai/pro/contract.js';
import type { AiGatewayRequestBody } from '../../../src/ai/modelTypes.js';

const ENV = [
  'AI_PRO_ENABLED',
  'AI_PRO_GATEWAY_PROVIDERS',
  'AI_LITE_GATEWAY_PROVIDERS',
  'AI_PRO_MAX_CALLS',
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'IP_HASH_SALT',
] as const;
const original = new Map(ENV.map((name) => [name, process.env[name]]));

beforeEach(() => {
  for (const name of ENV) delete process.env[name];
});

afterEach(() => {
  for (const name of ENV) {
    const value = original.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

/** Everything a real backend deployment needs for the allowance to be enforceable. */
function configureBackend(): void {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SECRET_KEY = 'server-secret';
  process.env.IP_HASH_SALT = 'a-salt-at-least-16-chars';
}

const PRO_BODY: AiGatewayRequestBody = {
  request: { system: 'You generate concepts.', messages: [{ role: 'user', content: 'a lower third' }], expect: 'image' },
  route: PRO_STANDARD_ROUTES.concept,
  surface: 'pro',
};

async function refusal(body: AiGatewayRequestBody, userId: string | null): Promise<GatewayError> {
  try {
    await admitManagedProCall(body, userId);
  } catch (error) {
    assert.ok(error instanceof GatewayError, 'the refusal should be a GatewayError');
    return error;
  }
  throw new assert.AssertionError({ message: 'the call was admitted when it should have been refused' });
}

// ── where the requirement binds, and where it deliberately does not ──────────────────────

test('a deployment with no accounts backend cannot enforce an allowance, and is left alone', () => {
  // A self-hosted box with a gateway key and no Supabase: there is nobody to hold an allowance
  // and nothing to hold it in. Requiring a reservation there would refuse every managed Pro
  // call on a machine whose operator owns both the key and the bill.
  assert.equal(proAllowanceEnforceable(), false);
});

test('a real backend deployment CAN enforce it, whether or not hosted Pro is switched on', () => {
  configureBackend();
  assert.equal(proAllowanceEnforceable(), true);
  // Deliberately independent of AI_PRO_ENABLED: on a deployment that can meter Pro spend,
  // UNMETERED Pro spend on the managed key is the tap this route exists to close.
  process.env.AI_PRO_ENABLED = '1';
  assert.equal(proAllowanceEnforceable(), true);
});

// ── the refusals, in the order they fire ─────────────────────────────────────────────────

test('hosted Pro switched off refuses the managed key and names the alternative', async () => {
  configureBackend();
  const error = await refusal(PRO_BODY, 'user-1');
  assert.equal(error.code, 'unavailable');
  assert.equal(error.status, 503);
  assert.match(error.message, /your own AI Gateway key/i);
});

test('an unauthenticated caller is refused before any route or ledger work', async () => {
  configureBackend();
  process.env.AI_PRO_ENABLED = '1';
  const error = await refusal(PRO_BODY, null);
  assert.equal(error.code, 'authentication_required');
  assert.equal(error.status, 401);
});

test('a route the profile does not fund is refused before it is billed', async () => {
  configureBackend();
  process.env.AI_PRO_ENABLED = '1';
  process.env.AI_PRO_GATEWAY_PROVIDERS = 'vertex';
  const error = await refusal(
    { ...PRO_BODY, route: { provider: 'vercel', model: 'somebody/uncatalogued-model' } },
    'user-1',
  );
  assert.equal(error.code, 'unavailable');
  assert.match(error.message, /not available for NoaCG Pro/i);
});

test('a managed Pro call with no reservation is refused', async () => {
  configureBackend();
  process.env.AI_PRO_ENABLED = '1';
  process.env.AI_PRO_GATEWAY_PROVIDERS = 'vertex';
  const error = await refusal(PRO_BODY, 'user-1');
  assert.equal(error.code, 'authentication_required');
  assert.equal(error.status, 403);
  assert.match(error.message, /must be started/i);
});

// ── the ledger arithmetic the ceiling rests on ───────────────────────────────────────────
//
// Driven through MemoryLiteGenerationStore, which implements the same contract migration
// 0044's RPCs do. The SQL side proves itself in that migration's own self-check; this proves
// the shape both implementations answer in, because the browser fallback store is what an
// offline evaluation run actually uses.

async function reservedPro(store: MemoryLiteGenerationStore, now: number): Promise<string> {
  const reservation = await store.reserve({
    userId: 'user-1',
    ipHash: 'ip',
    idempotencyKey: 'pro-0123456789abcdef',
    requestedCategory: null,
    now,
    profile: {
      id: 'pro',
      promptVersion: 'pro-hosted-v1',
      maxProviderCostUsd: PRO_MAX_GENERATION_COST_USD,
      dailyStarts: 3,
      monthlyStarts: 10,
      dailySuccesses: 2,
      monthlySuccesses: 8,
      maxConcurrentPerUser: 1,
      maxConcurrentFleet: 4,
      dailyFleetSpendUsd: 5,
      expiryMs: 900_000,
    },
  });
  assert.equal(reservation.status, 'created');
  return reservation.status === 'created' ? reservation.record.id : '';
}

test('the first settlement REPLACES the booked worst case; every later one adds', async () => {
  const store = new MemoryLiteGenerationStore();
  const now = Date.now();
  const id = await reservedPro(store, now);

  // Booked conservatively at the whole generation's ceiling, and admitted anyway - otherwise
  // the booking itself would refuse the first call.
  let admission = await store.admitProCall({
    generationId: id, userId: 'user-1', now, maxCalls: 4, generationCeilingUsd: 0.15,
  });
  assert.equal(admission.status, 'admitted');
  assert.equal(admission.spentUsd, 0.15);

  await store.recordProCall({ generationId: id, userId: 'user-1', costUsd: 0.07 });
  admission = await store.admitProCall({
    generationId: id, userId: 'user-1', now, maxCalls: 4, generationCeilingUsd: 0.15,
  });
  assert.equal(admission.status, 'admitted');
  assert.equal(admission.spentUsd, 0.07, 'the booking must be replaced, not added to');

  await store.recordProCall({ generationId: id, userId: 'user-1', costUsd: 0.01 });
  admission = await store.admitProCall({
    generationId: id, userId: 'user-1', now, maxCalls: 4, generationCeilingUsd: 0.15,
  });
  assert.equal(admission.spentUsd, 0.08);
});

test('a generation past its ceiling admits no further call', async () => {
  const store = new MemoryLiteGenerationStore();
  const now = Date.now();
  const id = await reservedPro(store, now);
  await store.recordProCall({ generationId: id, userId: 'user-1', costUsd: 0.2 });
  const admission = await store.admitProCall({
    generationId: id, userId: 'user-1', now, maxCalls: 9, generationCeilingUsd: 0.15,
  });
  assert.equal(admission.status, 'cost-ceiling');
});

test('the call cap bounds a reservation even when every call is cheap', async () => {
  const store = new MemoryLiteGenerationStore();
  const now = Date.now();
  const id = await reservedPro(store, now);
  for (let i = 0; i < 4; i += 1) {
    await store.recordProCall({ generationId: id, userId: 'user-1', costUsd: 0.001 });
  }
  const admission = await store.admitProCall({
    generationId: id, userId: 'user-1', now, maxCalls: 4, generationCeilingUsd: 0.15,
  });
  assert.equal(admission.status, 'call-limit');
});

test('an expired reservation and somebody else\'s answer without revealing which', async () => {
  const store = new MemoryLiteGenerationStore();
  const now = Date.now();
  const id = await reservedPro(store, now);
  const expired = await store.admitProCall({
    generationId: id, userId: 'user-1', now: now + 900_001, maxCalls: 4, generationCeilingUsd: 0.15,
  });
  assert.equal(expired.status, 'expired');
  const foreign = await store.admitProCall({
    generationId: id, userId: 'somebody-else', now, maxCalls: 4, generationCeilingUsd: 0.15,
  });
  assert.equal(foreign.status, 'not-found');
});

test('settlement is skipped entirely when the provider billed nothing accountable', async () => {
  const store = new MemoryLiteGenerationStore();
  const now = Date.now();
  const id = await reservedPro(store, now);
  // A call that threw has no ModelResult: the booking must SURVIVE, leaving the fleet
  // over-booked (safe) and the next call admissible (correct - nothing was spent).
  await settleManagedProCall({ ...PRO_BODY, proGenerationId: id }, 'user-1', null);
  const record = await store.get(id);
  assert.equal(record?.providerCostUsd, PRO_MAX_GENERATION_COST_USD);
  assert.equal(record?.attemptCount, 0);
});

// ── the registry gate, which is what stops an env repoint being billed ───────────────────

test('the Pro task fails closed without an audited provider allowlist, and opens with one', () => {
  process.env.AI_PRO_ENABLED = '1';
  assert.equal(taskConfigured(proTaskProfile(proProfile())), false);
  process.env.AI_PRO_GATEWAY_PROVIDERS = 'vertex';
  assert.equal(taskConfigured(proTaskProfile(proProfile())), true);
});

test('the concept IMAGE route is admitted as an image route and priced, not waved through', () => {
  process.env.AI_PRO_ENABLED = '1';
  process.env.AI_PRO_GATEWAY_PROVIDERS = 'vertex';
  const task = proTaskProfile(proProfile());
  // Declared, so the text-route rule does not refuse it...
  assert.deepEqual(task.routePolicy.imageRoutes, [PRO_STANDARD_ROUTES.concept]);
  // ...and still catalog-approved and priced, which is what the declaration does NOT waive.
  assert.ok(task.routePolicy.prices[`${PRO_STANDARD_ROUTES.concept.provider}:${PRO_STANDARD_ROUTES.concept.model}`]);
  // An UNDECLARED image route is still refused, so this cannot become a general exemption.
  const smuggled = {
    ...task,
    routePolicy: { ...task.routePolicy, primary: PRO_STANDARD_ROUTES.concept, imageRoutes: [] },
  };
  assert.equal(taskConfigured(smuggled), false);
});

test('the browser and the server hold a Pro generation to the SAME ceiling', () => {
  // Two enforcement points, one number. `src/ai/pro/pipeline.ts` refuses in the browser (a
  // cost control) and the ledger refuses on the server (a bound); a drift between them would
  // mean one of the two is decorative.
  process.env.AI_PRO_ENABLED = '1';
  assert.equal(proProfile().maxProviderCostUsd, PRO_MAX_GENERATION_COST_USD);
});
