// `npm run test:e2e:affected` is the PER-MERGE gate (docs/DEPLOYMENT.md, AGENTS.md "Verifying
// changes"), and it can spawn TWO Playwright processes: the mapped-or-full suite, then the
// catalog calibration tripwire under its own config. Whatever it exits with is the whole verdict
// a person or a CI step reads.
//
// That makes the aggregation a silent-failure surface: report only the LAST run's status and a
// red suite followed by a green catalog gate exits 0. Nobody would notice - the failure list is
// thousands of lines above the prompt, and the headline says the gate passed. The repo has
// already been burned twice by trusting a headline over a failure list (~/.claude memory,
// "Pipe masks exit codes"), so the rule is pinned here rather than left to a careful reading of
// the runner.
//
// `runPlan` takes its spawner as an argument for exactly this reason: the behaviour can be
// driven with fake exit codes, with no dev server, no browser and no minutes on the clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPlan, runsFor, summariseRuns } from './e2e-affected.mjs';

/** A spawner that returns canned statuses in order, and records what it was asked to run. */
function fakeRunner(...statuses) {
  const seen = [];
  const run = (r) => {
    seen.push(r.name);
    return statuses.length > 0 ? statuses.shift() : 0;
  };
  run.seen = seen;
  return run;
}

const SUBSET_WITH_CATALOG = { mode: 'subset', specs: ['sports.spec.ts'], catalog: true };

test('a failed suite is not hidden by a catalog gate that passes afterwards', () => {
  const run = fakeRunner(1, 0);
  const { status, runs } = runPlan(SUBSET_WITH_CATALOG, run);

  assert.equal(status, 1, 'the overall status must stay red');
  assert.deepEqual(run.seen, ['suite', 'catalog gate'], 'both runs still execute');
  assert.deepEqual(
    runs.map((r) => [r.name, r.status]),
    [
      ['suite', 1],
      ['catalog gate', 0],
    ],
  );
});

test('the first failure keeps its own exit code, rather than being flattened to 1', () => {
  // Playwright exits 1 for test failures but other codes exist (e.g. a config or worker fault).
  // Reporting the FIRST failure's code keeps that distinction reachable.
  const { status } = runPlan(SUBSET_WITH_CATALOG, fakeRunner(2, 1));
  assert.equal(status, 2);
});

test('a failure in the second run is reported too', () => {
  const { status } = runPlan(SUBSET_WITH_CATALOG, fakeRunner(0, 1));
  assert.equal(status, 1);
});

test('all-successful runs still return success', () => {
  const run = fakeRunner(0, 0);
  const { status } = runPlan(SUBSET_WITH_CATALOG, run);
  assert.equal(status, 0);
  assert.deepEqual(run.seen, ['suite', 'catalog gate']);
});

test('a spawn that never reported an exit code counts as a failure', () => {
  // spawnSync reports `status: null` when the process was killed by a signal or failed to start.
  // Treating that as 0 is the same false green by another route.
  assert.equal(runPlan(SUBSET_WITH_CATALOG, fakeRunner(null, 0)).status, 1);
  assert.equal(runPlan(SUBSET_WITH_CATALOG, fakeRunner(undefined, 0)).status, 1);
});

test('the run list matches the plan - and an empty spec list never reaches Playwright', () => {
  // `full` deliberately runs Playwright with no spec arguments (that IS the whole suite); a
  // `subset` with an empty list must run NOTHING, because those two spell the same command line.
  assert.deepEqual(runsFor({ mode: 'full', specs: [], catalog: true }).map((r) => r.name), [
    'suite',
    'catalog gate',
  ]);
  assert.deepEqual(runsFor({ mode: 'subset', specs: ['ux.spec.ts'], catalog: false }).map((r) => r.args), [
    ['playwright', 'test', 'ux.spec.ts'],
  ]);
  assert.deepEqual(runsFor({ mode: 'none', specs: [], catalog: true }).map((r) => r.name), ['catalog gate']);
  assert.deepEqual(runsFor({ mode: 'none', specs: [], catalog: false }), []);
});

test('nothing to run is a pass, and spawns nothing', () => {
  const run = fakeRunner();
  const { status, runs } = runPlan({ mode: 'none', specs: [], catalog: false }, run);
  assert.equal(status, 0);
  assert.deepEqual(runs, []);
  assert.deepEqual(run.seen, []);
});

test('the summary names which run went red', () => {
  const { status, runs } = runPlan(SUBSET_WITH_CATALOG, fakeRunner(1, 0));
  const line = summariseRuns(runs, status);
  assert.match(line, /suite FAILED \(exit 1\)/);
  assert.match(line, /catalog gate passed/);
  assert.match(line, /Overall: FAILED \(exit 1\)/);

  const green = runPlan(SUBSET_WITH_CATALOG, fakeRunner(0, 0));
  assert.match(summariseRuns(green.runs, green.status), /Overall: passed/);
});
