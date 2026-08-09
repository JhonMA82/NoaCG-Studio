// Where the Lite eval tooling finds its two files, resolved for ANY checkout.
//
// A linked worktree has no `.env` of its own - git does not copy untracked files - so every
// tool that needs a real key has to read the MAIN checkout's `.env`. The bench configuration,
// by contrast, belongs to the checkout that runs the round: `.env.bench.local` is written next
// to the worktree's own `package.json`, because `vite --mode bench` loads it from there.
//
// Both halves of `.env.bench.local` are load-bearing:
//   - `.bench`  - `vite --mode bench` (what `npm run dev:bench` starts) loads it. NOT `.env`:
//                 AI_LITE_ENABLED=1 makes the tier picker appear and fails pro.spec.ts, and the
//                 e2e suite reads `.env`.
//   - `.local`  - `.env.bench` ITSELF IS COMMITTED and says so in its own header ("NO SECRETS
//                 BELONG HERE"). Vite loads `.env.[mode].local` after `.env.[mode]`, so this
//                 file wins without touching the tracked one, and `.gitignore` covers it.

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEnvFile } from './read-dotenv.mjs';

/** The checkout these scripts live in - a worktree, or the main checkout. */
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The MAIN checkout, which is the only one that carries a real `.env`. `--git-common-dir` is
 * the shared `.git` directory: in a linked worktree it is an absolute path into the main
 * checkout, in the main checkout it is a bare `.git` relative to the cwd - hence the resolve
 * against `repoRoot` rather than against wherever the tool was invoked from.
 */
export function mainCheckout() {
  const result = spawnSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const raw = result.status === 0 ? result.stdout.trim() : '';
  // Not a git checkout at all (a tarball, a CI copy): the checkout we are in is all there is.
  if (!raw) return repoRoot;
  return dirname(resolve(repoRoot, raw));
}

/** The main checkout's `.env` - the one file that holds real keys. Absent reads as empty. */
export function mainEnv() {
  return readEnvFile(mainCheckout(), '.env');
}

/** This checkout's bench configuration file. Written by lite-eval-env, read by everything else. */
export function benchEnvPath() {
  return join(repoRoot, '.env.bench.local');
}

/** This checkout's bench configuration values. A missing file reads as empty, never as an error. */
export function benchEnv() {
  return readEnvFile(repoRoot, '.env.bench.local');
}
