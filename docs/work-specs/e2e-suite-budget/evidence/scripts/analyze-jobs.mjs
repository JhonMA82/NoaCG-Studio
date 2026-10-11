// Read-only analysis over runs.json + jobs/*.json. Prints the figures section A/D of the brief asks for.
import { tmpdir } from 'node:os';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const here = process.env.NOACG_CI_CACHE || join(tmpdir(), 'noacg-ci-cache');
const runs = JSON.parse(readFileSync(join(here, 'runs.json'), 'utf8'));
const runById = new Map(runs.map(r => [r.id, r]));
const jobsDir = join(here, 'jobs');
if (!existsSync(jobsDir)) { console.error(`no job cache at ${jobsDir} - run fetch-runs.mjs and fetch-jobs.mjs first (NOACG_CI_CACHE selects the directory)`); process.exit(2); }
const have = new Set(readdirSync(jobsDir));
const min = (a, b) => (new Date(b) - new Date(a)) / 60000;
const q = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const fmt = n => Number.isFinite(n) ? n.toFixed(1) : '-';
const wk = d => { const t = new Date(d); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day); return t.toISOString().slice(0, 10); };
const WINDOW_START = process.argv[2] || '2026-09-15';
const WINDOW_END = process.argv[3] || '2026-10-12';
const inWindow = r => r.created_at >= WINDOW_START && r.created_at < WINDOW_END;

// Load every job interval (all attempts) for all runs in the window.
const allJobs = []; // {run, wf, event, branch, week, name, started, completed, conclusion, attempt, minutes, steps}
let missing = 0;
for (const r of runs.filter(inWindow)) {
  const files = [`${r.id}.json`];
  for (let a = 1; a < (r.run_attempt || 1); a++) files.push(`${r.id}-a${a}.json`);
  for (const f of files) {
    if (!have.has(f)) { if (r.conclusion !== 'skipped') missing++; continue; }
    for (const j of JSON.parse(readFileSync(join(jobsDir, f), 'utf8'))) {
      if (!j.started_at || !j.completed_at || j.conclusion === 'skipped') continue;
      allJobs.push({ run: r, wf: r.path.replace('.github/workflows/', ''), event: r.event, branch: r.head_branch, week: wk(r.created_at), name: j.name, created: j.created_at, started: j.started_at, completed: j.completed_at, conclusion: j.conclusion, attempt: j.run_attempt, minutes: min(j.started_at, j.completed_at), steps: j.steps || [], file: f });
    }
  }
}
console.log(`window ${WINDOW_START}..${WINDOW_END}: runs ${runs.filter(inWindow).length}, jobs loaded ${allJobs.length}, runs without job file ${missing}`);

// ---------- 1. Runner minutes per workflow per week (all attempts, all conclusions)
console.log('\n== RUNNER MINUTES per week x workflow (sum of job wall clock, every attempt)');
const rm = {};
for (const j of allJobs) { const k = j.week; rm[k] = rm[k] || {}; rm[k][j.wf] = (rm[k][j.wf] || 0) + j.minutes; }
const wfs = [...new Set(allJobs.map(j => j.wf))].sort((a, b) => allJobs.filter(j => j.wf === b).reduce((s, j) => s + j.minutes, 0) - allJobs.filter(j => j.wf === a).reduce((s, j) => s + j.minutes, 0));
console.log('week'.padEnd(12) + wfs.map(w => w.replace('.yml', '').slice(0, 14).padStart(15)).join('') + 'TOTAL'.padStart(9));
for (const w of Object.keys(rm).sort()) { const tot = Object.values(rm[w]).reduce((a, b) => a + b, 0); console.log(w.padEnd(12) + wfs.map(x => fmt(rm[w][x] || 0).padStart(15)).join('') + fmt(tot).padStart(9)); }

// ci.yml by event x week, plus per-run cost
console.log('\n== ci.yml runner minutes by week x event, and per-run median');
const ce = {};
for (const j of allJobs.filter(j => j.wf === 'ci.yml')) { const k = j.week + ' ' + (j.event === 'push' ? (j.branch === 'main' ? 'push-main' : 'push-branch') : j.event); ce[k] = ce[k] || { min: 0, runs: new Set() }; ce[k].min += j.minutes; ce[k].runs.add(j.run.id); }
for (const k of Object.keys(ce).sort()) console.log(k.padEnd(32), 'minutes', fmt(ce[k].min).padStart(8), 'runs', String(ce[k].runs.size).padStart(4), 'min/run', fmt(ce[k].min / ce[k].runs.size));

// ---------- 2. Main full runs: shard wall, slowest shard, queue wait, setup, cap hits, superseded
console.log('\n== MAIN FULL RUNS (ci.yml push main): per-week shard statistics');
const mainRuns = runs.filter(r => inWindow(r) && r.path.endsWith('/ci.yml') && r.event === 'push' && r.head_branch === 'main');
const perRun = [];
for (const r of mainRuns) {
  const js = allJobs.filter(j => j.run.id === r.id && j.attempt === (r.run_attempt || 1));
  const shards = js.filter(j => /^E2E \d+\/\d+/.test(j.name));
  const plan = js.find(j => j.name === 'E2E plan');
  const gate = js.find(j => j.name === 'CI gate');
  const retry = js.find(j => /^E2E retry/.test(j.name));
  const catalog = js.find(j => /^Catalog calibration/.test(j.name));
  const shardTotal = shards.length ? Number(shards[0].name.match(/\/(\d+)/)[1]) : 0;
  const capHits = shards.filter(s => s.conclusion === 'cancelled' && s.minutes >= 19.5).length;
  const superseded = r.conclusion === 'cancelled' && shards.length === 0 && js.length > 0;
  const setup = shards.map(s => { const st = s.steps.find(x => x.name === 'E2E shard'); return st && st.started_at ? min(s.started, st.started_at) : NaN; }).filter(Number.isFinite);
  const e2eStep = shards.map(s => { const st = s.steps.find(x => x.name === 'E2E shard'); return st && st.started_at && st.completed_at ? min(st.started_at, st.completed_at) : NaN; }).filter(Number.isFinite);
  const waits = shards.map(s => min(s.created, s.started));
  perRun.push({ r, week: wk(r.created_at), n: shards.length, shardTotal, slowest: shards.length ? Math.max(...shards.map(s => s.minutes)) : NaN, mean: shards.length ? shards.reduce((a, s) => a + s.minutes, 0) / shards.length : NaN, capHits, superseded, jobs: js.length, runnerMin: js.reduce((a, j) => a + j.minutes, 0), wallToGate: gate ? min(r.created_at, gate.completed) : NaN, firstJobDelay: js.length ? Math.min(...js.map(j => min(r.created_at, j.started))) : NaN, maxWait: waits.length ? Math.max(...waits) : NaN, p50Wait: q(waits, .5), setupP50: q(setup, .5), setupP90: q(setup, .9), e2eP50: q(e2eStep, .5), retry: retry ? { conclusion: retry.conclusion, minutes: retry.minutes } : null, catalog: catalog ? { conclusion: catalog.conclusion, minutes: catalog.minutes } : null, conclusion: r.conclusion, gate: gate?.conclusion, shardConcl: shards.map(s => s.conclusion) });
}
const byWeek = {};
for (const p of perRun) (byWeek[p.week] = byWeek[p.week] || []).push(p);
for (const w of Object.keys(byWeek).sort()) {
  const a = byWeek[w];
  const full = a.filter(p => p.n > 0);
  const green = full.filter(p => p.gate === 'success');
  const sup = a.filter(p => p.superseded).length;
  const slow = full.map(p => p.slowest), mean = full.map(p => p.mean);
  const capRuns = full.filter(p => p.capHits > 0).length, capShards = full.reduce((s, p) => s + p.capHits, 0);
  const shardTotals = [...new Set(full.map(p => p.shardTotal))].join('/');
  console.log(`${w}: main runs ${a.length}, with shards ${full.length} (shard counts ${shardTotals}), superseded-cancelled ${sup}, gate green ${green.length}, cap-hit runs ${capRuns} (${capShards} shards)`);
  console.log(`   slowest shard p50/p90/max ${fmt(q(slow, .5))}/${fmt(q(slow, .9))}/${fmt(q(slow, 1))}  mean-shard p50 ${fmt(q(mean, .5))}  setup p50/p90 ${fmt(q(full.map(p => p.setupP50), .5))}/${fmt(q(full.map(p => p.setupP90), .9))}  e2e-step p50 ${fmt(q(full.map(p => p.e2eP50), .5))}`);
  console.log(`   run-created->gate-done p50/p90/max ${fmt(q(full.map(p => p.wallToGate).filter(Number.isFinite), .5))}/${fmt(q(full.map(p => p.wallToGate).filter(Number.isFinite), .9))}/${fmt(q(full.map(p => p.wallToGate).filter(Number.isFinite), 1))}  first-job-start delay p50/p90 ${fmt(q(full.map(p => p.firstJobDelay), .5))}/${fmt(q(full.map(p => p.firstJobDelay), .9))}  shard queue wait max p50/p90/max ${fmt(q(full.map(p => p.maxWait), .5))}/${fmt(q(full.map(p => p.maxWait), .9))}/${fmt(q(full.map(p => p.maxWait), 1))}`);
  const withRetry = full.filter(p => p.retry); const cat = full.filter(p => p.catalog);
  console.log(`   runner-min/full-run p50 ${fmt(q(full.map(p => p.runnerMin), .5))}  retry jobs ${withRetry.length} (${withRetry.filter(p => p.retry.conclusion === 'success').length} ok, p50 ${fmt(q(withRetry.map(p => p.retry.minutes), .5))} min)  catalog jobs ${cat.length} p50 ${fmt(q(cat.map(p => p.catalog.minutes), .5))} min  superseded runner-min total ${fmt(a.filter(p => p.superseded).reduce((s, p) => s + p.runnerMin, 0))}`);
}
// Tail: list every cap hit with run id, date, shard, minutes
console.log('\n== Shards killed at the cap (cancelled, >=19.5 min), main runs');
for (const p of perRun.filter(p => p.capHits)) console.log(p.r.created_at.slice(0, 16), p.r.id, `shards ${p.shardTotal}`, p.shardConcl.map((c, i) => c === 'cancelled' ? `#${i + 1}` : '').filter(Boolean).join(','), 'gate', p.gate, 'run', p.conclusion);
// Distribution of slowest shard over the newest 30 full green runs with 11 shards
const newest = perRun.filter(p => p.n > 0 && p.gate === 'success').slice(-40);
console.log(`\n== Newest ${newest.length} green full main runs: slowest shard p50 ${fmt(q(newest.map(p => p.slowest), .5))} p90 ${fmt(q(newest.map(p => p.slowest), .9))} max ${fmt(q(newest.map(p => p.slowest), 1))}; shard counts ${[...new Set(newest.map(p => p.shardTotal))].join('/')}`);
const n11 = perRun.filter(p => p.shardTotal === 11 && p.n > 0);
if (n11.length) { console.log(`   11-shard runs: ${n11.length}, slowest shard each: ${n11.map(p => fmt(p.slowest)).join(' ')} ; gate: ${n11.map(p => p.gate).join(' ')}`); }
const n10 = perRun.filter(p => p.shardTotal === 10 && p.n > 0);
console.log(`   10-shard runs: ${n10.length}, slowest shard p50/p90/max ${fmt(q(n10.map(p => p.slowest), .5))}/${fmt(q(n10.map(p => p.slowest), .9))}/${fmt(q(n10.map(p => p.slowest), 1))}, cap hits ${n10.reduce((s, p) => s + p.capHits, 0)}`);

// Per-shard-index mean for the newest 20 ten-shard green runs (imbalance view)
const last10 = n10.filter(p => p.gate === 'success').slice(-20);
if (last10.length) {
  const idx = {};
  for (const p of last10) for (const j of allJobs.filter(j => j.run.id === p.r.id && /^E2E \d+\/\d+/.test(j.name))) { const i = Number(j.name.match(/E2E (\d+)/)[1]); (idx[i] = idx[i] || []).push(j.minutes); }
  console.log('   per-index mean over newest 20 green 10-shard runs:', Object.keys(idx).sort((a, b) => a - b).map(i => fmt(idx[i].reduce((a, b) => a + b, 0) / idx[i].length)).join(' '), ' spread max/min of means', fmt(Math.max(...Object.values(idx).map(a => a.reduce((x, y) => x + y, 0) / a.length)) / Math.min(...Object.values(idx).map(a => a.reduce((x, y) => x + y, 0) / a.length))));
}

// ---------- 3. PR and merge-group runs: shards, modes, runner minutes
for (const ev of ['pull_request', 'merge_group']) {
  console.log(`\n== ci.yml ${ev} runs by week`);
  const rs = runs.filter(r => inWindow(r) && r.path.endsWith('/ci.yml') && r.event === ev);
  const bw = {};
  for (const r of rs) {
    const js = allJobs.filter(j => j.run.id === r.id && j.attempt === (r.run_attempt || 1));
    const shards = js.filter(j => /^E2E \d+\/\d+/.test(j.name));
    const mode = shards.length ? (shards[0].name.match(/\((\w+)\)/) || [])[1] : 'none';
    const gate = js.find(j => j.name === 'CI gate');
    (bw[wk(r.created_at)] = bw[wk(r.created_at)] || []).push({ shards: shards.length, mode, runnerMin: js.reduce((a, j) => a + j.minutes, 0), slowest: shards.length ? Math.max(...shards.map(s => s.minutes)) : 0, wall: gate ? min(r.created_at, gate.completed) : NaN, maxWait: shards.length ? Math.max(...shards.map(s => min(s.created, s.started))) : NaN, capHits: shards.filter(s => s.conclusion === 'cancelled' && s.minutes >= 19.5).length, retry: js.find(j => /^E2E retry/.test(j.name)), conclusion: r.conclusion, jobs: js.length });
  }
  for (const w of Object.keys(bw).sort()) {
    const a = bw[w]; const modes = {}; for (const x of a) modes[x.mode] = (modes[x.mode] || 0) + 1;
    console.log(`${w}: runs ${a.length} modes ${JSON.stringify(modes)} shards/run p50/p90 ${q(a.map(x => x.shards), .5)}/${q(a.map(x => x.shards), .9)} runner-min/run p50/p90 ${fmt(q(a.map(x => x.runnerMin), .5))}/${fmt(q(a.map(x => x.runnerMin), .9))} slowest-shard p50/p90/max ${fmt(q(a.filter(x => x.shards).map(x => x.slowest), .5))}/${fmt(q(a.filter(x => x.shards).map(x => x.slowest), .9))}/${fmt(q(a.filter(x => x.shards).map(x => x.slowest), 1))} created->gate p50/p90 ${fmt(q(a.map(x => x.wall).filter(Number.isFinite), .5))}/${fmt(q(a.map(x => x.wall).filter(Number.isFinite), .9))} max shard wait p50/p90/max ${fmt(q(a.map(x => x.maxWait).filter(Number.isFinite), .5))}/${fmt(q(a.map(x => x.maxWait).filter(Number.isFinite), .9))}/${fmt(q(a.map(x => x.maxWait).filter(Number.isFinite), 1))} cap-hit shards ${a.reduce((s, x) => s + x.capHits, 0)} retries ${a.filter(x => x.retry).length}`);
  }
}

// ---------- 4. Concurrency: sweep all job intervals across all workflows
console.log('\n== CONCURRENCY (all workflows, all jobs): per-day peak and minutes at >=18 / >=20 concurrent');
const events = [];
for (const j of allJobs) { events.push([new Date(j.started).getTime(), 1]); events.push([new Date(j.completed).getTime(), -1]); }
events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
let cur = 0, prevT = null; const perDay = {}; const hist = {};
for (const [t, d] of events) {
  if (prevT !== null && cur > 0) { const day = new Date(prevT).toISOString().slice(0, 10); perDay[day] = perDay[day] || { peak: 0, at18: 0, at20: 0, busy: 0 }; const dm = (t - prevT) / 60000; perDay[day].busy += dm; if (cur >= 18) perDay[day].at18 += dm; if (cur >= 20) perDay[day].at20 += dm; hist[cur] = (hist[cur] || 0) + dm; }
  cur += d; prevT = t;
  const day = new Date(t).toISOString().slice(0, 10); perDay[day] = perDay[day] || { peak: 0, at18: 0, at20: 0, busy: 0 }; if (cur > perDay[day].peak) perDay[day].peak = cur;
}
for (const d of Object.keys(perDay).sort()) console.log(d, 'peak', String(perDay[d].peak).padStart(3), 'min at>=18', fmt(perDay[d].at18).padStart(7), 'min at>=20', fmt(perDay[d].at20).padStart(7), 'busy-min', fmt(perDay[d].busy).padStart(8));
const totalBusy = Object.values(hist).reduce((a, b) => a + b, 0);
console.log('minutes by concurrency level (share of busy time):', Object.keys(hist).sort((a, b) => a - b).map(k => `${k}:${(100 * hist[k] / totalBusy).toFixed(1)}%`).join(' '));
console.log('absolute minutes at each level >= 16:', Object.keys(hist).filter(k => Number(k) >= 16).sort((a, b) => a - b).map(k => `${k}:${hist[k].toFixed(0)}`).join(' '));
// Ceiling inference: for ci.yml E2E shard jobs that waited > 1 min, what was the running concurrency when they were created?
const starts = allJobs.map(j => [new Date(j.started).getTime(), new Date(j.completed).getTime()]).sort((a, b) => a[0] - b[0]);
function concurrencyAt(t) { let n = 0; for (const [s, e] of starts) { if (s > t) break; if (e > t) n++; } return n; }
const waited = allJobs.filter(j => j.wf === 'ci.yml' && /^E2E \d+\/\d+/.test(j.name) && min(j.created, j.started) > 1);
const sample = waited.filter((_, i) => i % Math.max(1, Math.floor(waited.length / 400)) === 0);
const conc = sample.map(j => concurrencyAt(new Date(j.created).getTime() + 30000));
console.log(`shard jobs waiting >1 min: ${waited.length}; concurrency 30 s after creation (sample ${sample.length}): p10 ${q(conc, .1)} p50 ${q(conc, .5)} p90 ${q(conc, .9)}; share with concurrency < 18: ${(100 * conc.filter(c => c < 18).length / conc.length).toFixed(0)}%`);
const noWait = allJobs.filter(j => j.wf === 'ci.yml' && /^E2E \d+\/\d+/.test(j.name) && min(j.created, j.started) <= 0.5);
const sample2 = noWait.filter((_, i) => i % Math.max(1, Math.floor(noWait.length / 400)) === 0);
const conc2 = sample2.map(j => concurrencyAt(new Date(j.created).getTime() + 30000));
console.log(`shard jobs starting within 30 s: ${noWait.length}; concurrency 30 s after creation (sample ${sample2.length}): p50 ${q(conc2, .5)} p90 ${q(conc2, .9)} max ${q(conc2, 1)}`);

// ---------- 5. Shard queue wait vs concurrency: E2E shard jobs waiting > 2 min, by week
console.log('\n== E2E shard job queue wait (started - created), all ci.yml events, by week: p50/p90/p99/max and share >2 min');
const sw = {};
for (const j of allJobs.filter(j => j.wf === 'ci.yml' && /^E2E \d+\/\d+/.test(j.name))) (sw[j.week] = sw[j.week] || []).push(min(j.created, j.started));
for (const w of Object.keys(sw).sort()) { const a = sw[w]; console.log(w, 'n', a.length, 'p50', fmt(q(a, .5)), 'p90', fmt(q(a, .9)), 'p99', fmt(q(a, .99)), 'max', fmt(q(a, 1)), 'share>2min', (100 * a.filter(x => x > 2).length / a.length).toFixed(1) + '%', 'share>10min', (100 * a.filter(x => x > 10).length / a.length).toFixed(1) + '%'); }

// ---------- 6. Other workflows: per-run job minutes
console.log('\n== Other workflows: jobs per run and minutes per run (p50/p90), newest two weeks');
for (const wf of ['configured-suite.yml', 'quarantine.yml', 'post-land.yml', 'nightly.yml', 'catalog-gates.yml', 'deploy-verify.yml', 'hosted-latency.yml', 'fit-sweep.yml', 'e2e-durations-refresh.yml', 'weekly-audit.yml']) {
  const rs = runs.filter(r => inWindow(r) && r.created_at >= '2026-09-28' && r.path.endsWith('/' + wf));
  const per = rs.map(r => { const js = allJobs.filter(j => j.run.id === r.id); return { jobs: js.length, minutes: js.reduce((a, j) => a + j.minutes, 0), slowest: js.length ? Math.max(...js.map(j => j.minutes)) : 0, concl: r.conclusion }; }).filter(x => x.jobs > 0);
  if (!per.length) { console.log(wf, 'no job data'); continue; }
  console.log(wf.padEnd(26), 'runs', String(per.length).padStart(4), 'jobs/run p50', q(per.map(x => x.jobs), .5), 'runner-min/run p50/p90', fmt(q(per.map(x => x.minutes), .5)), fmt(q(per.map(x => x.minutes), .9)), 'slowest job p50/p90/max', fmt(q(per.map(x => x.slowest), .5)), fmt(q(per.map(x => x.slowest), .9)), fmt(q(per.map(x => x.slowest), 1)), 'total', fmt(per.reduce((a, x) => a + x.minutes, 0)));
}
// nightly detail
console.log('\n== Nightly runs: shards, slowest shard, cancelled/failed shards');
for (const r of runs.filter(r => inWindow(r) && r.path.endsWith('/nightly.yml') && r.event === 'schedule')) {
  const js = allJobs.filter(j => j.run.id === r.id); const shards = js.filter(j => /^E2E \d+\/\d+/.test(j.name) || /shard/i.test(j.name));
  if (!js.length) continue;
  console.log(r.created_at.slice(0, 10), r.id, r.conclusion.padEnd(9), 'jobs', js.length, 'shards', shards.length, 'slowest', fmt(shards.length ? Math.max(...shards.map(s => s.minutes)) : NaN), 'shard conclusions', JSON.stringify(shards.reduce((o, s) => (o[s.conclusion] = (o[s.conclusion] || 0) + 1, o), {})), 'names', shards.slice(0, 1).map(s => s.name).join(''));
}
