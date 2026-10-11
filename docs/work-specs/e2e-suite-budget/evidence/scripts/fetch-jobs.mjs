// Read-only: fetch job records (with step timings) for runs listed in runs.json, filtered by workflow.
// Usage: node fetch-jobs.mjs ci.yml nightly.yml ...   (writes jobs/<runId>.json and jobs/<runId>-a<n>.json for earlier attempts)
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const here = process.env.NOACG_CI_CACHE || join(tmpdir(), 'noacg-ci-cache');
const dir = join(here, 'jobs');
mkdirSync(dir, { recursive: true });
const REPO = 'NoaCG/NoaCG-Studio';
const want = new Set(process.argv.slice(2));
const runs = JSON.parse(readFileSync(join(here, 'runs.json'), 'utf8'))
  .filter(r => want.has(r.path.replace('.github/workflows/', '')) && r.conclusion !== 'skipped');
const exec = promisify(execFile);
async function ghJson(path) {
  let last;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const { stdout } = await exec('gh', ['api', '--paginate', '--slurp', path], { encoding: 'utf8', maxBuffer: 1 << 28 });
      return JSON.parse(stdout);
    } catch (e) {
      last = e; const msg = String(e.stderr || e.message);
      if (/rate limit/i.test(msg)) { console.error('RATE LIMIT', msg.replace(/\s+/g, ' ').slice(0, 200)); await new Promise(r => setTimeout(r, 90000)); }
      else await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
  throw last;
}
const slimJob = j => ({
  id: j.id, name: j.name, status: j.status, conclusion: j.conclusion, created_at: j.created_at, started_at: j.started_at,
  completed_at: j.completed_at, run_attempt: j.run_attempt, runner_name: j.runner_name, labels: j.labels,
  steps: (j.steps || []).map(s => ({ name: s.name, conclusion: s.conclusion, started_at: s.started_at, completed_at: s.completed_at })),
});
const tasks = [];
for (const r of runs) {
  const f = join(dir, `${r.id}.json`);
  if (!existsSync(f)) tasks.push({ path: `repos/${REPO}/actions/runs/${r.id}/jobs?per_page=100`, file: f });
  for (let a = 1; a < (r.run_attempt || 1); a++) {
    const fa = join(dir, `${r.id}-a${a}.json`);
    if (!existsSync(fa)) tasks.push({ path: `repos/${REPO}/actions/runs/${r.id}/attempts/${a}/jobs?per_page=100`, file: fa });
  }
}
console.log('runs', runs.length, 'tasks', tasks.length);
let done = 0, failed = 0;
async function worker() {
  while (tasks.length) {
    const t = tasks.shift();
    try {
      const pages = await ghJson(t.path);
      const jobs = pages.flatMap(p => p.jobs || []).map(slimJob);
      writeFileSync(t.file, JSON.stringify(jobs));
    } catch (e) { failed++; console.error('FAILED', t.path, String(e.stderr || e.message).slice(0, 100)); }
    done++; if (done % 100 === 0) console.log('done', done, 'failed', failed);
  }
}
const WORKERS = Number(process.env.FETCH_WORKERS || 8);
await Promise.all(Array.from({ length: WORKERS }, worker));
console.log('finished', done, 'failed', failed);
