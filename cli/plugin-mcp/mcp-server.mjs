#!/usr/bin/env node
// The plugin's MCP entrance. It exists to run `noacg mcp` in ONE process.
//
// The plugin used to declare `npx -y @noacg/cli mcp`, and npx cannot do that job cheaply. It
// resolves the package, spawns the real binary with `stdio: 'inherit'`, and then stays alive for
// the whole session with nothing left to do but forward the child's exit code. Measured on
// 2026-09-02 (docs/backlog/cli-mcp-startup-weight.md): that launcher process holds ~85 MB of
// private bytes for hours, and npx adds roughly 1.5-4 s to every session start. Pinning the
// version does not help - the cost is npx's own machinery, not the "what is latest?" lookup.
// An MCP server declared by a plugin starts in EVERY session that has the plugin installed, so
// both costs are paid by people who never touch a NoaCG graphic that day.
//
// So: find the CLI, then `import` it here instead of spawning it. Same process, same stdio, no
// wrapper. The npx path stays as the LAST resort, because zero-install is a real feature - a
// fresh user with no global install must still get a working server, and for them this stays
// exactly as expensive as the plugin already was, never more.

import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BIN = 'noacg';
const ENTRY = path.join('@noacg', 'cli', 'dist', 'index.js');

// The staleness check (docs/backlog/a-stale-global-cli-wins-over-npx-silently.md): an installed
// copy wins over npx silently, so a machine that ran `npm i -g @noacg/cli` once keeps that version
// forever with nothing on screen saying so. One cached registry read fixes that.
const REGISTRY_LATEST_URL = 'https://registry.npmjs.org/@noacg/cli/latest';
// One path per machine by default, so every `noacg-mcp` process shares one cached read. An explicit
// override exists solely so a diagnostic run (docs/acceptance/owner-queue/*-stale-global-cli-warns.md)
// can plant a fake `latest` without touching the real cache every other session on the box reads.
const VERSION_CACHE_FILE = process.env.NOACG_CLI_LATEST_CACHE_FILE
  || path.join(os.tmpdir(), 'noacg-cli-latest-version.json');
const VERSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // once a day is enough to catch a stale machine
const REGISTRY_TIMEOUT_MS = 1500; // never let a slow network add real time to a session start

/** Where npm puts a globally installed package, derived from the directory holding its shim:
 *  `<prefix>\node_modules\...` on Windows, `<prefix>/lib/node_modules/...` everywhere else. */
function globalEntries(binDir) {
  return [
    path.join(binDir, 'node_modules', ENTRY),
    path.join(binDir, '..', 'lib', 'node_modules', ENTRY),
  ];
}

/** npm's own npx entry, beside the running node binary - the same two layouts as above. */
function npxEntry() {
  const dir = path.dirname(process.execPath);
  return [
    path.join(dir, 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    path.join(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
  ].find(existsSync) ?? null;
}

/** The CLI's entry file, or null to fall back to npx. The order is deliberate: an explicit
 *  override first (a checkout under development), then a normal resolve, then a global install. */
function resolveCli() {
  const override = process.env.NOACG_CLI;
  if (override && existsSync(override)) return override;

  try {
    return createRequire(import.meta.url).resolve('@noacg/cli/dist/index.js');
  } catch {
    // Not installed beside the plugin. Expected - the plugin ships no node_modules.
  }

  // The default `npm i -g` prefix sits beside the running node binary: two stats that hit for
  // most installs, before the PATH walk below spends up to three per entry.
  const beside = globalEntries(path.dirname(process.execPath)).find(existsSync);
  if (beside) return beside;

  const dirs = (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const shim = [BIN, `${BIN}.cmd`, `${BIN}.exe`].map((n) => path.join(dir, n)).find(existsSync);
    if (!shim) continue;
    try {
      // npm symlinks the shim straight at the entry file on Linux and macOS (realpathSync throws
      // when the target is gone, so a returned path exists).
      const real = realpathSync(shim);
      if (real.endsWith('.js')) return real;
    } catch {
      // A shim that cannot be resolved is not a reason to stop looking.
    }
    const entry = globalEntries(dir).find(existsSync);
    if (entry) return entry;
  }
  return null;
}

/** The version `entry` (`.../@noacg/cli/dist/index.js`) belongs to, read from that package's own
 *  `package.json`, or null if it cannot be read - never a reason to stop resolving the CLI. */
function readOwnVersion(entry) {
  try {
    const pkgPath = path.join(path.dirname(entry), '..', 'package.json');
    return JSON.parse(readFileSync(pkgPath, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

/** npm's current `latest` for `@noacg/cli`, cached on disk for a day so a version check costs a
 *  network round trip once per machine per day rather than once per session. Returns null on any
 *  failure (offline, slow, cache unreadable) - a version check must never block startup. */
async function fetchLatestVersion() {
  try {
    const cached = JSON.parse(readFileSync(VERSION_CACHE_FILE, 'utf8'));
    if (Date.now() - cached.checkedAt < VERSION_CACHE_TTL_MS) return cached.latest;
  } catch {
    // No cache yet, or it is unreadable - fetch below.
  }

  let timeout;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), REGISTRY_TIMEOUT_MS);
    const res = await fetch(REGISTRY_LATEST_URL, { signal: controller.signal });
    if (!res.ok) return null;
    const { version } = await res.json();
    try {
      // Several concurrent `noacg-mcp` processes on one machine (a normal state in this repo's own
      // multi-worktree workflow) can race past the TTL check together and all land here at once.
      // Write-then-rename makes each write atomic, so a reader never sees a torn write from another
      // process - only ever one writer's complete JSON or another's, never a mix of both.
      const tmp = `${VERSION_CACHE_FILE}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ latest: version, checkedAt: Date.now() }));
      renameSync(tmp, VERSION_CACHE_FILE);
    } catch {
      // A machine where the temp dir cannot be written still gets the warning, just every session.
    }
    return version ?? null;
  } catch {
    return null; // offline or slow - silence, not a stale-version warning that could be wrong.
  } finally {
    clearTimeout(timeout);
  }
}

const extra = process.argv.slice(2);
const cli = resolveCli();

if (cli) {
  // Say what is about to import, so a stale global install is visible instead of silent (the
  // defect docs/backlog/a-stale-global-cli-wins-over-npx-silently.md describes). Skipped only when
  // `cli` actually IS the `NOACG_CLI` override (a checkout under active development is expected to
  // differ from npm's latest) - not merely when the env var is set, because a stale or deleted
  // override path falls through to a normal resolve inside `resolveCli`, and the copy that gets
  // imported then is one this check should cover. `resolveCli` returns the override path verbatim
  // when it uses it, so comparing against the result says the same thing its own check does,
  // without re-deriving it. Run in the background so a slow or unreachable registry cannot add real
  // time to startup: the warning, if any, may print a beat after the CLI is already live.
  if (cli !== process.env.NOACG_CLI) {
    const ownVersion = readOwnVersion(cli);
    if (ownVersion) {
      fetchLatestVersion().then((latest) => {
        if (latest && latest !== ownVersion) {
          process.stderr.write(
            `[noacg] the installed @noacg/cli is ${ownVersion}; npm's latest is ${latest}. Run\n`
              + '[noacg] `npm i -g @noacg/cli@latest` to update it.\n',
          );
        }
      }).catch(() => {
        // A version check must never surface as an error - see fetchLatestVersion's own contract.
      });
    }
  }
  // `dist/index.js` runs its own `main()` on import and reads `process.argv.slice(2)`, so hand it
  // the argv it would have had as a real command. One process from here on.
  process.argv = [process.execPath, cli, 'mcp', ...extra];
  await import(pathToFileURL(cli).href);
} else {
  // No installed copy. Say so on stderr - stdout belongs to the MCP protocol, and a stray line
  // there breaks the transport.
  process.stderr.write(
    '[noacg] @noacg/cli is not installed, so this session falls back to npx: an extra process and\n'
      + '[noacg] a slower start. `npm i -g @noacg/cli` makes it a single process.\n',
  );
  // Run npm's own npx entry IN THIS PROCESS rather than spawning the `npx` shim. Two reasons, both
  // load-bearing. Node has refused to spawn a `.cmd` without `shell: true` since the 2024
  // argument-injection fix, so `spawn('npx.cmd', ...)` dies immediately on Windows - measured here
  // before this was written. And spawning would make this launcher a THIRD process on the one path
  // that already had two, so the fresh-user case would get worse instead of staying level.
  const npxCli = npxEntry();
  if (!npxCli) {
    process.stderr.write('[noacg] npx could not be found either. Run `npm i -g @noacg/cli`.\n');
    process.exit(1);
  }
  process.argv = [process.execPath, npxCli, '-y', '@noacg/cli', 'mcp', ...extra];
  await import(pathToFileURL(npxCli).href);
}
