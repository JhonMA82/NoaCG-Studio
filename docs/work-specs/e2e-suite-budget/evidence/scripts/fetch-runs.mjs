// Read-only: fetch every workflow run in the window into runs.json (sliced by day to avoid truncation).
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const here = process.env.NOACG_CI_CACHE || join(tmpdir(), 'noacg-ci-cache');
mkdirSync(here, { recursive: true });
const out = join(here, 'runs.json');
const REPO = 'NoaCG/NoaCG-Studio';
const start = new Date('2026-09-15T00:00:00Z');
const end = new Date('2026-10-12T00:00:00Z');

function ghJson(path) {
  let last;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const txt = execFileSync('gh', ['api', '--paginate', '--slurp', path], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
      return JSON.parse(txt);
    } catch (e) {
      last = e; console.error('retry', attempt, path, String(e.stderr || e.message).trim().slice(0, 120));
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000 * attempt);
    }
  }
  throw last;
}
const fields = ['id', 'name', 'path', 'workflow_id', 'event', 'head_branch', 'head_sha', 'status', 'conclusion', 'run_attempt', 'created_at', 'updated_at', 'run_started_at', 'display_title'];
const byId = new Map();
if (existsSync(out)) for (const r of JSON.parse(readFileSync(out, 'utf8'))) byId.set(r.id, r);
for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
  const day = d.toISOString().slice(0, 10);
  const pages = ghJson(`repos/${REPO}/actions/runs?created=${day}&per_page=100`);
  let n = 0;
  for (const page of pages) for (const r of page.workflow_runs) {
    const slim = {};
    for (const f of fields) slim[f] = r[f];
    slim.pr_numbers = (r.pull_requests || []).map(p => p.number);
    byId.set(r.id, slim); n++;
  }
  console.log(day, n, 'total_count', pages[0]?.total_count);
}
const all = [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
writeFileSync(out, JSON.stringify(all));
console.log('runs', all.length, '->', out);
