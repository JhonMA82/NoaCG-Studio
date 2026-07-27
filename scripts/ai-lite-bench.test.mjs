// Self-tests for the NoaCG Lite benchmark (run in the build gate):
//  - production-vs-benchmark pipeline EQUIVALENCE pins (one compile path, no drift)
//  - gold / floor / repair suite validity against the real server-side semantic validator
//  - suite integrity, versioning, manifest determinism, failure-taxonomy shape
//  - production-bundle exclusion (src never imports benchmark code)
// Zero model calls, zero network.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildApiRuntime, projectRoot } from './api-runtime-build.mjs';
import { CORE_SUITE, GOLD_SPECS, REPAIR_SUITE, SPIKE_FIXTURE_IDS, floorDecision, seededRandom, LITE_BENCH_SUITE_ID } from './ai-lite-bench/suites.mjs';
import { HOLDOUT_SUITE } from './ai-lite-bench/holdout.mjs';
import { CHALLENGE_SUITE } from './ai-lite-bench/challenge.mjs';
import { FAILURE_CODES, classifyFailure } from './ai-lite-bench/taxonomy.mjs';
import { buildRunManifest, pipelineIdentityMatches } from './ai-lite-bench/manifest.mjs';
import { LITE_LOWER_THIRD_FIXTURES } from './ai-lite-lower-third-fixtures.mjs';

const read = (relative) => readFileSync(path.join(projectRoot, relative), 'utf8');

const runtime = await buildApiRuntime(['api/_lib/aiLiteProfile.ts']);
const contract = await import(pathToFileURL(path.join(runtime.outputDir, 'src/ai/liteContract.js')).href);
after(async () => { await runtime.cleanup(); });

const request = (prompt) => ({ prompt, resolution: { width: 1920, height: 1080 }, fps: 50 });

// ── Pipeline equivalence pins ────────────────────────────────────────────────

test('claudeProvider compiles grounded specs only through litePipeline', () => {
  const source = read('src/ai/claudeProvider.ts');
  assert.match(source, /from '\.\/litePipeline'/);
  assert.match(source, /assembleGroundedTemplate\(/);
  assert.match(source, /normalizeLiteSpec\(/);
  // No second copy of the assembly sequence may exist in the provider.
  assert.doesNotMatch(source, /specToTemplate\(/);
  assert.doesNotMatch(source, /applyDesignAdjustments\(/);
});

test('litePipeline holds the exact production assembly order', () => {
  const source = read('src/ai/litePipeline.ts');
  assert.match(source, /applySpecOutPreset\(\s*ensureSpecFonts\(applyDesignAdjustments\(/);
  assert.match(source, /withSafetyChecks\(/);
  assert.match(source, /demoteSpecFields\(/);
});

test('the app injects the shared production validator', () => {
  const source = read('src/components/wizard/steps/AiStep.tsx');
  assert.match(source, /productionSpxValidator\(/);
  assert.doesNotMatch(source, /withSafetyChecks\(/);
});

test('the benchmark runners compile through the shared pipeline, never inline', () => {
  for (const file of ['scripts/ai-lite-eval.mjs', 'scripts/ai-lite-bench/compileRunner.mjs']) {
    const source = read(file);
    assert.match(source, /compileLiteDecision/, `${file} must use litePipeline`);
    assert.doesNotMatch(source, /specToTemplate\(/, `${file} must not re-inline the assembly`);
  }
});

test('production src never imports benchmark code (bundle exclusion)', () => {
  const walk = (dir) => readdirSync(path.join(projectRoot, dir), { withFileTypes: true })
    .flatMap((entry) => {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(rel);
      return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
    });
  for (const file of walk('src')) {
    assert.doesNotMatch(
      readFileSync(path.join(projectRoot, file), 'utf8'),
      /from ['"][^'"]*scripts\//,
      `${file} imports from scripts/ - benchmark code must never enter the bundle`,
    );
  }
});

// ── Suite integrity ──────────────────────────────────────────────────────────

test('core suite: 8 briefs, unique ids, fixture texts in step with the fixture bank', () => {
  assert.equal(CORE_SUITE.length, 8);
  assert.equal(new Set(CORE_SUITE.map((b) => b.id)).size, 8);
  const fixtures = new Map(LITE_LOWER_THIRD_FIXTURES);
  for (const brief of CORE_SUITE.filter((b) => b.fixtureId)) {
    assert.equal(brief.brief, fixtures.get(brief.fixtureId), `${brief.id} drifted from fixture ${brief.fixtureId}`);
  }
  for (const brief of CORE_SUITE) {
    assert.ok(['ready', 'unsupported'].includes(brief.expect.decision), brief.id);
    if (brief.expect.decision === 'ready') assert.ok(brief.fields?.primary, `${brief.id} needs labelled fields`);
  }
});

test('hidden holdout stays disjoint from the core suite', () => {
  const coreIds = new Set(CORE_SUITE.map((b) => b.id));
  const coreBriefs = new Set(CORE_SUITE.map((b) => b.brief));
  for (const brief of HOLDOUT_SUITE) {
    assert.ok(!coreIds.has(brief.id));
    assert.ok(!coreBriefs.has(brief.brief));
  }
});

test('expected-unsupported core briefs are caught by the deterministic gate', () => {
  // The production schema is ready-only, so this pre-inference screen is the ONLY refusal
  // path: a miss both spends a model call and forces an unsupported brief into a graphic.
  for (const brief of CORE_SUITE.filter((b) => b.expect.decision === 'unsupported')) {
    const screened = contract.deterministicUnsupportedDecision(request(brief.brief));
    assert.ok(screened, `${brief.id} would spend a model call and force a wrong graphic`);
    assert.equal(screened.code, brief.expect.unsupportedCode, brief.id);
  }
  // A requested off-catalog category refuses deterministically even with a neutral prompt.
  const categoryScreened = contract.deterministicUnsupportedDecision({
    ...request('A clean graphic for tonight.'),
    generationSpec: { version: 1, category: 'scoreboard', fields: [] },
  });
  assert.equal(categoryScreened?.code, 'unsupported-category');
});

// ── Gold, floor, repair against the real semantic validator ──────────────────

test('every gold spec passes the server semantic validation for its brief', () => {
  for (const gold of GOLD_SPECS) {
    const brief = CORE_SUITE.find((b) => b.id === gold.briefId);
    assert.ok(brief, gold.briefId);
    const result = contract.validateLiteDecision(gold.decision, request(brief.brief));
    assert.deepEqual(result.errors, [], `${gold.briefId}: ${result.errors.join(', ')}`);
    assert.equal(result.decision?.status, 'ready');
  }
});

test('the floor is deterministic and semantically valid for every ready core brief', () => {
  for (const brief of CORE_SUITE.filter((b) => b.expect.decision === 'ready')) {
    const a = floorDecision(brief, contract.LITE_CATALOG, 42);
    const b = floorDecision(brief, contract.LITE_CATALOG, 42);
    assert.deepEqual(a, b, `${brief.id} floor must be seed-deterministic`);
    const result = contract.validateLiteDecision(a, request(brief.brief));
    assert.deepEqual(result.errors, [], `${brief.id} floor: ${result.errors.join(', ')}`);
  }
});

test('the repair suite expectations match validateLiteDecision exactly', () => {
  for (const item of REPAIR_SUITE) {
    const result = contract.validateLiteDecision(item.decision, item.request);
    assert.deepEqual([...result.errors].sort(), [...item.expectErrors].sort(), item.id);
  }
});

test('spike selection: 6 briefs, all from the frozen fixture bank', () => {
  assert.equal(SPIKE_FIXTURE_IDS.length, 6);
  assert.equal(new Set(SPIKE_FIXTURE_IDS).size, 6);
  const bank = new Set(LITE_LOWER_THIRD_FIXTURES.map(([id]) => id));
  for (const id of SPIKE_FIXTURE_IDS) assert.ok(bank.has(id), `${id} missing from the fixture bank`);
});

test('challenge suite: unique ids, disjoint from core and holdout, valid floors', () => {
  const ids = CHALLENGE_SUITE.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  const taken = new Set([...CORE_SUITE, ...HOLDOUT_SUITE].map((b) => b.id));
  for (const id of ids) assert.ok(!taken.has(id));
  for (const brief of CHALLENGE_SUITE.filter((b) => b.expect.decision === 'ready')) {
    const floor = floorDecision(brief, contract.LITE_CATALOG, 7);
    assert.deepEqual(floor, floorDecision(brief, contract.LITE_CATALOG, 7), brief.id);
    const result = contract.validateLiteDecision(floor, request(brief.brief));
    assert.deepEqual(result.errors, [], `${brief.id}: ${result.errors.join(', ')}`);
  }
});

// ── Taxonomy and manifest ────────────────────────────────────────────────────

test('failure taxonomy codes are unique and classification is stage-ordered', () => {
  assert.equal(new Set(FAILURE_CODES).size, FAILURE_CODES.length);
  assert.equal(classifyFailure({ providerErrorCode: 'rate_limited' }), 'RATE_LIMITED');
  assert.equal(classifyFailure({ truncated: true }), 'OUTPUT_TRUNCATED');
  assert.equal(
    classifyFailure({ expect: { decision: 'unsupported' }, decision: { status: 'ready' } }),
    'UNSUPPORTED_FORCED',
  );
  assert.equal(
    classifyFailure({ expect: { decision: 'ready' }, decision: { status: 'unsupported' } }),
    'CATEGORY_WRONG',
  );
  assert.equal(classifyFailure({ semanticErrors: ['variant_not_allowed'] }), 'VARIANT_INVALID');
  assert.equal(classifyFailure({ validationRuleCodes: ['bench-overlap'] }), 'REFLOW_FAILED');
  assert.equal(classifyFailure({ decision: { status: 'ready' }, expect: { decision: 'ready' } }), null);
  for (const row of [
    { providerErrorCode: 'rate_limited' },
    { truncated: true },
    { semanticErrors: ['anything'] },
    { validationRuleCodes: ['bench-overlap'] },
  ]) {
    assert.ok(FAILURE_CODES.includes(classifyFailure(row)));
  }
});

test('run manifests are deterministic and compare pipeline identity', () => {
  const a = buildRunManifest({ mode: 'regression' });
  const b = buildRunManifest({ mode: 'model-comparison' });
  assert.deepEqual(a.hashes, b.hashes);
  assert.equal(a.suiteId, LITE_BENCH_SUITE_ID);
  assert.ok(pipelineIdentityMatches(a, b));
  assert.ok(!pipelineIdentityMatches(a, { ...b, hashes: { ...b.hashes, catalog: 'drifted' } }));
});

test('seeded PRNG is stable across runs', () => {
  const r = seededRandom(7);
  assert.deepEqual([r(), r(), r()], (() => { const s = seededRandom(7); return [s(), s(), s()]; })());
});
