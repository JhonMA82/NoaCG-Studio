// The guard's command matchers decide whether heavy browser work is allowed to start. Both
// failure directions are silent, which is why they are pinned here rather than checked by hand:
//
//   too eager  - a legitimate command is refused. Already happened: `grep -n "npm run test:e2e"
//                AGENTS.md` was denied because the phrase appeared anywhere in the text. A guard
//                that blocks reading a file is a guard people learn to work around.
//   too shy    - a real invocation slips past, a second suite or sweep starts, and the machine
//                goes to 35 MB of free RAM with 59 browser shells. Nothing reports that; you
//                just notice the laptop has stopped responding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { invokesE2e, invokesSweep, commandSegments, SWEEP_SCRIPTS } from './command-match.mjs';

/** Either matcher firing means "this command starts heavy browser work". */
const startsHeavyWork = (cmd) => invokesE2e(cmd) || invokesSweep(cmd);

test('real e2e invocations are recognised, in every spelling used here', () => {
  for (const cmd of [
    'npm run test:e2e',
    'npm run test:e2e -- wizard-logo.spec.ts',
    'npm run test:e2e:affected',
    'npm run test:e2e:focus',
    'npm run test:e2e:catalog',
    'npm run test:e2e:live',
    'pnpm run test:e2e',
    'npx playwright test --config=playwright.catalog.config.ts',
    'playwright test',
    'node scripts/e2e-affected.mjs',
    'cd /c/repo && npm run test:e2e',
    'npm run build; npm run test:e2e',
    'NOACG_ALLOW_PARALLEL_E2E=1 npm run test:e2e', // the env prefix must not hide the invocation
  ]) {
    assert.ok(invokesE2e(cmd), cmd);
  }
});

test('sweeps and benches are recognised - they cost the same memory as a suite', () => {
  for (const cmd of [
    'node scripts/l3-sweep.mjs shots lower-third',
    'node scripts/type-floor.mjs',
    'node scripts/overflow-sweep.mjs --baseline',
    'node scripts/field-coverage.mjs',
    'node scripts/numerals.mjs --fonts',
    'node scripts/factory.mjs --json factory-report.json',
    'node scripts/render-smoke-video.mjs',
    'node scripts/pro-bench.mjs',
    'node C:/claude/NoaCG-Studio/scripts/l3-sweep.mjs shots quiz',
    'npm run bench:lite',
    'npm run video:bench:run',
  ]) {
    assert.ok(invokesSweep(cmd), cmd);
  }
});

test('MENTIONING a command is not running one', () => {
  // The regression that motivated positional matching. Each of these contains the text of an
  // invocation and starts nothing; denying any of them is a bug.
  for (const cmd of [
    'grep -n "npm run test:e2e" AGENTS.md',
    "rg 'test:e2e:affected' docs/",
    'grep -rn type-floor.mjs AGENTS.md',
    'echo "run npm run test:e2e later"',
    'git commit -m "Document npm run test:e2e in the contributor guide"',
    'git log --oneline --grep "node scripts/l3-sweep.mjs"',
    'cat package.json',
    'node scripts/dev-port.mjs',
    'node scripts/e2e-runs.mjs --all',
  ]) {
    assert.ok(!startsHeavyWork(cmd), cmd);
  }
});

test('a here-document body is data, not commands', () => {
  // Measured 2026-08-06: `git commit -F- <<'EOF'` was REFUSED because a paragraph of the commit
  // message began "test:e2e:affected is the per-merge gate…". Segments split on newlines, so a
  // line of prose sat where an invocation would. The quoted-argument rule cannot cover this -
  // the text is on its own line, not inside quotes.
  const commitWithMessage = [
    "git commit -F- <<'EOF'",
    'Make the affected-e2e runner report the worst run',
    '',
    'test:e2e:affected is the per-merge gate, and node scripts/type-floor.mjs is a catalog gate.',
    'EOF',
  ].join('\n');
  assert.ok(!startsHeavyWork(commitWithMessage), commitWithMessage);

  // The unquoted and indent-stripping spellings too, and a body naming a sweep.
  assert.ok(!startsHeavyWork('cat <<EOF\nnpm run test:e2e\nEOF'));
  assert.ok(!startsHeavyWork('cat <<-END\n\tnode scripts/l3-sweep.mjs shots quiz\n\tEND'));

  // What the heredoc OPENED with is still a command, and so is anything after the terminator -
  // stripping the body must not swallow either.
  assert.ok(startsHeavyWork("npm run test:e2e && git commit -F- <<'EOF'\nmessage\nEOF"));
  assert.ok(startsHeavyWork("git commit -F- <<'EOF'\nmessage\nEOF\nnpm run test:e2e"));
});

test('a command in a later shell segment still counts', () => {
  // The invocation is not always first: `cd x && npm run test:e2e` is the ordinary shape.
  assert.ok(invokesE2e('cd repo && npm run test:e2e'));
  assert.ok(invokesSweep('npm run build && node scripts/type-floor.mjs'));
  assert.ok(invokesE2e('echo start\nnpm run test:e2e'));
  assert.ok(invokesSweep('foo | node scripts/numerals.mjs'));
});

test('a similarly-named script is not a sweep', () => {
  // `e2e-runs.mjs` reports what is running and `dev-port.mjs` prints a number; neither launches
  // a browser, and blocking them would break the very commands the refusal message recommends.
  for (const cmd of [
    'node scripts/e2e-runs.mjs --wait',
    'node scripts/e2e-lists.mjs',
    'node scripts/worktree-activity.mjs',
    'node scripts/merge-order.mjs --branch x',
    'node scripts/check-shared-instructions.mjs',
  ]) {
    assert.ok(!invokesSweep(cmd), cmd);
  }
});

test('segments strip env prefixes but keep the rest of the command', () => {
  assert.deepEqual(commandSegments('A=1 B=2 npm run test:e2e'), ['npm run test:e2e']);
  assert.deepEqual(commandSegments('a && b'), ['a', 'b']);
  assert.deepEqual(commandSegments('a; b | c'), ['a', 'b', 'c']);
});

test('the shared sweep list is a usable alternation for both consumers', () => {
  // scripts/e2e-runs.mjs interpolates this into a RegExp to spot a RUNNING sweep, and
  // command-match uses it on a command line. A malformed alternation would break process
  // detection silently while the command matcher kept working.
  const built = new RegExp(`scripts[/\\\\]+(${SWEEP_SCRIPTS})\\.mjs`);
  assert.ok(built.test('node C:/repo/scripts/l3-sweep.mjs'));
  assert.ok(built.test('node C:\\repo\\scripts\\type-floor.mjs'));
  assert.ok(!built.test('node C:/repo/scripts/dev-port.mjs'));
});
