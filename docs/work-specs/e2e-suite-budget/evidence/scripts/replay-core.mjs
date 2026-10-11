// Which changed files cause focus escalations, and what the 11-shard landings look like.
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = process.env.NOACG_CI_CACHE || join(tmpdir(), 'noacg-ci-cache');
const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, windowsHide: true }).trim();
const planner = await import(pathToFileURL(join(ROOT, 'scripts/e2e-affected.mjs')).href);
const traced = await import(pathToFileURL(join(ROOT, 'scripts/e2e-traced.mjs')).href);
const map = traced.readTracedMap();
const replay = JSON.parse(readFileSync(join(here, 'replay-selection.json'), 'utf8'));
const escalators = {}; const escalatorKinds = {};
let focusLandings = 0;
for (const l of replay.landings.filter(l => l.focus)) {
  focusLandings++;
  const sha = git('rev-parse', l.sha);
  const changed = git('diff', '--name-only', `${sha}^1`, sha).split('\n').filter(Boolean);
  for (const f of changed) {
    const p = planner.planFor([f], { sprintFocus: true, traced: map });
    if (p.focusApplied) { escalators[f] = (escalators[f] || 0) + 1; escalatorKinds[f] = p.unmapped.length ? 'unmapped' : (p.traced && p.traced.escalated && p.traced.escalated.length ? 'traced-problem' : 'core'); }
  }
}
console.log(`focus landings: ${focusLandings}; distinct escalating files: ${Object.keys(escalators).length}`);
const byDir = {};
for (const [f, n] of Object.entries(escalators)) { const d = f.split('/').slice(0, 2).join('/'); byDir[d] = byDir[d] || { n: 0, files: 0 }; byDir[d].n += n; byDir[d].files++; }
console.log('escalations by top-2 dirs:', Object.entries(byDir).sort((a, b) => b[1].n - a[1].n).map(([d, v]) => `${d}:${v.n}(${v.files} files)`).join(' '));
console.log('top 30 escalating files (landings in which the file alone would escalate):');
for (const [f, n] of Object.entries(escalators).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(String(n).padStart(3), escalatorKinds[f].padEnd(14), f);
// How many landings escalate ONLY because of one file class
console.log('\n== 11-shard landings by mode and planned minutes');
const eleven = replay.landings.filter(l => l.shards === 11);
const buckets = {};
for (const l of eleven) { const k = (l.focus ? 'focus' : l.mode) + ' ' + (l.minutes < 40 ? '<40' : l.minutes < 69 ? '40-68' : l.minutes < 100 ? '69-99' : '>=100'); buckets[k] = (buckets[k] || 0) + 1; }
console.log(JSON.stringify(buckets));
console.log('subset (non-focus) landings: planned minutes list:', replay.landings.filter(l => !l.focus && l.mode === 'subset').map(l => l.minutes).sort((a, b) => a - b).join(' '));
