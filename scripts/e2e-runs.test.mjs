// Which CHECKOUT a running Playwright process belongs to. This is the load-bearing part of the
// cross-worktree guard: `activeRuns({ exclude: me })` uses it to decide whether a run is someone
// else's, so getting it wrong fails in both directions - attribute my own run elsewhere and the
// queue waits for me to finish before letting me start, attribute someone else's to me and the
// collision the guard exists to prevent goes through unnoticed.
//
// Every "real" case below is a command line copied verbatim from `Get-CimInstance Win32_Process`
// on this machine while suites were actually running.
//
// The cases are split by platform, because the root is normalised with `path.resolve` and that
// is platform-specific by design: on Linux a Windows path is not absolute, so resolve() prepends
// the cwd and `C:\claude\NoaCG-Studio` comes back as `<cwd>/C:/claude/NoaCG-Studio`. That is
// correct - and irrelevant, because rootOfCommand only ever sees command lines produced by the
// platform it is running on. Asserting a Windows shape on ubuntu tests nothing real and fails.
// The ARGUMENT-SPLITTING cases, which are the actual logic, are platform-neutral and always run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rootOfCommand, sameRoot } from './e2e-runs.mjs';

const onlyWindows = { skip: process.platform !== 'win32' };
const onlyPosix = { skip: process.platform === 'win32' };

test('the main checkout, launched through the .bin shim', onlyWindows, () => {
  const cmd = '"node"   "C:\\claude\\NoaCG-Studio\\node_modules\\.bin\\\\..\\@playwright\\test\\cli.js" test advanced-mode.spec.ts';
  assert.equal(rootOfCommand(cmd), 'C:/claude/NoaCG-Studio');
});

test('a linked worktree, launched with an absolute node path', onlyWindows, () => {
  const cmd =
    '"C:\\Program Files\\nodejs\\node.exe" C:\\claude\\NoaCG-Studio\\.claude\\worktrees\\creative-vocabulary-test-ff7b6d\\node_modules\\playwright\\lib\\worker\\workerProcessEntry.js';
  assert.equal(
    rootOfCommand(cmd),
    'C:/claude/NoaCG-Studio/.claude/worktrees/creative-vocabulary-test-ff7b6d',
  );
});

test('the node interpreter\'s own path is never mistaken for the checkout', onlyWindows, () => {
  // "C:\Program Files\nodejs\node.exe" comes FIRST and contains no node_modules, so the scan
  // has to walk past it rather than anchor on the first drive letter it sees.
  const cmd = '"C:\\Program Files\\nodejs\\node.exe" C:\\repo\\node_modules\\@playwright\\test\\cli.js test';
  assert.equal(rootOfCommand(cmd), 'C:/repo');
});

test('a checkout path containing spaces survives, because it is quoted', onlyWindows, () => {
  const cmd = '"node" "C:\\Users\\First Last\\My Repo\\node_modules\\@playwright\\test\\cli.js" test';
  assert.equal(rootOfCommand(cmd), 'C:/Users/First Last/My Repo');
});

test('a posix invocation resolves too', onlyPosix, () => {
  assert.equal(
    rootOfCommand('/usr/bin/node /home/dev/proj/node_modules/@playwright/test/cli.js test'),
    '/home/dev/proj',
  );
});

// ── Platform-neutral: the argument splitting itself, which is the actual logic ──────────────
// Asserted on the SHAPE of the answer rather than on an absolute path, so the same assertions
// hold wherever they run. This is the regression the rewrite exists for, so it must not be a
// case that silently skips on the platform CI happens to use.

test('a path is never glued across two separate arguments', () => {
  // The bug this replaced: a regex allowed to cross whitespace produced
  // ".../sleeper.mjs 60000 C:/claude/NoaCG-Studio" - two unrelated arguments as one path.
  const root = rootOfCommand(
    'node /tmp/sleeper.mjs 60000 /srv/checkout/node_modules/@playwright/test/cli.js test',
  );
  assert.ok(root, 'a root should be found');
  assert.ok(root.endsWith('/srv/checkout'), `expected the checkout argument, got ${root}`);
  assert.ok(!root.includes('sleeper'), `a preceding argument leaked into the path: ${root}`);
  assert.ok(!root.includes('60000'), `a preceding argument leaked into the path: ${root}`);
});

test('the argument before the checkout never contributes, even when it looks like a path', () => {
  const root = rootOfCommand('/usr/bin/node /opt/tools/runner.mjs /srv/checkout/node_modules/x/cli.js test');
  assert.ok(root.endsWith('/srv/checkout'), `got ${root}`);
  assert.ok(!root.includes('runner.mjs'), `got ${root}`);
});

test('a command with no node_modules has no root, rather than a wrong one', () => {
  // Returning null means the process is IGNORED. That is the safe direction for a non-run;
  // inventing a root would put a phantom checkout in the guard's refusal message.
  assert.equal(rootOfCommand('node scripts/dev-port.mjs'), null);
  assert.equal(rootOfCommand(''), null);
  // node_modules with nothing before it is not a checkout either.
  assert.equal(rootOfCommand('node node_modules/@playwright/test/cli.js test'), null);
});

test('roots compare case-insensitively and across slash spellings', onlyWindows, () => {
  // Windows is case-insensitive and the same checkout gets spelled both ways by different
  // launchers; if these did not compare equal, a run would never be recognised as its own.
  assert.ok(sameRoot('C:\\claude\\NoaCG-Studio', 'c:/claude/noacg-studio'));
  assert.ok(!sameRoot('C:/claude/NoaCG-Studio', 'C:/claude/NoaCG-Studio/.claude/worktrees/x'));
});
