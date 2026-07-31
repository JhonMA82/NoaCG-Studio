import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import generate from '../ai/generate.js';
import { gatewayLedgerConfigured, gatewayLedgerEntry } from './aiGatewayLedger.js';
import { aiGenerateRateLimitCaps } from './rateLimit.js';
import type { AiGatewayRequestBody, ModelResult } from '../../src/ai/modelTypes.js';

const ENV = [
  'AI_GENERATE_RATE_WINDOW_SEC',
  'AI_GENERATE_RATE_MAX',
  'ANTHROPIC_API_KEY',
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

let requestCounter = 0;

/** Each call site gets its own client IP so tests never share a rate-limit bucket. */
function gatewayRequest(ip: string, body?: unknown): Request {
  return new Request('https://noacg.test/api/ai/generate', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    body: JSON.stringify(body ?? {
      route: { provider: 'anthropic', model: 'claude-sonnet-5' },
      request: { system: 'You are a test.', messages: [{ role: 'user', content: 'hi' }] },
    }),
  });
}

function uniqueIp(): string {
  requestCounter += 1;
  return `203.0.113.${requestCounter}`;
}

test('gateway rate limit caps read env overrides and default to 60/minute', () => {
  const defaults = aiGenerateRateLimitCaps();
  assert.equal(defaults.windowMs, 60_000);
  assert.equal(defaults.max, 60);

  process.env.AI_GENERATE_RATE_WINDOW_SEC = '10';
  process.env.AI_GENERATE_RATE_MAX = '5';
  const configured = aiGenerateRateLimitCaps();
  assert.equal(configured.windowMs, 10_000);
  assert.equal(configured.max, 5);
});

test('the gateway refuses a hammering client with 429 + Retry-After before reading the body', async () => {
  process.env.AI_GENERATE_RATE_MAX = '2';
  const ip = uniqueIp();

  // Within the cap the guard stays out of the way (no key configured -> 412, not 429).
  const first = await generate.fetch(gatewayRequest(ip));
  assert.equal(first.status, 412);
  const second = await generate.fetch(gatewayRequest(ip));
  assert.equal(second.status, 412);

  const refused = await generate.fetch(gatewayRequest(ip));
  assert.equal(refused.status, 429);
  assert.ok(Number(refused.headers.get('retry-after')) >= 1);
  const refusedBody = await refused.json() as { error: { code: string; retryable: boolean } };
  assert.equal(refusedBody.error.code, 'rate_limited');
  assert.equal(refusedBody.error.retryable, true);

  // A different client is unaffected.
  const other = await generate.fetch(gatewayRequest(uniqueIp()));
  assert.equal(other.status, 412);
});

test('a video-tagged call from a caller the server cannot recognise is NOT refused', async () => {
  // The ai.video gate binds recognised accounts only. With no backend configured every
  // caller resolves the ANONYMOUS defaults - which set ai.video false - so a gate keyed on
  // the resolved answer alone would take account-free BYO video away from every self-hosted
  // instance. 412 (no key configured) is the pre-existing answer and must stay it.
  const request = new Request('https://noacg.test/api/ai/generate', {
    method: 'POST',
    headers: { 'x-forwarded-for': uniqueIp(), authorization: 'Bearer stale-or-unverifiable' },
    body: JSON.stringify({
      route: { provider: 'anthropic', model: 'claude-sonnet-5' },
      request: { system: 'You are a test.', messages: [{ role: 'user', content: 'hi' }] },
      surface: 'video',
    }),
  });
  const response = await generate.fetch(request);
  assert.equal(response.status, 412);
});

test('a pro-tagged call follows the same recognised-account-only gate as video', async () => {
  // Same posture as the video test above: with no backend configured the caller cannot be
  // recognised, so the ai.pro gate must not fire - 412 (no key) is the pre-existing answer.
  const request = new Request('https://noacg.test/api/ai/generate', {
    method: 'POST',
    headers: { 'x-forwarded-for': uniqueIp(), authorization: 'Bearer stale-or-unverifiable' },
    body: JSON.stringify({
      route: { provider: 'openrouter', model: 'vendor/image-model' },
      request: { system: 'You are a test.', messages: [{ role: 'user', content: 'hi' }], expect: 'image' },
      surface: 'pro',
    }),
  });
  const response = await generate.fetch(request);
  assert.equal(response.status, 412);
});

test('an unknown surface is refused outright rather than downgraded to the ungated path', async () => {
  const response = await generate.fetch(gatewayRequest(uniqueIp(), {
    route: { provider: 'anthropic', model: 'claude-sonnet-5' },
    request: { system: 'You are a test.', messages: [{ role: 'user', content: 'hi' }] },
    surface: 'not-a-surface',
  }));
  assert.equal(response.status, 400);
  const body = await response.json() as { error: { code: string } };
  assert.equal(body.error.code, 'invalid_request');
});

const LEDGER_BODY: AiGatewayRequestBody = {
  route: { provider: 'anthropic', model: 'claude-sonnet-5' },
  request: { system: 'You are a test.', messages: [{ role: 'user', content: 'secret prompt text' }] },
};

test('the ledger entry is content-free accounting: route, key source, usage, outcome - never text', () => {
  const result: ModelResult = {
    output: 'secret generated output',
    provider: 'openrouter',
    model: 'z-ai/glm-5',
    attempts: [
      { route: { provider: 'anthropic', model: 'claude-sonnet-5' }, attempts: 2 },
      { route: { provider: 'openrouter', model: 'z-ai/glm-5' }, attempts: 1 },
    ],
    usage: {
      inputTokens: 100,
      outputTokens: 40,
      totalTokens: 140,
      cachedInputTokens: 25,
      reasoningTokens: 5,
      estimatedCost: { amount: 0.0031, currency: 'USD', source: 'provider' },
    },
  };
  const entry = gatewayLedgerEntry({
    userId: 'user-1',
    ipHash: 'ip-hash-1',
    body: { ...LEDGER_BODY, fallbacks: [{ provider: 'openrouter', model: 'z-ai/glm-5' }] },
    userKeys: { openrouter: 'sk-user-key' },
    result,
  });

  // The executed route is charged, and the user's own key marks it 'byo'.
  assert.equal(entry.task, 'byo-generate');
  assert.equal(entry.provider, 'openrouter');
  assert.equal(entry.model, 'z-ai/glm-5');
  assert.equal(entry.keySource, 'byo');
  assert.equal(entry.outcome, 'ok');
  assert.equal(entry.attemptCount, 3);
  assert.equal(entry.inputTokens, 100);
  assert.equal(entry.outputTokens, 40);
  assert.equal(entry.cachedInputTokens, 25);
  assert.equal(entry.reasoningTokens, 5);
  assert.equal(entry.providerCostUsd, 0.0031);

  // Content-free by construction: exactly these fields, nothing that could carry
  // prompts, messages, or generated output.
  assert.deepEqual(Object.keys(entry).sort(), [
    'attemptCount', 'cachedInputTokens', 'inputTokens', 'ipHash', 'keySource', 'model',
    'outcome', 'outputTokens', 'provider', 'providerCostUsd', 'reasoningTokens', 'task', 'userId',
  ]);
  const serialized = JSON.stringify(entry);
  assert.ok(!serialized.includes('secret prompt text'));
  assert.ok(!serialized.includes('secret generated output'));
});

test('a pro-tagged execution ledgers as pro-generate so gateway accounting can tell it apart', () => {
  const entry = gatewayLedgerEntry({
    userId: null,
    ipHash: 'ip-hash-pro',
    body: { ...LEDGER_BODY, surface: 'pro' },
    userKeys: {},
    errorCode: 'missing_key',
  });
  assert.equal(entry.task, 'pro-generate');
});

test('a failed execution ledgers the primary route with zero usage and the error code', () => {
  const entry = gatewayLedgerEntry({
    userId: null,
    ipHash: 'ip-hash-2',
    body: LEDGER_BODY,
    userKeys: {},
    errorCode: 'missing_key',
  });
  assert.equal(entry.provider, 'anthropic');
  assert.equal(entry.model, 'claude-sonnet-5');
  assert.equal(entry.keySource, 'managed');
  assert.equal(entry.outcome, 'missing_key');
  assert.equal(entry.attemptCount, 0);
  assert.equal(entry.inputTokens, 0);
  assert.equal(entry.providerCostUsd, 0);
});

test('the gateway ledger requires the Supabase URL and secret key', () => {
  assert.equal(gatewayLedgerConfigured(), false);
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  assert.equal(gatewayLedgerConfigured(), false);
  process.env.SUPABASE_SECRET_KEY = 'server-secret';
  assert.equal(gatewayLedgerConfigured(), true);
});
