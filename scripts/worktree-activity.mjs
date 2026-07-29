// What every OTHER worktree of this checkout is currently working on.
//
// Several worktrees are normally active at once (see AGENTS.md), so "is anyone already on
// this?" is a question both the SessionStart hook and the shared `next` workflow need to
// answer, from the same rules. A worktree counts as active when it has files in flight:
// uncommitted working-tree changes, or commits on its branch that `main` does not have yet.
//
// This is READ-ONLY and best-effort. It never blocks anything: two sessions touching one file
// is not automatically a problem, it is just something worth knowing before starting work.
//
// CLI (no arguments): print the live snapshot for the checkout you run it from.
//   node scripts/worktree-activity.mjs

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { git, normalize, samePath, worktreeRoots } from './worktree-cleanup-lib.mjs';

/** Files shown per worktree before the list is summarised with a "+N more" tail. */
const DEFAULT_FILE_LIMIT = 40;

/**
 * Activity in every registered worktree except the one containing `cwd`.
 *
 * Returns one entry per worktree that has anything in flight, each:
 *   { root, name, branch, detached, head, lastCommit, uncommitted, ahead, files }
 * where `files` is the de-duplicated union of uncommitted and ahead-of-main paths, `ahead` is
 * the number of commits the branch has that `main` lacks, and `lastCommit` is
 * `{ subject, relative }` (or null when it cannot be read). A worktree sitting clean on `main`
 * is not activity and is skipped, as is one with no changed files at all.
 */
export function worktreeActivity(cwd = process.cwd()) {
  const roots = worktreeRoots(cwd);
  if (roots.length === 0) return [];

  const self = roots.filter((root) => isUnder(normalize(cwd), root)).sort((a, b) => b.length - a.length)[0];
  const hasMain = git(['rev-parse', '--verify', '--quiet', 'main'], roots[0]).ok;

  const activity = [];
  for (const root of roots) {
    if (self && samePath(root, self)) continue;

    const shortRef = git(['rev-parse', '--abbrev-ref', 'HEAD'], root).stdout || null;
    const detached = shortRef === 'HEAD';
    if (!detached && shortRef === 'main') continue; // sitting on main - nothing to compare

    // Branches share one object store, so anything history-only can run from this checkout;
    // the working-tree status is per-worktree and must run inside that worktree itself.
    const head = git(['rev-parse', 'HEAD'], root).stdout || null;
    const diffRef = detached ? head : shortRef;
    const ahead = hasMain && diffRef ? countLines(git(['rev-list', '--count', `main..${diffRef}`], roots[0]).stdout) : 0;
    const aheadFiles =
      hasMain && diffRef ? lines(git(['diff', '--name-only', `main...${diffRef}`], roots[0]).stdout) : [];
    const uncommitted = uncommittedPaths(root);

    const files = [...new Set([...uncommitted, ...aheadFiles])].sort();
    if (files.length === 0) continue;

    activity.push({
      root,
      name: root.split('/').pop() ?? root,
      branch: detached ? null : shortRef,
      detached,
      head,
      lastCommit: lastCommit(root),
      uncommitted: uncommitted.length,
      ahead,
      files,
    });
  }
  return activity;
}

/**
 * The worktrees from `activity` that touch any of `paths`, as
 * `[{ entry, files }]` with `files` the overlapping paths only. Repo-relative paths with
 * forward slashes, compared case-insensitively (Windows).
 */
export function overlapping(activity, paths) {
  const wanted = new Set(paths.map((file) => file.replaceAll('\\', '/').toLowerCase()));
  return activity
    .map((entry) => ({ entry, files: entry.files.filter((file) => wanted.has(file.toLowerCase())) }))
    .filter((hit) => hit.files.length > 0);
}

/** The snapshot as human-readable lines, for a hook or a CLI run. Empty when nothing is in flight. */
export function formatActivity(activity, { fileLimit = DEFAULT_FILE_LIMIT } = {}) {
  if (activity.length === 0) return [];
  const out = [];
  for (const entry of activity) {
    const where = entry.detached ? `detached @ ${entry.head?.slice(0, 7) ?? '?'}` : entry.branch;
    const commit = entry.lastCommit
      ? `, last commit ${entry.lastCommit.relative}: "${entry.lastCommit.subject}"`
      : '';
    out.push(
      `  - ${entry.name} (${where}) - ${entry.uncommitted} uncommitted, ` +
        `${entry.ahead} commit(s) ahead of main${commit}`,
    );
    const shown = entry.files.slice(0, fileLimit);
    const more = entry.files.length - shown.length;
    out.push(`    files: ${shown.join(', ')}${more > 0 ? ` (+${more} more)` : ''}`);
  }
  return out;
}

/** Paths with working-tree changes in `cwd`, staged, unstaged or untracked. */
function uncommittedPaths(cwd) {
  // `-z` keeps paths with spaces or non-ASCII intact and unquoted; each record is a fixed
  // 2-character status code, a space, then the path. The status code's first character is a
  // SPACE for a not-staged change (" M path"), so this must read raw output - the shared git()
  // helper trims, which would shift every such path by one character.
  const res = spawnSync('git', ['status', '--porcelain', '-z'], { cwd, encoding: 'utf8' });
  if (res.status !== 0 || typeof res.stdout !== 'string') return [];
  return res.stdout
    .split('\0')
    .filter(Boolean)
    // A rename is two records: "R  <new>" then the bare <old> path. Both names are genuinely
    // in flight, and the bare one has no status prefix to strip.
    .map((record) => (/^[ MADRCU?!][ MADRCU?!] /.test(record) ? record.slice(3) : record))
    .filter(Boolean);
}

/** `{ subject, relative }` for the tip commit of the worktree at `root`, or null. */
function lastCommit(root) {
  const res = git(['log', '-1', '--format=%s%x00%cr'], root);
  if (!res.ok) return null;
  const [subject, relative] = res.stdout.split('\0');
  if (!subject) return null;
  return { subject, relative: relative ?? 'unknown' };
}

function lines(stdout) {
  return stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

function countLines(stdout) {
  const value = Number.parseInt(stdout.trim(), 10);
  return Number.isFinite(value) ? value : 0;
}

function isUnder(path, root) {
  const [a, b] = [path.toLowerCase(), root.toLowerCase()];
  return a === b || a.startsWith(`${b}/`);
}

// CLI: print the live snapshot for the checkout this is run from.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const activity = worktreeActivity(process.cwd());
  if (activity.length === 0) {
    console.log('No other worktree has work in flight right now.');
  } else {
    console.log(
      'Other worktrees with work in flight (uncommitted, or committed but not yet merged into main):',
    );
    for (const line of formatActivity(activity)) console.log(line);
  }
}
