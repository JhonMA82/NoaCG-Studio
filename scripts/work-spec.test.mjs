import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { acceptanceIds, checkWorkFile, digest, inspectWork, migrateWork, planAcceptance } from './work-spec.mjs';
import { checkPlan } from './wave-plan-check.mjs';
import { deltaBetween, nextState, summaryLine } from './wave-tick.mjs';

const spec = '# Outcome\n### AC-1: Save survives reload\n### AC-2: Existing files still open\n';
const proof = '# Verification\nSaved, reloaded, opened a legacy fixture.\n';
const evidence = [{ path: 'docs/work-specs/save/evidence/run.md', sha256: digest(proof) }];
const record = () => ({ version: 2, specSha256: digest(spec), authority: { source: 'owner instruction', status: 'agreed' } });
const inspect = (work) => inspectWork(work, spec, { read: () => proof });
function complete(work, revision = 'a'.repeat(40)) {
  work.review = { revision, specSha256: work.specSha256, evidence,
    criteria: ['AC-1', 'AC-2'].map((id) => ({ id, status: 'pass', evidence })) };
  return work;
}

test('ledger never interprets execution state; v1 migrates on read without promoting it', () => {
  for (const field of ['tasks', 'state', 'ready', 'dependencies', 'launches', 'jobs']) {
    assert.match(inspect({ ...record(), [field]: [] }).problems.join(' '), /execution state belongs/);
  }
  const old = { ...complete(record()), version: 1, tasks: [{ state: 'verified', evidence }] };
  const before = structuredClone(old);
  const migrated = migrateWork(old);
  assert.equal(migrated.version, 2); assert.equal(migrated.tasks, undefined);
  assert.equal(migrated.review, null); assert.ok(migrated.priorEvidence.length);
  assert.deepEqual(old, before);
  assert.deepEqual(inspect(old).openCriteria, ['AC-1', 'AC-2']);
  assert.equal(Object.hasOwn(inspect(record()), 'ready'), false);
  assert.match(inspect({ version: 99 }).problems.join(' '), /unsupported/);
});

test('spec edits invalidate acceptance; line endings and fenced examples do not', () => {
  assert.equal(digest(spec.replaceAll('\n', '\r\n')), digest(spec));
  assert.match(inspectWork(record(), spec + 'changed').problems.join(' '), /spec changed/);
  assert.deepEqual(acceptanceIds(spec + '```md\n### AC-99: Example\n```\n'), ['AC-1', 'AC-2']);
  assert.match(inspectWork(record(), spec + '### AC-1: Duplicate\n').problems.join(' '), /unique/);
});

test('completed slice leaves parent open; missing/failed/duplicate claims cannot converge', () => {
  const partial = complete(record()); partial.review.criteria[1].status = 'unverified';
  assert.deepEqual(inspect(partial).openCriteria, ['AC-2']);
  assert.ok(inspect(partial).gaps.length);
  for (const mutate of [
    (w) => { w.review = null; }, (w) => { w.review.criteria.pop(); },
    (w) => { w.review.criteria[1].id = 'AC-1'; }, (w) => { w.review.criteria[0].status = 'fail'; },
    (w) => { w.review.criteria[0].evidence = []; }, (w) => { w.review.specSha256 = '0'.repeat(64); },
  ]) { const work = complete(record()); mutate(work); assert.ok(inspect(work).gaps.length); assert.ok(inspect(work).openCriteria.length); }
  assert.ok(inspectWork(complete(record()), spec, { read: () => 'replaced' }).gaps.length);
  const empty = complete(record()); empty.review.evidence = [{ path: 'docs/empty.md', sha256: digest('') }];
  assert.match(inspectWork(empty, spec, { read: () => '' }).gaps.join(' '), /empty evidence/);
});

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'noacg-work-spec-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = 'docs/work-specs/save'; mkdirSync(path.join(root, dir, 'evidence'), { recursive: true });
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
  const file = `${dir}/work.json`; write(evidence[0].path, proof);
  const save = () => write(file, JSON.stringify(work)); save();
  return { root, work, file, write, save, git };
}

test('real Git changes invalidate partial reviews; bookkeeping commits remain valid', (t) => {
  const f = fixture(t); const before = readFileSync(path.join(f.root, f.file));
  assert.equal(checkWorkFile(f.file, { root: f.root }).status, 'evidence-complete');
  assert.deepEqual(readFileSync(path.join(f.root, f.file)), before);
  f.git('add', '.'); f.git('commit', '-qm', 'Record review');
  assert.equal(checkWorkFile(f.file, { root: f.root }).status, 'evidence-complete');
  f.work.review.criteria[1].status = 'unverified'; f.save(); f.write('app.js', 'broken');
  const result = checkWorkFile(f.file, { root: f.root });
  assert.match(result.gaps.join(' '), /review stale: app.js/);
  assert.deepEqual(result.openCriteria, ['AC-1', 'AC-2']);
});

test('untracked code, malformed records and invalid revisions fail closed', (t) => {
  const f = fixture(t); f.write('new-code.js', 'broken');
  assert.equal(checkWorkFile(f.file, { root: f.root }).status, 'open');
  f.work.review.revision = '0'.repeat(40); f.save();
  assert.match(checkWorkFile(f.file, { root: f.root }).gaps.join(' '), /not an ancestor/);
  f.write(f.file, '{ invalid'); assert.equal(checkWorkFile(f.file, { root: f.root }).status, 'invalid');
  assert.equal(checkWorkFile('../outside.json', { root: f.root }).status, 'invalid');
});

test('both pools share acceptance scope; size/dependencies remain wave decisions', (t) => {
  const f = fixture(t); f.write(f.file, JSON.stringify(record()));
  const plan = (pool, ref = '', size = 'standard') => `Pools at plan time: available\n## Wave table\n| L | goal | START | TOUCHES | MINTS | POOL | browser |\n|---|---|---|---|---|---|---|\n| A | save | on codex/predecessor landing | app.js | - | ${pool} | no |\n## Prompts\nSESSION A\n${ref}\nSIZE ${size}\nWHY fallback opus\nQUEUE finish\n`;
  const check = (pool, ref, size) => checkPlan(plan(pool, ref, size), { workSpec: (file, criteria) => checkWorkFile(file, { root: f.root, criteria }) });
  for (const pool of ['opus', 'codex']) {
    assert.deepEqual(check(pool, '').problems, []);
    assert.deepEqual(check(pool, `SPEC ${f.file} AC-1,AC-2`).problems, []);
    assert.match(check(pool, `SPEC ${f.file} AC-99`).problems.join(' '), /scope must name/);
    assert.match(check(pool, `SPEC ${f.file} AC-1`, 'large').problems.join(' '), /autonomously decompose/);
    assert.match(check(pool, `SPEC ${f.file}`).problems.join(' '), /SPEC needs/);
  }
  f.work.authority.status = 'draft'; f.save();
  assert.match(check('codex', `SPEC ${f.file} AC-1`).problems.join(' '), /agreed intent/);
});

test('actual tick reports open parent after branch landing, then evidence readiness', (t) => {
  const f = fixture(t); f.work.review.criteria[1].status = 'unverified'; f.save();
  const text = `SPEC ${f.file} AC-1\nSPEC ${f.file} AC-2\n`;
  const observe = () => planAcceptance(text, { check: (file) => checkWorkFile(file, { root: f.root }) });
  const base = { at: Date.now(), branches: [], jobs: [], blocked: [], features: observe() };
  assert.equal(base.features.length, 1);
  const before = nextState({ ...base, branches: [{name: 'codex/a-save', ahead: true, landed: false}] }, {tick: 1});
  const after = { ...base, branches: [{name: 'codex/a-save', ahead: false, landed: true}] };
  assert.ok(deltaBetween(before, after).includes('LANDED codex/a-save'));
  assert.match(summaryLine(after), /1\/1 parent feature\(s\) open/);
  assert.equal(after.features[0].status, 'open');
  const openState = nextState(after, {tick: 2});
  f.work.review.criteria[1].status = 'pass'; f.save();
  const converged = { ...after, features: observe() };
  assert.match(deltaBetween(openState, converged).join(' '), /PARENT EVIDENCE READY/);
  assert.match(summaryLine(converged), /0\/1 parent feature\(s\) open/);
  assert.deepEqual(deltaBetween(nextState(converged, {tick: 3}), converged), []);
});
