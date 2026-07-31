// Bulk cleanup of stale worktrees, their merged branches, stale worktree metadata, and empty
// leftover folders - safely, from the primary `main` checkout.
//
// Default is a read-only DRY RUN. Pass --apply to actually delete. The explicitly invoked shared
// cleanup workflow drives this: dry-run, show the plan, then apply when the assessment is clean.
//
// The ONE trustworthy test for "this work is safely in main" is commit containment:
//   git rev-list --count <ref> --not main   == 0
// (equivalently `git merge-base --is-ancestor <ref> main`). Branch names, `gone` upstream
// markers, and human/AI memory are NEVER trusted for a deletion decision - a branch that
// merged main into itself, or an old ancestor tip, both look alarming by name/diff yet are
// fully contained. Automatic removal requires containment in BOTH local main and origin/main:
// local containment proves the primary checkout has the work, and remote containment proves it
// has been backed up outside this machine. Ahead, behind, and divergence are surfaced explicitly.
//
// Containment only sees true ancestry, so a branch merged via "squash and merge" (a new commit,
// not an ancestor of the original branch) never passes it. Those are caught separately by a
// tree-equality heuristic (possiblySquashMerged) and reported for manual review - never deleted
// automatically, since tree equality is a weaker signal than ancestry.
//
// Hard rules (never broken, even with --apply):
//   - never `git branch -D`, never `git worktree remove --force`, never touch main or the
//     current branch;
//   - never remove a worktree with uncommitted changes, or a detached worktree whose HEAD is
//     not contained in main (it may hold unique work);
//   - never delete a non-empty unregistered folder (report it for manual review);
//   - only delete managed claude/* or codex/* branches whose commits are fully contained in local
//     main and origin/main, and even then let `git branch -d` refuse as a final backstop.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { primaryCheckout } from './reattach-main.mjs';
import { pruneStalePorts } from './dev-port.mjs';
import {
  git,
  inspectLeftoverFolders,
  normalize,
  samePath,
  worktreeRoots,
  sweepEmptyLeftoverFolders,
} from './worktree-cleanup-lib.mjs';

/**
 * Ignored paths that removal may destroy without asking, because the repo can rebuild every one
 * of them from a command. EVERYTHING ELSE that git is ignoring is treated as possible work.
 *
 * This list exists because `git status --porcelain` - the clean-tree test every guard in this
 * file relies on - does not mention ignored files at all, and `git worktree remove` deletes them
 * anyway. Measured: a worktree holding `dist/precious.json` and `.env` reports zero porcelain
 * lines, removes with exit 0 and no `--force`, and both files are gone. Bench output directories
 * in this repo hold results that cost real money to produce, so "git said clean" is not evidence
 * that a worktree is disposable.
 */
const REGENERABLE_IGNORED = [
  'node_modules/',
  'dist/',
  'test-results/',
  'playwright-report/',
  'coverage/',
  'public/player-host/',
  'player-host/node_modules/',
  'render-worker/node_modules/',
  'render-worker/remotion/videoFontFaces.generated.ts',
  'supabase/.temp/',
  // Generated per checkout and documented as never-hand-edited (AGENTS.md, docs/DEV_PORTS.md).
  '.claude/launch.json',
  '.claude/dev-port.json',
  // Permission choices, not work: losing it costs a few re-approvals, nothing unrecoverable.
  '.claude/settings.local.json',
];

const MAIN = 'main';
const REMOTE_MAIN = 'origin/main';
const MANAGED_BRANCH_PREFIXES = ['claude/', 'codex/'];

/** True when every commit of `ref` is already reachable from `target`. */
function containedIn(ref, target, cwd) {
  const res = git(['rev-list', '--count', ref, '--not', target], cwd);
  return res.ok && res.stdout === '0';
}

/** Automatic deletion requires both local containment and remote backup. */
function safelyBackedUp(ref, cwd) {
  return containedIn(ref, MAIN, cwd) && containedIn(ref, REMOTE_MAIN, cwd);
}

/**
 * True when `ref`'s tree is already identical to main's, even though its commits are not
 * ancestors of main - the signature of a squash or rebase merge (GitHub "Squash and merge"
 * rewrites history, so ancestry containment never sees it). `git diff --quiet` exits 0 for no
 * difference; only called after containedInMain has already failed, so this never re-flags a
 * true ancestor. Reporting only - never a deletion signal, since a false positive (e.g. a
 * branch that coincidentally matches main's tree without being merged) is possible.
 */
function possiblySquashMerged(ref, cwd) {
  const res = git(['diff', '--quiet', MAIN, ref], cwd);
  return res.ok;
}

/** The branch a worktree has checked out, or null if detached. Reads the porcelain record. */
function worktreeBranches(cwd) {
  const res = git(['worktree', 'list', '--porcelain'], cwd);
  const map = new Map(); // normalized path -> { branch|null, head }
  if (!res.ok) return map;
  let path = null;
  for (const line of res.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      path = normalize(line.slice('worktree '.length));
      map.set(path, { branch: null, head: null });
    } else if (line.startsWith('HEAD ')) {
      if (path) map.get(path).head = line.slice('HEAD '.length).trim();
    } else if (line.startsWith('branch ')) {
      const ref = line.slice('branch '.length).trim();
      if (path) map.get(path).branch = ref.replace('refs/heads/', '');
    }
  }
  return map;
}

/**
 * Split the worktree's IGNORED content into what the repo can rebuild and what it cannot.
 *
 * `--ignored=matching` reports whole ignored directories as one entry rather than walking into
 * them, so this stays cheap even next to a 400MB bench directory. Sizes are measured only for
 * the at-risk entries, since those are the ones a person has to make a decision about.
 */
export function classifyIgnored(worktreePath) {
  const res = git(['status', '--porcelain', '--ignored=matching'], worktreePath);
  const regenerable = [];
  const atRisk = [];
  if (!res.ok) return { regenerable, atRisk, unreadable: true };

  for (const line of res.stdout.split('\n')) {
    if (!line.startsWith('!! ')) continue;
    const entry = line.slice(3).trim().replace(/^"|"$/g, '');
    if (!entry) continue;
    if (REGENERABLE_IGNORED.some((known) => entry === known || entry.startsWith(known))) {
      regenerable.push(entry);
    } else {
      atRisk.push({ path: entry, bytes: sizeOf(join(worktreePath, entry)) });
    }
  }
  return { regenerable, atRisk, unreadable: false };
}

/**
 * Bytes under `target`, capped so a pathological tree cannot make cleanup hang. The cap is
 * reported as a floor (`atLeast`) rather than silently pretending the walk was complete.
 */
function sizeOf(target, { maxEntries = 20000 } = {}) {
  let bytes = 0;
  let entries = 0;
  const stack = [target];
  while (stack.length > 0 && entries < maxEntries) {
    const current = stack.pop();
    let stat;
    try {
      stat = statSync(current);
    } catch {
      continue;
    }
    entries += 1;
    if (stat.isDirectory()) {
      try {
        for (const child of readdirSync(current)) stack.push(join(current, child));
      } catch {
        // Unreadable directory - report what we could measure rather than failing the run.
      }
    } else {
      bytes += stat.size;
    }
  }
  return { bytes, atLeast: entries >= maxEntries };
}

/** Human-readable byte count for the confirmation list. */
export function formatBytes({ bytes, atLeast }) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${atLeast ? '>' : ''}${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)}${units[unit]}`;
}

/**
 * SELF cleanup - the worktree the caller is sitting in, removing itself at the end of a session.
 *
 * The bulk `assess()` below deliberately refuses the current worktree and the current branch,
 * because a sweep must never pull the floor out from under the session driving it. Handoff is
 * the one moment where that is exactly the point: the work has landed, the chat is finished,
 * and the folder is litter that the next session would otherwise mistake for live work.
 *
 * What Windows actually allows, measured rather than assumed: run from the PRIMARY checkout,
 * `git worktree remove` on a worktree that still has a live process inside DEREGISTERS it and
 * deletes every file, failing only on the now-empty directory ("Permission denied"). So the
 * session can clear essentially all of itself; the empty husk unlocks the moment the session
 * exits and `sweepEmptyLeftoverFolders` (already wired into the SessionStart hook) reaps it.
 *
 * Every deletion rule of this file still applies - no `--force`, no `-D`, never `main`, never
 * another worktree, and containment in BOTH local `main` and `origin/main` before anything goes.
 *
 * Returns `{ ok, reasons, primaryRoot, path, branch, head }`; `reasons` lists every blocker
 * found, so a refusal explains itself completely instead of one item at a time.
 */
export function assessSelf(cwd) {
  const reasons = [];
  const here = normalize(cwd);
  const primaryRoot = primaryCheckout(here);
  if (!primaryRoot) return { ok: false, reasons: ['could not locate the primary checkout'], primaryRoot: null, path: null, branch: null, head: null };

  const worktrees = worktreeBranches(primaryRoot);
  // The caller's cwd is usually the worktree root, but may be nested inside it; the longest
  // registered path that contains it is the one that owns this session.
  const path = [...worktrees.keys()]
    .filter((root) => here.toLowerCase() === root.toLowerCase() || here.toLowerCase().startsWith(`${root.toLowerCase()}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (!path) return { ok: false, reasons: ['this directory is not a registered worktree'], primaryRoot, path: null, branch: null, head: null };

  const self = worktrees.get(path);
  const result = { ok: false, reasons, primaryRoot, path, branch: self.branch, head: self.head };

  if (samePath(path, primaryRoot)) reasons.push('this is the primary checkout, which is never removed');
  if (self.branch === MAIN) reasons.push(`this worktree is on ${MAIN}`);
  if (!self.branch) reasons.push('this worktree is detached - it may hold work no branch names');

  const status = git(['status', '--porcelain'], path);
  if (!status.ok) reasons.push('could not read the working tree status');
  else if (status.stdout !== '') reasons.push(`${status.stdout.split('\n').length} uncommitted file(s)`);

  // A merge/rebase/cherry-pick in progress always leaves the tree dirty too, but naming it is
  // clearer than reporting the symptom.
  for (const marker of ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'BISECT_LOG']) {
    if (git(['rev-parse', '--verify', '--quiet', marker], path).ok) reasons.push(`a ${marker} operation is in progress`);
  }

  // Stashes are NOT checked: they live in the shared common dir as refs, so they survive the
  // worktree that made them. Removing this folder cannot lose one.

  if (self.branch && self.branch !== MAIN && !safelyBackedUp(self.branch, primaryRoot)) {
    reasons.push(
      containedIn(self.branch, MAIN, primaryRoot)
        ? `${self.branch} is in local ${MAIN} but not in ${REMOTE_MAIN} - it is not backed up off this machine`
        : `${self.branch} has commits that are not in ${MAIN}`,
    );
  }

  // Ignored content is NOT a refusal - it is a price. `.env` lives in almost every worktree, so
  // blocking on it would mean this never runs; the caller is shown what dies and decides.
  result.ignored = classifyIgnored(path);
  if (result.ignored.unreadable) reasons.push('could not read the ignored-file list');

  result.ok = reasons.length === 0;
  return result;
}

/**
 * Perform the self cleanup an `assessSelf` plan approved. Re-verifies from scratch first: the
 * assessment may be seconds old, but this deletes things, and `main` moves under long sessions.
 *
 * `folderRemains` is the expected Windows outcome, not a failure - the worktree is deregistered
 * and empty, and the husk goes when the session that holds it exits.
 */
export function applySelf(
  plan,
  {
    prunePorts = pruneStalePorts,
    refreshRemote = () => git(['fetch', 'origin', '--prune'], plan.primaryRoot),
    acknowledgeData = false,
  } = {},
) {
  const done = { removedWorktree: false, folderRemains: false, deletedBranch: null, releasedPorts: [], errors: [] };

  // The one thing a clean tree does not prove. Removal destroys ignored content silently, so
  // anything unrecognised must be acknowledged by a person who has seen the list.
  const atRisk = plan.ignored?.atRisk ?? [];
  if (atRisk.length > 0 && !acknowledgeData) {
    done.errors.push(
      `refusing: ${atRisk.length} ignored path(s) here are not regenerable and would be destroyed ` +
        `(${atRisk.map((entry) => entry.path).join(', ')}) - acknowledge them explicitly to proceed`,
    );
    return done;
  }

  const refreshed = refreshRemote();
  if (!refreshed?.ok) {
    done.errors.push(`could not refresh origin before self cleanup: ${refreshed?.stderr || refreshed?.stdout || 'fetch failed'}`);
    return done;
  }

  const recheck = assessSelf(plan.path);
  if (!recheck.ok || recheck.branch !== plan.branch) {
    done.errors.push(`state changed since assessment - ${recheck.reasons.join('; ') || 'branch moved'}`);
    return done;
  }

  // Never --force: a refusal here is git protecting something this assessment did not see.
  const removed = git(['worktree', 'remove', plan.path], plan.primaryRoot);
  const stillRegistered = worktreeBranches(plan.primaryRoot).has(plan.path);
  if (stillRegistered) {
    done.errors.push(`could not remove the worktree: ${removed.stderr || removed.stdout || 'git worktree remove failed'}`);
    return done;
  }
  done.removedWorktree = true;
  done.folderRemains = existsSync(plan.path);

  // Lowercase -d only, as everywhere else here: it refuses anything not fully merged.
  const deleted = git(['branch', '-d', plan.branch], plan.primaryRoot);
  if (deleted.ok) done.deletedBranch = plan.branch;
  else done.errors.push(`worktree removed, but the branch was kept: ${deleted.stderr || deleted.stdout || 'git branch -d refused'}`);

  try {
    done.releasedPorts = prunePorts() ?? [];
  } catch (error) {
    done.errors.push(`could not release the dev port: ${error?.message ?? error}`);
  }

  return done;
}

export function assess(cwd) {
  const plan = {
    ok: true,
    reason: null,
    primaryRoot: null,
    currentBranch: null,
    mainSync: null, // { ahead, behind, state }
    worktrees: [], // { path, branch|null, head, action: 'remove'|'skip', why }
    branches: [], // { name, head, action: 'delete'|'skip', why }
    otherMerged: [], // branches outside managed prefixes (reported, not deleted)
    possibleSquashMerges: [], // tree matches main but not an ancestor - reported, not deleted
    prune: [], // stale worktree metadata git would prune
    emptyFolders: { empty: [], nonEmpty: [], unreadable: [] },
  };

  const primaryRoot = primaryCheckout(cwd);
  if (!primaryRoot) {
    return { ...plan, ok: false, reason: 'not inside a git checkout' };
  }
  plan.primaryRoot = primaryRoot;

  // Rule #8: only ever run from the PRIMARY checkout. A linked worktree cannot delete the
  // folder it is running inside, and its git ops fall through here confusingly.
  const roots = worktreeRoots(cwd);
  const containing = roots
    .filter((r) => samePath(cwd, r) || normalize(cwd).toLowerCase().startsWith(r.toLowerCase() + '/'))
    .sort((a, b) => b.length - a.length)[0];
  if (!containing || !samePath(containing, primaryRoot)) {
    return {
      ...plan,
      ok: false,
      reason:
        `this must run from the primary checkout (${primaryRoot}); current location resolves to ` +
        `${containing ?? normalize(cwd)}. A worktree cannot safely delete itself - cd to the ` +
        'primary checkout and rerun.',
    };
  }

  // main must exist to test containment against.
  if (!git(['rev-parse', '--verify', '--quiet', `refs/heads/${MAIN}`], primaryRoot).ok) {
    return { ...plan, ok: false, reason: `local branch ${MAIN} does not exist` };
  }
  plan.currentBranch =
    git(['symbolic-ref', '-q', '--short', 'HEAD'], primaryRoot).stdout || null; // null when detached
  if (plan.currentBranch !== MAIN) {
    return {
      ...plan,
      ok: false,
      reason:
        `the primary checkout must be on ${MAIN}; it is ` +
        `${plan.currentBranch ? `on ${plan.currentBranch}` : 'detached'}`,
    };
  }

  // Sync status vs origin/main (read-only; fetch is done by the caller before assess()).
  const lr = git(['rev-list', '--left-right', '--count', `${MAIN}...origin/${MAIN}`], primaryRoot);
  if (!lr.ok || !/^\d+\s+\d+$/.test(lr.stdout)) {
    return { ...plan, ok: false, reason: `could not compare ${MAIN} with ${REMOTE_MAIN}` };
  }
  const [ahead, behind] = lr.stdout.split(/\s+/).map(Number);
  const state = ahead && behind ? 'diverged' : ahead ? 'ahead' : behind ? 'behind' : 'in-sync';
  plan.mainSync = { ahead, behind, state };

  const wtInfo = worktreeBranches(primaryRoot);

  // Classify each registered worktree except the primary root itself.
  for (const path of roots) {
    if (samePath(path, primaryRoot)) continue;
    const info = wtInfo.get(path) ?? { branch: null, head: null };
    const entry = { path, branch: info.branch, head: info.head, action: 'skip', why: '' };

    const status = git(['status', '--porcelain'], path);
    if (!status.ok) {
      entry.why = 'could not read working-tree status';
    } else if (status.stdout !== '') {
      entry.why = 'uncommitted changes present';
    } else if (info.branch) {
      if (info.branch === MAIN) {
        entry.why = 'holds main - never removed';
      } else if (safelyBackedUp(info.branch, primaryRoot)) {
        entry.action = 'remove';
        entry.why = `branch ${info.branch} contained in main and origin/main`;
      } else if (containedIn(info.branch, MAIN, primaryRoot)) {
        entry.why = `branch ${info.branch} is only contained in local main, not origin/main`;
      } else {
        entry.why = `branch ${info.branch} has commits not in main`;
      }
    } else {
      // Detached: safe to remove only if the checked-out commit is contained in main.
      if (info.head && safelyBackedUp(info.head, primaryRoot)) {
        entry.action = 'remove';
        entry.why = `detached HEAD ${info.head.slice(0, 7)} contained in main and origin/main`;
      } else if (info.head && containedIn(info.head, MAIN, primaryRoot)) {
        entry.why = 'detached HEAD is only contained in local main, not origin/main';
      } else {
        entry.why = 'detached HEAD not contained in main - may hold unique work';
      }
    }
    plan.worktrees.push(entry);
  }

  // Which branches remain checked out in a worktree we are NOT removing? Those cannot be deleted.
  const keptWorktreeBranches = new Set(
    plan.worktrees.filter((w) => w.action !== 'remove' && w.branch).map((w) => w.branch),
  );

  // Branch classification. Default scope: fully merged managed branches, including ones whose
  // worktree still exists. Other merged branches are reported only.
  const branchList = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], primaryRoot);
  const localBranches = branchList.ok ? branchList.stdout.split('\n').filter(Boolean) : [];
  for (const name of localBranches) {
    if (name === MAIN) continue;
    if (name === plan.currentBranch) continue; // never the current branch
    const head = git(['rev-parse', name], primaryRoot).stdout || null;
    if (!containedIn(name, MAIN, primaryRoot)) {
      // Not an ancestor of main - but a squash/rebase merge lands the same tree under a new
      // commit, so check for that signature before writing the branch off as unmerged.
      if (possiblySquashMerged(name, primaryRoot)) plan.possibleSquashMerges.push(name);
      if (MANAGED_BRANCH_PREFIXES.some((prefix) => name.startsWith(prefix))) {
        plan.branches.push({
          name,
          head,
          action: 'skip',
          why: 'has commits not contained in local main',
        });
      }
      continue; // unmerged (or unconfirmed) branches are left entirely alone
    }
    if (!safelyBackedUp(name, primaryRoot)) {
      plan.branches.push({
        name,
        head,
        action: 'skip',
        why: 'contained in local main but not backed up to origin/main',
      });
      continue;
    }
    if (!MANAGED_BRANCH_PREFIXES.some((prefix) => name.startsWith(prefix))) {
      plan.otherMerged.push(name);
      continue;
    }
    if (keptWorktreeBranches.has(name)) {
      plan.branches.push({
        name,
        head,
        action: 'skip',
        why: 'still checked out in a worktree left in place',
      });
    } else {
      plan.branches.push({
        name,
        head,
        action: 'delete',
        why: 'contained in main and origin/main',
      });
    }
  }

  // Stale worktree metadata git would prune (folders already gone). -n reports without acting.
  const pruneDry = git(['worktree', 'prune', '-n', '-v'], primaryRoot);
  if (pruneDry.ok && pruneDry.stdout) {
    plan.prune = pruneDry.stdout.split('\n').filter(Boolean);
  }

  plan.emptyFolders = inspectLeftoverFolders({
    primaryRoot,
    registeredRoots: roots,
    protect: [cwd],
  });
  return plan;
}

function currentPrimaryBranch(primaryRoot) {
  return git(['symbolic-ref', '-q', '--short', 'HEAD'], primaryRoot).stdout || null;
}

function worktreeStillSafeToRemove(worktree, primaryRoot) {
  const status = git(['status', '--porcelain'], worktree.path);
  if (!status.ok || status.stdout !== '') return false;
  const current = worktreeBranches(primaryRoot).get(normalize(worktree.path));
  if (!current) return false;
  if (current.branch) {
    return (
      current.branch === worktree.branch &&
      current.head === worktree.head &&
      current.branch !== MAIN &&
      safelyBackedUp(current.branch, primaryRoot)
    );
  }
  return (
    !worktree.branch &&
    current.head === worktree.head &&
    Boolean(current.head) &&
    safelyBackedUp(current.head, primaryRoot)
  );
}

export function assessmentRisks(plan) {
  const risks = [];
  if (!plan.ok) return [plan.reason ?? 'assessment failed'];
  if (plan.mainSync?.ahead) {
    risks.push(`local main has ${plan.mainSync.ahead} commit(s) not in origin/main`);
  }
  for (const worktree of plan.worktrees.filter((entry) => entry.action === 'skip')) {
    if (
      worktree.why.includes('uncommitted') ||
      worktree.why.includes('unique work') ||
      worktree.why.includes('could not read') ||
      worktree.why.includes('only contained in local main') ||
      worktree.why.includes('has commits not in main')
    ) {
      risks.push(`${worktree.path}: ${worktree.why}`);
    }
  }
  for (const branch of plan.branches.filter((entry) => entry.action === 'skip')) {
    if (
      branch.why.includes('not backed up to origin/main') ||
      branch.why.includes('not contained in local main')
    ) {
      risks.push(`${branch.name}: ${branch.why}`);
    }
  }
  for (const folder of plan.emptyFolders.nonEmpty) {
    risks.push(`${folder}: non-empty unregistered folder`);
  }
  for (const folder of plan.emptyFolders.unreadable) {
    risks.push(`${folder}: unreadable unregistered folder`);
  }
  return risks;
}

export function applyPlan(
  plan,
  cwd,
  {
    prunePorts = pruneStalePorts,
    refreshRemote = () => git(['fetch', 'origin', '--prune'], plan.primaryRoot),
  } = {},
) {
  const done = { removedWorktrees: [], deletedBranches: [], pruned: false, sweep: null, releasedPorts: [], errors: [] };

  const refreshed = refreshRemote();
  if (!refreshed?.ok) {
    done.errors.push(
      `could not refresh origin before applying cleanup: ` +
        `${refreshed?.stderr || refreshed?.stdout || 'fetch failed'}`,
    );
    return done;
  }
  if (currentPrimaryBranch(plan.primaryRoot) !== MAIN) {
    done.errors.push(`primary checkout is no longer on ${MAIN} - no cleanup actions applied`);
    return done;
  }

  for (const w of plan.worktrees.filter((x) => x.action === 'remove')) {
    if (!worktreeStillSafeToRemove(w, plan.primaryRoot)) {
      done.errors.push(`worktree ${w.path}: safety state changed after assessment - skipped`);
      continue;
    }
    const res = git(['worktree', 'remove', w.path], plan.primaryRoot); // never --force
    if (res.ok) done.removedWorktrees.push(w.path);
    else done.errors.push(`worktree remove ${w.path}: ${res.stderr || res.stdout || 'failed (folder may be locked/busy)'}`);
  }

  // Re-derive deletable branches after removals (a just-freed branch is now deletable). Keep
  // the same containment gate; `git branch -d` is the final backstop that refuses unmerged.
  for (const b of plan.branches.filter((x) => x.action === 'delete')) {
    if (
      !MANAGED_BRANCH_PREFIXES.some((prefix) => b.name.startsWith(prefix)) ||
      !b.head ||
      git(['rev-parse', b.name], plan.primaryRoot).stdout !== b.head ||
      !safelyBackedUp(b.name, plan.primaryRoot)
    ) {
      done.errors.push(`branch ${b.name}: identity or backup state changed after assessment - skipped`);
      continue;
    }
    const res = git(['branch', '-d', b.name], plan.primaryRoot);
    if (res.ok) done.deletedBranches.push(b.name);
    else done.errors.push(`branch -d ${b.name}: ${res.stderr || res.stdout || 'refused'}`);
  }

  if (plan.prune.length > 0) {
    const res = git(['worktree', 'prune'], plan.primaryRoot);
    done.pruned = res.ok;
    if (!res.ok) done.errors.push(`worktree prune: ${res.stderr || res.stdout}`);
  }

  done.sweep = sweepEmptyLeftoverFolders({
    primaryRoot: plan.primaryRoot,
    registeredRoots: worktreeRoots(plan.primaryRoot),
    protect: [cwd],
  });

  // A removed worktree cannot hand its dev-port reservation back itself, so give it back here -
  // otherwise the port stays held until some later allocation happens to land on it
  // (docs/DEV_PORTS.md). Only reservations whose worktree is gone are touched.
  try {
    done.releasedPorts = prunePorts().map((t) => t.port);
  } catch (err) {
    done.errors.push(`dev-port reservations: ${err.message}`);
  }

  return done;
}

function report(plan, done) {
  const L = [];
  const mode = done ? 'APPLIED' : 'DRY RUN';
  L.push(`# Worktree cleanup - ${mode}`);
  L.push(`Primary checkout: ${plan.primaryRoot} (current branch: ${plan.currentBranch ?? 'detached'})`);

  if (plan.mainSync) {
    const { ahead, behind, state } = plan.mainSync;
    L.push(`main vs origin/main: ${state}` + (state === 'in-sync' ? '' : ` (ahead ${ahead}, behind ${behind})`));
    if (state === 'diverged' || state === 'ahead') {
      L.push(
        `  ! local main is ${state} from origin/main. Only refs independently contained in both ` +
          'local main and origin/main are eligible for automatic deletion.',
      );
    }
  }

  const toRemove = plan.worktrees.filter((w) => w.action === 'remove');
  const wtSkip = plan.worktrees.filter((w) => w.action === 'skip');
  const toDelete = plan.branches.filter((b) => b.action === 'delete');
  const brSkip = plan.branches.filter((b) => b.action === 'skip');

  L.push('');
  L.push(`## Worktrees to remove (${toRemove.length})`);
  for (const w of toRemove) {
    const applied = done ? (done.removedWorktrees.some((p) => samePath(p, w.path)) ? ' [removed]' : ' [FAILED]') : '';
    L.push(`  - ${w.path} (${w.why})${applied}`);
  }
  if (toRemove.length === 0) L.push('  (none)');

  L.push('');
  L.push(`## Branches to delete (${toDelete.length})`);
  for (const b of toDelete) {
    const applied = done ? (done.deletedBranches.includes(b.name) ? ' [deleted]' : ' [FAILED/refused]') : '';
    L.push(`  - ${b.name} (${b.why})${applied}`);
  }
  if (toDelete.length === 0) L.push('  (none)');

  const skips = [
    ...wtSkip.map((w) => `worktree ${w.path}: ${w.why}`),
    ...brSkip.map((b) => `branch ${b.name}: ${b.why}`),
  ];
  L.push('');
  L.push(`## Skipped (${skips.length})`);
  for (const s of skips) L.push(`  - ${s}`);
  if (skips.length === 0) L.push('  (none)');

  L.push('');
  L.push('## Stale worktree metadata to prune');
  if (plan.prune.length === 0) L.push('  (none)');
  else {
    for (const p of plan.prune) L.push(`  - ${p}`);
    if (done) L.push(done.pruned ? '  [pruned]' : '  [prune FAILED]');
  }

  L.push('');
  L.push('## Empty leftover folders');
  if (done && done.sweep) {
    const { removed, nonEmpty, locked } = done.sweep;
    if (removed.length === 0 && nonEmpty.length === 0 && locked.length === 0) L.push('  (none)');
    for (const d of removed) L.push(`  - ${d} [removed]`);
    for (const d of locked) L.push(`  - ${d} [locked/busy - rerun later]`);
    for (const d of nonEmpty) L.push(`  - ${d} [NON-EMPTY - manual review, not deleted]`);
  } else {
    const { empty, nonEmpty, unreadable } = plan.emptyFolders;
    if (empty.length === 0 && nonEmpty.length === 0 && unreadable.length === 0) L.push('  (none)');
    for (const d of empty) L.push(`  - ${d} [empty - will remove]`);
    for (const d of unreadable) L.push(`  - ${d} [UNREADABLE - manual review, not deleted]`);
    for (const d of nonEmpty) L.push(`  - ${d} [NON-EMPTY - manual review, not deleted]`);
  }

  L.push('');
  L.push('## Dev-port reservations');
  if (done) {
    L.push(done.releasedPorts.length === 0 ? '  (none to release)' : `  - released ${done.releasedPorts.join(', ')}`);
  } else {
    L.push('  (released only under --apply)');
  }

  if (plan.otherMerged.length > 0) {
    L.push('');
    L.push(
      '## Also contained in main and origin/main, NOT deleted ' +
        '(branches outside claude/* and codex/* - remove manually if unwanted)',
    );
    for (const n of plan.otherMerged) L.push(`  - ${n}`);
  }

  if (plan.possibleSquashMerges.length > 0) {
    L.push('');
    L.push(
      '## Possible squash merges, NOT deleted (tree matches main but history is not an ancestor - verify then remove manually)',
    );
    for (const n of plan.possibleSquashMerges) L.push(`  - ${n}`);
  }

  const manual = [
    ...wtSkip.map((w) => `${w.path} - ${w.why}`),
    ...brSkip.map((b) => `${b.name} - ${b.why}`),
    ...(!done ? plan.emptyFolders.nonEmpty : []).map(
      (d) => `${d} - non-empty leftover folder`,
    ),
    ...(!done ? plan.emptyFolders.unreadable : []).map(
      (d) => `${d} - unreadable leftover folder`,
    ),
    ...(done?.sweep?.nonEmpty ?? []).map((d) => `${d} - non-empty leftover folder`),
    ...(done?.sweep?.locked ?? []).map((d) => `${d} - locked, rerun later`),
    ...(done?.errors ?? []),
  ];
  L.push('');
  L.push(`## Manual cleanup remaining (${manual.length})`);
  for (const m of manual) L.push(`  - ${m}`);
  if (manual.length === 0) L.push('  (none)');

  return L.join('\n');
}

// CLI: `node scripts/cleanup-worktrees.mjs [--apply] [--acknowledge-risks]`
// Default is a dry run. Risk acknowledgement is valid only after the user approves the safe subset.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv.includes('--self')) {
  // Self mode: the handoff workflow's last action. Dry run by default, like the bulk mode.
  const plan = assessSelf(normalize(process.cwd()));
  if (!plan.ok) {
    console.log('Self cleanup NOT safe - this worktree stays:');
    for (const reason of plan.reasons) console.log(`  - ${reason}`);
    process.exit(2);
  }

  console.log(`Self cleanup is safe: ${plan.path} (branch ${plan.branch}, contained in main and origin/main).`);

  const atRisk = plan.ignored.atRisk;
  if (atRisk.length > 0) {
    console.log('\nThis will also DESTROY ignored content git never reports as changes:');
    for (const entry of atRisk) console.log(`  - ${entry.path}  (${formatBytes(entry.bytes)})`);
    console.log('  None of it is in git. Removing the worktree deletes it for good.');
  }
  if (plan.ignored.regenerable.length > 0) {
    console.log(`\nAlso removed, but regenerable: ${plan.ignored.regenerable.join(', ')}`);
  }

  const acknowledgeData = process.argv.includes('--acknowledge-data');
  if (!process.argv.includes('--apply')) {
    console.log(
      atRisk.length > 0
        ? '\nDry run - if that list is acceptable, rerun with --self --apply --acknowledge-data.'
        : '\nDry run - rerun with --self --apply to remove it.',
    );
    process.exit(0);
  }
  if (atRisk.length > 0 && !acknowledgeData) {
    console.log('\nRefusing to apply: the content above is not regenerable and was not acknowledged.');
    console.log('Show the list to the user; rerun with --acknowledge-data only after they agree.');
    process.exit(2);
  }

  const done = applySelf(plan, { acknowledgeData });
  if (done.removedWorktree) console.log(`Removed worktree ${plan.path}`);
  if (done.deletedBranch) console.log(`Deleted branch ${done.deletedBranch}`);
  if (done.releasedPorts.length > 0) console.log(`Released dev port(s): ${done.releasedPorts.join(', ')}`);
  if (done.folderRemains) {
    console.log('The now-empty folder is still on disk - this session holds it open. It is swept automatically once this session exits.');
  }
  for (const error of done.errors) console.log(`  ! ${error}`);
  process.exit(done.errors.length > 0 ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const doApply = process.argv.includes('--apply');
  const acknowledgedRisks = process.argv.includes('--acknowledge-risks');
  const cwd = normalize(process.cwd());

  const primaryRoot = primaryCheckout(cwd);
  if (primaryRoot) {
    const fetched = git(['fetch', 'origin', '--prune'], primaryRoot);
    if (!fetched.ok) {
      console.log(
        `Cannot run cleanup: could not refresh origin: ` +
          `${fetched.stderr || fetched.stdout || 'git fetch failed'}`,
      );
      process.exit(2);
    }
  }

  const plan = assess(cwd);
  if (!plan.ok) {
    console.log(`Cannot run cleanup: ${plan.reason}`);
    process.exit(2);
  }

  const risks = assessmentRisks(plan);
  if (doApply && risks.length > 0 && !acknowledgedRisks) {
    console.log(report(plan, null));
    console.log('\nCannot apply without explicit acknowledgement of these skipped-risk items:');
    for (const risk of risks) console.log(`  - ${risk}`);
    console.log('After user approval, rerun with --apply --acknowledge-risks.');
    process.exit(2);
  }

  const done = doApply ? applyPlan(plan, cwd) : null;
  console.log(report(plan, done));
  process.exit(done?.errors.length ? 1 : 0);
}
