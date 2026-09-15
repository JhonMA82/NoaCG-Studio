// The reclaimer decides to KILL processes on a machine somebody is working on, unattended, at
// night. So it is tested the way `db-push.test.mjs` tests the migration classifier: the safe
// answers are checked one by one, and the failing-closed answer is checked for every shape that
// is not explicitly allowed - because the guard is the classifier, not the prose around it.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { orphanProcesses } from './e2e-runs.mjs';

import { RECLAIMABLE, RECLAIM_AFTER_MS, classifyForReclaim, describeReclaim, planReclaim } from './ram-reclaim.mjs';

test('only the named leftover kinds may be closed', () => {
  for (const kind of Object.keys(RECLAIMABLE)) {
    const verdict = classifyForReclaim({ pid: 1234, kind });
    assert.equal(verdict.action, 'kill', `${kind} is a leftover by construction`);
    assert.equal(verdict.reason, RECLAIMABLE[kind]);
  }
});

test('the classifier fails closed on everything it does not recognise', () => {
  const strangers = [
    { pid: 1, kind: 'node' },
    { pid: 2, kind: 'vite-dev-server' },
    { pid: 3, kind: 'chrome' },
    { pid: 4, kind: 'looks-expensive' },
    { pid: 5, kind: '' },
    { pid: 6 },
    { pid: 7, kind: 'PLAYWRIGHT-WORKER' }, // near-miss spelling is still a stranger
    { kind: 'playwright-worker' }, // no pid
    { pid: 0, kind: 'playwright-worker' },
    { pid: -1, kind: 'playwright-worker' },
    null,
    undefined,
  ];
  for (const stranger of strangers) {
    assert.equal(classifyForReclaim(stranger).action, 'keep', `${JSON.stringify(stranger)} must be kept`);
  }
  assert.match(classifyForReclaim({ pid: 9, kind: 'chrome' }).reason, /fails closed/);
});

test('a leftover with a live owner is not a leftover', () => {
  const verdict = classifyForReclaim({ pid: 99, kind: 'headless-browser-shell', hasLiveOwner: true });
  assert.equal(verdict.action, 'keep');
  assert.match(verdict.reason, /live session owns it/);
});

test('nothing is reclaimed before the queue has been starved for a quarter of an hour', () => {
  const candidates = [{ pid: 11, kind: 'headless-browser-shell' }];
  const now = 10_000_000;
  assert.equal(planReclaim({ starvedSince: null, now, candidates }).action, 'wait');
  assert.equal(planReclaim({ starvedSince: now - 60_000, now, candidates }).action, 'wait');
  assert.equal(planReclaim({ starvedSince: now - RECLAIM_AFTER_MS, now, candidates }).action, 'reclaim');
});

test('a reclaim reports what it freed and NAMES who is holding the rest, without touching them', () => {
  const now = 10_000_000;
  const plan = planReclaim({
    starvedSince: now - RECLAIM_AFTER_MS,
    now,
    candidates: [
      { pid: 11, kind: 'headless-browser-shell' },
      { pid: 12, kind: 'vite-dev-server' },
    ],
    holders: [], // nothing live: this is the only state in which anything may be closed
  });

  assert.deepEqual(plan.kill.map((d) => d.candidate.pid), [11]);
  assert.deepEqual(plan.keep.map((d) => d.candidate.pid), [12]);

  const text = describeReclaim(plan).join('\n');
  assert.match(text, /closing 1 orphaned process/);
  assert.match(text, /kept pid 12/);
});

test('live browser work anywhere on the machine stops the reclaim dead', () => {
  // A catalog sweep drives Chromium through the playwright LIBRARY, so it has no CLI and its
  // browser shells look exactly like a killed run's leftovers. The holders list is what sees it.
  const now = 10_000_000;
  const plan = planReclaim({
    starvedSince: now - RECLAIM_AFTER_MS * 4,
    now,
    candidates: [{ pid: 11, kind: 'headless-browser-shell' }, { pid: 12, kind: 'playwright-worker' }],
    holders: ['C:/claude/NoaCG-Studio/.claude/worktrees/aa (overflow-sweep, pid 900)'],
  });
  assert.deepEqual(plan.kill, [], 'nothing is closed while something is using the machine');
  assert.deepEqual(plan.keep.map((d) => d.candidate.pid), [11, 12]);
  const text = describeReclaim(plan).join('\n');
  assert.match(text, /nothing here is safely reclaimable/);
  // Closing a session is a judgement about work in flight. The reclaimer says who, never does it.
  assert.match(text, /overflow-sweep/);
  assert.match(text, /nobody's to close but its own session/);
});

test('idle suspicion never confers reclaim authority', () => {
  const suspect = { pid: 42, kind: 'run', status: 'suspected-idle', cpuDeltaSeconds: 0 };
  assert.equal(classifyForReclaim(suspect).action, 'keep');
  const plan = planReclaim({ starvedSince: 1, now: RECLAIM_AFTER_MS + 1,
    candidates: [suspect, { pid: 43, kind: 'headless-browser-shell' }], holders: [suspect] });
  assert.deepEqual(plan.kill, []);
  assert.equal(plan.keep.length, 2);
});

test('the actual runner candidate adapter never promotes advisory holder evidence', () => {
  // Invoke the production adapter without starting jobs.mjs's live runner/CLI side effects.
  const source = readFileSync(new URL('./jobs.mjs', import.meta.url), 'utf8');
  const body = source.match(/function reclaimCandidates\(\) \{[\s\S]*?\n\}/)[0];
  const candidateAdapter = new Function('orphanProcesses', 'codexDelegations', `${body}; return reclaimCandidates();`);
  const nodes = [{ pid: 42, command: 'node scripts/l3-sweep.mjs', status: 'suspected-idle', cpuSeconds: 0 }];
  const result = candidateAdapter(() => orphanProcesses({ nodes, shells: [{ pid: 43, mb: 10 }], table: [] }), () => []);
  assert.deepEqual(result, []);
});
