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
// against the depth the platform serves. It reads the client's own fetch calls rather than a
// list somebody keeps in step - a URL written down twice is how one copy quietly stops being
// served.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every `/api/...` literal the browser fetches, with the file it came from. */
const CLIENT_SOURCES = [
  'src/ai/pro/session.ts',
  'src/ai/liteClient.ts',
  'src/ai/modelGateway.ts',
  'src/ai/modelCatalog.ts',
  'src/ai/importAnalysis/client.ts',
];

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
const problems = [];

for (const file of CLIENT_SOURCES) {
  let source;
  try {
    source = readFileSync(path.join(repoRoot, file), 'utf8');
  } catch {
    continue;   // an optional client; absence is not a failure
  }
  for (const match of source.matchAll(/['"`](\/api\/[A-Za-z0-9/_-]+)['"`]/g)) {
    const url = match[1];
    const withoutApi = url.replace(/^\/api\//, '');
    // The most specific catch-all directory that could serve this path.
    const owner = prefixes.find((prefix) => prefix === '' || withoutApi.startsWith(`${prefix}/`));
    if (owner === undefined) continue;                 // served by a concrete file, not a catch-all
    const rest = owner === '' ? withoutApi : withoutApi.slice(owner.length + 1);
    if (rest.includes('/')) {
      problems.push(
        `${file}: ${url} is ${rest.split('/').length} segments past api/${owner ? `${owner}/` : ''}[...path] `
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

console.log(`API route depth OK (${prefixes.length} catch-all function(s), no path too deep).`);
