import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  applyPlan,
  assess,
  assessmentRisks,
} from './cleanup-worktrees.mjs';
import { assessReattach } from './reattach-main.mjs';
import { overlapping, worktreeActivity } from './worktree-activity.mjs';
import {
  inspectLeftoverFolders,
  normalize,
  sweepEmptyLeftoverFolders,
  worktreeRoots,
} from './worktree-cleanup-lib.mjs';

function runGit(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(
    result.status,
    0,
    `git ${args.join(' ')} failed:\n${result.stderr || result.stdout}`,
  );
  return result.stdout.trim();
}

function makeRepo(t) {
  const root = mkdtempSync(join(tmpdir(), 'noacg-worktree-safety-'));
  const origin = join(root, 'origin.git');
  const primary = join(root, 'repo');
  runGit(root, 'init', '--bare', '--initial-branch=main', origin);
  runGit(root, 'clone', origin, primary);
  runGit(primary, 'config', 'user.name', 'Safety Tests');
  runGit(primary, 'config', 'user.email', 'safety-tests@example.invalid');
  writeFileSync(join(primary, 'README.md'), 'initial\n');
  runGit(primary, 'add', 'README.md');
  runGit(primary, 'commit', '-m', 'Initial commit');
  runGit(primary, 'push', '-u', 'origin', 'main');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { primary, root };
}

function addWorktree(primary, name, prefix = 'codex') {
  const branch = `${prefix}/${name}`;
  const path = join(primary, '.claude', 'worktrees', name);
  mkdirSync(join(primary, '.claude', 'worktrees'), { recursive: true });
  runGit(primary, 'worktree', 'add', '-b', branch, path, 'main');
  return { branch, path };
}

function commitInWorktree(worktree, message = 'Feature commit') {
  writeFileSync(join(worktree, 'feature.txt'), `${message}\n`);
  runGit(worktree, 'add', 'feature.txt');
  runGit(worktree, 'commit', '-m', message);
}

test('cleanup assessment refuses a primary checkout that is not on main', (t) => {
  const { primary } = makeRepo(t);
  runGit(primary, 'switch', '-c', 'codex/not-main');

  const plan = assess(primary);

  assert.equal(plan.ok, false);
  assert.match(plan.reason, /must be on main/);
});

test('cleanup does not remove work backed up only by local main', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'local-only');
  commitInWorktree(worktree.path);
  runGit(primary, 'merge', '--ff-only', worktree.branch);

  const plan = assess(primary);
  const worktreeEntry = plan.worktrees.find((entry) => entry.branch === worktree.branch);
  const branchEntry = plan.branches.find((entry) => entry.name === worktree.branch);

  assert.equal(plan.ok, true);
  assert.equal(plan.mainSync.state, 'ahead');
  assert.equal(worktreeEntry.action, 'skip');
  assert.match(worktreeEntry.why, /only contained in local main/);
  assert.equal(branchEntry.action, 'skip');
  assert.match(branchEntry.why, /not backed up to origin\/main/);
  assert.ok(assessmentRisks(plan).length >= 3);
});

test('cleanup removes only a clean, remotely backed-up managed worktree and branch', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'merged');
  commitInWorktree(worktree.path);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');

  const plan = assess(primary);
  assert.equal(plan.ok, true);
  assert.equal(assessmentRisks(plan).length, 0);
  assert.equal(
    plan.worktrees.find((entry) => entry.branch === worktree.branch).action,
    'remove',
  );
  assert.equal(
    plan.branches.find((entry) => entry.name === worktree.branch).action,
    'delete',
  );

  const result = applyPlan(plan, primary, { prunePorts: () => [] });

  assert.deepEqual(result.errors, []);
  assert.equal(existsSync(worktree.path), false);
  assert.equal(runGit(primary, 'branch', '--list', worktree.branch), '');
});

test('cleanup apply rechecks a worktree that became dirty after assessment', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'changed-after-plan');
  commitInWorktree(worktree.path);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');
  const plan = assess(primary);
  writeFileSync(join(worktree.path, 'late-change.txt'), 'do not remove\n');

  const result = applyPlan(plan, primary, { prunePorts: () => [] });

  assert.ok(
    result.errors.some((error) => error.includes('safety state changed after assessment')),
  );
  assert.equal(existsSync(worktree.path), true);
  assert.notEqual(runGit(primary, 'branch', '--list', worktree.branch), '');
});

test('cleanup apply refuses every action if the primary checkout leaves main', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'main-moved');
  commitInWorktree(worktree.path);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');
  const plan = assess(primary);
  runGit(primary, 'switch', '-c', 'admin/not-main');

  const result = applyPlan(plan, primary, { prunePorts: () => [] });

  assert.deepEqual(result.removedWorktrees, []);
  assert.deepEqual(result.deletedBranches, []);
  assert.match(result.errors[0], /no longer on main/);
  assert.equal(existsSync(worktree.path), true);
  assert.notEqual(runGit(primary, 'branch', '--list', worktree.branch), '');
});

test('cleanup apply preserves a branch whose ref moved after assessment', (t) => {
  const { primary } = makeRepo(t);
  writeFileSync(join(primary, 'second.txt'), 'second\n');
  runGit(primary, 'add', 'second.txt');
  runGit(primary, 'commit', '-m', 'Second main commit');
  runGit(primary, 'push', 'origin', 'main');
  runGit(primary, 'branch', 'codex/ref-moved');
  const plan = assess(primary);
  runGit(primary, 'branch', '-f', 'codex/ref-moved', 'HEAD~1');

  const result = applyPlan(plan, primary, { prunePorts: () => [] });

  assert.ok(result.errors.some((error) => error.includes('state changed after assessment')));
  assert.notEqual(runGit(primary, 'branch', '--list', 'codex/ref-moved'), '');
});

test('cleanup treats dirty worktrees as a blocking risk', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'dirty', 'claude');
  writeFileSync(join(worktree.path, 'uncommitted.txt'), 'keep me\n');

  const plan = assess(primary);
  const entry = plan.worktrees.find((item) => item.branch === worktree.branch);

  assert.equal(entry.action, 'skip');
  assert.match(entry.why, /uncommitted changes/);
  assert.ok(assessmentRisks(plan).some((risk) => risk.includes('uncommitted changes')));
});

test('leftover-folder dry run reports empty and non-empty folders without deleting either', (t) => {
  const { primary } = makeRepo(t);
  const base = join(primary, '.claude', 'worktrees');
  const empty = join(base, 'empty');
  const nonEmpty = join(base, 'non-empty');
  mkdirSync(empty, { recursive: true });
  mkdirSync(nonEmpty, { recursive: true });
  writeFileSync(join(nonEmpty, 'keep.txt'), 'keep\n');

  const inspection = inspectLeftoverFolders({
    primaryRoot: primary,
    registeredRoots: worktreeRoots(primary),
    protect: [primary],
  });

  assert.deepEqual(inspection.empty, [normalize(empty)]);
  assert.deepEqual(inspection.nonEmpty, [normalize(nonEmpty)]);
  assert.equal(existsSync(empty), true);
  assert.equal(existsSync(nonEmpty), true);

  const sweep = sweepEmptyLeftoverFolders({
    primaryRoot: primary,
    registeredRoots: worktreeRoots(primary),
    protect: [primary],
  });
  assert.deepEqual(sweep.removed, [normalize(empty)]);
  assert.equal(existsSync(empty), false);
  assert.equal(existsSync(nonEmpty), true);
});

test('activity scan reports other worktrees committed and uncommitted work, never its own', async (t) => {
  const { primary } = makeRepo(t);
  const busy = addWorktree(primary, 'busy');
  commitInWorktree(busy.path, 'Committed but unmerged');
  writeFileSync(join(busy.path, 'src with space.ts'), 'draft\n');
  const idle = addWorktree(primary, 'idle'); // branched off main, nothing done
  writeFileSync(join(primary, 'own-work.txt'), 'own\n');

  const activity = await worktreeActivity(primary);

  assert.deepEqual(
    activity.map((entry) => entry.branch),
    [busy.branch],
    'only the worktree with work in flight is reported',
  );
  const [entry] = activity;
  // Untracked, uncommitted and committed-but-unmerged all count as in flight; the scanning
  // checkout's own files never do, and a path with a space survives intact.
  assert.deepEqual(entry.files, ['feature.txt', 'src with space.ts']);
  assert.equal(entry.uncommitted, 1);
  assert.equal(entry.ahead, 1);
  assert.equal(entry.lastCommit.subject, 'Committed but unmerged');
  assert.equal(existsSync(idle.path), true);

  // Scanned from the busy worktree itself, its own work is what must NOT be listed - the
  // primary checkout sits on main, so it cannot prove the self-exclusion on its own.
  assert.deepEqual(await worktreeActivity(busy.path), []);
});

test('activity scan drops a branch once its work is merged into main', async (t) => {
  const { primary } = makeRepo(t);
  const landed = addWorktree(primary, 'landed');
  commitInWorktree(landed.path, 'Work that lands');
  assert.equal((await worktreeActivity(primary)).length, 1);

  runGit(primary, 'merge', '--ff-only', landed.branch);

  assert.deepEqual(await worktreeActivity(primary), []);
});

test('overlap detection matches only worktrees touching the given files', async (t) => {
  const { primary } = makeRepo(t);
  const busy = addWorktree(primary, 'overlap');
  commitInWorktree(busy.path, 'Touch feature.txt');

  const activity = await worktreeActivity(primary);

  const hit = overlapping(activity, ['src/other.ts', 'feature.txt']);
  assert.deepEqual(hit.map((h) => h.entry.branch), [busy.branch]);
  assert.deepEqual(hit[0].files, ['feature.txt']);
  assert.deepEqual(overlapping(activity, ['src/other.ts']), []);
});

test('reattach gate accepts only clean, reachable detached HEAD state', (t) => {
  const { primary } = makeRepo(t);
  runGit(primary, 'switch', '--detach');

  const clean = assessReattach(primary);
  assert.equal(clean.safe, true);

  writeFileSync(join(primary, 'uncommitted.txt'), 'keep\n');
  const dirty = assessReattach(primary);
  assert.equal(dirty.safe, false);
  assert.match(dirty.reason, /not clean/);
});

test('reattach gate rejects a detached commit not reachable from any branch or remote', (t) => {
  const { primary } = makeRepo(t);
  runGit(primary, 'switch', '--detach');
  writeFileSync(join(primary, 'unique.txt'), 'unique\n');
  runGit(primary, 'add', 'unique.txt');
  runGit(primary, 'commit', '-m', 'Unique detached work');

  const assessment = assessReattach(primary);

  assert.equal(assessment.safe, false);
  assert.match(assessment.reason, /not reachable from any branch or remote/);
});
