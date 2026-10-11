// gate: build
// guards: scripts/claude-remote.ps1, scripts/claude-remote-launch.mjs
// Windows lifecycle checks use a real temporary native fixture, never Claude credentials or network.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';

const helper = fileURLToPath(new URL('./claude-remote.ps1', import.meta.url));
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
const windows = { skip: process.platform !== 'win32' };

let binaryDir;
function fakeBinary() {
  if (binaryDir) return path.join(binaryDir, 'claude.exe');
  binaryDir = mkdtempSync(path.join(os.tmpdir(), 'noacg-remote-binary-'));
  const source = path.join(binaryDir, 'Fake.cs');
  const exe = path.join(binaryDir, 'claude.exe');
  writeFileSync(source, `
using System;
using System.IO;
using System.Threading;
public class Fake {
  public static int Main(string[] args) {
    if (string.Join(" ", args) != "remote-control --spawn worktree --no-create-session-in-dir --capacity 4") return 9;
    if (Environment.GetEnvironmentVariable("CLAUDECODE") != null) return 8;
    File.AppendAllText("calls.txt", "launch" + Environment.NewLine);
    string mode = File.ReadAllText("behavior.txt");
    if (mode == "login") { Console.Error.WriteLine("You must be logged in"); return 1; }
    if (mode == "exit") return 2;
    if (mode == "consent") Console.WriteLine("Enable Remote Control? (y/n)");
    Thread.Sleep(300000);
    return 0;
  }
}
`);
  const compiled = spawnSync('powershell.exe', ['-NoProfile', '-Command',
    `Add-Type -Path ${quote(source)} -OutputAssembly ${quote(exe)} -OutputType ConsoleApplication`],
  { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  assert.equal(compiled.status, 0, compiled.stderr);
  assert.equal(compiled.error, undefined);
  return exe;
}
after(() => { if (binaryDir) rmSync(binaryDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'noacg-remote-'));
  const stateDir = path.join(dir, '.git', 'noacg-claude-remote');
  const fake = path.join(dir, 'claude.exe');
  const calls = path.join(dir, 'calls.txt');
  copyFileSync(fakeBinary(), fake);
  function command(mode = 'ensure', behavior = 'idle', missing = false) {
    writeFileSync(path.join(dir, 'behavior.txt'), behavior);
    return `
. ${quote(helper)}
$env:CLAUDECODE = 'test-parent-session'
function Get-Command {
    param($Name, $CommandType, $ErrorAction)
    ${missing ? 'return $null' : `[pscustomobject]@{Source=${quote(fake)}}`}
}
try {
    Invoke-ClaudeRemote ${quote(mode)} ${quote(dir)} ${quote(stateDir)}
    if ($env:CLAUDECODE -ne 'test-parent-session') { throw 'Parent environment changed' }
}
catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
`;
  }
  function run(mode, behavior, missing) {
    return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command(mode, behavior, missing)],
      { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  }
  function asyncRun() {
    return new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command()],
        { windowsHide: true, timeout: 20000 });
      let stdout = '', stderr = '';
      child.stdout.on('data', (data) => { stdout += data; });
      child.stderr.on('data', (data) => { stderr += data; });
      child.on('error', reject);
      child.on('close', (status) => resolve({ status, stdout, stderr }));
    });
  }
  return {
    dir, stateDir, calls, run, asyncRun,
    record: () => JSON.parse(readFileSync(path.join(stateDir, 'server.json'), 'utf8')),
    cleanup() {
      run('stop');
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}

test('server survives launcher exit, reports RAM, and repeated start reuses it', windows, () => {
  const f = fixture();
  try {
    const start = f.run('ensure');
    assert.equal(start.status, 0, start.stderr);
    assert.equal(start.error, undefined);
    assert.match(start.stdout, /MiB working set, [\d.]+ MiB private/);
    assert.match(start.stdout, /Phone connection not verified/);
    const original = f.record();
    assert.ok(original.pid > 0);
    assert.equal(f.run('status').status, 0);
    const reuse = f.run('ensure');
    assert.match(reuse.stdout, /already running/);
    assert.equal(f.record().pid, original.pid);
    assert.equal(readFileSync(f.calls, 'utf8').trim(), 'launch');
    const stop = f.run('stop');
    assert.equal(stop.status, 0, stop.stderr);
    assert.equal(existsSync(path.join(f.stateDir, 'server.json')), false);
    assert.match(f.run('status').stdout, /not running/);
  } finally { f.cleanup(); }
});

test('concurrent starts launch exactly one server', windows, async () => {
  const f = fixture();
  try {
    const results = await Promise.all([f.asyncRun(), f.asyncRun()]);
    for (const result of results) assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(f.calls, 'utf8').trim(), 'launch');
    assert.equal(results.filter((result) => /already running/.test(result.stdout)).length, 1);
  } finally { f.cleanup(); }
});

test('a reused PID cannot be mistaken for the managed server or stopped', windows, () => {
  const f = fixture();
  try {
    const start = f.run('ensure');
    assert.equal(start.status, 0, start.stderr);
    const original = f.record();
    assert.equal(f.run('stop').status, 0);
    // The test runner is a live process using the same executable, but the wrong birth time.
    writeFileSync(path.join(f.stateDir, 'server.json'), JSON.stringify({
      ...original, pid: process.pid, started: '1', executable: process.execPath,
    }));
    assert.match(f.run('status').stdout, /not running/);
    assert.equal(f.run('stop').status, 0);
    assert.equal(process.kill(process.pid, 0), true);
    assert.equal(f.run('ensure').status, 0);
    assert.notEqual(f.record().pid, process.pid);
  } finally { f.cleanup(); }
});

for (const [behavior, expected] of [
  ['login', /not signed in.*claude auth login/],
  ['consent', /First-time setup required/],
  ['exit', /Remote Control exited/],
]) {
  test(`startup ${behavior} produces an actionable failure without leaving a server`, windows, () => {
    const f = fixture();
    try {
      const result = f.run('ensure', behavior);
      assert.equal(result.status, 1);
      assert.match(result.stderr, expected);
      assert.equal(existsSync(path.join(f.stateDir, 'server.json')), false);
      assert.match(f.run('status').stdout, /not running/);
    } finally { f.cleanup(); }
  });
}

test('missing CLI is reported before creating a process', windows, () => {
  const f = fixture();
  try {
    const result = f.run('ensure', 'idle', true);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Claude CLI missing/);
    assert.equal(existsSync(f.calls), false);
  } finally { f.cleanup(); }
});

test('a linked worktree finds the primary repository server record', windows, () => {
  const f = fixture();
  const linked = path.join(f.dir, 'linked');
  const git = (args) => {
    const result = spawnSync('git', args, { cwd: f.dir, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    git(['init']);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'Fixture']);
    git(['worktree', 'add', '-b', 'phone-test', linked]);
    assert.equal(f.run('ensure').status, 0);
    const status = spawnSync('powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, 'status'],
      { cwd: linked, encoding: 'utf8', windowsHide: true, timeout: 10000 });
    assert.equal(status.status, 0, status.stderr);
    assert.match(status.stdout, new RegExp('PID ' + f.record().pid));
  } finally {
    f.run('stop');
    if (existsSync(linked)) git(['worktree', 'remove', '--force', linked]);
    f.cleanup();
  }
});
