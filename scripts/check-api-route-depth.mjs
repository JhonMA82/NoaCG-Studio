#!/usr/bin/env node
// Refuse an api/ path the deployment will not route.
//
// MEASURED ON PRODUCTION 2026-08-14, not inferred: a `[...path].ts` function under api/ routes
// exactly ONE segment. The probe, against the live site:
//
//   /api/ai/pro                          -> the app's own JSON 404   (routed)
//   /api/ai/pro/status                   -> platform NOT_FOUND       (never routed)
//   /api/ai/lite/nonexistent             -> Lite's own JSON 404      (routed)
//   /api/ai/lite/a/b                     -> platform NOT_FOUND       (never routed)
//   /api/ai/tasks/import-analysis        -> the app's 405            (routed)
//   /api/ai/tasks/import-analysis/status -> platform NOT_FOUND       (never routed)
//
// Vercel's docs describe `[...slug]` as a catch-all over multiple segments; this deployment
// does not behave that way, and the deployment is what serves users. Hosted Pro shipped three
// endpoints one segment too deep and every one of them 404'd in production while every test,
// every gate and the whole CI suite stayed green - because nothing here drives a real URL
// through Vercel's router.
//
// So this is a STATIC check of the one thing that was wrong: the paths the browser asks for,
// against the depth the platform serves. Both sides are DERIVED - every `/api/` path named
// anywhere under `src/`, against the catch-all directories found in the `api/` tree - so neither
// a new function nor a new client file needs this script edited to be covered. Nothing here is a
// list somebody keeps in step: a URL written down twice is how one copy quietly stops being
// served, and a source file left off a list is how `src/ai/importAnalysis/client.ts` kept two
// unroutable paths after the same defect had already been found and fixed in hosted Pro.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every browser file that could name an `/api/...` path - DERIVED, not listed.
 *
 *  A hand-kept list is the same defect one level up: `src/ai/importAnalysis/client.ts` carried
 *  two paths the deployment would not route and the guard could not see them, because nobody had
 *  added the file. The whole of `src/` is cheap to read and cannot go stale. */
function clientSources() {
  const files = [];
  const walk = (absolute, relative) => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const child = path.join(absolute, entry.name);
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child, rel);
      else if (/\.[tj]sx?$/.test(entry.name)) files.push(rel);
    }
  };
  walk(path.join(repoRoot, 'src'), 'src');
  return files;
}

/** The `/api/...` paths one source names, each already reduced to the SEGMENT COUNT the router
 *  sees. A template literal counts an interpolation as exactly one segment - which is the claim
 *  a path builder makes and the thing worth checking: `/api/admin/${path}` is legal, and
 *  `/api/admin/${a}/detail` is a platform 404 however `a` resolves. Anything unrecognisable
 *  inside the braces is still one segment, because a builder that splices a slash in is a path
 *  this check cannot answer and must not pretend to. */
function apiPaths(source) {
  const found = [];
  for (const match of source.matchAll(/(['"`])(\/api\/[^'"`\n]*)\1/g)) {
    const raw = match[2];
    if (match[1] !== '`' && raw.includes('$')) continue;          // not a path, whatever it is
    const normalized = raw.replace(/\$\{[^}]*\}/g, 'SEGMENT');
    if (normalized.includes('$')) continue;                       // a nested brace we cannot read
    found.push({ raw, normalized: normalized.replace(/\/+$/, '') });
  }
  return found;
}

/** A routed function whose own directory absorbs segments before the catch-all sees them.
 *  Derived from the api/ tree rather than listed: a new `[...path].ts` changes what is legal,
 *  and it must not need this file edited to be counted. */
function catchAllPrefixes() {
  const prefixes = [];
  const walk = (absolute, relative) => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (entry.name.startsWith('_')) continue;
      const child = path.join(absolute, entry.name);
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child, rel);
      else if (/^\[\.\.\..+\]\.[tj]sx?$/.test(entry.name)) prefixes.push(path.posix.dirname(rel));
    }
  };
  walk(path.join(repoRoot, 'api'), '');
  return prefixes.map((p) => (p === '.' ? '' : p)).sort((a, b) => b.length - a.length);
}


const prefixes = catchAllPrefixes();
const files = clientSources();
const problems = [];
let checked = 0;

for (const file of files) {
  const source = readFileSync(path.join(repoRoot, file), 'utf8');
  for (const { raw, normalized } of apiPaths(source)) {
    const withoutApi = normalized.replace(/^\/api\//, '');
    // The most specific catch-all directory that could serve this path.
    const owner = prefixes.find((prefix) => prefix === '' || withoutApi.startsWith(`${prefix}/`));
    if (owner === undefined) continue;                 // served by a concrete file, not a catch-all
    checked += 1;
    const rest = owner === '' ? withoutApi : withoutApi.slice(owner.length + 1);
    if (rest.includes('/')) {
      problems.push(
        `${file}: ${raw} is ${rest.split('/').length} segments past api/${owner ? `${owner}/` : ''}[...path] `
        + `- the deployment routes ONE, so this is a platform 404`,
      );
    }
  }
}

if (problems.length) {
  console.error('API paths the deployment will not route:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    '\nEither flatten the path into one segment (hosted Pro uses `pro-status`), or give the '
    + 'area its own [...path].ts function - which costs one against the Hobby cap of 12 '
    + '(npm run check:function-budget).',
  );
  process.exit(1);
}

console.log(
  `API route depth OK (${checked} catch-all path(s) across ${prefixes.length} function(s), `
  + `read from ${files.length} source file(s)).`,
);
