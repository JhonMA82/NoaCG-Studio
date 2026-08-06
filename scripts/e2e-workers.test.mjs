// The worker count is now a DECISION rather than a constant, and a wrong one is expensive in
// both directions - too many makes the machine unusable, too few makes every run drag. It is
// pure arithmetic over one input, so it is cheap to pin exactly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseWorkers } from './e2e-workers.mjs';

test('an explicit E2E_WORKERS always wins, however little memory is free', () => {
  const { workers, reason } = chooseWorkers({ freeMb: 300, override: '8' });
  assert.equal(workers, 8);
  assert.match(reason, /pinned/);
});

test('a junk or non-positive override is ignored rather than obeyed', () => {
  // '0', 'yes' and '-2' must not silently produce a zero or negative worker count, which
  // Playwright would either reject or interpret as something nobody intended.
  for (const override of ['0', 'yes', '-2', '']) {
    const { workers } = chooseWorkers({ freeMb: 4535, override });
    assert.equal(workers, 3, `override ${JSON.stringify(override)} should fall through`);
  }
});

test('the measured anchor reproduces the number that was benchmarked', () => {
  // 4535 MB free was the reference machine at rest, and 3 workers was the choice that left it
  // usable (2472 MB free at the low point) while costing 5% against the fastest count.
  assert.equal(chooseWorkers({ freeMb: 4535 }).workers, 3);
});

test('more free memory buys more workers, up to the cap', () => {
  assert.equal(chooseWorkers({ freeMb: 5900 }).workers, 4);
  // Beyond the cap the answer stops growing: 6 workers measured SLOWER than 4 here, so there
  // is no evidence to extrapolate on.
  assert.equal(chooseWorkers({ freeMb: 32_000 }).workers, 4);
});

test('a busy machine scales down instead of taking what is left', () => {
  // Premiere with a project open, or a second heavy app, is exactly this case. 3076 MB is the
  // figure actually observed with a 2.9 GB allocation held against this machine.
  assert.equal(chooseWorkers({ freeMb: 3400 }).workers, 2);
  assert.equal(chooseWorkers({ freeMb: 3076 }).workers, 2);
  assert.equal(chooseWorkers({ freeMb: 2300 }).workers, 1);
});

test('the ladder is monotonic - more memory never yields fewer workers', () => {
  // A step table is easy to mis-edit into a non-monotonic mess, and the symptom would be a
  // worker count that jumps around for no reason anyone could explain.
  let previous = 0;
  for (let freeMb = 0; freeMb <= 12_000; freeMb += 100) {
    const { workers } = chooseWorkers({ freeMb });
    assert.ok(workers >= previous, `${freeMb} MB free gave ${workers} after ${previous}`);
    previous = workers;
  }
});

test('the count is never zero or negative, however full the machine is', () => {
  // The floor is 1: the run still happens, it just stops competing for the last of the memory.
  // A zero or negative count would be a crash, not a slow run.
  for (const freeMb of [1800, 1200, 800, 200, 0]) {
    const { workers } = chooseWorkers({ freeMb });
    assert.equal(workers, 1, `${freeMb} MB free`);
  }
  assert.match(chooseWorkers({ freeMb: 200 }).reason, /nearly full/);
  assert.match(chooseWorkers({ freeMb: 2300 }).reason, /only enough for one worker/);
});

test('the reason always names the free memory it decided from', () => {
  // A variable worker count with no explanation makes every "why was that run slow?" a guess.
  assert.match(chooseWorkers({ freeMb: 4535 }).reason, /4535 MB free/);
});
