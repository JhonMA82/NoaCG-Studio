// Which CHECKOUT a running Playwright process belongs to. This is the load-bearing part of the
// cross-worktree guard: `activeRuns({ exclude: me })` uses it to decide whether a run is someone
// else's, so getting it wrong fails in both directions - attribute my own run elsewhere and the
// queue waits for me to finish before letting me start, attribute someone else's to me and the
// collision the guard exists to prevent goes through unnoticed.
//
// Every "real" case below is a command line copied verbatim from `Get-CimInstance Win32_Process`
// on this machine while suites were actually running.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rootOfCommand, sameRoot } from './e2e-runs.mjs';

test('the main checkout, launched through the .bin shim', () => {
  const cmd = '"node"   "C:\\claude\\NoaCG-Studio\\node_modules\\.bin\\\\..\\@playwright\\test\\cli.js" test advanced-mode.spec.ts';
  assert.equal(rootOfCommand(cmd), 'C:/claude/NoaCG-Studio');
});

test('a linked worktree, launched with an absolute node path', () => {
  const cmd =
    '"C:\\Program Files\\nodejs\\node.exe" C:\\claude\\NoaCG-Studio\\.claude\\worktrees\\creative-vocabulary-test-ff7b6d\\node_modules\\playwright\\lib\\worker\\workerProcessEntry.js';
  assert.equal(
    rootOfCommand(cmd),
    'C:/claude/NoaCG-Studio/.claude/worktrees/creative-vocabulary-test-ff7b6d',
  );
});

test('the node interpreter\'s own path is never mistaken for the checkout', () => {
  // "C:\Program Files\nodejs\node.exe" comes FIRST and contains no node_modules, so the scan
  // has to walk past it rather than anchor on the first drive letter it sees.
  const cmd = '"C:\\Program Files\\nodejs\\node.exe" C:\\repo\\node_modules\\@playwright\\test\\cli.js test';
  assert.equal(rootOfCommand(cmd), 'C:/repo');
});

test('a path is never glued across two separate arguments', () => {
  // The bug this replaced: a regex allowed to cross whitespace produced
  // ".../sleeper.mjs 60000 C:/claude/NoaCG-Studio" - two unrelated arguments as one path.
  const cmd = 'node C:/tmp/sleeper.mjs 60000 C:/claude/NoaCG-Studio/node_modules/@playwright/test/cli.js test';
  assert.equal(rootOfCommand(cmd), 'C:/claude/NoaCG-Studio');
});

test('a checkout path containing spaces survives, because it is quoted', () => {
  const cmd = '"node" "C:\\Users\\First Last\\My Repo\\node_modules\\@playwright\\test\\cli.js" test';
  assert.equal(rootOfCommand(cmd), 'C:/Users/First Last/My Repo');
});

// Only meaningful on a posix host: the root is normalised with path.resolve, which on Windows
// prefixes the current drive and turns `/home/dev/proj` into `C:/home/dev/proj`. That is correct
// behaviour for Windows and irrelevant there, since a posix command line cannot appear on it -
// but CI runs on ubuntu, so the case is still covered where it can be.
test('a posix invocation resolves too', { skip: process.platform === 'win32' }, () => {
  assert.equal(
    rootOfCommand('/usr/bin/node /home/dev/proj/node_modules/@playwright/test/cli.js test'),
    '/home/dev/proj',
  );
});

test('a command with no node_modules has no root, rather than a wrong one', () => {
  // Returning null means the process is IGNORED. That is the safe direction for a non-run;
  // inventing a root would put a phantom checkout in the guard's refusal message.
  assert.equal(rootOfCommand('node scripts/dev-port.mjs'), null);
  assert.equal(rootOfCommand(''), null);
  // node_modules with nothing before it is not a checkout either.
  assert.equal(rootOfCommand('node node_modules/@playwright/test/cli.js test'), null);
});

test('roots compare case-insensitively and across slash spellings', () => {
  // Windows is case-insensitive and the same checkout gets spelled both ways by different
  // launchers; if these did not compare equal, a run would never be recognised as its own.
  assert.ok(sameRoot('C:\\claude\\NoaCG-Studio', 'c:/claude/noacg-studio'));
  assert.ok(!sameRoot('C:/claude/NoaCG-Studio', 'C:/claude/NoaCG-Studio/.claude/worktrees/x'));
});
