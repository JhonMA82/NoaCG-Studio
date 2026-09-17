#!/usr/bin/env node
// Read-only traceability checks for substantial work. This does not run commands from a
// spec, launch workers, or decide whether evidence actually proves a product requirement.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

// Specs and evidence receipts are text. Normalize checkout line endings so a Windows
// receipt remains valid in a Linux checkout. Binary artifacts are linked from the receipt.
export const digest = (text) => createHash('sha256').update(text.toString().replace(/\r\n/g, '\n')).digest('hex');
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** v1 accidentally mixed execution with acceptance. Discard its task-state interpretation
 * on read, retain evidence references, and require a fresh criterion review. Never promote
 * old task confidence to acceptance. Writers serialize v2; unknown versions stay read-only. */
export function migrateWork(work) {
  if (work?.version !== 1) return work;
  const evidence = [...(Array.isArray(work.review?.evidence) ? work.review.evidence : []),
    ...(Array.isArray(work.tasks) ? work.tasks.flatMap((task) => Array.isArray(task?.evidence) ? task.evidence : []) : [])];
  return { version: 2, specSha256: work.specSha256, authority: work.authority,
    migratedFrom: 1, priorEvidence: evidence, review: null };
}

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

/** Acceptance only. A launch, worker exit, task checkbox or landing cannot change this verdict. */
export function inspectWork(record, specText, { read = () => { throw new Error('artifact reader unavailable'); } } = {}) {
  const work = migrateWork(record);
  const problems = [];
  const gaps = [];
  if (!work || work.version !== 2) return { problems: ['unsupported work-spec version; read-only'], gaps, openCriteria: [] };
  const ids = acceptanceIds(specText);
  const open = new Set(ids);
  if (!ids.length || new Set(ids).size !== ids.length) problems.push('spec needs unique ### AC-N: acceptance headings');
  if (work.specSha256 !== digest(specText)) problems.push('spec changed: reconcile acceptance against the authorized intent');
  if (!nonempty(work.authority?.source)) problems.push('authority.source must reference the owner instruction or existing authorization');
  if (!['draft', 'agreed'].includes(work.authority?.status)) problems.push('authority.status must be draft or agreed');
  for (const field of ['tasks', 'state', 'ready', 'dependencies', 'launches', 'jobs']) {
    if (Object.hasOwn(work, field)) problems.push(`${field}: execution state belongs to the existing wave/job/landing system`);
  }
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
  if (work.review) {
    if (work.review.specSha256 !== work.specSha256) gaps.push('review is for an older spec');
    if (!/^[a-f0-9]{40}$/.test(work.review.revision ?? '')) gaps.push('review needs a full Git revision');
    checkEvidence(work.review.evidence, 'review');
    const claims = Array.isArray(work.review.criteria) ? work.review.criteria : [];
    if (claims.length !== ids.length || new Set(claims.map((claim) => claim?.id)).size !== ids.length || claims.some((claim) => !ids.includes(claim?.id))) gaps.push('review must account for every acceptance ID exactly once');
    for (const claim of claims) {
      const before = gaps.length;
      if (claim?.status !== 'pass') gaps.push(`${claim?.id}: ${claim?.status ?? 'unverified'}; continue its task or add a gap task`);
      checkEvidence(claim?.evidence, claim?.id ?? 'criterion');
      if (gaps.length === before) open.delete(claim?.id);
    }
  } else gaps.push('convergence review missing');
  if (work.authority?.status !== 'agreed') gaps.push('spec is a draft; implementation is not authorized by this record');
  // A broken review envelope cannot leave a misleading empty open-criteria list.
  if (problems.length || gaps.some((gap) => !/^AC-\d+:/.test(gap))) ids.forEach((id) => open.add(id));
  return { problems, gaps, openCriteria: [...open] };
}

/** Recognize acceptance receipts by their content, never by a directory exemption.
 * Only the review may change in an existing ledger. A new ledger must describe a spec
 * already in the reviewed tree. Unknown fields remain ordinary changes, conservatively. */
function receiptBookkeeping(root, files, revision, git) {
  const allowed = new Set();
  const keys = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => names.includes(key));
  const envelope = (work) => {
    const result = { ...work };
    delete result.review;
    return result;
  };
  const atRevision = (file) => git(['show', `${revision}:${file}`]);
  for (const file of files.filter((name) => /^docs\/work-specs\/[a-z0-9-]+\/work\.json$/.test(name))) {
    try {
      const work = JSON.parse(readLocal(root, file));
      if (work.version !== 2 || !keys(work, ['version', 'specSha256', 'authority', 'review'])
        || !keys(work.authority, ['status', 'source'])
        || !keys(work.review, ['revision', 'specSha256', 'evidence', 'criteria'])) continue;
      const specPath = `${path.posix.dirname(file)}/spec.md`;
      const originalSpec = atRevision(specPath);
      if (originalSpec.status !== 0 || digest(originalSpec.stdout) !== work.specSha256) continue;
      const checked = inspectWork(work, readLocal(root, specPath).toString(), { read: (name) => readLocal(root, name) });
      // Failed/unverified criteria are honest partial reviews, not malformed receipts.
      if (checked.problems.length || checked.gaps.some((gap) => !/^AC-\d+: (fail|unverified); continue its task or add a gap task$/.test(gap))) continue;
      if (git(['merge-base', '--is-ancestor', work.review.revision, 'HEAD']).status !== 0) continue;
      if (work.review.criteria.some((claim) => !keys(claim, ['id', 'status', 'evidence']))) continue;
      const receipts = [...work.review.evidence, ...work.review.criteria.flatMap((claim) => claim.evidence)];
      const evidenceDir = `${path.posix.dirname(file)}/evidence/`;
      if (receipts.some((item) => !keys(item, ['path', 'sha256'])
        || !item.path.startsWith(evidenceDir) || path.posix.normalize(item.path) !== item.path)) continue;
      const original = atRevision(file);
      if (original.status === 0 && !isDeepStrictEqual(envelope(JSON.parse(original.stdout)), envelope(work))) continue;
      allowed.add(file);
      // Existing evidence changes always require re-review, even if its hash was updated.
      for (const item of receipts) if (atRevision(item.path).status !== 0) allowed.add(item.path);
    } catch { /* Malformed, missing or unknown bookkeeping remains a freshness change. */ }
  }
  return allowed;
}

/** Code, tests, spec, instructions and existing evidence changes invalidate the verdict. */
function freshnessProblems(root, revision) {
  const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (git(['merge-base', '--is-ancestor', revision, 'HEAD']).status !== 0) return ['review revision is not an ancestor of HEAD'];
  const changed = git(['diff', '--name-only', revision, '--']);
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
  if (changed.status !== 0 || untracked.status !== 0) return ['cannot check review freshness'];
  const files = [...new Set(`${changed.stdout}\n${untracked.stdout}`.split(/\r?\n/).filter(Boolean))];
  const allowed = receiptBookkeeping(root, files, revision, git);
  return files.filter((file) => !allowed.has(file)).map((file) => `review stale: ${file}`);
}

export function checkWorkFile(recordPath, { root = ROOT, criteria } = {}) {
  try {
    if (!/^docs\/work-specs\/[a-z0-9-]+\/work\.json$/.test(recordPath)) throw new Error('record must be docs/work-specs/<slug>/work.json');
    const work = migrateWork(JSON.parse(readLocal(root, recordPath)));
    const spec = `${path.posix.dirname(recordPath)}/spec.md`;
    const specText = readLocal(root, spec).toString('utf8');
    const ids = acceptanceIds(specText);
    const verdict = inspectWork(work, specText, { read: (file) => readLocal(root, file) });
    if (criteria) {
      const selected = criteria.split(',');
      if (selected.some((id) => !ids.includes(id)) || new Set(selected).size !== selected.length) verdict.problems.push('scope must name distinct acceptance IDs from the spec');
      if (work.authority?.status !== 'agreed') verdict.problems.push('scope is not backed by agreed intent');
    }
    // Check freshness even on partial reviews, so old passes do not hide changed behaviour.
    if (work.review && /^[a-f0-9]{40}$/.test(work.review.revision ?? '')) {
      const stale = freshnessProblems(root, work.review.revision);
      if (stale.length) { verdict.gaps.push(...stale); verdict.openCriteria = ids; }
    }
    return { ...verdict, status: verdict.problems.length ? 'invalid' : verdict.gaps.length ? 'open' : 'evidence-complete' };
  } catch (error) { return { status: 'invalid', problems: [error.message], gaps: [], openCriteria: [] }; }
}

/** Derived observations only; no execution state or decisions are persisted in the ledger. */
export function planAcceptance(text, { check = checkWorkFile } = {}) {
  const records = [...new Set([...text.matchAll(/^\s*SPEC\s+(\S+)/gm)].map((match) => match[1]))];
  return records.map((record) => {
    const result = check(record);
    return { record, status: result.status, openCriteria: result.openCriteria,
      problems: result.problems.length, gaps: result.gaps.length };
  });
}

export function main(argv = process.argv.slice(2)) {
  const [mode, record, criteria] = argv;
  if (!['status', 'scope', 'converge'].includes(mode) || !record || (mode === 'scope' && !criteria)) {
    console.error('Usage: node scripts/work-spec.mjs status|converge <record> | scope <record> AC-1,AC-2');
    return 1;
  }
  const result = checkWorkFile(record, { criteria: mode === 'scope' ? criteria : undefined });
  // The coordinator normally needs a decision and pointers, not every unfinished task.
  const output = argv.includes('--details') ? result : {
    status: result.status,
    counts: { problems: result.problems.length, gaps: result.gaps.length, openCriteria: result.openCriteria.length },
    problems: result.problems.slice(0, 10), gaps: result.gaps.slice(0, 10), openCriteria: result.openCriteria.slice(0, 10),
    details: `node scripts/work-spec.mjs status ${record} --details`,
  };
  console.log(JSON.stringify(output, null, 2));
  return result.problems.length || (mode === 'converge' && result.status !== 'evidence-complete') ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
