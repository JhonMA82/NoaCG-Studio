#!/usr/bin/env node
// WHICH SPEC FILES A RED RUN'S SHARDS FAILED ON - read from their own blob reports, so the retry
// job re-runs exactly those files on the same commit and nothing else.
//
//   node scripts/e2e-retry.mjs --blobs <dir> --shards <n> [--shard-specs <json>] [--changed <base>] [--github-output]
//
// The shards upload `blob-report-<n>` artifacts (playwright.config.ts); ci.yml's `e2e-retry` job
// downloads them into one directory and asks Playwright to merge them into a JSON report, which
// is the same merge the combined HTML report is made from and needs no network. From that report
// the failing spec FILES are collected - files, not test titles, because the retry runs whole
// files and the quarantine is kept per file, the unit the planner and the durations table use.
//
// A test is failed when Playwright's verdict for it is `unexpected`: that is the status after
// every result of the test is weighed, and it is what the `ok` flag on a spec does NOT say - `ok`
// is true for a skipped spec (e2e/AGENTS.md, "A suite that skips itself exits 0").
//
// A SHARD THAT DIED IS RE-RUN WHOLE. A shard killed at its 20-minute cap, or one that failed before
// Playwright reported, uploads no blob, so its files have no verdict on this commit at all. Until
// 2026-10-03 that refused the whole retry, and twice that day (runs 37096120413 and 37118148332)
// one slow shard beside one flaky spec left main red with nothing re-run. Now the files the plan
// assigned to the dead shard (`--shard-specs`, the plan's own `shardSpecs`) come back as
// `unreported`, and ci.yml runs them in a step of their own. That is their FIRST run: a failure
// there keeps the run red but is never read as a failure confirmed by a second run, and a pass is
// never a flake to quarantine. Only the `specs` that failed in a shard are quarantined.
//
// THREE REFUSALS, each one a case where a green retry would let the gate read more than it knows:
//   - more than one shard without a report, or a dead shard whose files the plan does not name:
//     one second run cannot cover several runners' worth of files inside its own time limit, and
//     a file list that cannot be named cannot be re-run;
//   - nothing to re-run: no failing spec in the reports and no dead shard - the failure was not a
//     test. ONE SHAPE OF IT IS GREEN, not refused: every shard job of this run's attempt either
//     succeeded or was cancelled with its specs, its clean-tree check and its report upload all
//     passed (`cancelledAfterReport`, read off the run's own job list), and the merged report
//     carries no run-level error. That is a shard that ran out of clock AFTER its verdict was in.
//     Run 38153870752 was that: ten complete green reports, shard 5 ending at the 20-minute cap
//     in its post steps, and main red (#1020, #1025) for a commit whose every spec passed. The
//     matrix's one-word `needs.e2e.result` is not enough to decide it, because it can read
//     `cancelled` beside a shard that FAILED (see the gate in ci.yml); the job list cannot. A job
//     list that cannot be read refuses;
//   - a failing spec that this change itself touched (`--changed <base>`): a flake in a spec the
//     change wrote or edited is the change's, not the suite's; it is bounced to its author, never
//     quarantined on the strength of a second run.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ghJsonLines } from './ci-failure-set.mjs';
import { changedFilesSince } from './e2e-affected.mjs';
import { parseArgs } from './e2e-quarantine.mjs';
import { editedSpecs, planIdentity, specFilterArg, specPath } from './e2e-spec-names.mjs';

/**
 * The failing spec files of a Playwright JSON report, sorted, as repo-relative paths.
 * @param {{ suites?: any[] }} report
 */
export function failedSpecFiles(report) {
  const files = new Set();
  const walk = (suite) => {
    for (const spec of suite?.specs ?? []) {
      const failed = (spec.tests ?? []).some((t) => t?.status === 'unexpected');
      const file = String(spec.file ?? suite.file ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
      if (failed && file) files.add(specPath(file));
    }
    for (const child of suite?.suites ?? []) walk(child);
  };
  for (const suite of report?.suites ?? []) walk(suite);
  return [...files].sort();
}

/** How many shards may die and still be re-run: one runner's worth of files fits the retry's cap. */
export const MAX_DEAD_SHARDS = 1;

/** The shard job's steps (ci.yml) that must all have passed for its cancellation to come after its verdict. */
export const REPORTED_STEPS = ['E2E shard', 'Tests left the tree clean', 'Upload shard report'];

/**
 * Which shards this run's own job list shows cancelled only AFTER their verdict was in, or why
 * that cannot be said. Every `E2E <n>/<total>` job must be there; each one either succeeded or was
 * cancelled with all of `REPORTED_STEPS` passed. A failed leg, a cancelled leg whose specs, tree
 * check or upload did not pass, or a list that is missing or short refuses.
 * @param {{ name?: string, conclusion?: string | null, steps?: { name?: string, conclusion?: string | null }[] }[] | null} jobs
 * @param {number} shards
 * @returns {{ ok: true, capped: number[] } | { ok: false, why: string }}
 */
export function cancelledAfterReport(jobs, shards) {
  const legs = (jobs ?? [])
    .map((job) => ({ n: Number(/^E2E (\d+)\/\d+\b/.exec(String(job?.name ?? ''))?.[1]), job }))
    .filter(({ n }) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a.n - b.n);
  if (shards <= 0 || legs.length !== shards) {
    return { ok: false, why: `this run's job list shows ${legs.length} of ${shards} shard jobs` };
  }
  const capped = [];
  for (const { n, job } of legs) {
    if (job.conclusion === 'success') continue;
    const missed = REPORTED_STEPS.filter((name) => !(job.steps ?? []).some((s) => s?.name === name && s.conclusion === 'success'));
    if (job.conclusion !== 'cancelled' || missed.length > 0) {
      return { ok: false, why: `shard ${n} concluded ${job.conclusion ?? 'unknown'}${missed.length > 0 ? ` without passing ${missed.map((s) => `"${s}"`).join(', ')}` : ''}` };
    }
    capped.push(n);
  }
  if (capped.length === 0) return { ok: false, why: 'no shard job was cancelled' };
  return { ok: true, capped };
}

/**
 * What to re-run, or why not. Pure: the decision the gate's verdict rests on.
 *
 * `specs` failed in a shard and get their SECOND run; `unreported` are the files of a shard that
 * uploaded no report, which get their FIRST. `reported` is the 1-based indices of the shards that
 * uploaded one, and `shardSpecs` the plan's assignment, one file list per shard in shard order.
 * `jobs` is this run's job list and `errors` the number of run-level errors in the merged report
 * (null when it says nothing); with no failing spec they tell a shard that ran out of clock after
 * reporting from one that failed outside its specs. An `ok` with nothing to run says why, and
 * names the shards that ran into their cap as `capped`.
 * @param {{ failed: string[], reported: number[], shards: number, shardSpecs?: string[][] | null, changed?: string[], jobs?: Parameters<typeof cancelledAfterReport>[0], errors?: number | null }} input
 * @returns {{ ok: true, specs: string[], unreported: string[], dead: number[], capped?: number[], reason?: string } | { ok: false, reason: string }}
 */
export function retryPlan({ failed, reported, shards, shardSpecs = null, changed = [], jobs = null, errors = null }) {
  const have = new Set(reported);
  const dead = Array.from({ length: Math.max(0, shards) }, (_, i) => i + 1).filter((n) => !have.has(n));
  if (dead.length > MAX_DEAD_SHARDS) {
    return { ok: false, reason: `${dead.length} of ${shards} shards uploaded no report (${dead.join(', ')}) - more than one runner died, and one second run cannot cover their files inside its own time limit` };
  }
  const unnamed = dead.filter((n) => !Array.isArray(shardSpecs?.[n - 1]) || shardSpecs[n - 1].length === 0);
  if (unnamed.length > 0) {
    return { ok: false, reason: `shard ${unnamed.join(', ')} uploaded no report and the plan does not name its files, so they cannot be re-run` };
  }
  const failing = new Set(failed);
  const unreported = [...new Set(dead.flatMap((n) => shardSpecs[n - 1].map(specPath)))].filter((s) => !failing.has(s)).sort();
  if (failed.length === 0 && unreported.length === 0) {
    const refused = 'the shard reports name no failing spec - the failure was not a test, so there is nothing to re-run';
    if (errors !== 0) {
      return { ok: false, reason: `${refused} (${errors == null ? 'the merged report says nothing of run-level errors' : `the merged report holds ${errors} run-level error(s)`})` };
    }
    const legs = cancelledAfterReport(jobs, shards);
    if (!legs.ok) return { ok: false, reason: `${refused} (${legs.why})` };
    return {
      ok: true, specs: [], unreported: [], dead: [], capped: legs.capped,
      reason: `all ${shards} shard reports are in with no failing spec and no run error, and shard ${legs.capped.join(', ')} was cancelled only after its specs, clean-tree check and upload passed - every spec has its verdict, so there is nothing to re-run`,
    };
  }
  const edited = editedSpecs(changed);
  const touched = failed.filter((spec) => edited.has(planIdentity(spec)));
  if (touched.length > 0) {
    return { ok: false, reason: `${touched.join(', ')} failed and this change edits ${touched.length === 1 ? 'it' : 'them'} - a flake in a spec the change wrote is the change's to fix, not the suite's to quarantine` };
  }
  return { ok: true, specs: failed, unreported, dead };
}

/**
 * Merge the blob reports in `dir` into one JSON report, with the Playwright the shards used.
 *
 * The reporter writes to a FILE (`PLAYWRIGHT_JSON_OUTPUT_FILE`), never to stdout. On the Linux
 * runner, stdout captured through a pipe stops at 146,176 bytes of a 2.2 MB report, every time
 * (runs 36246036302 and 36253812414), while a file receives all of it: `JSON.parse` then failed on
 * the cut-off document, and a one-spec flake turned main red. Windows receives the whole report,
 * which is why it could not be reproduced there.
 */
function mergeBlobReports(dir) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'e2e-retry-'));
  const file = path.join(tmp, 'merged.json');
  try {
    const res = spawnSync('npx', ['--no-install', 'playwright', 'merge-reports', '--reporter=json', dir], {
      encoding: 'utf8',
      windowsHide: true,
      shell: process.platform === 'win32',
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: file },
    });
    if (res.status !== 0) {
      throw new Error(`merge-reports failed: ${String(res.stderr ?? '').trim() || `exit ${res.status}`}`);
    }
    return JSON.parse(readFileSync(file, 'utf8'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * What the change touched, from the planner's own reader. An unusable base is "nothing known", and
 * says so, because it switches the edited-spec refusal off: run 37118148332 hit that silently, on
 * a one-commit checkout with no base to diff against (ci.yml now fetches the history). Exported
 * for scripts/configured-verdict.mjs, whose quarantine makes the same refusal.
 */
export function changedSince(base) {
  if (!base || /^0{40}$/.test(base)) return [];
  try {
    return changedFilesSince(base);
  } catch (e) {
    console.error(`e2e-retry: cannot tell what this change edits (base ${base}): ${String(e?.message ?? e).split('\n')[0]}`);
    return [];
  }
}

/**
 * This run's jobs, latest attempt, with their step conclusions - or null without `GH_REPO` and
 * `RUN_ID` (a local run), and empty when GitHub does not answer. Either refuses the green path.
 */
function runJobs() {
  const { GH_REPO: repo, RUN_ID: runId } = process.env;
  if (!repo || !runId) return null;
  return ghJsonLines([`repos/${repo}/actions/runs/${runId}/jobs?per_page=100`, '--paginate', '--jq', '.jobs[] | {name, conclusion, steps: [.steps[]? | {name, conclusion}]}']);
}

/** The plan's per-shard assignment, or null when it is absent or unreadable. */
function parseShardSpecs(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const bins = JSON.parse(raw);
    return Array.isArray(bins) ? bins : null;
  } catch {
    return null;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { flags } = parseArgs(process.argv.slice(2));
  const dir = flags.get('--blobs');
  if (typeof dir !== 'string') {
    console.error('usage: e2e-retry.mjs --blobs <directory of blob reports> --shards <n> [--shard-specs <json>] [--changed <base>] [--github-output]');
    process.exit(2);
  }
  // No directory is no shard reporting at all, which the plan refuses or re-runs like any other.
  const zips = existsSync(dir) ? readdirSync(dir).filter((f) => /^report-\d+\.zip$/.test(f)) : [];
  const shards = Number(flags.get('--shards') ?? 0);
  const report = zips.length > 0 ? mergeBlobReports(dir) : null;
  const failed = failedSpecFiles(report);
  const plan = retryPlan({
    failed,
    reported: zips.map((f) => Number(/\d+/.exec(f)[0])),
    shards,
    shardSpecs: parseShardSpecs(flags.get('--shard-specs')),
    changed: changedSince(flags.get('--changed')),
    // Read only when it can decide anything: with a failing spec the green path is never taken.
    jobs: failed.length === 0 ? runJobs() : null,
    errors: Array.isArray(report?.errors) ? report.errors.length : null,
  });
  if (!plan.ok) {
    console.error(`e2e-retry: not re-running - ${plan.reason}.`);
    process.exit(1);
  }
  if (plan.reason) console.error(`e2e-retry: ${plan.reason}.`);
  // Green, but the cap is still being reached: say which shard, so the pressure stays visible.
  for (const n of plan.capped ?? []) {
    console.log(`::warning title=E2E shard ${n} reached its cap::Shard ${n} was cancelled at its timeout after its report was in. Its specs all passed, so the run is green, but the shard is running out of time.`);
  }
  for (const n of plan.dead) {
    console.error(`e2e-retry: shard ${n} uploaded no report, so its files never ran on this commit - they run once now, as their first verdict.`);
  }
  const filters = plan.specs.map(specFilterArg);
  const unreportedFilters = plan.unreported.map(specFilterArg);
  const out = process.env.GITHUB_OUTPUT;
  if (flags.has('--github-output') && out) {
    appendFileSync(
      out,
      `specs=${JSON.stringify(plan.specs)}\nfilters=${filters.join(' ')}\n` +
        `unreported=${JSON.stringify(plan.unreported)}\nunreported_filters=${unreportedFilters.join(' ')}\n`,
    );
  }
  process.stdout.write(`${JSON.stringify({ specs: plan.specs, filters, unreported: plan.unreported, unreportedFilters })}\n`);
}
