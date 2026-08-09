// The NoaCG Pro per-generation cost ceiling (src/ai/pro/contract.ts).
//
// It lives under api/_lib because this is the repo's ONE TypeScript test harness
// (scripts/run-ai-gateway-tests.mjs compiles these through tsconfig.api.json and runs them in
// the build gate); there is no application unit-test suite under src/. The module under test is
// the dependency-light Pro contract, which `api/` is already entitled to import - the same
// reason PRO_STANDARD_ROUTES lives there rather than beside the pipeline.
//
// Why a test at all, when the ceiling is three lines: every path that would exercise it for
// real SPENDS MONEY. e2e/pro.spec.ts drives the deterministic stub, whose costs are zero, so it
// can never reach a breach; the paid bench can, at about $0.08 a try. A cost control nothing
// cheap can fail is a cost control nobody re-checks after editing it.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRO_MAX_GENERATION_COST_USD,
  proSpendExceeds,
} from '../../src/ai/pro/contract.js';

test('the ceiling sits above the measured generation and below a runaway', () => {
  // pro-baseline-2026-08-09: $0.0777 per generation, dearest brief $0.0849.
  assert.ok(PRO_MAX_GENERATION_COST_USD > 0.0849, 'the dearest measured brief must pass');
  assert.ok(PRO_MAX_GENERATION_COST_USD < 0.25, 'three times the measurement is not a ceiling');
});

test('a normal generation passes, at both the typical and the dearest measured split', () => {
  assert.equal(proSpendExceeds({ conceptUsd: 0.0671, interpretUsd: 0.0068 }), false);
  assert.equal(proSpendExceeds({ conceptUsd: 0.0671, interpretUsd: 0.0178 }), false);
});

test('the ceiling counts BOTH calls, not the image alone', () => {
  // Each half is comfortably under on its own; together they are over. The bench had exactly
  // this bug in reverse (docs/ADMIN.md §9) - counting one call and reporting the run as within
  // its ceiling - so this is the property worth pinning, not the arithmetic.
  assert.equal(proSpendExceeds({ conceptUsd: 0.09 }), false);
  assert.equal(proSpendExceeds({ interpretUsd: 0.09 }), false);
  assert.equal(proSpendExceeds({ conceptUsd: 0.09, interpretUsd: 0.09 }), true);
});

test('exactly at the ceiling is allowed; a hundredth of a cent over is not', () => {
  assert.equal(proSpendExceeds({ conceptUsd: PRO_MAX_GENERATION_COST_USD }), false);
  assert.equal(proSpendExceeds({ conceptUsd: PRO_MAX_GENERATION_COST_USD + 0.0001 }), true);
});

test('an unreported cost counts as zero rather than as a breach', () => {
  // The documented reading, matching how api/_lib/lite/generations.ts treats an actual spend:
  // silence from the provider is not proof of a breach. Stated here so a future change to the
  // opposite reading is a deliberate edit to a failing test, not a quiet flip.
  assert.equal(proSpendExceeds({ conceptUsd: null, interpretUsd: null }), false);
  assert.equal(proSpendExceeds({}), false);
  assert.equal(proSpendExceeds({ conceptUsd: null, interpretUsd: 0.2 }), true);
});

test('an explicit ceiling overrides the default in both directions', () => {
  assert.equal(proSpendExceeds({ conceptUsd: 0.0777 }, 0.05), true);
  assert.equal(proSpendExceeds({ conceptUsd: 0.5 }, 1), false);
});
