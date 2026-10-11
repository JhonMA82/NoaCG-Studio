// Read-only: merged PRs since 2026-09-15 with merge-queue timeline events -> prs.json
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const here = process.env.NOACG_CI_CACHE || join(tmpdir(), 'noacg-ci-cache');
mkdirSync(here, { recursive: true });
const out = join(here, 'prs.json');
const REPO = 'NoaCG/NoaCG-Studio';
const exec = promisify(execFile);
async function gh(args) {
  let last;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try { const { stdout } = await exec('gh', args, { encoding: 'utf8', maxBuffer: 1 << 28 }); return stdout; }
    catch (e) { last = e; await new Promise(r => setTimeout(r, 1500 * attempt)); }
  }
  throw last;
}
const list = JSON.parse(await gh(['pr', 'list', '-R', REPO, '--state', 'merged', '--search', 'merged:>=2026-09-15', '--limit', '1000',
  '--json', 'number,title,createdAt,mergedAt,headRefName,mergeCommit,author,additions,deletions,changedFiles']));
console.log('merged PRs', list.length);
const prev = existsSync(out) ? new Map(JSON.parse(readFileSync(out, 'utf8')).map(p => [p.number, p])) : new Map();
const queue = list.filter(p => !prev.has(p.number));
let done = 0;
async function worker() {
  while (queue.length) {
    const p = queue.shift();
    try {
      const txt = await gh(['api', '--paginate', '--slurp', `repos/${REPO}/issues/${p.number}/timeline?per_page=100`]);
      const events = JSON.parse(txt).flat().filter(e => /merge_queue|merged|ready_for_review|convert_to_draft|auto_merge/.test(e.event || ''))
        .map(e => ({ event: e.event, created_at: e.created_at, actor: e.actor?.login }));
      prev.set(p.number, { ...p, events });
    } catch (e) { console.error('FAILED', p.number, String(e.stderr || e.message).slice(0, 100)); }
    done++; if (done % 50 === 0) { console.log('done', done); writeFileSync(out, JSON.stringify([...prev.values()])); }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
writeFileSync(out, JSON.stringify([...prev.values()]));
console.log('wrote', prev.size);
