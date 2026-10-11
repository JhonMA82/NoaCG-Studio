// gate: build
// guards: .github/workflows/ci.yml
// When ci.yml's guided-mod job runs. `CI gate` passes a skipped guided-mod job as the plan
// believed, so the plan step that decides it is the one place a red mod change could slip
// through: a pathspec that names nothing, or a base mapping that always diffs empty, would turn
// the checks off with every run green. This runs the step's own shell in a scratch repository.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const body = workflow.match(/ {6}- name: Does this change touch the guided mod\?\n[\s\S]*? {8}run: \|\n((?: {10}[^\n]*\n|\n)*)/)?.[1];
assert.ok(body, 'the guided-mod step must be present in the plan job');
const script = body.replace(/^ {10}/gm, '');
const bash = process.platform === 'win32' ? join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe') : 'bash';

const repo = mkdtempSync(join(tmpdir(), 'ci-guided-mod-'));
test.after(() => rmSync(repo, { recursive: true, force: true }));

function git(...args) {
  const run = spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
}

/** Writes the files and commits them; returns the commit's sha. */
function commit(files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'c');
  return git('rev-parse', 'HEAD');
}

/** The step's answer for an event, run at the repository's HEAD. */
function decide(env) {
  const output = `${repo}.out`;
  writeFileSync(output, '');
  const run = spawnSync(bash, ['--noprofile', '--norc', '-s'], {
    cwd: repo, input: script, encoding: 'utf8', timeout: 10_000, windowsHide: true,
    env: { ...process.env, PR_BASE: '', MERGE_GROUP_BASE: '', PUSH_BASE: '', DISPATCH_BASE: '', ...env, GITHUB_OUTPUT: output },
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const answer = readFileSync(output, 'utf8').match(/^run=(true|false)$/m)?.[1];
  rmSync(output, { force: true });
  return answer;
}

test('it runs on a change to the mod or to ci.yml, against each event\'s base, and not otherwise', () => {
  git('init', '-q');
  const start = commit({ 'cli/plugin-guide/hooks/register.tsx': 'a', '.github/workflows/ci.yml': 'a', 'docs/a.md': 'a' });
  const docs = commit({ 'docs/a.md': 'b' });
  const bases = [['pull_request', 'PR_BASE'], ['merge_group', 'MERGE_GROUP_BASE'], ['push', 'PUSH_BASE'], ['workflow_dispatch', 'DISPATCH_BASE']];
  for (const [EVENT, key] of bases) assert.equal(decide({ EVENT, [key]: start }), 'false', `${EVENT}: a docs change skips it`);
  const mod = commit({ 'cli/plugin-guide/tests/new.test.ts': 'x' });
  for (const [EVENT, key] of bases) assert.equal(decide({ EVENT, [key]: docs }), 'true', `${EVENT}: a mod change runs it`);
  commit({ '.github/workflows/ci.yml': 'b' });
  assert.equal(decide({ EVENT: 'pull_request', PR_BASE: mod }), 'true', 'a ci.yml change runs it');
});

test('with no usable base it runs', () => {
  assert.equal(decide({ EVENT: 'workflow_dispatch' }), 'true', 'a dispatch with no diff_base');
  assert.equal(decide({ EVENT: 'push', PUSH_BASE: '0000000000000000000000000000000000000000' }), 'true', 'a new branch');
  assert.equal(decide({ EVENT: 'pull_request', PR_BASE: 'deadbeef'.repeat(5) }), 'true', 'a base not in the clone');
  assert.equal(decide({ EVENT: 'schedule' }), 'true', 'an event with no base');
});
