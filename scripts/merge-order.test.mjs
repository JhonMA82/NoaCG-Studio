// Ordering advice is only worth having if it is measured, so these tests build real git
// histories and check the verdicts against them. Every case here is one this checkout has
// actually hit: a free branch alongside an expensive one, a rename that lands on top of
// someone else's edits, two branches minting the same migration number, and a stacked pair.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { assessMergeOrder, verdictFor } from './merge-order.mjs';

function runGit(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function write(root, path, contents) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

function makeRepo(t) {
  const root = mkdtempSync(join(tmpdir(), 'noacg-merge-order-'));
  runGit(root, 'init', '--initial-branch=main', '.');
  runGit(root, 'config', 'user.name', 'Merge Order Tests');
  runGit(root, 'config', 'user.email', 'merge-order@example.invalid');
  write(root, 'shared.txt', 'one\ntwo\nthree\n');
  write(root, 'quiet.txt', 'untouched\n');
  runGit(root, 'add', '-A');
  runGit(root, 'commit', '-m', 'Initial commit');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

/** Commit `files` on a fresh branch off main, then return to main. */
function branchWith(root, branch, files, { extraGitArgs = [] } = {}) {
  runGit(root, 'checkout', '-q', '-b', branch, 'main');
  for (const [path, contents] of Object.entries(files)) write(root, path, contents);
  if (extraGitArgs.length > 0) runGit(root, ...extraGitArgs);
  runGit(root, 'add', '-A');
  runGit(root, 'commit', '-m', `work on ${branch}`);
  runGit(root, 'checkout', '-q', 'main');
}

test('a branch that conflicts with nobody ranks first and reads clear', async (t) => {
  const root = makeRepo(t);
  branchWith(root, 'feature/free', { 'docs/note.md': 'standalone\n' });
  branchWith(root, 'feature/left', { 'shared.txt': 'LEFT\ntwo\nthree\n' });
  branchWith(root, 'feature/right', { 'shared.txt': 'RIGHT\ntwo\nthree\n' });

  const assessment = await assessMergeOrder(root);
  assert.equal(assessment.order[0].branch, 'feature/free');
  assert.equal(verdictFor(assessment, 'feature/free').severity, 'clear');

  // The two that fight over shared.txt each impose exactly that one file on the other.
  const left = verdictFor(assessment, 'feature/left');
  assert.equal(left.severity, 'caution', 'one conflicted file is normal parallel work, not a hold');
  assert.equal(left.landFirst, 'feature/free');
});

test('a rename over someone else\'s edits is held, and sinks to the end of the order', async (t) => {
  const root = makeRepo(t);
  branchWith(root, 'feature/editor', { 'shared.txt': 'one\ntwo\nEDITED\n' });
  branchWith(root, 'feature/mover', {}, { extraGitArgs: ['mv', 'shared.txt', 'moved.txt'] });

  const assessment = await assessMergeOrder(root);
  assert.equal(assessment.order.at(-1).branch, 'feature/mover', 'the mover lands last');

  const verdict = verdictFor(assessment, 'feature/mover');
  assert.equal(verdict.severity, 'hold');
  assert.equal(verdict.landFirst, 'feature/editor');
  assert.ok(
    verdict.reasons.some((reason) => reason.kind === 'structural'),
    `expected a structural reason, got ${JSON.stringify(verdict.reasons)}`,
  );

  // The other side is the cheap one and must not be discouraged from going first.
  assert.equal(verdictFor(assessment, 'feature/editor').severity, 'clear');
});

test('two branches minting the same migration number collide even though git merges cleanly', async (t) => {
  const root = makeRepo(t);
  branchWith(root, 'feature/alpha', { 'supabase/migrations/0024_alpha.sql': 'select 1;\n' });
  branchWith(root, 'feature/beta', { 'supabase/migrations/0024_beta.sql': 'select 2;\n' });

  const assessment = await assessMergeOrder(root);
  const alpha = assessment.branches.find((entry) => entry.branch === 'feature/alpha');
  assert.equal(alpha.imposed, 0, 'git itself reports no conflict - that is the whole trap');
  assert.equal(alpha.silent.length, 1);

  const verdict = verdictFor(assessment, 'feature/alpha');
  assert.ok(
    verdict.reasons.some((reason) => reason.kind === 'sequence'),
    `expected a sequence collision, got ${JSON.stringify(verdict.reasons)}`,
  );

  // A DIFFERENT number is never a duplicate. It can still be out of order, which is a separate
  // and much milder finding - so assert on the kind rather than on "no notes at all".
  branchWith(root, 'feature/gamma', { 'supabase/migrations/0025_gamma.sql': 'select 3;\n' });
  const later = await assessMergeOrder(root);
  const gamma = later.branches.find((entry) => entry.branch === 'feature/gamma');
  assert.ok(!gamma.silent.some((note) => note.kind === 'sequence'), 'a distinct number is not a duplicate');
  assert.ok(gamma.silent.every((note) => note.severity === 'caution'), 'nothing about gamma is a hold');
});

test('a higher migration number is a caution against a lower one still pending, and sorts behind it', async (t) => {
  const root = makeRepo(t);
  branchWith(root, 'feature/lower', { 'supabase/migrations/0024_lower.sql': 'select 1;\n' });
  branchWith(root, 'feature/higher', { 'supabase/migrations/0025_higher.sql': 'select 2;\n' });

  const assessment = await assessMergeOrder(root);
  const higher = assessment.branches.find((entry) => entry.branch === 'feature/higher');
  assert.equal(higher.imposed, 0, 'git reports no conflict - different file names never clash');

  const verdict = verdictFor(assessment, 'feature/higher');
  const note = verdict.reasons.find((reason) => reason.kind === 'sequence-order');
  assert.ok(note, `expected a sequence-order reason, got ${JSON.stringify(verdict.reasons)}`);
  assert.equal(note.severity, 'caution', 'out of order is a warning, not a stop');
  assert.equal(verdict.severity, 'caution');

  // The warning is only useful if the recommended order actually fixes it.
  const order = assessment.order.map((entry) => entry.branch);
  assert.ok(
    order.indexOf('feature/lower') < order.indexOf('feature/higher'),
    `lower number must land first, got ${order.join(' -> ')}`,
  );

  // The lower-numbered branch causes nothing and must stay clean.
  assert.equal(verdictFor(assessment, 'feature/lower').severity, 'clear');
});

test('a migration number the target already holds is reported, though git merges it cleanly', async (t) => {
  const root = makeRepo(t);
  write(root, 'supabase/migrations/0023_already_on_main.sql', 'select 0;\n');
  runGit(root, 'add', '-A');
  runGit(root, 'commit', '-m', 'Add a migration to main');
  branchWith(root, 'feature/reuses', { 'supabase/migrations/0023_reused.sql': 'select 1;\n' });

  const assessment = await assessMergeOrder(root);
  const branch = assessment.branches.find((entry) => entry.branch === 'feature/reuses');
  assert.equal(branch.imposed, 0);

  const verdict = verdictFor(assessment, 'feature/reuses');
  assert.ok(
    verdict.reasons.some((reason) => reason.kind === 'sequence-taken'),
    `expected a sequence-taken reason, got ${JSON.stringify(verdict.reasons)}`,
  );
});

test('a number above everything on the target is not flagged', async (t) => {
  const root = makeRepo(t);
  write(root, 'supabase/migrations/0023_already_on_main.sql', 'select 0;\n');
  runGit(root, 'add', '-A');
  runGit(root, 'commit', '-m', 'Add a migration to main');
  branchWith(root, 'feature/next-number', { 'supabase/migrations/0024_next.sql': 'select 1;\n' });

  const assessment = await assessMergeOrder(root);
  assert.deepEqual(assessment.branches.find((entry) => entry.branch === 'feature/next-number').silent, []);
  assert.equal(verdictFor(assessment, 'feature/next-number').severity, 'clear');
});

test('sequence numbers compare numerically, not as strings', async (t) => {
  const root = makeRepo(t);
  branchWith(root, 'feature/nine', { 'supabase/migrations/0009_nine.sql': 'select 9;\n' });
  branchWith(root, 'feature/ten', { 'supabase/migrations/0010_ten.sql': 'select 10;\n' });

  const assessment = await assessMergeOrder(root);
  // As strings "0010" < "0009" would be false and the note would land on the wrong branch.
  assert.ok(
    verdictFor(assessment, 'feature/ten').reasons.some((reason) => reason.kind === 'sequence-order'),
    'the higher number (0010) is the one that lands out of order',
  );
  assert.equal(verdictFor(assessment, 'feature/nine').severity, 'clear');
});

test('a stacked branch is held behind the branch it contains', async (t) => {
  const root = makeRepo(t);
  branchWith(root, 'feature/base', { 'base.txt': 'base\n' });
  runGit(root, 'checkout', '-q', '-b', 'feature/stacked', 'feature/base');
  write(root, 'stacked.txt', 'stacked\n');
  runGit(root, 'add', '-A');
  runGit(root, 'commit', '-m', 'work on feature/stacked');
  runGit(root, 'checkout', '-q', 'main');

  const assessment = await assessMergeOrder(root);
  const verdict = verdictFor(assessment, 'feature/stacked');
  assert.deepEqual(verdict.blockedBy, ['feature/base']);
  assert.equal(verdict.severity, 'hold');
  assert.equal(verdict.landFirst, 'feature/base');

  const order = assessment.order.map((entry) => entry.branch);
  assert.ok(
    order.indexOf('feature/base') < order.indexOf('feature/stacked'),
    `ancestor must precede the branch stacked on it, got ${order.join(' -> ')}`,
  );
});

test('a lone branch costs nobody anything, however wide it is', async (t) => {
  const root = makeRepo(t);
  // Nothing else is in flight, so even a rename has no one to impose on.
  branchWith(root, 'feature/only', {}, { extraGitArgs: ['mv', 'shared.txt', 'moved.txt'] });

  const assessment = await assessMergeOrder(root);
  const verdict = verdictFor(assessment, 'feature/only');
  assert.equal(verdict.severity, 'clear');
  assert.equal(verdict.landFirst, null);
});

test('equally expensive branches are cautions, not holds - the queue has to start somewhere', async (t) => {
  const root = makeRepo(t);
  // Each branch moves a file the other edits, so neither is the cheap one to wait for.
  branchWith(root, 'feature/one', { 'quiet.txt': 'edited by one\n' }, { extraGitArgs: ['mv', 'shared.txt', 'one.txt'] });
  branchWith(root, 'feature/two', { 'shared.txt': 'edited by two\ntwo\nthree\n' }, { extraGitArgs: ['mv', 'quiet.txt', 'two.txt'] });

  const assessment = await assessMergeOrder(root);
  for (const branch of ['feature/one', 'feature/two']) {
    const verdict = verdictFor(assessment, branch);
    assert.ok(
      verdict.reasons.some((reason) => reason.kind === 'structural'),
      `${branch} should still report the structural cost, got ${JSON.stringify(verdict.reasons)}`,
    );
    assert.equal(verdict.severity, 'caution', `${branch} has no cheaper alternative to wait for`);
    assert.equal(verdict.landFirst, null);
  }
});

test('a dirty branch is reported as not landable rather than ordered', async (t) => {
  const root = makeRepo(t);
  branchWith(root, 'feature/dirty', { 'dirty.txt': 'committed\n' });
  runGit(root, 'checkout', '-q', 'feature/dirty');
  write(root, 'dirty.txt', 'uncommitted edit\n');

  const assessment = await assessMergeOrder(root);
  assert.ok(
    assessment.notReady.some((entry) => entry.branch === 'feature/dirty' && /uncommitted/.test(entry.reason)),
    `expected feature/dirty in notReady, got ${JSON.stringify(assessment.notReady)}`,
  );
  assert.ok(!assessment.order.some((entry) => entry.branch === 'feature/dirty'));
});

test('an empty checkout answers honestly instead of inventing an order', async (t) => {
  const root = makeRepo(t);
  const assessment = await assessMergeOrder(root);
  assert.deepEqual(assessment.branches, []);
  assert.deepEqual(assessment.order, []);
});
