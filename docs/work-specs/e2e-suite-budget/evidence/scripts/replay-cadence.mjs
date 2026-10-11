// Replay candidate full-run cadences on main against the actual landing history (2026-09-15..10-11).
// Baseline = the observed main runs. Candidates = batched full runs on pinned main commits.
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = process.env.NOACG_CI_CACHE || join(tmpdir(), 'noacg-ci-cache');
const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, windowsHide: true }).trim();
const SINCE = '2026-09-15T00:00:00Z', UNTIL = '2026-10-12T00:00:00Z';
const q = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const fmt = n => Number.isFinite(n) ? n.toFixed(1) : '-';
const wk = d => { const t = new Date(d); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day); return t.toISOString().slice(0, 10); };

// 1. Landings on main with relevance from the planner (cached).
const cache = join(here, 'landings-relevance.json');
let landings;
if (existsSync(cache)) landings = JSON.parse(readFileSync(cache, 'utf8'));
else {
  const planner = await import(pathToFileURL(join(ROOT, 'scripts/e2e-affected.mjs')).href);
  const traced = await import(pathToFileURL(join(ROOT, 'scripts/e2e-traced.mjs')).href);
  const map = traced.readTracedMap();
  const minutes = JSON.parse(readFileSync(join(ROOT, 'scripts/e2e-durations.json'), 'utf8')).minutes;
  const med = [...Object.values(minutes)].sort((a, b) => a - b)[Math.floor(Object.keys(minutes).length / 2)];
  const lines = git('log', '--first-parent', `--since=${SINCE}`, `--until=${UNTIL}`, '--format=%H %cI %P', 'origin/main').split('\n').filter(Boolean).reverse();
  landings = [];
  for (const line of lines) {
    const [sha, when, ...parents] = line.split(' ');
    const changed = git('diff', '--name-only', `${sha}^1`, sha).split('\n').filter(Boolean);
    const plan = planner.planFor(changed, { sprintFocus: true, traced: map });
    const specs = plan.mode === 'full' ? Object.keys(minutes) : plan.specs;
    const mins = specs.reduce((a, s) => a + (minutes[s] ?? med), 0);
    const subject = git('log', '-1', '--format=%s', sha);
    const mechanical = /^(Quarantine|Release) |quarantine|e2e-traced|durations table|Revert /i.test(subject);
    landings.push({ sha, t: when, mode: plan.mode, focus: plan.focusApplied, minutes: +mins.toFixed(1), specs: specs.length, catalog: plan.catalog, merge: parents.length > 1, mechanical, subject: subject.slice(0, 70) });
  }
  writeFileSync(cache, JSON.stringify(landings));
}
const relevant = landings.filter(l => l.mode !== 'none');
console.log(`landings on main ${landings.length} (${landings[0].t.slice(0, 10)}..${landings.at(-1).t.slice(0, 10)}); relevant to offline E2E (mode != none) ${relevant.length}; mechanical ${landings.filter(l => l.mechanical).length}`);
const byWeekL = {}; for (const l of landings) { const w = wk(l.t); byWeekL[w] = byWeekL[w] || { n: 0, rel: 0 }; byWeekL[w].n++; if (l.mode !== 'none') byWeekL[w].rel++; }
console.log('per week landings / relevant:', Object.entries(byWeekL).map(([w, v]) => `${w}: ${v.n}/${v.rel}`).join('  '));

// 2. Observed main runs (baseline).
const runs = JSON.parse(readFileSync(join(here, 'runs.json'), 'utf8')).filter(r => r.path.endsWith('/ci.yml') && r.event === 'push' && r.head_branch === 'main' && r.created_at >= SINCE);
const bySha = new Map(runs.map(r => [r.head_sha, r]));
const completedFull = runs.filter(r => r.conclusion === 'success' || r.conclusion === 'failure').sort((a, b) => a.updated_at.localeCompare(b.updated_at));
const wallByWeek = {}; for (const r of runs.filter(r => r.conclusion === 'success')) (wallByWeek[wk(r.created_at)] = wallByWeek[wk(r.created_at)] || []).push((new Date(r.updated_at) - new Date(r.run_started_at)) / 60000);
const wallP50 = Object.fromEntries(Object.entries(wallByWeek).map(([w, a]) => [w, q(a, .5)]));
const wallP90 = Object.fromEntries(Object.entries(wallByWeek).map(([w, a]) => [w, q(a, .9)]));
console.log('observed successful full-run wall p50 by week:', JSON.stringify(Object.fromEntries(Object.entries(wallP50).map(([w, v]) => [w, +v.toFixed(1)]))), 'p90:', JSON.stringify(Object.fromEntries(Object.entries(wallP90).map(([w, v]) => [w, +v.toFixed(1)]))));
// Baseline detection delay: for each relevant landing, first completed (success/failure) main run created at or after the landing.
const baseDelays = [];
for (const l of relevant) {
  const r = completedFull.find(r => r.created_at >= l.t);
  if (r) baseDelays.push((new Date(r.updated_at) - new Date(l.t)) / 60000);
}
const RUNNER_MIN_PER_FULL = 130; // measured median runner minutes of a full main run (11 shards + build + factory + catalog + gate)
const obsFull = runs.filter(r => r.conclusion !== 'cancelled').length, obsCancelled = runs.filter(r => r.conclusion === 'cancelled').length;
console.log(`\nBASELINE (observed): main runs ${runs.length}, completed ${obsFull}, cancelled ${obsCancelled}; detection delay (landing -> first completed full run at/after it) p50 ${fmt(q(baseDelays, .5))} p90 ${fmt(q(baseDelays, .9))} max ${fmt(q(baseDelays, 1))} n=${baseDelays.length}; runner-min/week ~${fmt(obsFull * RUNNER_MIN_PER_FULL / 4)} (full runs only)`);

// 3. Candidate policies: discrete-event simulation.
function simulate({ name, idleWait = 0, cron = null, onlyRelevant = true, maxBatch = Infinity, duration = (t) => wallP50[wk(t)] || 20 }) {
  const items = (onlyRelevant ? relevant : landings).map(l => ({ ...l, tm: new Date(l.t).getTime() }));
  let i = 0; const runsOut = []; let busyUntil = -Infinity; let pending = [];
  let tNow = items[0].tm;
  const end = new Date(UNTIL).getTime();
  const schedule = [];
  // event loop over time: landing arrivals and run completions
  while (i < items.length || pending.length) {
    // next arrival
    const nextArrival = i < items.length ? items[i].tm : Infinity;
    // decide when the next run can start
    let startAt = Infinity;
    if (pending.length && busyUntil <= Math.max(tNow, pending[0].tm)) {
      if (cron) { const base = Math.max(pending[0].tm, busyUntil); const slot = Math.ceil(base / (cron * 60000)) * cron * 60000; startAt = slot; }
      else startAt = Math.max(pending[0].tm + idleWait * 60000, busyUntil);
      if (pending.length >= maxBatch) startAt = Math.min(startAt, Math.max(pending.at(-1).tm, busyUntil));
    }
    if (nextArrival <= startAt) { pending.push(items[i]); tNow = items[i].tm; i++; continue; }
    // start a run at startAt covering everything pending (pinned tip = last pending landing)
    const batch = pending; pending = [];
    const d = duration(new Date(startAt).toISOString());
    const done = startAt + d * 60000;
    busyUntil = done;
    runsOut.push({ start: startAt, done, batch });
    tNow = startAt;
    // landings arriving during the run accumulate in pending (handled by loop)
  }
  const delays = []; const batches = [];
  for (const r of runsOut) { batches.push(r.batch.length); for (const l of r.batch) delays.push((r.done - l.tm) / 60000); }
  const weeks = 4;
  console.log(`${name.padEnd(46)} runs ${String(runsOut.length).padStart(4)} (${fmt(runsOut.length / weeks)}/wk, -${(100 * (1 - runsOut.length / obsFull)).toFixed(0)}% vs ${obsFull}) runner-min/wk ~${fmt(runsOut.length * RUNNER_MIN_PER_FULL / weeks).padStart(6)}  detection p50/p90/max ${fmt(q(delays, .5))}/${fmt(q(delays, .9))}/${fmt(q(delays, 1))}  batch size p50/p90/max ${q(batches, .5)}/${q(batches, .9)}/${q(batches, 1)}  share >60 min ${(100 * delays.filter(x => x > 60).length / delays.length).toFixed(1)}%`);
  return { runsOut, delays, batches };
}
console.log('\nCANDIDATES (full run only for landings whose plan is not none; a run pins main\'s tip at start; never cancelled; next run starts when the previous finishes if new relevant landings arrived):');
simulate({ name: 'A every relevant landing, serialised (no overlap)', idleWait: 0 });
simulate({ name: 'B back-to-back batches, no idle wait', idleWait: 0 });
simulate({ name: 'C batches, wait up to 10 min for more landings', idleWait: 10 });
simulate({ name: 'D batches, wait up to 20 min', idleWait: 20 });
simulate({ name: 'E hourly slots (:00) when anything relevant landed', cron: 60 });
simulate({ name: 'F every 30 min slots', cron: 30 });
simulate({ name: 'G batches at p90 duration (slow weeks)', idleWait: 0, duration: (t) => wallP90[wk(t)] || 30 });
simulate({ name: 'H batches incl. docs-only landings (no skip)', idleWait: 0, onlyRelevant: false });
console.log('\nNote: A is the same as B here because both serialise; the observed baseline overlaps runs and cancels superseded ones.');
