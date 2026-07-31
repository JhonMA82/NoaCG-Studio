// The FREE DRY RUN for the paid benchmark stages (docs/AI_LITE_PROMOTION.md).
//
//   npm run bench:preflight -- <model,model,...>
//
// SPENDS NOTHING and reaches no network. It answers the question the paid runner
// structurally cannot answer at runtime: given this .env and these candidates, what would
// each arm ACTUALLY serve, and is the comparison worth paying for?
//
// Run it before `npm run bench:compare -- ... --confirm-spend`. Every failure it reports
// wasted a real round at least once (api/_lib/aiBenchPreflight.ts has the catalogue).

import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildApiRuntime, projectRoot } from './api-runtime-build.mjs';

const argv = process.argv.slice(2);
// --env=<path> checks a DIFFERENT environment file (a staging config, or a fixture
// reproducing a past failure) instead of the checkout's .env.
const ENV_FILE = argv.find((a) => a.startsWith('--env='))?.slice(6) ?? '.env';
const REQUESTED = (argv.find((a) => !a.startsWith('--')) ?? '').split(',').map((s) => s.trim()).filter(Boolean);

if (!REQUESTED.length) {
  console.error('Usage: npm run bench:preflight -- <model,model,...>');
  console.error('Checks what each arm would serve, for free, before bench:compare spends.');
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

const ambient = { ...(await readEnvFile()) };

// The preflight is server code (it resolves through the real profile and task registry), so
// it is compiled the same way the API tests compile it rather than reimplemented in JS.
const runtime = await buildApiRuntime(['api/_lib/aiBenchPreflight.ts']);
try {
  const entry = path.join(runtime.outputDir, 'api/_lib/aiBenchPreflight.js');
  const driver = path.join(runtime.outputDir, 'preflight-driver.mjs');
  await writeFile(
    driver,
    // A file:// URL, not a bare path: on Windows an absolute path starts with a drive
    // letter, which the ESM loader reads as an unsupported URL scheme.
    'import { benchPreflight, benchCredentialFindings, defaultIncumbentModel } from '
      + `${JSON.stringify(pathToFileURL(entry).href)};\n`
      + 'const [requested, ambient] = JSON.parse(process.argv[2]);\n'
      // The incumbent is always the baseline: a comparison with nothing to beat is not a
      // comparison. Derived from the profile default, so it cannot name a superseded model.
      + 'const incumbent = defaultIncumbentModel();\n'
      + 'const plan = requested.includes(incumbent) ? requested : [...requested, incumbent];\n'
      + 'const arms = plan.map((candidate) => ({ candidate, env: '
      + "{ AI_LITE_PRIMARY_MODEL: candidate, AI_LITE_PRIMARY_PROVIDER: 'openrouter' } }));\n"
      + 'const report = benchPreflight(arms, ambient);\n'
      + 'report.findings.push(...benchCredentialFindings(ambient, { requireEvalIdentity: true }));\n'
      + "report.ok = !report.findings.some((f) => f.severity === 'error');\n"
      + 'report.incumbent = incumbent;\n'
      + 'process.stdout.write(JSON.stringify(report));\n',
    'utf8',
  );
  const result = spawnSync(process.execPath, [driver, JSON.stringify([REQUESTED, ambient])], {
    cwd: projectRoot,
    encoding: 'utf8',
    // The real environment is passed as DATA (ambient), not inherited, so the preflight
    // reports on .env rather than on whatever this shell happens to carry.
    env: { PATH: process.env.PATH, NODE_ENV: 'test' },
  });
  if (result.status !== 0) {
    console.error(result.stderr || 'The preflight failed to run.');
    process.exit(1);
  }
  const report = JSON.parse(result.stdout);

  // Width the columns to the actual ids: a served model that runs into the next column is
  // exactly the thing this table exists to let you read at a glance.
  const width = Math.max(20, ...report.arms.flatMap((a) => [a.candidate.length, a.resolved.model.length]));
  console.log(`Plan: ${report.arms.length} arm(s)\n`);
  console.log(`  ${'arm (reported)'.padEnd(width)} -> ${'would actually serve'.padEnd(width)}  configured`);
  for (const arm of report.arms) {
    const mark = arm.resolved.model === arm.candidate && arm.configured ? ' ' : '✗';
    console.log(
      `${mark} ${arm.candidate.padEnd(width)} -> ${arm.resolved.model.padEnd(width)}  ${arm.configured ? 'yes' : 'NO '}`
        + (arm.candidate === report.incumbent ? '  [incumbent baseline]' : ''),
    );
  }

  const errors = report.findings.filter((f) => f.severity === 'error');
  const warnings = report.findings.filter((f) => f.severity === 'warning');
  if (errors.length) {
    console.log(`\n${errors.length} blocking problem(s):\n`);
    for (const finding of errors) console.log(`  ✗ [${finding.code}] ${finding.arm ? `${finding.arm}: ` : ''}${finding.message}\n`);
  }
  if (warnings.length) {
    console.log(`${warnings.length} warning(s):\n`);
    for (const finding of warnings) console.log(`  ! [${finding.code}] ${finding.message}\n`);
  }

  if (report.ok) {
    console.log('\nPreflight OK. The arms are distinct, approved, configured and attributable.');
    console.log('This says nothing about model QUALITY - that is what the paid round measures.');
  } else {
    console.log('Preflight FAILED. Fix the above before spending: each of these failures');
    console.log('produces a complete, plausible-looking, worthless result set.');
    process.exitCode = 1;
  }
} finally {
  await runtime.cleanup();
}
