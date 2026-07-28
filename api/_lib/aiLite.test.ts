import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  LITE_CATALOG,
  LITE_JUDGE_AXES,
  LITE_JUDGE_OUTPUT,
  LITE_READY_OUTPUT,
  deterministicUnsupportedDecision,
  liteJudgeSystemPrompt,
  liteJudgeVerdict,
  liteSystemPrompt,
  obviousUnsupportedDecision,
  validateLiteDecision,
  validateLiteJudgeScores,
} from '../../src/ai/liteContract.js';
import type { LiteGenerationRequest } from '../../src/ai/liteTypes.js';
import { liteJudgeConfigured, liteJudgePolicy, liteProfile, liteProfileConfigured } from './aiLiteProfile.js';
import { liteLedgerConfigured, MemoryLiteGenerationStore } from './aiLiteStore.js';
import { readJson } from './http.js';

const ENV = [
  'AI_LITE_ENABLED',
  'AI_LITE_JUDGE_ENABLED',
  'AI_LITE_JUDGE_PROVIDER',
  'AI_LITE_JUDGE_MODEL',
  'AI_LITE_JUDGE_THRESHOLD',
  'AI_LITE_OPENROUTER_PROVIDERS',
  'AI_LITE_REQUIRE_ZDR',
  'AI_LITE_OPENROUTER_STRUCTURED_MODE',
  'AI_LITE_DAILY_STARTS',
  'AI_LITE_DAILY_SUCCESSES',
  'AI_LITE_FLEET_DAILY_SPEND_USD',
  'AI_LITE_EVAL_MEMORY_LEDGER',
  'NODE_ENV',
  'VERCEL',
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'IP_HASH_SALT',
  'AI_LITE_JUDGE_MAX_PER_GENERATION',
  'AI_LITE_JUDGE_MAX_COST_USD',
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
  assert.equal(configured.requireZdr, true);
  assert.equal(configured.openRouterStructuredMode, 'json-schema');
});

test('Lite permits an explicit server-only non-ZDR forced-tool route', () => {
  process.env.AI_LITE_OPENROUTER_PROVIDERS = 'audited/no-training-provider';
  process.env.AI_LITE_REQUIRE_ZDR = '0';
  process.env.AI_LITE_OPENROUTER_STRUCTURED_MODE = 'tool';
  const profile = liteProfile();
  assert.equal(profile.requireZdr, false);
  assert.equal(profile.openRouterStructuredMode, 'tool');
});

test('managed Lite requires a durable server ledger and private IP-hash salt', () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'server-secret';
  assert.equal(liteLedgerConfigured(), false);

  process.env.IP_HASH_SALT = 'a-private-salt-at-least-sixteen-characters';
  assert.equal(liteLedgerConfigured(), true);
});

test('local evaluation can use an explicit non-production memory ledger', () => {
  process.env.AI_LITE_EVAL_MEMORY_LEDGER = '1';
  process.env.IP_HASH_SALT = 'a-private-salt-at-least-sixteen-characters';
  process.env.NODE_ENV = 'development';
  assert.equal(liteLedgerConfigured(), true);

  process.env.NODE_ENV = 'production';
  assert.equal(liteLedgerConfigured(), false);
  process.env.NODE_ENV = 'development';
  process.env.VERCEL = '1';
  assert.equal(liteLedgerConfigured(), false);
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
  assert.equal(
    obviousUnsupportedDecision('Create a continuous ticker that stays readable over live video')?.status,
    'unsupported',
  );
  assert.equal(
    obviousUnsupportedDecision('Create a video project in Remotion')?.status,
    'unsupported',
  );
  assert.equal(obviousUnsupportedDecision('A minimal university lower third'), null);
  assert.equal(deterministicUnsupportedDecision({
    ...request(),
    generationSpec: {
      version: 1,
      category: 'ticker',
      fields: [],
    },
  })?.status, 'unsupported');
});

test('the managed model receives a ready-only lower-third schema', () => {
  const schema = LITE_READY_OUTPUT.schema as {
    oneOf?: unknown;
    properties?: {
      status?: { enum?: unknown[] };
      spec?: { properties?: { zone?: { enum?: unknown[] } } };
    };
  };
  assert.equal(schema.oneOf, undefined);
  assert.deepEqual(schema.properties?.status?.enum, ['ready']);
  assert.deepEqual(schema.properties?.spec?.properties?.zone?.enum, [
    'bottom-left',
    'bottom-center',
    'bottom-right',
  ]);
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
      intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: 'person-role' },
      lines: [
        { title: 'Name', sample: 'Amina Okafor', role: 'person-name' },
        { title: 'Role', sample: 'Reporter', role: 'person-role' },
      ],
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

test('Lite rejects missing requested field roles and unreadable bespoke palettes', () => {
  const entry = LITE_CATALOG[0];
  const value = {
    status: 'ready',
    aiCategory: 'lower-third',
    spec: {
      fit: 'catalog',
      reason: 'A general strap.',
      name: 'Lecture Strap',
      summary: 'A lower third.',
      category: 'lower-third',
      variantId: entry.variantId,
      intent: { kind: 'organization', primaryRole: 'organization', secondaryRole: 'supporting-context' },
      lines: [
        { title: 'Faculty', sample: 'Faculty of Engineering', role: 'organization' },
        { title: 'Context', sample: 'Annual Lecture', role: 'supporting-context' },
      ],
      palette: { accent: '#f6a623', text: '#111111', textDim: '#222222', panel: '#101010' },
      flourish: '',
    },
  };
  const semantic = validateLiteDecision(value, {
    ...request(),
    prompt: 'A university lecture lower third for a speaker name and academic role.',
  });
  assert.ok(semantic.errors.includes('requested_role_missing:person-name'));
  assert.ok(semantic.errors.includes('requested_role_missing:person-role'));
  assert.ok(semantic.errors.includes('primary_text_contrast_low'));
  assert.ok(semantic.errors.includes('secondary_text_contrast_low'));
});

test('Lite semantic validation recognizes natural person and team role requests', () => {
  const entry = LITE_CATALOG[0];
  assert.ok(entry);
  const baseSpec = {
    fit: 'catalog' as const,
    reason: 'A presenter strap.',
    name: 'Presenter Strap',
    summary: 'A lower third.',
    category: 'lower-third',
    variantId: entry.variantId,
    intent: { kind: 'person' as const, primaryRole: 'person-name' as const },
    lines: [{ title: 'Name', sample: 'Mateo Silva', role: 'person-name' as const }],
    palette: { accent: '#f6a623', text: '#ffffff', textDim: '#cccccc', panel: '#101010' },
    flourish: '',
  };

  const personSemantic = validateLiteDecision({
    status: 'ready',
    spec: baseSpec,
  }, {
    ...request(),
    prompt: 'A lower third for speaker name Dr. Anika Ramanathan and academic role Professor of Engineering.',
  });
  assert.ok(personSemantic.errors.includes('requested_role_missing:person-role'));

  const playerSemantic = validateLiteDecision({
    status: 'ready',
    spec: baseSpec,
  }, {
    ...request(),
    prompt: 'A bold football lower third for player name Mateo Silva and team Northbridge FC.',
  });
  assert.ok(playerSemantic.errors.includes('requested_role_missing:team-name'));
});

test('Lite semantic validation preserves documentary subjects and story headlines', () => {
  const entry = LITE_CATALOG[4];
  assert.ok(entry);
  const base = {
    fit: 'catalog' as const,
    reason: 'A quiet editorial treatment.',
    name: 'Editorial Lower Third',
    summary: 'A restrained lower third.',
    category: 'lower-third' as const,
    variantId: entry.variantId,
    palette: { accent: '#f6a623', text: '#ffffff', textDim: '#cccccc', panel: '#101010' },
    flourish: '',
  };
  const documentary = validateLiteDecision({
    status: 'ready',
    aiCategory: 'lower-third',
    spec: {
      ...base,
      intent: { kind: 'story', primaryRole: 'story-headline', secondaryRole: 'location' },
      lines: [
        { title: 'Headline', sample: 'Nuru Bekele', role: 'story-headline' },
        { title: 'Location', sample: 'Lake Tana, Ethiopia', role: 'location' },
      ],
    },
  }, {
    ...request(),
    prompt: 'A quiet documentary lower third for subject name Nuru Bekele and location Lake Tana, Ethiopia.',
  });
  assert.ok(documentary.errors.includes('requested_role_missing:person-name'));

  const story = validateLiteDecision({
    status: 'ready',
    aiCategory: 'lower-third',
    spec: {
      ...base,
      intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: 'location' },
      lines: [
        { title: 'Name', sample: 'Rail services resume', role: 'person-name' },
        { title: 'Location', sample: 'Greater Manchester', role: 'location' },
      ],
    },
  }, {
    ...request(),
    prompt: 'A news lower third for headline Rail services resume after repairs and location Greater Manchester.',
  });
  assert.ok(story.errors.includes('requested_role_missing:story-headline'));
});

test('Lite semantic validation treats a professional title as a person role', () => {
  const entry = LITE_CATALOG[0];
  const semantic = validateLiteDecision({
    status: 'ready',
    aiCategory: 'lower-third',
    spec: {
      fit: 'catalog',
      reason: 'A professional house strap.',
      name: 'Producer Lower Third',
      summary: 'A professional lower third.',
      category: 'lower-third',
      variantId: entry.variantId,
      intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: 'team-name' },
      lines: [
        { title: 'Name', sample: 'Taylor Morgan', role: 'person-name' },
        { title: 'Title', sample: 'Senior Producer', role: 'team-name' },
      ],
      flourish: '',
    },
  }, {
    ...request(),
    prompt: 'Create a professional lower third for Taylor Morgan, Senior Producer.',
  });
  assert.ok(semantic.errors.includes('requested_role_missing:person-role'));
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

test('judge admission gates ownership, liveness, the per-generation cap, and fleet spend', async () => {
  process.env.AI_LITE_OPENROUTER_PROVIDERS = 'audited/provider';
  process.env.AI_LITE_JUDGE_MAX_PER_GENERATION = '1';
  const profile = liteProfile();
  const store = new MemoryLiteGenerationStore();
  const now = Date.now();
  const reservation = await store.reserve({
    userId: 'user-1',
    ipHash: 'ip-1',
    idempotencyKey: 'key-1',
    requestedCategory: 'lower-third',
    now,
    profile,
  });
  assert.equal(reservation.status, 'created');
  if (reservation.status !== 'created') return;
  const generationId = reservation.record.id;
  const judge = { generationId, userId: 'user-1', now, profile };

  // Someone else's generation and an unknown id answer identically - no id oracle.
  assert.equal((await store.reserveJudge({ ...judge, userId: 'user-2' })).status, 'not-found');
  assert.equal((await store.reserveJudge({ ...judge, generationId: 'missing' })).status, 'not-found');
  // A record past its expiry is not a spend handle, however long the row survives.
  assert.equal(
    (await store.reserveJudge({ ...judge, now: reservation.record.expiresAt + 1 })).status,
    'expired',
  );

  const first = await store.reserveJudge(judge);
  assert.equal(first.status, 'created');
  assert.equal(first.status === 'created' ? first.judgeCount : 0, 1);
  // The worst case is BOOKED before the call, so concurrent judgements cannot race it.
  const booked = await store.get(generationId);
  assert.ok(Math.abs((booked?.providerCostUsd ?? 0) - (profile.maxProviderCostUsd + profile.judgeMaxCostUsd)) < 1e-9);
  // The cap counts attempts, so a retry loop cannot spin the spend up.
  assert.equal((await store.reserveJudge(judge)).status, 'judge-limit');

  // Settling reconciles the booking to what the provider actually charged.
  await store.settleJudgeCost(generationId, 0.001 - profile.judgeMaxCostUsd);
  const settled = await store.get(generationId);
  assert.ok(Math.abs((settled?.providerCostUsd ?? 0) - (profile.maxProviderCostUsd + 0.001)) < 1e-9);
});

test('judge admission refuses once the daily fleet spend ceiling would be crossed', async () => {
  process.env.AI_LITE_OPENROUTER_PROVIDERS = 'audited/provider';
  // Room for the generation's own worst-case booking, but not for a judgement on top.
  process.env.AI_LITE_FLEET_DAILY_SPEND_USD = '0.008';
  const profile = liteProfile();
  const store = new MemoryLiteGenerationStore();
  const now = Date.now();
  const reservation = await store.reserve({
    userId: 'user-1',
    ipHash: 'ip-1',
    idempotencyKey: 'key-1',
    requestedCategory: 'lower-third',
    now,
    profile,
  });
  assert.equal(reservation.status, 'created');
  if (reservation.status !== 'created') return;
  assert.equal(
    (await store.reserveJudge({ generationId: reservation.record.id, userId: 'user-1', now, profile })).status,
    'fleet-spend',
  );
});

test('content-free accepted and discarded outcomes become thresholded chassis priors', async () => {
  process.env.AI_LITE_OPENROUTER_PROVIDERS = 'audited/provider';
  process.env.AI_LITE_DAILY_STARTS = '20';
  process.env.AI_LITE_DAILY_SUCCESSES = '20';
  const profile = liteProfile();
  const store = new MemoryLiteGenerationStore();
  const now = Date.now();
  for (let index = 0; index < 8; index += 1) {
    const reservation = await store.reserve({
      userId: 'quality-user',
      ipHash: 'quality-ip',
      idempotencyKey: `quality-${index}`,
      requestedCategory: 'lower-third',
      now: now + index,
      profile,
    });
    assert.equal(reservation.status, 'created');
    if (reservation.status !== 'created') continue;
    await store.update(reservation.record.id, {
      status: index < 6 ? 'accepted' : 'usable',
      resolvedCategory: 'lower-third',
      resolvedVariantId: 'lt11',
      intentKind: 'person',
      ...(index >= 6 ? { rejectionReason: 'user_discarded', feedbackReason: 'regenerated' } : {}),
    });
  }
  assert.deepEqual(await store.qualityPriors({ now: now + 10, windowDays: 90, minSamples: 8 }), [{
    variantId: 'lt11',
    intentKind: 'person',
    accepted: 6,
    discarded: 2,
  }]);
});

test('the skin prompt teaches strap shape and the unwrappable name line', () => {
  const prompt = liteSystemPrompt('test-v1', [], { skin: true });
  assert.match(prompt, /STRAP SHAPE IS NON-NEGOTIABLE/);
  assert.match(prompt, /squat box/);
  assert.match(prompt, /ONE line, never wrapped/);
  // The teaching rides only the skin-enabled prompt.
  assert.doesNotMatch(liteSystemPrompt('test-v1', [], { skin: false }), /STRAP SHAPE/);
});

test('the skin judge fails closed and prices its own route', () => {
  // Default: disabled.
  assert.equal(liteJudgeConfigured(liteProfile()), false);

  // Enabled but no OpenRouter provider allowlist: still closed.
  process.env.AI_LITE_JUDGE_ENABLED = '1';
  assert.equal(liteJudgeConfigured(liteProfile()), false);

  process.env.AI_LITE_OPENROUTER_PROVIDERS = 'audited/provider';
  const configured = liteProfile();
  assert.equal(liteJudgeConfigured(configured), true);
  // The policy caps prices at the JUDGE route's own entry, not the generation routes'.
  const policy = liteJudgePolicy(configured);
  assert.equal(policy?.zdr, true);
  assert.deepEqual(policy?.only, ['audited/provider']);
  assert.equal(policy?.maxInputPerMillion, 0.30);
  assert.equal(policy?.maxOutputPerMillion, 2.50);

  // An unpriced judge model fails closed.
  process.env.AI_LITE_JUDGE_MODEL = 'someone/unpriced-vision-model';
  process.env.AI_LITE_JUDGE_PROVIDER = 'openrouter';
  assert.equal(liteJudgeConfigured(liteProfile()), false);
  assert.equal(liteJudgePolicy(liteProfile()), undefined);
});

test('judge scores validate strictly and one weak axis sinks the verdict', () => {
  const good = { legibility: 5, hierarchy: 4, briefFit: 4, strapShape: 5, reason: 'Clean strap, name reads instantly.' };
  const parsed = validateLiteJudgeScores(good);
  assert.deepEqual(parsed?.scores, { legibility: 5, hierarchy: 4, briefFit: 4, strapShape: 5 });
  assert.equal(liteJudgeVerdict(parsed.scores, 3), 'pass');
  assert.equal(liteJudgeVerdict({ ...parsed.scores, strapShape: 2 }, 3), 'fail');
  assert.equal(liteJudgeVerdict(parsed.scores, 5), 'fail');

  assert.equal(validateLiteJudgeScores({ ...good, legibility: 0 }), null);
  assert.equal(validateLiteJudgeScores({ ...good, hierarchy: 6 }), null);
  assert.equal(validateLiteJudgeScores({ ...good, briefFit: 3.5 }), null);
  assert.equal(validateLiteJudgeScores({ ...good, reason: '' }), null);
  const { strapShape: _dropped, ...missingAxis } = good;
  assert.equal(validateLiteJudgeScores(missingAxis), null);
});

test('the judge prompt and schema cover exactly the four axes', () => {
  const prompt = liteJudgeSystemPrompt('test-v1');
  for (const axis of LITE_JUDGE_AXES) assert.ok(prompt.includes(axis), `prompt names ${axis}`);
  assert.match(prompt, /squat box/);
  const schema = LITE_JUDGE_OUTPUT.schema as { required?: string[]; additionalProperties?: boolean };
  assert.deepEqual(schema.required, [...LITE_JUDGE_AXES, 'reason']);
  assert.equal(schema.additionalProperties, false);
});
