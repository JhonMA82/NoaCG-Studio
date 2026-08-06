// WHO ELSE IS RUNNING PLAYWRIGHT RIGHT NOW - across every checkout of this repo on this machine.
//
// WHY THIS EXISTS. Several worktrees are normally live at once (scripts/worktree-activity.mjs
// exists for exactly that), and each one's Playwright config asks for 4 workers. Two sessions
// deciding to run their suites in the same minute therefore asks the box for EIGHT parallel
// browser workers plus two Vite servers - measured on a Ryzen 7 5800H / 16 GB laptop as 34
// live `chrome-headless-shell` processes, 93% CPU and under 2 GB of free RAM. Neither run is
// wrong; the collision is. Nobody chose it, and nobody could see it: each session only knows
// about its own checkout, and the dev-port registry deliberately keeps them off each other's
// ports, so the usual "port is busy" signal never fires.
//
// WHAT THIS IS NOT. It is not a lock file. A lock has to be released, and the thing holding it
// is a shell command that can be killed, time out, or be interrupted mid-run - so a stale lock
// would block every future run until someone deleted it by hand. Instead we ask the OS what is
// actually running. That answer is self-cleaning by construction: a killed run stops being
// reported the moment its process is gone.
//
// WHAT COUNTS AS A RUN. The top-level Playwright CLI (`@playwright/test/cli.js test ...`), one
// per run, whatever config or spec list it was given. Worker processes and browser shells are
// deliberately NOT counted: they are children of that CLI, so counting them would report one
// run many times, and a lingering browser without its CLI is an orphan (see --orphans), not a
// run in progress.
//
// CLI:
//   node scripts/e2e-runs.mjs            list active runs; exit 1 if any, 0 if none
//   node scripts/e2e-runs.mjs --json     the same as one machine-readable object
//   node scripts/e2e-runs.mjs --wait     block until no run is active, then exit 0
//   node scripts/e2e-runs.mjs --orphans  list browser/worker processes with no live CLI parent

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Absolute path with forward slashes, so paths compare across Windows/posix spellings. */
function normalize(path) {
  return resolve(path).replaceAll('\\', '/');
}

/** Case-insensitive checkout-path equality (Windows filesystems are case-insensitive). */
export function sameRoot(a, b) {
  return normalize(a).toLowerCase() === normalize(b).toLowerCase();
}

/**
 * Every node process on this machine, as `{ pid, command, startedAt }`.
 *
 * Node has no portable process list, so this shells out. Windows is the primary platform here
 * and `Get-CimInstance` is the only reliable source of a full command line on it (`tasklist`
 * truncates and `wmic` is deprecated); everything else gets `ps`. A failure returns an EMPTY
 * list, which makes every caller fail OPEN - a guard that cannot see the machine must not be
 * able to block a legitimate test run.
 */
export function nodeProcesses() {
  return process.platform === 'win32' ? windowsNodeProcesses() : posixNodeProcesses();
}

function windowsNodeProcesses() {
  // ConvertTo-Json collapses a single result to an object rather than an array, so force one.
  const script =
    "@(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | " +
    'Select-Object ProcessId,CommandLine,CreationDate) | ConvertTo-Json -Depth 3 -Compress';
  const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (res.status !== 0 || !res.stdout?.trim()) return [];
  let rows;
  try {
    rows = JSON.parse(res.stdout);
  } catch {
    return [];
  }
  return (Array.isArray(rows) ? rows : [rows])
    .filter((r) => typeof r?.CommandLine === 'string')
    .map((r) => ({
      pid: Number(r.ProcessId),
      command: r.CommandLine,
      // CIM dates arrive as \/Date(1754472000000)\/ through ConvertTo-Json.
      startedAt: msFromCimDate(r.CreationDate),
    }));
}

function msFromCimDate(value) {
  const match = typeof value === 'string' ? /\/Date\((\d+)\)\//.exec(value) : null;
  return match ? Number(match[1]) : null;
}

function posixNodeProcesses() {
  const res = spawnSync('ps', ['-eo', 'pid=,etimes=,args='], { encoding: 'utf8' });
  if (res.status !== 0 || !res.stdout) return [];
  return res.stdout
    .split('\n')
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter(Boolean)
    .filter(([, , , args]) => /(^|[/\\])node(\.exe)?\s/.test(`${args} `))
    .map(([, pid, etimes, args]) => ({
      pid: Number(pid),
      command: args,
      startedAt: Date.now() - Number(etimes) * 1000,
    }));
}

/** The top-level Playwright test CLI - one process per run, whatever config it was handed. */
const RUNNER = /@playwright[/\\]+test[/\\]+cli\.js["']?\s+.*\btest\b/;

/** A worker or browser spawned BY a run. Never counted as a run; used only by --orphans. */
const WORKER = /playwright[/\\]+lib[/\\]+worker[/\\]+workerProcessEntry\.js/;

/**
 * The checkout a Playwright process belongs to: everything left of its `node_modules`. That is
 * the one path present in every spelling of the invocation (`npx`, an `.bin` shim, a direct
 * `node ...cli.js`), so it identifies the worktree without parsing arguments.
 */
export function rootOfCommand(command) {
  // Split into ARGUMENTS first, then look inside one, rather than running a regex across the
  // whole command line. A single regex cannot get this right: a checkout path may contain
  // spaces (so whitespace cannot bound the match), but if the pattern is allowed to cross
  // whitespace it will happily span two unrelated arguments and glue them into a path that
  // never existed - observed producing `.../sleeper.mjs 60000 C:/claude/NoaCG-Studio` from a
  // command line whose real root was the second of those. Quoting is what actually resolves
  // the ambiguity, and quoting is a property of the argument, not of the character stream.
  for (const arg of splitArgs(command)) {
    const at = arg.toLowerCase().indexOf('node_modules');
    if (at <= 0) continue; // absent, or the argument IS node_modules with no root before it
    const root = arg.slice(0, at).replace(/[\\/]+$/, '');
    if (root) return normalize(root);
  }
  return null;
}

/**
 * A command line's arguments. Quoted runs stay whole (so a path with spaces survives); anything
 * else splits on whitespace. This is not a full shell parser and does not need to be - it only
 * has to keep one filesystem path from bleeding into the next.
 */
function splitArgs(command) {
  return command.match(/"[^"]*"|'[^']*'|\S+/g)?.map((arg) => arg.replace(/^["']|["']$/g, '')) ?? [];
}

/** Which config a run is using, for a message that says WHAT is running, not just that something is. */
function labelOf(command) {
  if (/playwright\.catalog\.config/.test(command)) return 'catalog calibration gate';
  if (/playwright\.live\.config/.test(command)) return 'configured/live suite';
  const specs = command.match(/[\w-]+\.spec\.ts/g);
  if (specs) return `${specs.length} spec file${specs.length === 1 ? '' : 's'}`;
  return 'full offline suite';
}

/**
 * Playwright runs active anywhere on this machine, newest last.
 * `exclude` drops runs belonging to that checkout - pass your own root to ask "is anyone ELSE
 * running?", omit it to ask "is anything running at all?".
 */
export function activeRuns({ exclude } = {}) {
  return nodeProcesses()
    .filter((p) => RUNNER.test(p.command))
    .map((p) => ({
      pid: p.pid,
      root: rootOfCommand(p.command),
      label: labelOf(p.command),
      elapsedMin: p.startedAt ? Math.round(((Date.now() - p.startedAt) / 60_000) * 10) / 10 : null,
    }))
    .filter((r) => r.root && !(exclude && sameRoot(r.root, exclude)))
    .sort((a, b) => (b.elapsedMin ?? 0) - (a.elapsedMin ?? 0));
}

/** One human-readable line per active run. */
export function describeRuns(runs) {
  return runs
    .map((r) => `  - ${r.root} (pid ${r.pid}, ${r.label}${r.elapsedMin === null ? '' : `, ${r.elapsedMin} min in`})`)
    .join('\n');
}

/**
 * Playwright workers and browser shells with no live CLI to belong to - what a killed or
 * crashed run leaves behind. They hold real RAM and nothing will ever reap them.
 */
export function orphanProcesses() {
  const runsExist = nodeProcesses().some((p) => RUNNER.test(p.command));
  const workers = nodeProcesses().filter((p) => WORKER.test(p.command));
  const shells = browserShells();
  return runsExist ? { workers: [], shells: [] } : { workers, shells };
}

function browserShells() {
  if (process.platform !== 'win32') return [];
  const script =
    "@(Get-Process -Name chrome-headless-shell -ErrorAction SilentlyContinue | " +
    'Select-Object Id,@{n="Mb";e={[int]($_.WorkingSet64/1MB)}}) | ConvertTo-Json -Compress';
  const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (res.status !== 0 || !res.stdout?.trim()) return [];
  try {
    const rows = JSON.parse(res.stdout);
    return (Array.isArray(rows) ? rows : [rows]).map((r) => ({ pid: r.Id, mb: r.Mb }));
  } catch {
    return [];
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (process.argv[1] && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);

  if (args.includes('--orphans')) {
    const { workers, shells } = orphanProcesses();
    const mb = shells.reduce((sum, s) => sum + s.mb, 0);
    if (workers.length === 0 && shells.length === 0) {
      console.log('No orphaned Playwright processes - nothing is holding RAM between runs.');
      process.exit(0);
    }
    console.log(
      `Orphaned from a killed or crashed run: ${workers.length} worker process(es) and ` +
        `${shells.length} browser shell(s) holding ~${mb} MB.\n` +
        'No Playwright CLI is running, so nothing will reap these. Close them with:\n' +
        '  node scripts/e2e-runs.mjs --kill-orphans',
    );
    process.exit(1);
  }

  if (args.includes('--kill-orphans')) {
    const { workers, shells } = orphanProcesses();
    if (workers.length === 0 && shells.length === 0) {
      console.log('Nothing to clean up.');
      process.exit(0);
    }
    // Only ever reached when NO Playwright CLI is running, so none of these can belong to a
    // live run - that check is the whole safety argument for killing anything here.
    let killed = 0;
    for (const p of [...workers, ...shells]) {
      try {
        process.kill(p.pid);
        killed++;
      } catch {
        // Already gone, or not ours to signal. Either way there is nothing to report.
      }
    }
    console.log(`Closed ${killed} orphaned process(es).`);
    process.exit(0);
  }

  const wait = args.includes('--wait');
  const asJson = args.includes('--json');
  const mine = args.includes('--all') ? undefined : repoRoot;

  let runs = activeRuns({ exclude: mine });

  if (wait) {
    let waited = 0;
    while (runs.length > 0) {
      if (waited === 0) {
        console.log(`Waiting for ${runs.length} Playwright run(s) to finish:\n${describeRuns(runs)}`);
      } else if (waited % 60 === 0) {
        console.log(`  still waiting (${waited / 60} min)...`);
      }
      await new Promise((done) => setTimeout(done, 5_000));
      waited += 5;
      runs = activeRuns({ exclude: mine });
    }
    if (waited > 0) console.log(`Clear after ${Math.round(waited / 6) / 10} min.`);
    process.exit(0);
  }

  if (asJson) {
    process.stdout.write(`${JSON.stringify({ runs, count: runs.length })}\n`);
    process.exit(runs.length > 0 ? 1 : 0);
  }

  if (runs.length === 0) {
    console.log('No Playwright run is active in any other checkout of this repo.');
    process.exit(0);
  }
  console.log(`${runs.length} Playwright run(s) active:\n${describeRuns(runs)}`);
  process.exit(1);
}
