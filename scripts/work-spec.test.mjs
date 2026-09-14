// Real records, evidence files, Git changes and CLI verdicts. No provider or browser required.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { acceptanceIds, checkWorkFile, digest, inspectWork } from './work-spec.mjs';
import { checkPlan } from './wave-plan-check.mjs';

const spec = '# Outcome\n\n### AC-1: Save survives reload\n\n### AC-2: Existing files still open\n';
const proof = '# Verification\nSaved a file, reloaded it and opened a legacy fixture.\n';
const evidence = [{ path: 'docs/work-specs/save/evidence/run.md', sha256: digest(proof) }];
function record() {
  return {
    version: 1, specSha256: digest(spec), authority: { source: 'owner instruction, 2026-09-14', status: 'agreed' },
    tasks: [
      { id: 'T1', goal: 'Save a file', size: 'small', covers: ['AC-1'], dependsOn: [], state: 'planned', stop: 'Save and reload demonstrated' },
      { id: 'T2', goal: 'Open old files', size: 'standard', covers: ['AC-2'], dependsOn: ['T1'], state: 'planned', stop: 'Legacy fixture opens' },
    ],
  };
}
const inspect = (work) => inspectWork(work, spec, { read: () => proof });

test('bounds and dependencies admit one task, then its successor with evidence', () => {
  const work = record();
  assert.deepEqual(inspect(work).ready, ['T1']);
  work.tasks[0].state = 'verified';
  assert.deepEqual(inspect(work).ready, []);
  work.tasks[0].evidence = evidence;
  assert.deepEqual(inspect(work).ready, ['T2']);
  work.tasks[1].size = 'large';
  assert.deepEqual(inspect(work).ready, []);
});

test('drafts are readable but not dispatchable; unknown versions fail closed', () => {
  const work = record();
  work.authority.status = 'draft';
  assert.deepEqual(inspect(work).ready, []);
  work.version = 2;
  assert.match(inspect(work).problems.join(' '), /unsupported/);
});

test('decomposition cannot drop a criterion or create unknown dependencies/cycles', () => {
  for (const mutate of [
    (w) => w.tasks.pop(),
    (w) => { w.tasks[0].covers = ['AC-99']; },
    (w) => { w.tasks[0].dependsOn = ['T9']; },
    (w) => { w.tasks[0].dependsOn = ['T2']; },
    (w) => { w.tasks[1].id = 'T1'; },
  ]) {
    const work = record(); mutate(work);
    assert.ok(inspect(work).problems.length);
    assert.deepEqual(inspect(work).ready, []);
  }
});

test('spec changes invalidate task mapping; examples do not add acceptance', () => {
  assert.equal(digest(spec.replaceAll('\n', '\r\n')), digest(spec));
  assert.match(inspectWork(record(), spec + '\nChanged requirement').problems.join(' '), /spec changed/);
  assert.deepEqual(acceptanceIds(spec + '\n```md\n### AC-99: Example\n```\n'), ['AC-1', 'AC-2']);
  assert.match(inspectWork(record(), spec + '\n### AC-1: Duplicate\n').problems.join(' '), /unique/);
});

function complete(work, revision = 'a'.repeat(40)) {
  for (const task of work.tasks) { task.state = 'verified'; task.evidence = evidence; }
  work.review = { revision, specSha256: work.specSha256, evidence,
    criteria: ['AC-1', 'AC-2'].map((id) => ({ id, status: 'pass', evidence })) };
  return work;
}

test('all tasks checked off is insufficient; review needs every criterion and unchanged artifacts', () => {
  const work = complete(record());
  assert.deepEqual(inspect(work).gaps, []);
  for (const mutate of [
    (w) => { w.review = null; },
    (w) => { w.review.criteria.pop(); },
    (w) => { w.review.criteria[1].id = 'AC-1'; },
    (w) => { w.review.criteria[0].status = 'fail'; },
    (w) => { w.review.criteria[0].status = 'unverified'; },
    (w) => { w.review.criteria[0].evidence = []; },
    (w) => { w.review.specSha256 = '0'.repeat(64); },
  ]) { const altered = structuredClone(work); mutate(altered); assert.ok(inspect(altered).gaps.length); }
  assert.ok(inspectWork(work, spec, { read: () => 'replaced evidence' }).gaps.length);
  const empty = structuredClone(work);
  for (const task of empty.tasks) task.evidence = [{ path: 'docs/empty.md', sha256: digest('') }];
  assert.match(inspectWork(empty, spec, { read: () => '' }).gaps.join(' '), /empty evidence/);
});

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'noacg-work-spec-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = 'docs/work-specs/save';
  mkdirSync(path.join(root, dir, 'evidence'), { recursive: true });
  const write = (name, text) => writeFileSync(path.join(root, name), text);
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  git('config', 'core.autocrlf', 'false');
  write(`${dir}/spec.md`, spec); write('app.js', 'export const save = true;\n');
  git('add', '.'); git('commit', '-qm', 'Initial behavior');
  const work = complete(record(), git('rev-parse', 'HEAD'));
  const file = `${dir}/work.json`;
  write(evidence[0].path, proof);
  const save = () => write(file, JSON.stringify(work));
  save();
  return { root, work, file, write, save, git };
}

test('current Git behavior plus evidence yields evidence-complete without mutating files', (t) => {
  const f = fixture(t);
  const before = readFileSync(path.join(f.root, f.file));
  assert.equal(checkWorkFile(f.file, { root: f.root }).status, 'evidence-complete');
  assert.deepEqual(readFileSync(path.join(f.root, f.file)), before);
  f.git('add', '.'); f.git('commit', '-qm', 'Record review');
  assert.equal(checkWorkFile(f.file, { root: f.root }).status, 'evidence-complete');
  f.write('app.js', 'export const save = false;\n');
  assert.match(checkWorkFile(f.file, { root: f.root }).gaps.join(' '), /review stale: app.js/);
});

test('untracked code and invalid revisions cannot reuse a green review', (t) => {
  const f = fixture(t);
  f.write('new-code.js', 'broken');
  assert.equal(checkWorkFile(f.file, { root: f.root }).status, 'open');
  f.work.review.revision = '0'.repeat(40); f.save();
  assert.match(checkWorkFile(f.file, { root: f.root }).gaps.join(' '), /not an ancestor/);
});

test('malformed records and missing or external evidence fail closed', (t) => {
  const f = fixture(t);
  f.work.tasks[0].evidence = [{ path: '../outside.md', sha256: digest(proof) }]; f.save();
  assert.equal(checkWorkFile(f.file, { root: f.root }).status, 'open');
  f.write(f.file, '{ invalid');
  assert.equal(checkWorkFile(f.file, { root: f.root }).status, 'invalid');
  assert.equal(checkWorkFile('../outside.json', { root: f.root }).status, 'invalid');
});

test('wave check keeps legacy prompts and enforces declared SPEC tasks on both pools', (t) => {
  const f = fixture(t);
  f.work = record();
  // save closes over fixture work; write this planned record directly.
  f.write(f.file, JSON.stringify(f.work));
  const plan = (pool, ref = '') => `Pools at plan time: available\n## Wave table\n| L | goal | START | TOUCHES | MINTS | POOL | browser |\n|---|---|---|---|---|---|---|\n| A | save | now | app.js | - | ${pool} | no |\n## Prompts\nSESSION A\n${ref}\nWHY fallback opus\nQUEUE finish\n`;
  const check = (pool, ref) => checkPlan(plan(pool, ref), { workSpec: (file, task) => checkWorkFile(file, { root: f.root, task, dispatch: false }) });
  for (const pool of ['opus', 'codex']) {
    assert.deepEqual(check(pool, '').problems, []);
    assert.deepEqual(check(pool, `SPEC ${f.file} T1`).problems, []);
    assert.deepEqual(check(pool, `SPEC ${f.file} T2`).problems, []);
    assert.match(checkWorkFile(f.file, { root: f.root, task: 'T2' }).problems.join(' '), /not dispatchable/);
    assert.match(check(pool, `SPEC ${f.file}`).problems.join(' '), /SPEC needs/);
    assert.match(check(pool, `SPEC ${f.file} T1\nSPEC ${f.file} T2`).problems.join(' '), /only one/);
  }
  f.work.tasks[0].size = 'large'; f.write(f.file, JSON.stringify(f.work));
  assert.match(check('codex', `SPEC ${f.file} T1`).problems.join(' '), /oversized/);
});

test('CLI exits nonzero for an unknown record instead of claiming completion', () => {
  const script = fileURLToPath(new URL('./work-spec.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, 'converge', 'docs/work-specs/missing/work.json'], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).status, 'invalid');
});
