#!/usr/bin/env node
// gate: workflow weekly-audit.yml
// guards: scripts/e2e-affected.mjs, scripts/ci-failure-set.mjs, scripts/e2e-lists.mjs
// DID SELECTION MISS IT? For every red full run on main in the window, replay the landing that
// caused it through the per-change planner and say whether the failing spec would have run on
// that landing's pull request (docs/work-specs/e2e-suite-budget/evidence/selection-audit.md, the
// rollout criterion for batched validation).
//
//   node scripts/e2e-selection-misses.mjs [--days 7] [--limit 100] [--json]
//
// WHY. Before main's full run moves from "every landing" to "batched on pinned commits", the
// per-change plan has to be shown to catch what the full run catches. A failure the full run finds
// is either a selection MISS (the culprit's own plan did not select the spec: #927 on 2026-10-10,
// where `editor-fidelity-trim` was not mapped to `importedDesign/svg.ts`) or something else (a
// flake, a cap kill, a unit test). This reports the first kind by name, every week, and the count
// is what the cadence change waits on. "No miss observed" is evidence, not completeness: the full
// post-merge run keeps running after the change.
//
// HOW. The red runs come from the Actions API (`ci.yml`, push, main, conclusion failure); their
// failing specs from the same check annotations the red-main alarm reads
// (scripts/ci-failure-set.mjs); the landing's changed files from git (`sha^1..sha`, the merge the
// queue made); the plan from `planFor` at HEAD with the traced map, as a pull request runs it. The
// planner at HEAD rather than at the landing's commit is an approximation in the safe direction
// for this question: headers only grow, so a spec selected today was not necessarily selected then,
// and a spec not selected today was not selected then either.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchFailureSet, ghJsonLines, resolveRepo } from './ci-failure-set.mjs';
import { planFor } from './e2e-affected.mjs';
import { readStore } from './e2e-quarantine.mjs';
import { readTracedMap } from './e2e-traced.mjs';
import { measured } from './measured.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Classify one red run's failing specs against the plan its landing would have had. Pure.
 *
 * A spec that failed and then passed on the same commit went through the quarantine
 * (e2e/quarantine.json keeps the date it entered and the date it was released), and that is a
 * flake the plan could not have caught by selecting it, so it is named `flake`, never `miss`.
 * @param {{ sha: string, specs: string[] }} run  failing spec paths (`e2e/x.spec.ts`), job items dropped
 * @param {{ mode: string, specs: string[] }} plan the planner's answer for the landing's diff
 * @param {Set<string>} [flaky] basenames the quarantine store knows from this window
 * @returns {{ spec: string, verdict: 'selected' | 'full' | 'miss' | 'flake' | 'not-a-spec' }[]}
 */
export function classify(run, plan, flaky = new Set()) {
  const selected = new Set(plan.specs.map((s) => s.split('/').pop()));
  return run.specs.map((spec) => {
    const name = spec.split('/').pop();
    if (!/\.spec\.ts$/.test(spec)) return { spec, verdict: 'not-a-spec' };
    if (plan.mode === 'full') return { spec, verdict: 'full' };
    if (selected.has(name)) return { spec, verdict: 'selected' };
    return { spec, verdict: flaky.has(name) ? 'flake' : 'miss' };
  });
}

/**
 * Which failing specs each red run INTRODUCED. A red main stays red through the landings after it
 * until somebody fixes it (#927 turned main red at 6dd97b7d5; the next two landings, a mask fix
 * and a quarantine entry, failed the same spec and had nothing to do with it). So a spec counts
 * for the first run in which it fails after a run in which it did not, and a run inherits the
 * rest. Pure; `runs` oldest first, each `{ sha, conclusion, specs }` with `specs` the failing
 * specs of that run (empty for a green one).
 * @returns {{ sha: string, specs: string[] }[]} the red runs with only their newly failing specs
 */
export function newlyFailing(runs) {
  let before = new Set();
  const out = [];
  for (const run of runs) {
    const now = new Set(run.specs ?? []);
    if (run.conclusion === 'failure') out.push({ sha: run.sha, specs: [...now].filter((s) => !before.has(s)) });
    before = now;
  }
  return out;
}

/** Basenames of specs the quarantine store entered or released on or after `sinceIso`. */
export function flakyIn(store, sinceIso) {
  const out = new Set();
  for (const [spec, e] of Object.entries(store.specs ?? {})) if (e.since >= sinceIso) out.add(spec.split('/').pop());
  for (const [spec, e] of Object.entries(store.released ?? {})) if (e.last >= sinceIso) out.add(spec.split('/').pop());
  return out;
}

/** The week's table and totals. Pure. */
export function summarize(rows) {
  const misses = rows.filter((r) => r.verdict === 'miss');
  const flakes = rows.filter((r) => r.verdict === 'flake').length;
  const lines = [
    `### Selection misses: ${misses.length} of ${rows.length} failing spec(s) on ${new Set(rows.map((r) => r.sha)).size} red main run(s)${flakes ? ` (${flakes} quarantined flake(s) not counted)` : ''}`,
    '',
    '| Landing | Run | Failing spec | On its own plan |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.sha.slice(0, 9)} | ${r.runId} | \`${r.spec}\` | ${r.verdict}${r.verdict === 'miss' ? ' - add a covers line or a shared-set entry' : r.verdict === 'flake' ? ' - failed then passed on one commit (quarantine)' : ''} |`),
    '',
    misses.length === 0
      ? 'No miss in this window. That is evidence for the per-change plan, not a proof of completeness; the full run on main stays.'
      : `${misses.length} miss(es): each is a dependency the headers and the traced map did not name. Fix the header, then re-run this.`,
    '',
  ];
  return { misses, text: lines.join('\n') };
}

/**
 * The files that changed between the previous completed full run on main and this one. That is
 * one landing when the runs are consecutive, and every landing in between when main moved
 * several times before a run completed (a superseded run cancels itself, so a batch of landings
 * shares the first run that finishes - #927 and #941 did, on 2026-10-10). Without a previous run
 * the landing's own parent is the base. A shallow checkout fetches what it needs first.
 */
export function changedFilesOf(sha, base = `${sha}^1`, git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', windowsHide: true })) {
  try {
    git('cat-file', '-e', `${base}^{commit}`);
    git('cat-file', '-e', `${sha}^{commit}`);
  } catch {
    try { git('fetch', '--quiet', 'origin', sha, ...(base.endsWith('^1') ? [] : [base])); } catch { /* reported by the diff below */ }
  }
  return git('diff', '--name-only', base, sha).split('\n').map((l) => l.trim()).filter(Boolean);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt; };
  const days = Number(value('--days', 7));
  const limit = Number(value('--limit', 100));
  const { repo } = resolveRepo();
  if (!repo) {
    console.error('e2e-selection-misses: cannot resolve the repository (GH_REPO or the origin remote).');
    process.exit(2);
  }
  const since = Date.now() - days * 86_400_000;
  // Every completed run in the window, oldest first: a green run resets what counts as "already
  // failing", and a cancelled one (superseded, or killed at the cap) says nothing either way.
  const all = ghJsonLines([`repos/${repo}/actions/workflows/ci.yml/runs?branch=main&event=push&status=completed&per_page=${Math.min(100, limit)}`, '--jq', '.workflow_runs[] | {id, head_sha, conclusion, created_at}'])
    .filter((r) => r?.id && (r.conclusion === 'failure' || r.conclusion === 'success') && Date.parse(r.created_at) >= since)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const runs = all.filter((r) => r.conclusion === 'failure');
  measured.optional(runs.length, 'red full runs on main in the window', 'a week with no red main run has nothing to replay');
  const traced = readTracedMap();
  const flaky = flakyIn(readStore(), new Date(since).toISOString().slice(0, 10));
  const failing = new Map(runs.map((r) => [r.id, fetchFailureSet(r.id, { repo }).items.filter((i) => !i.startsWith('job: '))]));
  const introduced = new Map(newlyFailing(all.map((r) => ({ sha: r.head_sha, conclusion: r.conclusion, specs: failing.get(r.id) ?? [] }))).map((r) => [r.sha, r.specs]));
  const rows = [];
  for (const run of runs) {
    const specs = introduced.get(run.head_sha) ?? [];
    if (specs.length === 0) continue;
    const previous = all[all.indexOf(run) - 1];
    let changed;
    try { changed = changedFilesOf(run.head_sha, previous ? previous.head_sha : undefined); } catch (e) {
      console.error(`e2e-selection-misses: cannot diff ${run.head_sha.slice(0, 9)} (${String(e?.message ?? e).split('\n')[0]}) - skipped.`);
      continue;
    }
    const plan = planFor(changed, { sprintFocus: true, traced });
    for (const c of classify({ sha: run.head_sha, specs }, plan, flaky)) rows.push({ ...c, sha: run.head_sha, runId: run.id });
  }
  const { misses, text } = summarize(rows);
  if (args.includes('--json')) console.log(JSON.stringify({ days, runs: runs.length, rows }, null, 1));
  else console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  for (const m of misses) console.log(`::warning title=Selection miss::${m.spec} failed on main at ${m.sha.slice(0, 9)} and its landing's own plan did not select it.`);
}
