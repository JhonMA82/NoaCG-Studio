// The Usage section's outcome and cost rules, pinned against the WHOLE status vocabulary.
//
// Why this file exists: the same two rules live in migration 0026 (SQL, for the overview) and
// in usage.ts (JavaScript, for this section). 0026 corrected only the SQL half, and for a day
// production showed "26 failed / $0.09" beside "19 failed, 7 declined / $0.01" computed from
// the same rows. Nothing failed, because nothing checked. These assertions enumerate every
// value LiteGenerationStatus can hold, so a status added without a decision here fails loudly.

import assert from 'node:assert/strict';
import test from 'node:test';
import { committed, generationOutcome, spent } from './usage.js';
import type { LiteGenerationStatus } from '../aiLiteStore.js';

/** Every value the column can hold - kept as a typed literal so widening
 *  LiteGenerationStatus without updating this list is a TYPE error, not a silent gap. */
const EVERY_STATUS: Record<LiteGenerationStatus, ReturnType<typeof generationOutcome>> = {
  reserved: 'in-flight',
  model_running: 'in-flight',
  spec_ready: 'in-flight',
  usable: 'success',
  accepted: 'success',
  failed: 'failure',
  // The guardrail firing. Counting this as a failure is the bug this file guards.
  unsupported: 'declined',
  // A reservation nobody came back for: an abandoned tab, not a fault of ours.
  expired: 'in-flight',
};

test('every generation status classifies exactly as migration 0026 classifies it', () => {
  for (const [status, expected] of Object.entries(EVERY_STATUS)) {
    assert.equal(generationOutcome(status), expected, `${status} should be ${expected}`);
  }
});

test('only `failed` is a failure - a decline and an abandoned reservation are not', () => {
  const failures = Object.entries(EVERY_STATUS).filter(([, outcome]) => outcome === 'failure');
  assert.deepEqual(failures.map(([status]) => status), ['failed']);
  assert.equal(generationOutcome('unsupported'), 'declined');
  assert.notEqual(generationOutcome('expired'), 'failure');
});

test('an unknown status is in-flight, never a failure', () => {
  // A status this build has not heard of must not inflate the number that sends someone to
  // investigate a subsystem - the honest default is "not an outcome yet".
  assert.equal(generationOutcome('some_future_state'), 'in-flight');
});

test('spend counts only generations that reached a provider', () => {
  assert.equal(spent({ model: 'google/gemini-2.5-flash-lite', provider_cost_usd: 0.0031 }), 0.0031);
  // The reservation ceiling on a generation that never chose a route: booked, never incurred.
  assert.equal(spent({ model: null, provider_cost_usd: 0.007 }), 0);
  assert.equal(spent({ model: 'x', provider_cost_usd: '0.25' }), 0.25);
  assert.equal(spent({ model: 'x', provider_cost_usd: 'not a number' }), 0);
});

test('the fleet bar counts reservations at their ceiling, unlike spend', () => {
  // Deliberately different: this mirrors what reserve_ai_lite_generation sums (migration
  // 0013), so the bar reads the same number that does the refusing.
  assert.equal(committed({ model: null, provider_cost_usd: 0.007 }), 0.007);
  assert.equal(spent({ model: null, provider_cost_usd: 0.007 }), 0);
});

test("prod's own numbers: 43 generations split 17 usable / 19 failed / 7 declined", () => {
  // The shape that exposed the bug. The old set folded the 7 declines into the failures and
  // reported 26 - the number that sent someone looking for a broken subsystem.
  const ledger = [
    ...Array.from({ length: 17 }, () => 'usable'),
    ...Array.from({ length: 19 }, () => 'failed'),
    ...Array.from({ length: 7 }, () => 'unsupported'),
  ];
  const tally = ledger.reduce<Record<string, number>>((acc, status) => {
    const outcome = generationOutcome(status);
    return { ...acc, [outcome]: (acc[outcome] ?? 0) + 1 };
  }, {});
  assert.deepEqual(tally, { success: 17, failure: 19, declined: 7 });
  assert.equal(ledger.length, 43);
});
