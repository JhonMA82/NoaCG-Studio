// guards: scripts/e2e-selection-misses.mjs, docs/work-specs/e2e-suite-budget/evidence/selection-audit.md
// A red main run's failing spec is a selection MISS only when the landing's own plan was a subset
// that did not name it; a full plan, a selected spec and a non-spec failure are not.
import assert from 'node:assert/strict';
import test from 'node:test';

import { changedFilesOf, classify, flakyIn, newlyFailing, summarize } from './e2e-selection-misses.mjs';

test('a spec counts for the run that turned it red, not for the landings that inherited a red main', () => {
  const runs = [
    { sha: 'g1', conclusion: 'success', specs: [] },
    { sha: 'r1', conclusion: 'failure', specs: ['e2e/trim.spec.ts'] },
    { sha: 'r2', conclusion: 'failure', specs: ['e2e/trim.spec.ts'] },
    { sha: 'r3', conclusion: 'failure', specs: ['e2e/trim.spec.ts', 'e2e/other.spec.ts'] },
    { sha: 'g2', conclusion: 'success', specs: [] },
    { sha: 'r4', conclusion: 'failure', specs: ['e2e/trim.spec.ts'] },
  ];
  assert.deepEqual(newlyFailing(runs), [
    { sha: 'r1', specs: ['e2e/trim.spec.ts'] },
    { sha: 'r2', specs: [] },
    { sha: 'r3', specs: ['e2e/other.spec.ts'] },
    { sha: 'r4', specs: ['e2e/trim.spec.ts'] },
  ]);
});

test('a subset plan that omits the failing spec is a miss; a full plan, a selected spec or a quarantined flake is not; a job failure is not a spec', () => {
  const run = { sha: 'abc', specs: ['e2e/editor-fidelity-trim.spec.ts', 'e2e/layout.spec.ts', 'job: Build', 'e2e/editor-groups.spec.ts'] };
  const subset = { mode: 'subset', specs: ['layout.spec.ts', 'wizard-kit.spec.ts'] };
  assert.deepEqual(classify(run, subset, new Set(['editor-groups.spec.ts'])), [
    { spec: 'e2e/editor-fidelity-trim.spec.ts', verdict: 'miss' },
    { spec: 'e2e/layout.spec.ts', verdict: 'selected' },
    { spec: 'job: Build', verdict: 'not-a-spec' },
    { spec: 'e2e/editor-groups.spec.ts', verdict: 'flake' },
  ]);
  const store = { specs: { 'e2e/configured/a.spec.ts': { since: '2026-10-11', count: 1 } }, released: { 'e2e/editor-groups.spec.ts': { last: '2026-10-11', count: 1 }, 'e2e/old.spec.ts': { last: '2026-09-29', count: 2 } } };
  assert.deepEqual([...flakyIn(store, '2026-10-05')].sort(), ['a.spec.ts', 'editor-groups.spec.ts'], 'only entries from the window count');
  assert.deepEqual(classify(run, { mode: 'full', specs: [] }).map((c) => c.verdict), ['full', 'full', 'not-a-spec', 'full']);
  assert.deepEqual(classify({ sha: 'abc', specs: ['e2e/x.spec.ts'] }, { mode: 'none', specs: [] }), [{ spec: 'e2e/x.spec.ts', verdict: 'miss' }], 'a landing that planned nothing and broke a spec is the plainest miss');
});

test('the summary counts misses and names the fix', () => {
  const rows = [
    { sha: 'abcdef0123', runId: 1, spec: 'e2e/a.spec.ts', verdict: 'miss' },
    { sha: 'abcdef0123', runId: 1, spec: 'e2e/b.spec.ts', verdict: 'selected' },
    { sha: 'fedcba9876', runId: 2, spec: 'e2e/c.spec.ts', verdict: 'full' },
  ];
  const { misses, text } = summarize(rows);
  assert.equal(misses.length, 1);
  assert.match(text, /Selection misses: 1 of 3 failing spec\(s\) on 2 red main run\(s\)/);
  assert.match(text, /`e2e\/a\.spec\.ts` \| miss - add a covers line or a shared-set entry/);
  assert.match(summarize([]).text, /No miss in this window/);
});

test('the diff spans from the previous completed run, and a shallow checkout fetches both ends first', () => {
  const calls = [];
  const git = (...a) => {
    calls.push(a.join(' '));
    if (a[0] === 'cat-file') throw new Error('missing');
    if (a[0] === 'diff') return 'src/x.ts\n\ne2e/y.spec.ts\n';
    return '';
  };
  assert.deepEqual(changedFilesOf('deadbeef', 'cafe0000', git), ['src/x.ts', 'e2e/y.spec.ts']);
  assert.ok(calls.includes('fetch --quiet origin deadbeef cafe0000'), 'fetched the run and its base');
  assert.ok(calls.includes('diff --name-only cafe0000 deadbeef'), 'diffed from the previous run, not the parent');
  calls.length = 0;
  changedFilesOf('deadbeef', undefined, git);
  assert.ok(calls.includes('diff --name-only deadbeef^1 deadbeef'), 'without a previous run the parent is the base');
  assert.ok(calls.includes('fetch --quiet origin deadbeef'), 'a parent is reachable from the commit itself');
});
