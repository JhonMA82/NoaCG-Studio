// guards: src/output/reload.ts, src/control/outputRecovery.ts
//
// A TAKE AT THE MOMENT AN OUTPUT RELOADS IS NEVER LOST (issue #757). Prepare for Live and a new
// renderer build reload the output page once nothing is on air, after probing its own URL. A Take
// that lands while that probe is out stays on air and the reload waits; a Take that reaches the log
// after the reload has started is replayed by the reloaded page. Pure, run here in Node.

import test from 'node:test';
import assert from 'node:assert/strict';

const { reloadWhenClear } = await import('../src/output/reload.ts');
const { planOutputRecovery, seqBaselines, alreadyInSnapshot } = await import('../src/control/outputRecovery.ts');

/** An output page whose URL probe is held open until `answer` is called. */
function page() {
  let air = 0;
  let reloads = 0;
  let answer;
  const pending = new Promise((resolve) => {
    answer = resolve;
  });
  const doors = { probe: () => pending, onAir: () => air, reload: () => (reloads += 1) };
  return { doors, answer: (ok) => answer(ok), take: () => (air += 1), get reloads() { return reloads; } };
}

test('a Take that lands while the URL probe is out keeps the page up', async () => {
  const p = page();
  // Prepare for Live found nothing on air and asked for the reload.
  const reloading = reloadWhenClear(p.doors);
  p.take();
  p.answer(true);
  assert.equal(await reloading, false, 'the caller is told it did not reload, and waits for air to clear');
  assert.equal(p.reloads, 0);
});

test('with nothing on air, the page reloads once its URL answers', async () => {
  const p = page();
  const reloading = reloadWhenClear(p.doors);
  assert.equal(p.reloads, 0, 'not before the probe answers');
  p.answer(true);
  assert.equal(await reloading, true);
  assert.equal(p.reloads, 1);
});

test('a URL that does not answer, or throws, never reloads', async () => {
  const p = page();
  const reloading = reloadWhenClear(p.doors);
  p.answer(false);
  assert.equal(await reloading, false);
  assert.equal(p.reloads, 0);

  let reloads = 0;
  const thrown = await reloadWhenClear({ probe: () => Promise.reject(new TypeError('Failed to fetch')), onAir: () => 0, reload: () => (reloads += 1) });
  assert.equal(thrown, false);
  assert.equal(reloads, 0);
});

test('a Take that reaches the log after the reload started is replayed by the reloaded page', () => {
  // Both graphics last reported at seq 40. The Take of Strap is row 41: the old page never reported
  // it (a report waits 800 ms), or never applied it before it unloaded.
  const live = { Scorebug: { seq: 40, event: 900 }, Strap: { seq: 40, event: 900 } };
  const plan = planOutputRecovery(['Scorebug', 'Strap'], seqBaselines(live));
  assert.equal(plan.followFrom, 40, 'the boot reads the log after the oldest report');
  assert.equal(alreadyInSnapshot(plan.snapshotAt, 'Strap', 41), false, 'the Take is replayed');

  // The old page did report Strap after the Take: its pose comes back from the report, and the
  // row is not played a second time.
  const reported = planOutputRecovery(['Scorebug', 'Strap'], seqBaselines({ ...live, Strap: { seq: 41, event: 901 } }));
  assert.equal(reported.followFrom, 40);
  assert.equal(alreadyInSnapshot(reported.snapshotAt, 'Strap', 41), true);
});
