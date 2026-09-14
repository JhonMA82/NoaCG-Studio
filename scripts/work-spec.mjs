#!/usr/bin/env node
// Read-only traceability checks for substantial work. This does not run commands from a
// spec, launch workers, or decide whether evidence actually proves a product requirement.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Specs and evidence receipts are text. Normalize checkout line endings so a Windows
// receipt remains valid in a Linux checkout. Binary artifacts are linked from the receipt.
export const digest = (text) => createHash('sha256').update(text.toString().replace(/\r\n/g, '\n')).digest('hex');
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const strings = (value) => Array.isArray(value) && value.every(nonempty);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Ignore examples in fenced blocks: only real AC headings define acceptance. */
export function acceptanceIds(text) {
  let fence = null;
  const ids = [];
  for (const line of text.split(/\r?\n/)) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (!fence) {
      const match = line.match(/^### (AC-\d+):\s+\S/);
      if (match) ids.push(match[1]);
    }
  }
  return ids;
}

/** All artifact reads stay inside this checkout, including through symlinks. */
function readLocal(root, relative) {
  if (!nonempty(relative) || relative.includes('\\') || path.posix.isAbsolute(relative) || relative.includes(':')) {
    throw new Error(`not a repository-relative path: ${relative}`);
  }
  const file = realpathSync(path.resolve(root, relative));
  const inside = path.relative(realpathSync(root), file);
  if (inside.startsWith(`..${path.sep}`) || inside === '..' || path.isAbsolute(inside)) {
    throw new Error(`path leaves checkout: ${relative}`);
  }
  return readFileSync(file);
}

/** A malformed/future record has no executable interpretation. No migration or writes. */
export function inspectWork(work, specText, { read = () => { throw new Error('artifact reader unavailable'); } } = {}) {
  const problems = [];
  const gaps = [];
  if (!work || work.version !== 1) return { problems: ['unsupported work-spec version; read-only'], gaps, ready: [] };
  const ids = acceptanceIds(specText);
  if (!ids.length || new Set(ids).size !== ids.length) problems.push('spec needs unique ### AC-N: acceptance headings');
  if (work.specSha256 !== digest(specText)) problems.push('spec changed: reconcile tasks and record the current intent before dispatch');
  if (!nonempty(work.authority?.source)) problems.push('authority.source must reference the owner instruction or existing authorization');
  if (!['draft', 'agreed'].includes(work.authority?.status)) problems.push('authority.status must be draft or agreed');
  if (!Array.isArray(work.tasks) || !work.tasks.length) return { problems: [...problems, 'tasks must be a nonempty array'], gaps, ready: [] };

  const taskIds = work.tasks.map((task) => task?.id);
  if (taskIds.some((id) => !/^T\d+$/.test(id)) || new Set(taskIds).size !== taskIds.length) problems.push('task IDs must be unique T numbers');
  const tasks = new Map(work.tasks.map((task) => [task?.id, task]));
  const checkEvidence = (evidence, label) => {
    if (!Array.isArray(evidence) || !evidence.length) { gaps.push(`${label}: evidence missing`); return; }
    for (const item of evidence) {
      try {
        if (!nonempty(item?.path) || !/\.(md|json|txt|log)$/.test(item.path) || !/^[a-f0-9]{64}$/.test(item?.sha256 ?? '')) throw new Error('text receipt path and sha256 required');
        const receipt = read(item.path);
        if (!receipt.toString().trim()) throw new Error('empty evidence receipt');
        if (digest(receipt) !== item.sha256) throw new Error('artifact changed');
      } catch (error) { gaps.push(`${label}: ${error.message}`); }
    }
  };
  for (const task of work.tasks) {
    if (!task || typeof task !== 'object') { problems.push('invalid task'); continue; }
    const label = task.id;
    if (!nonempty(task.goal) || !nonempty(task.stop)) problems.push(`${label}: goal and safe stop condition required`);
    if (!['small', 'standard', 'large'].includes(task.size)) problems.push(`${label}: size must be small, standard or large`);
    if (!['planned', 'active', 'verified'].includes(task.state)) problems.push(`${label}: invalid state`);
    if (!strings(task.covers) || !task.covers.length || task.covers.some((id) => !ids.includes(id))) problems.push(`${label}: covers must name acceptance IDs from the spec`);
    if (!strings(task.dependsOn) || task.dependsOn.some((id) => !tasks.has(id) || id === label)) problems.push(`${label}: invalid dependencies`);
    if (task.state === 'verified') checkEvidence(task.evidence, label);
    else gaps.push(`${label}: ${task.state ?? 'unknown'}`);
  }
  // A cycle is never repaired by pretending one dependency completed.
  const visited = new Set();
  const active = new Set();
  function visit(id) {
    if (active.has(id)) { problems.push(`dependency cycle at ${id}`); return; }
    if (visited.has(id)) return;
    active.add(id);
    for (const next of Array.isArray(tasks.get(id)?.dependsOn) ? tasks.get(id).dependsOn : []) if (tasks.has(next)) visit(next);
    active.delete(id);
    visited.add(id);
  }
  for (const id of taskIds) visit(id);
  for (const id of ids) {
    if (!work.tasks.some((task) => Array.isArray(task?.covers) && task.covers.includes(id))) problems.push(`${id}: lost in decomposition; assign it to a task`);
  }
  if (work.review) {
    if (work.review.specSha256 !== work.specSha256) gaps.push('review is for an older spec');
    if (!/^[a-f0-9]{40}$/.test(work.review.revision ?? '')) gaps.push('review needs a full Git revision');
    checkEvidence(work.review.evidence, 'review');
    const claims = Array.isArray(work.review.criteria) ? work.review.criteria : [];
    if (claims.length !== ids.length || new Set(claims.map((claim) => claim?.id)).size !== ids.length || claims.some((claim) => !ids.includes(claim?.id))) gaps.push('review must account for every acceptance ID exactly once');
    for (const claim of claims) {
      if (claim?.status !== 'pass') gaps.push(`${claim?.id}: ${claim?.status ?? 'unverified'}; continue its task or add a gap task`);
      checkEvidence(claim?.evidence, claim?.id ?? 'criterion');
    }
  } else gaps.push('convergence review missing');
  if (work.authority?.status !== 'agreed') gaps.push('spec is a draft; implementation is not authorized by this record');
  // Evidence failures on completed prerequisites block dependents, not independent work.
  const ready = problems.length || work.authority?.status !== 'agreed' ? [] : work.tasks.filter((task) =>
    task.state === 'planned' && task.size !== 'large' && task.dependsOn.every((id) =>
      tasks.get(id).state === 'verified' && !gaps.some((gap) => gap.startsWith(`${id}:`)))).map((task) => task.id);
  return { problems, gaps, ready };
}

/** Only review bookkeeping may differ from the reviewed tree. Code, tests, spec and
 * instructions changing all invalidate the verdict. This is deliberately conservative. */
function freshnessProblems(root, recordPath, revision) {
  const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (git(['merge-base', '--is-ancestor', revision, 'HEAD']).status !== 0) return ['review revision is not an ancestor of HEAD'];
  const evidenceDir = `${path.posix.dirname(recordPath)}/evidence/`;
  const changed = git(['diff', '--name-only', revision, '--']);
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
  if (changed.status !== 0 || untracked.status !== 0) return ['cannot check review freshness'];
  const files = `${changed.stdout}\n${untracked.stdout}`.split(/\r?\n/).filter(Boolean);
  return files.filter((file) => file !== recordPath && !file.startsWith(evidenceDir)).map((file) => `review stale: ${file}`);
}

export function checkWorkFile(recordPath, { root = ROOT, task, dispatch = true } = {}) {
  try {
    if (!/^docs\/work-specs\/[a-z0-9-]+\/work\.json$/.test(recordPath)) throw new Error('record must be docs/work-specs/<slug>/work.json');
    const work = JSON.parse(readLocal(root, recordPath));
    const spec = `${path.posix.dirname(recordPath)}/spec.md`;
    const verdict = inspectWork(work, readLocal(root, spec).toString('utf8'), { read: (file) => readLocal(root, file) });
    if (task) {
      const selected = work?.tasks?.find((item) => item?.id === task);
      if (!selected || selected.size === 'large' || work.authority?.status !== 'agreed') verdict.problems.push(`${task}: unknown, oversized or draft task`);
      else if (dispatch && !verdict.ready.includes(task)) verdict.problems.push(`${task}: not dispatchable (dependency, evidence, or state)`);
    }
    if (!verdict.problems.length && !verdict.gaps.length) verdict.gaps.push(...freshnessProblems(root, recordPath, work.review.revision));
    return { ...verdict, status: verdict.problems.length ? 'invalid' : verdict.gaps.length ? 'open' : 'evidence-complete' };
  } catch (error) { return { status: 'invalid', problems: [error.message], gaps: [], ready: [] }; }
}

export function main(argv = process.argv.slice(2)) {
  const [mode, record, task] = argv;
  if (!['status', 'dispatch', 'converge'].includes(mode) || !record || (mode === 'dispatch' && !task)) {
    console.error('Usage: node scripts/work-spec.mjs status|converge <record> | dispatch <record> <task>');
    return 1;
  }
  const result = checkWorkFile(record, { task: mode === 'dispatch' ? task : undefined });
  // The coordinator normally needs a decision and pointers, not every unfinished task.
  const output = argv.includes('--details') ? result : {
    status: result.status,
    counts: { problems: result.problems.length, gaps: result.gaps.length, ready: result.ready.length },
    problems: result.problems.slice(0, 10), gaps: result.gaps.slice(0, 10), ready: result.ready.slice(0, 10),
    details: `node scripts/work-spec.mjs status ${record} --details`,
  };
  console.log(JSON.stringify(output, null, 2));
  return result.problems.length || (mode === 'converge' && result.status !== 'evidence-complete') ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
