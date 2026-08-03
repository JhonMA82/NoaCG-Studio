// The PINNED-MODEL liveness check: every OpenRouter model id this codebase hard-codes, checked
// against the live listing.
//
// Why this exists: a retired model id is the one staleness in this stack that fails in
// PRODUCTION rather than in a build. Nothing in the repo references a version of it — the id IS
// the contract — so `npm outdated`, `npm audit`, typecheck and the e2e suite all stay green
// while a real user's generation returns a provider error. The video harness already syncs its
// own catalog (`npm run video:models:sync`); the SPX/Lite/Pro routes are pinned in source
// (PRO_STANDARD_ROUTES, the Lite profile, aiModelCatalog) and had nothing watching them.
//
// Usage:
//   node scripts/check-model-ids.mjs          # exit 1 if any pinned id is missing upstream
//   node scripts/check-model-ids.mjs --json   # machine-readable report on stdout
//
// The listing endpoint is public — this spends no tokens and needs no key. It reads only ids
// that appear as `model: '…'` or `id: '…'` in shipped source, never in tests or docs, so a
// candidate discussed in a comment is not mistaken for one we route to.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Where routes are declared. Tests are excluded: a fixture id is not a route we ship. */
const SEARCH_ROOTS = ['src/ai', 'api/_lib'];
const isSource = (path) => path.endsWith('.ts') && !path.endsWith('.test.ts');

/**
 * Only a literal in ROUTE POSITION counts. A bare `vendor/name` string matches file paths,
 * doc URLs and prose; requiring `model:` or `id:` in front is what keeps this from reporting
 * `meta-llama/llama-4-scout` out of the comment that explains why we do NOT use it.
 */
const ROUTE_LITERAL = /\b(?:model|id):\s*'([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[A-Za-z0-9._:-]+)'/g;

const walk = (dir) => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (isSource(path)) out.push(path);
  }
  return out;
};

/** id -> the repo-relative files that pin it. */
const pinned = new Map();
for (const dir of SEARCH_ROOTS) {
  for (const file of walk(resolve(root, dir))) {
    const text = readFileSync(file, 'utf8');
    for (const [, id] of text.matchAll(ROUTE_LITERAL)) {
      if (!pinned.has(id)) pinned.set(id, new Set());
      pinned.get(id).add(relative(root, file).replaceAll('\\', '/'));
    }
  }
}

const res = await fetch('https://openrouter.ai/api/v1/models');
if (!res.ok) {
  // A listing we cannot read is not evidence the routes are fine. Fail rather than pass quietly.
  console.error(`openrouter listing answered ${res.status}`);
  process.exitCode = 1;
  throw new Error('could not read the model listing');
}
const live = new Set((await res.json()).data.map((m) => m.id));

const rows = [...pinned.entries()]
  .map(([id, files]) => ({ id, files: [...files].sort(), live: live.has(id) }))
  .sort((a, b) => a.id.localeCompare(b.id));
const missing = rows.filter((row) => !row.live);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ checked: rows.length, missing, rows }, null, 2));
} else {
  for (const row of rows) console.log(`${row.live ? 'ok  ' : 'GONE'} ${row.id}`);
  console.log(`\n${rows.length} pinned ids checked against the live listing.`);
  if (missing.length) {
    console.log('\nNo longer listed upstream:');
    for (const row of missing) console.log(`  - ${row.id}  (${row.files.join(', ')})`);
  }
}

// `process.exitCode`, never `process.exit()`: forcing exit while the fetch's handle is still
// closing trips a libuv assertion on Windows (`!(handle->flags & UV_HANDLE_CLOSING)`) and the
// run reports 127 instead of the verdict it just computed.
process.exitCode = missing.length ? 1 : 0;
