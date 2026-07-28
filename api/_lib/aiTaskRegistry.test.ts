import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  APPROVED_MODEL_CATALOG,
  approvedModelEntry,
  approvedModelPrices,
  approvedModelRoute,
  modelRouteKey,
} from './aiModelCatalog.js';
import {
  LITE_TASK_ID,
  liteTaskProfile,
  taskConfigured,
  taskProfile,
  type TaskProfile,
} from './aiTaskRegistry.js';
import { liteProfile, liteProfileConfigured } from './aiLiteProfile.js';

const ENV = [
  'AI_LITE_ENABLED',
  'AI_LITE_PRIMARY_PROVIDER',
  'AI_LITE_PRIMARY_MODEL',
  'AI_LITE_FALLBACK_PROVIDER',
  'AI_LITE_FALLBACK_MODEL',
  'AI_LITE_OPENROUTER_PROVIDERS',
  'AI_LITE_PRICING_JSON',
  'AI_LITE_PROMPT_VERSION',
  'AI_LITE_SKIN_ENABLED',
  'AI_LITE_REQUIRE_ZDR',
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

test('the registry re-expresses Lite as the lite-design-spec task profile', () => {
  process.env.AI_LITE_PROMPT_VERSION = 'lite-test-v9';
  const task = taskProfile(LITE_TASK_ID);
  assert.equal(task.taskId, 'lite-design-spec');
  assert.equal(task.enabled, false); // AI_LITE_ENABLED defaults off - fail closed.
  assert.deepEqual(task.tiers, ['free']);
  assert.deepEqual(task.schema, { id: 'lite-ready-decision', version: 'lite-test-v9' });
  assert.deepEqual(task.ledger, { kind: 'ai_generations', profile: 'lite' });
  assert.equal(task.maxAttempts, 2);
  assert.equal(task.retryLimit, 0);
  assert.equal(task.limits.maxImages, 0);
  assert.equal(task.limits.maxImageResolution, null);
  assert.deepEqual(task.routePolicy.primary, { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' });
  assert.deepEqual(task.routePolicy.fallbacks, [{ provider: 'openrouter', model: 'qwen/qwen3-coder-next' }]);

  // The skin experiment widens the structured contract, and the schema ref says so.
  process.env.AI_LITE_SKIN_ENABLED = '1';
  assert.equal(taskProfile(LITE_TASK_ID).schema.id, 'lite-ready-decision-skin');
});

test('the configured default routes pass the registry gate', () => {
  process.env.AI_LITE_ENABLED = '1';
  process.env.AI_LITE_OPENROUTER_PROVIDERS = 'audited/provider';
  const task = liteTaskProfile();
  assert.equal(taskConfigured(task), true);

  // Without the OpenRouter endpoint allowlist the route config half fails closed,
  // exactly as liteProfileConfigured always has.
  delete process.env.AI_LITE_OPENROUTER_PROVIDERS;
  assert.equal(taskConfigured(liteTaskProfile()), false);
});

test('a free-tier route outside the approved catalog fails closed even when priced', () => {
  process.env.AI_LITE_ENABLED = '1';
  process.env.AI_LITE_OPENROUTER_PROVIDERS = 'audited/provider';
  process.env.AI_LITE_PRIMARY_PROVIDER = 'openrouter';
  process.env.AI_LITE_PRIMARY_MODEL = 'vendor/unapproved-model';
  process.env.AI_LITE_PRICING_JSON = JSON.stringify({
    'openrouter:vendor/unapproved-model': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  });
  const profile = liteProfile();
  // The pricing override satisfies the pre-registry check - the catalog is what refuses.
  assert.equal(liteProfileConfigured(profile), true);
  assert.equal(taskConfigured(liteTaskProfile(profile)), false);
});

test('BYO/paid tiers are not catalog-gated; free and anonymous are', () => {
  process.env.AI_LITE_OPENROUTER_PROVIDERS = 'audited/provider';
  process.env.AI_LITE_PRIMARY_PROVIDER = 'openrouter';
  process.env.AI_LITE_PRIMARY_MODEL = 'vendor/unapproved-model';
  process.env.AI_LITE_PRICING_JSON = JSON.stringify({
    'openrouter:vendor/unapproved-model': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  });
  const base = liteTaskProfile();
  const withTiers = (tiers: TaskProfile['tiers']): TaskProfile => ({ ...base, tiers });
  assert.equal(taskConfigured(withTiers(['byo'])), true);
  assert.equal(taskConfigured(withTiers(['paid'])), true);
  assert.equal(taskConfigured(withTiers(['free'])), false);
  assert.equal(taskConfigured(withTiers(['anonymous'])), false);
  // A mixed tier set still carries managed free spend, so the catalog still gates it.
  assert.equal(taskConfigured(withTiers(['free', 'byo'])), false);
});

test('free-tier route policy defaults to zero-data-retention routing', () => {
  // Stage 2 doctrine (plan §9): ZDR is the DEFAULT for every free task route. Turning
  // it off is an explicit, audited, per-task server decision - never a default.
  const task = liteTaskProfile();
  assert.ok(task.tiers.includes('free'));
  assert.equal(task.routePolicy.requireZdr, true);
  process.env.AI_LITE_REQUIRE_ZDR = '0';
  assert.equal(liteTaskProfile().routePolicy.requireZdr, false); // explicit opt-out honored
});

test('openWeights is preference metadata, never an approval gate', () => {
  const proprietary = approvedModelEntry({ provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' });
  assert.ok(proprietary);
  assert.equal(proprietary.openWeights, false);
  // A closed-weight entry is approved all the same (ratified plan §15 decision 1).
  assert.equal(approvedModelRoute(proprietary.route), true);

  const open = approvedModelEntry({ provider: 'openrouter', model: 'qwen/qwen3-coder-next' });
  assert.ok(open);
  assert.equal(open.openWeights, true);
  assert.equal(approvedModelRoute(open.route), true);

  assert.equal(approvedModelRoute({ provider: 'openrouter', model: 'vendor/unapproved-model' }), false);
});

test('every catalog entry is complete enough for the free-route policy to price it', () => {
  assert.ok(APPROVED_MODEL_CATALOG.length > 0);
  for (const entry of APPROVED_MODEL_CATALOG) {
    assert.ok(entry.capabilities.structuredOutput, `${entry.route.model} must decode structured output`);
    assert.ok(entry.capabilities.contextWindow > 0);
    assert.ok(entry.price.inputPerMillion >= 0 && entry.price.outputPerMillion >= 0);
    assert.ok(entry.zdrAvailable, `${entry.route.model} must honour the ZDR-by-default policy`);
    assert.ok(entry.notes.length > 0);
  }
});

test('the Lite price table is the catalog snapshot plus explicit env overrides', () => {
  const profile = liteProfile();
  for (const [key, price] of Object.entries(approvedModelPrices())) {
    assert.deepEqual(profile.prices[key], price, `${key} price mirrors the catalog`);
  }
  process.env.AI_LITE_PRICING_JSON = JSON.stringify({
    [modelRouteKey({ provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' })]:
      { inputPerMillion: 0.2, outputPerMillion: 0.8 },
  });
  const overridden = liteProfile();
  assert.deepEqual(
    overridden.prices['openrouter:google/gemini-2.5-flash-lite'],
    { inputPerMillion: 0.2, outputPerMillion: 0.8 },
  );
});
