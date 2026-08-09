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

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mainCheckout as resolveMainCheckout, readEnvFile } from './read-dotenv.mjs';

/** The checkout these scripts live in - a worktree, or the main checkout. */
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The MAIN checkout, which is the only one that carries a real `.env`. */
export function mainCheckout() {
  return resolveMainCheckout(repoRoot);
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
