// Read-only replay: how often does per-change selection (PR / merge-group style, sprint focus on,
// traced map on) actually run each spec, over the last N landings on main?
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = process.env.NOACG_CI_CACHE || join(tmpdir(), 'noacg-ci-cache');
const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const N = Number(process.argv[2] || 150);
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, windowsHide: true }).trim();
const planner = await import(pathToFileURL(join(ROOT, 'scripts/e2e-affected.mjs')).href);
const traced = await import(pathToFileURL(join(ROOT, 'scripts/e2e-traced.mjs')).href);
const map = traced.readTracedMap();
const table = JSON.parse(readFileSync(join(ROOT, 'scripts/e2e-durations.json'), 'utf8'));
const minutes = table.minutes;
const med = [...Object.values(minutes)].sort((a, b) => a - b)[Math.floor(Object.keys(minutes).length / 2)];
const landings = git('log', '--first-parent', '--merges', `-${N}`, '--format=%H %ad %s', '--date=short', 'origin/main').split('\n');
const sel = {}; const modes = {}; const planned = []; const shards = []; let catalogRuns = 0;
const results = [];
for (const line of landings) {
  const [sha, date, ...subj] = line.split(' ');
  const changed = git('diff', '--name-only', `${sha}^1`, sha).split('\n').filter(Boolean);
  const plan = planner.planFor(changed, { sprintFocus: true, traced: map });
  const specs = plan.mode === 'full' ? Object.keys(minutes) : plan.specs;
  modes[plan.mode + (plan.focusApplied ? '+focus' : '')] = (modes[plan.mode + (plan.focusApplied ? '+focus' : '')] || 0) + 1;
  const mins = specs.reduce((a, s) => a + (minutes[s] ?? med), 0);
  planned.push(mins);
  const sh = planner.shardsFor({ mode: plan.mode, specs: plan.specs });
  shards.push(sh);
  if (plan.catalog) catalogRuns++;
  for (const s of specs) sel[s] = (sel[s] || 0) + 1;
  results.push({ sha: sha.slice(0, 9), date, subject: subj.join(' ').slice(0, 60), changed: changed.length, mode: plan.mode, focus: plan.focusApplied, specs: specs.length, minutes: +mins.toFixed(1), shards: sh, catalog: plan.catalog, unmapped: plan.unmapped.length });
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
console.log(`landings replayed: ${landings.length} (${landings.at(-1).split(' ')[1]} .. ${landings[0].split(' ')[1]}); modes ${JSON.stringify(modes)}; catalog flag ${catalogRuns}`);
console.log(`planned table-minutes per landing: p50 ${q(planned, .5).toFixed(1)} p75 ${q(planned, .75).toFixed(1)} p90 ${q(planned, .9).toFixed(1)} max ${q(planned, 1).toFixed(1)}; mean ${(planned.reduce((a, b) => a + b, 0) / planned.length).toFixed(1)}; total ${planned.reduce((a, b) => a + b, 0).toFixed(0)}`);
console.log(`shards per landing: ${JSON.stringify(shards.reduce((o, s) => (o[s] = (o[s] || 0) + 1, o), {}))}`);
const rows = Object.keys(minutes).map(s => ({ spec: s, min: minutes[s], runs: sel[s] || 0, share: (sel[s] || 0) / landings.length, cost: (minutes[s] || 0) * (sel[s] || 0) }));
rows.sort((a, b) => b.cost - a.cost);
console.log('\nTop 40 specs by replayed selection cost (minutes x landings selected) over these landings:');
console.log('spec'.padEnd(42), 'min'.padStart(6), 'selected'.padStart(9), 'share'.padStart(6), 'cost-min'.padStart(9));
for (const r of rows.slice(0, 40)) console.log(r.spec.padEnd(42), r.min.toFixed(2).padStart(6), String(r.runs).padStart(9), (100 * r.share).toFixed(0).padStart(5) + '%', r.cost.toFixed(0).padStart(9));
const never = rows.filter(r => r.runs === 0);
console.log(`\nspecs never selected in ${landings.length} landings: ${never.length} (${never.reduce((a, r) => a + r.min, 0).toFixed(1)} min): ${never.map(r => r.spec).join(' ')}`);
const focus = planner.FOCUS || [];
writeFileSync(join(here, 'replay-selection.json'), JSON.stringify({ landings: results, perSpec: rows }, null, 1));
console.log('\nwrote replay-selection.json');
