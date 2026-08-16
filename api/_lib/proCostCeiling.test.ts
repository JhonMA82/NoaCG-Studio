// The NoaCG Pro per-generation cost ceiling (src/ai/pro/contract.ts).
//
// It lives under api/_lib because this is the repo's ONE TypeScript test harness
// (scripts/run-ai-gateway-tests.mjs compiles these through tsconfig.api.json and runs them in
// the build gate); there is no application unit-test suite under src/. The module under test is
// the dependency-light Pro contract, which `api/` is already entitled to import - the same
// reason PRO_STANDARD_ROUTES lives there rather than beside the pipeline.
//
// Why a test at all, when the ceiling is one number: every path that would exercise it for real
// SPENDS MONEY. The offline stub's costs are zero, so nothing cheap can reach a breach, and a
// cost control nothing cheap can fail is a cost control nobody re-checks after editing it.
//
// WHAT THIS USED TO TEST. Until 2026-08-15 it drove `proSpendExceeds({conceptUsd, interpretUsd})`
// - a helper that summed the retired concept-and-reconstruct engine's two calls. That engine is
// gone and the helper had no caller but this file, so what is pinned now is the CONSTANT and its
// relationship to the two measurements it has been sized against. The enforcement moved to the
// ledger, where a reservation books against this number and refuses the call that would pass it
// (api/_lib/pro/managedCall.ts, `admission.status === 'cost-ceiling'`).

import assert from 'node:assert/strict';
import test from 'node:test';
import { PRO_MAX_GENERATION_COST_USD } from '../../src/ai/pro/contract.js';

/** The retired engine's measured generation: $0.0777 typical, $0.0849 dearest
 *  (`pro-baseline-2026-08-09`, four briefs, 4/4 pass). */
const RETIRED_ENGINE_DEAREST_USD = 0.0849;
/** Phase A's, measured on the first real hosted generations (docs/NOACG_PRO_PLAN.md §16):
 *  $0.0043211 and $0.0034336, one call each. */
const PHASE_A_DEAREST_USD = 0.0043211;

test('the ceiling still clears the dearest generation either engine has produced', () => {
  // Both, not just the live one. The ledger holds rows written under the old engine, and a
  // ceiling that would retroactively have refused them is a ceiling that moved without anyone
  // deciding to move it.
  assert.ok(PRO_MAX_GENERATION_COST_USD > RETIRED_ENGINE_DEAREST_USD);
  assert.ok(PRO_MAX_GENERATION_COST_USD > PHASE_A_DEAREST_USD);
});

test('…and is still low enough to stop a runaway rather than merely exist', () => {
  // Three times the retired engine's own measurement was never a ceiling. Phase A is 20x
  // cheaper, so this bound is now loose by design and NOT by accident - see the constant's own
  // note. Tightening it needs a fresh measurement, not a tidy-up.
  assert.ok(PRO_MAX_GENERATION_COST_USD < 0.25);
  assert.ok(
    PRO_MAX_GENERATION_COST_USD / PHASE_A_DEAREST_USD > 10,
    'the slack against the live engine is real; if this ever fails the ceiling was tightened '
      + 'and its note needs rewriting with it',
  );
});

test('the ceiling is a real number a reservation can book against', () => {
  // The ledger multiplies and compares it. A zero, a NaN or a negative would make every
  // generation either free or impossible, and both fail silently at the reservation.
  assert.equal(Number.isFinite(PRO_MAX_GENERATION_COST_USD), true);
  assert.ok(PRO_MAX_GENERATION_COST_USD > 0);
});
