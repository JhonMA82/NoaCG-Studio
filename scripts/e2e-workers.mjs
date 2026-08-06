// HOW MANY PLAYWRIGHT WORKERS THIS MACHINE CAN AFFORD RIGHT NOW.
//
// WHY THIS IS NOT A CONSTANT. The limit on a developer laptop is MEMORY, not cores, and the
// amount of memory available is not a property of the machine - it is a property of the moment.
// Measured on the reference box (Ryzen 7 5800H, 8C/16T, 16 GB), one fixed 119-test set, traces
// off, from ~4.5 GB free at rest - wall time, then the lowest free memory reached during the run:
//
//     6 workers   157.1 s    401 MB free
//     4 workers   151.8 s    651 MB free
//     3 workers   159.7 s   2472 MB free
//
// Six is SLOWER than four: past the memory ceiling another worker buys paging, not parallelism.
// And 651 MB free is not a test run any more - at that point Windows is evicting the editor,
// the browser and everything else to fund it, which is the "my laptop is unusable while tests
// run" complaint in one number.
//
// A hardcoded 3 answered that for one machine on one afternoon. It is wrong the moment the
// conditions move, in both directions: open Premiere and a video project and 3 is too many;
// close everything, or run on a 32 GB desktop, and 3 leaves the box idle. So the number is
// derived from free memory at the moment the config loads.
//
// THE RESERVE IS THE POINT. `RESERVE_MB` is memory this never spends - the headroom the person
// at the keyboard keeps for the work they are doing WHILE the suite runs. Tests get what is
// left over, and if that is only enough for one worker then one worker is the honest answer.
// A slow suite is an annoyance; a machine that stops responding costs the whole session.

import { freemem } from 'node:os';

/**
 * A STEP TABLE, not a formula, because the cost of a worker is not linear and pretending it is
 * produces confident nonsense. From 4535 MB free, 3 workers consumed about 2.0 GB of it while
 * 4 consumed 3.9 GB - the fourth worker cost nearly twice the third, because that is the point
 * where Windows starts reclaiming from other processes to fund the run. Fitting a straight line
 * through those two points yields a negative base cost, which is the arithmetic saying the model
 * is wrong. So each row is anchored on a measurement or a conservative step below one.
 *
 * `minFreeMb` is the free memory at which that many workers still leaves the machine usable.
 * First row that fits wins; anything below the last row gets a single worker.
 */
const LADDER = [
  // 4 was the fastest count measured, but from 4535 MB it left only 651 MB - unusable. It needs
  // roughly a gigabyte more headroom than that before it is a reasonable choice.
  { minFreeMb: 5500, workers: 4 },
  // The benchmarked anchor: 4535 MB free, 3 workers, 2472 MB still free at the low point.
  { minFreeMb: 4200, workers: 3 },
  { minFreeMb: 3000, workers: 2 },
];

/**
 * Below this the run still happens, but it stops competing for what is left. Named separately
 * from the ladder because it is the promise this module makes: the machine stays usable.
 */
const FLOOR_FREE_MB = 1800;

/**
 * Never more than the ladder's top, whatever the machine has. Four was the fastest number
 * measured here and six was SLOWER, so there is no evidence that going higher helps - and this
 * module's job is to apply what was measured, not to extrapolate past it. Raise it deliberately
 * with E2E_WORKERS on a machine where more has actually been shown to pay.
 */
const MAX_WORKERS = LADDER[0].workers;

/**
 * Workers to use for a LOCAL run.
 *
 * @param {object} [opts]
 * @param {number} [opts.freeMb]  free memory to decide from; defaults to the real reading
 * @param {string} [opts.override] an explicit E2E_WORKERS value, which always wins
 * @returns {{ workers: number, reason: string }} the count and a one-line explanation to print
 */
export function chooseWorkers({ freeMb = Math.round(freemem() / (1024 * 1024)), override } = {}) {
  const pinned = Number(override);
  if (Number.isInteger(pinned) && pinned > 0) {
    return { workers: pinned, reason: `E2E_WORKERS=${pinned} (pinned)` };
  }

  const step = LADDER.find((row) => freeMb >= row.minFreeMb);
  if (step) {
    const note = step.workers === MAX_WORKERS ? ` (the measured maximum)` : '';
    return { workers: step.workers, reason: `${freeMb} MB free${note}` };
  }
  return {
    workers: 1,
    reason:
      freeMb >= FLOOR_FREE_MB
        ? `${freeMb} MB free - only enough for one worker`
        : `${freeMb} MB free - the machine is nearly full; expect a slow run`,
  };
}

/**
 * The value a Playwright config should use, printing the choice once so a run's duration is
 * always explainable after the fact. A variable worker count that says nothing would turn every
 * "why was that slower?" into a guess.
 *
 * Playwright re-imports the config inside EVERY worker process, so a bare log here prints once
 * per worker plus once for the runner - and each worker reads a different (lower) free-memory
 * figure, because by then the earlier workers are already running. Only the runner's line means
 * anything; the workers' copies are recomputed and discarded. `TEST_WORKER_INDEX` is set only in
 * a worker, which is how we tell them apart.
 */
export function localWorkers() {
  const { workers, reason } = chooseWorkers({ override: process.env.E2E_WORKERS });
  if (process.env.TEST_WORKER_INDEX === undefined) {
    console.log(`[e2e] ${workers} worker${workers === 1 ? '' : 's'} - ${reason}`);
  }
  return workers;
}
