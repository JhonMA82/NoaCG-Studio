// The benchmark preflight's regression suite: every check here corresponds to a way a PAID
// round was actually wasted (api/_lib/aiBenchPreflight.ts). Free - no network, no tokens.
//
// Every positive assertion has a MUTATION TWIN: the same input minus the one triggering
// property must NOT fire. A preflight that stops checking is worse than no preflight, since
// it certifies the spend; a green check that cannot go red is exactly that.

import assert from 'node:assert/strict';
import test from 'node:test';
import { benchCredentialFindings, benchPreflight, defaultIncumbentModel } from './aiBenchPreflight.js';
import {
  IMPORT_ANALYSIS_LIMITS,
  importAnalysisImageSizeOk,
} from '../../src/ai/importAnalysis/contract.js';

/** A minimal ambient environment where everything is configured correctly - the baseline the
 *  tests below break ONE property at a time. */
const OK_AMBIENT: Record<string, string> = {
  AI_LITE_ENABLED: 'true',
  OPENROUTER_API_KEY: 'sk-test',
  AI_LITE_OPENROUTER_PROVIDERS: 'deepinfra',
};

/** Two approved, funded, distinct catalog routes - real entries, so the test measures the
 *  actual catalog rather than a fixture of it. */
const INCUMBENT = 'google/gemini-2.5-flash-lite';
const CANDIDATE = 'qwen/qwen3-30b-a3b-instruct-2507';

const arm = (candidate: string, env: Record<string, string | undefined> = {}) => ({
  candidate,
  env: { AI_LITE_PRIMARY_MODEL: candidate, AI_LITE_PRIMARY_PROVIDER: 'openrouter', ...env },
});

const codes = (report: { findings: { code: string }[] }) => report.findings.map((f) => f.code);

test('a correctly configured two-arm comparison passes', () => {
  const report = benchPreflight([arm(INCUMBENT), arm(CANDIDATE)], OK_AMBIENT);
  assert.equal(report.ok, true, `unexpected findings: ${JSON.stringify(report.findings, null, 2)}`);
  assert.deepEqual(report.arms.map((a) => a.resolved.model), [INCUMBENT, CANDIDATE]);
});

test('a saved model in the ambient environment cannot silently override a candidate', () => {
  // The failure: .env carries AI_LITE_PRIMARY_MODEL and the runner forgot to inject, so the
  // arm reports as the candidate and serves the saved model.
  const notInjected = { candidate: CANDIDATE, env: {} };
  const overridden = benchPreflight(
    [{ candidate: INCUMBENT, env: {} }, notInjected],
    { ...OK_AMBIENT, AI_LITE_PRIMARY_MODEL: INCUMBENT, AI_LITE_PRIMARY_PROVIDER: 'openrouter' },
  );
  assert.equal(overridden.ok, false);
  assert.ok(codes(overridden).includes('candidate-overridden'));
  // It also catches the compounding consequence: both arms now serve one model.
  assert.ok(codes(overridden).includes('arms-not-distinct'));

  // The mutation twin: the SAME ambient environment, with the arm injecting properly.
  const injected = benchPreflight(
    [arm(INCUMBENT), arm(CANDIDATE)],
    { ...OK_AMBIENT, AI_LITE_PRIMARY_MODEL: INCUMBENT, AI_LITE_PRIMARY_PROVIDER: 'openrouter' },
  );
  assert.equal(injected.ok, true, 'an injected route must outrank the saved one');
});

test('arms that resolve to the same model are refused even when each arm is valid', () => {
  // Both arms individually configured, both approved - and identical. Every per-arm check
  // passes; only the cross-arm question catches it.
  const selfCompare = benchPreflight([arm(INCUMBENT), arm(INCUMBENT)], OK_AMBIENT);
  assert.equal(selfCompare.ok, false);
  assert.ok(codes(selfCompare).includes('arms-not-distinct'));
  assert.equal(codes(selfCompare).includes('candidate-overridden'), false,
    'each arm serves what it claims - the fault is only that they are the same');

  // The mutation twin: one arm changed to a different approved model.
  const distinct = benchPreflight([arm(INCUMBENT), arm(CANDIDATE)], OK_AMBIENT);
  assert.equal(distinct.ok, true);
});

test('a route missing from the approved catalog fails closed, and says so', () => {
  const unapproved = benchPreflight([arm(INCUMBENT), arm('some-lab/never-approved-model')], OK_AMBIENT);
  assert.equal(unapproved.ok, false);
  assert.ok(codes(unapproved).includes('route-not-approved'));
  const finding = unapproved.findings.find((f) => f.code === 'route-not-approved');
  assert.match(finding?.message ?? '', /approved-route catalog/,
    'the diagnosis must name the gate that closed, not just report failure');

  // The mutation twin: the same shape with a listed model.
  assert.equal(benchPreflight([arm(INCUMBENT), arm(CANDIDATE)], OK_AMBIENT).ok, true);
});

test('a missing provider allowlist is caught before the spend, not during it', () => {
  const { AI_LITE_OPENROUTER_PROVIDERS: _dropped, ...noAllowlist } = OK_AMBIENT;
  const report = benchPreflight([arm(INCUMBENT), arm(CANDIDATE)], noAllowlist);
  assert.equal(report.ok, false);
  assert.ok(codes(report).includes('route-not-configured'));
  assert.match(
    report.findings.find((f) => f.code === 'route-not-configured')?.message ?? '',
    /allowlist/,
  );

  // The mutation twin: restore the allowlist and the same arms pass.
  assert.equal(benchPreflight([arm(INCUMBENT), arm(CANDIDATE)], OK_AMBIENT).ok, true);
});

test('a single-arm run is flagged as having no baseline', () => {
  const solo = benchPreflight([arm(CANDIDATE)], OK_AMBIENT);
  assert.ok(codes(solo).includes('no-baseline'));
  // A warning, not an error: it is a judgement call, not a broken configuration.
  assert.equal(solo.ok, true);
  assert.equal(codes(benchPreflight([arm(INCUMBENT), arm(CANDIDATE)], OK_AMBIENT)).includes('no-baseline'), false);
});

test('the incumbent is whatever the profile serves by default, not a copied constant', () => {
  // It must equal the route the profile falls back to, so a promotion cannot leave the
  // baseline pointing at the superseded model for one more round.
  assert.equal(defaultIncumbentModel(), INCUMBENT);
  // And it must ignore an override in the surrounding environment - the default is the
  // question, not whatever this process happens to be configured for.
  process.env.AI_LITE_PRIMARY_MODEL = CANDIDATE;
  try {
    assert.equal(defaultIncumbentModel(), INCUMBENT);
  } finally {
    delete process.env.AI_LITE_PRIMARY_MODEL;
  }
});

test('the preflight leaves the ambient process environment exactly as it found it', () => {
  // It installs each arm's environment to resolve through the real profile code; a leak
  // would silently reconfigure whatever runs next in the same process.
  process.env.AI_LITE_PRIMARY_MODEL = 'sentinel/value';
  const before = { ...process.env };
  benchPreflight([arm(INCUMBENT), arm(CANDIDATE)], OK_AMBIENT);
  assert.equal(process.env.AI_LITE_PRIMARY_MODEL, 'sentinel/value');
  assert.deepEqual(Object.keys(process.env).sort(), Object.keys(before).sort());
  delete process.env.AI_LITE_PRIMARY_MODEL;
});

test('credential and flag mistakes are reported together, not one per run', () => {
  const findings = benchCredentialFindings({}, { requireEvalIdentity: true });
  const found = findings.map((f) => f.code);
  assert.ok(found.includes('missing-credentials'));
  assert.ok(found.includes('feature-disabled'));
  assert.ok(findings.length >= 3, 'one dry run must list everything that is wrong');

  // The mutation twin: a fully configured environment reports nothing.
  assert.deepEqual(
    benchCredentialFindings(
      {
        ...OK_AMBIENT,
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'anon',
        E2E_EMAIL: 'test@example.com',
        E2E_PASSWORD: 'pw',
      },
      { requireEvalIdentity: true },
    ),
    [],
  );
});

// ── The import-analysis size cap ──────────────────────────────────────────────
// The per-axis cap rejected every PORTRAIT case in the 2026-07-29 vision round, which is one
// of the reasons that run was not a valid comparison. These pin the shape of the rule, not
// the numbers: the property that matters is that orientation cannot change the answer.

test('the analysis size cap is orientation-independent', () => {
  const { maxWidth, maxHeight, maxPixels, maxEdge } = IMPORT_ANALYSIS_LIMITS;
  // The exact case that was refused: the reference frame, stood on its end.
  assert.equal(importAnalysisImageSizeOk(maxWidth, maxHeight), true);
  assert.equal(importAnalysisImageSizeOk(maxHeight, maxWidth), true, 'portrait was the regression');
  // The general property - swapping the axes can never change the verdict.
  for (const [w, h] of [[1600, 900], [900, 1600], [1080, 1920], [400, 1900], [1920, 1080]]) {
    assert.equal(
      importAnalysisImageSizeOk(w, h),
      importAnalysisImageSizeOk(h, w),
      `${w}x${h} and ${h}x${w} must agree`,
    );
  }
  // And it is still a real limit in both directions - the mutation twins.
  assert.equal(importAnalysisImageSizeOk(maxEdge + 1, 16), false, 'longest edge still bounded');
  assert.equal(importAnalysisImageSizeOk(16, maxEdge + 1), false);
  assert.equal(importAnalysisImageSizeOk(1600, 1600), false, `${1600 * 1600} exceeds ${maxPixels}`);
  assert.equal(importAnalysisImageSizeOk(15, 100), false, 'a degenerate sliver is still refused');
  assert.equal(importAnalysisImageSizeOk(100.5, 100), false, 'non-integer dimensions are refused');
});

test('a hand-supplied token is accepted but its expiry is called out', () => {
  const findings = benchCredentialFindings(
    { ...OK_AMBIENT, NOACG_LITE_EVAL_BEARER_TOKEN: 'token' },
    { requireEvalIdentity: true },
  );
  assert.equal(findings.filter((f) => f.severity === 'error').length, 0);
  assert.equal(findings.filter((f) => f.severity === 'warning').length, 1);
});
