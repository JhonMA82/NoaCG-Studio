import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  LITE_CATALOG,
  obviousUnsupportedDecision,
  validateLiteDecision,
} from '../../src/ai/liteContract.js';
import type { LiteGenerationRequest } from '../../src/ai/liteTypes.js';
import { liteProfile, liteProfileConfigured } from './aiLiteProfile.js';
import { liteLedgerConfigured, MemoryLiteGenerationStore } from './aiLiteStore.js';
import { readJson } from './http.js';

const ENV = [
  'AI_LITE_ENABLED',
  'AI_LITE_OPENROUTER_PROVIDERS',
  'AI_LITE_DAILY_STARTS',
  'AI_LITE_DAILY_SUCCESSES',
  'AI_LITE_FLEET_DAILY_SPEND_USD',
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
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

const request = (): LiteGenerationRequest => ({
  idempotencyKey: 'test-idempotency-key-0001',
  prompt: 'A clean public-news lower third.',
  resolution: { width: 1920, height: 1080 },
  fps: 50,
});

test('Lite profile is disabled and OpenRouter routing fails closed by default', () => {
  const profile = liteProfile();
  assert.equal(profile.enabled, false);
  assert.equal(liteProfileConfigured(profile), false);
  process.env.AI_LITE_ENABLED = '1';
  process.env.AI_LITE_OPENROUTER_PROVIDERS = 'audited/provider';
  const configured = liteProfile();
  assert.equal(configured.enabled, true);
  assert.equal(liteProfileConfigured(configured), true);
  assert.equal(configured.maxAttempts, 2);
  assert.equal(configured.maxProviderCostUsd, 0.007);
});

test('managed Lite requires a durable server ledger and private IP-hash salt', () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'server-secret';
  assert.equal(liteLedgerConfigured(), false);

  process.env.IP_HASH_SALT = 'a-private-salt-at-least-sixteen-characters';
  assert.equal(liteLedgerConfigured(), true);
});

test('request JSON limits reject declared and streamed oversize bodies', async () => {
  const declared = new Request('https://noacg.test/api/ai/lite/generations', {
    method: 'POST',
    headers: { 'content-length': '1000' },
    body: '{}',
  });
  await assert.rejects(() => readJson(declared, 10), { code: 'too_large' });

  const streamed = new Request('https://noacg.test/api/ai/lite/generations', {
    method: 'POST',
    body: JSON.stringify({ value: 'x'.repeat(100) }),
  });
  await assert.rejects(() => readJson(streamed, 20), { code: 'too_large' });
});

test('obviously unsupported requests are rejected before model inference', () => {
  assert.deepEqual(
    obviousUnsupportedDecision('Build a package of multiple graphics with a branching state machine')?.status,
    'unsupported',
  );
  assert.equal(obviousUnsupportedDecision('A minimal university lower third'), null);
});

test('Lite accepts only a semantically matching allowlisted catalog spec', () => {
  const entry = LITE_CATALOG[0];
  const valid = {
    status: 'ready',
    unsupportedCode: '',
    message: '',
    suggestedBrief: '',
    aiCategory: entry.aiCategory,
    spec: {
      fit: 'catalog',
      reason: 'The type and chassis match.',
      name: 'Public News Strap',
      summary: 'A clear editorial lower third.',
      category: entry.category,
      variantId: entry.variantId,
      lines: [{ title: 'Name', sample: 'Amina Okafor' }, { title: 'Role', sample: 'Reporter' }],
      flourish: '',
    },
  };
  const result = validateLiteDecision(valid, request());
  assert.deepEqual(result.errors, []);
  assert.equal(result.decision?.status, 'ready');

  const malformed = structuredClone(valid);
  malformed.spec.variantId = 'not-allowed';
  assert.deepEqual(validateLiteDecision(malformed, request()).errors, ['variant_not_allowed']);
});

test('memory ledger enforces idempotency, concurrency, and successful-generation allowances', async () => {
  process.env.AI_LITE_OPENROUTER_PROVIDERS = 'audited/provider';
  process.env.AI_LITE_DAILY_STARTS = '2';
  process.env.AI_LITE_DAILY_SUCCESSES = '1';
  const profile = liteProfile();
  const store = new MemoryLiteGenerationStore();
  const now = Date.now();
  const first = await store.reserve({
    userId: 'user-1',
    ipHash: 'ip-hash',
    idempotencyKey: 'key-1',
    requestedCategory: 'lower-third',
    now,
    profile,
  });
  assert.equal(first.status, 'created');
  if (first.status !== 'created') return;

  const duplicate = await store.reserve({
    userId: 'user-1',
    ipHash: 'ip-hash',
    idempotencyKey: 'key-1',
    requestedCategory: 'lower-third',
    now,
    profile,
  });
  assert.equal(duplicate.status, 'duplicate');

  const concurrent = await store.reserve({
    userId: 'user-1',
    ipHash: 'ip-hash',
    idempotencyKey: 'key-2',
    requestedCategory: 'ticker',
    now,
    profile,
  });
  assert.equal(concurrent.status, 'user-concurrency');

  await store.update(first.record.id, { status: 'usable' });
  const exhausted = await store.reserve({
    userId: 'user-1',
    ipHash: 'ip-hash',
    idempotencyKey: 'key-2',
    requestedCategory: 'ticker',
    now,
    profile,
  });
  assert.equal(exhausted.status, 'daily-success-limit');
});

test('fleet admission reserves worst-case session cost before provider reconciliation', async () => {
  process.env.AI_LITE_OPENROUTER_PROVIDERS = 'audited/provider';
  process.env.AI_LITE_FLEET_DAILY_SPEND_USD = '0.01';
  const profile = liteProfile();
  const store = new MemoryLiteGenerationStore();
  const now = Date.now();
  const first = await store.reserve({
    userId: 'user-1',
    ipHash: 'ip-1',
    idempotencyKey: 'key-1',
    requestedCategory: 'lower-third',
    now,
    profile,
  });
  assert.equal(first.status, 'created');
  const second = await store.reserve({
    userId: 'user-2',
    ipHash: 'ip-2',
    idempotencyKey: 'key-2',
    requestedCategory: 'ticker',
    now,
    profile,
  });
  assert.equal(second.status, 'fleet-spend');
});
