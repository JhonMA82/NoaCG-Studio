// The FREE DRY RUN for the paid benchmark stages (docs/AI_LITE_PROMOTION.md).
//
//   npm run bench:preflight -- <model,model,...> [--task=lite|import-analysis] [--env=<path>]
//
// SPENDS NOTHING and reaches no network. It answers the question the paid runner
// structurally cannot answer at runtime: given this .env and these candidates, what would
// each arm ACTUALLY serve, and is the comparison worth paying for?
//
// --task=lite (default) resolves through the Lite profile (bench:compare's arms);
// --task=import-analysis resolves through the imported-graphic-analysis profile
// (bench:vision's arms - the 2026-07-29 vision round ran without this and two of five
// candidates failed all 35 images for reasons nothing free had checked).
//
// Run it before `npm run bench:compare -- ... --confirm-spend`. Every failure it reports
// wasted a real round at least once (api/_lib/aiBenchPreflight.ts has the catalogue).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from './api-runtime-build.mjs';
import { printPreflightReport, runTaskPreflight } from './ai-task-preflight.mjs';

const argv = process.argv.slice(2);
// --env=<path> checks a DIFFERENT environment file (a staging config, or a fixture
// reproducing a past failure) instead of the checkout's .env.
const ENV_FILE = argv.find((a) => a.startsWith('--env='))?.slice(6) ?? '.env';
const TASK = argv.find((a) => a.startsWith('--task='))?.slice(7) ?? 'lite';
const REQUESTED = (argv.find((a) => !a.startsWith('--')) ?? '').split(',').map((s) => s.trim()).filter(Boolean);

if (!REQUESTED.length || !['lite', 'import-analysis'].includes(TASK)) {
  console.error('Usage: npm run bench:preflight -- <model,model,...> [--task=lite|import-analysis]');
  console.error('Checks what each arm would serve, for free, before a paid bench spends.');
  process.exit(1);
}

/** The ambient environment the dev server would inherit. Parsed from .env exactly as the
 *  paid runner reads it - the precedence is the point, so this must be the same file. */
async function readEnvFile() {
  const env = {};
  try {
    const raw = await readFile(path.resolve(projectRoot, ENV_FILE), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match) env[match[1]] = match[2].trim();
    }
  } catch {
    console.warn(`No ${ENV_FILE} found - checking the plan against the ambient environment only.\n`);
  }
  return env;
}

const report = await runTaskPreflight({
  task: TASK,
  candidates: REQUESTED,
  ambient: await readEnvFile(),
  // The Lite comparison mints per-candidate bench tokens; the vision runner does too.
  requireEvalIdentity: true,
  includeIncumbent: true,
});

const ok = printPreflightReport(report);
if (ok) {
  console.log('\nPreflight OK. The arms are distinct, approved, configured and attributable.');
  console.log('This says nothing about model QUALITY - that is what the paid round measures.');
} else {
  console.log('Preflight FAILED. Fix the above before spending: each of these failures');
  console.log('produces a complete, plausible-looking, worthless result set.');
  process.exitCode = 1;
}
