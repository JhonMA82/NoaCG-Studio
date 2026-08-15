// The routing model the dev server serves by and `check-api-route-depth` certifies against.
//
// It is asserted over the REAL api/ tree rather than a fixture on purpose: what these tests
// protect is the agreement between three things - the tree, the dev middleware and the gate -
// and a fixture tree would agree with itself while the real one drifted. The cost is that
// renaming a function breaks a test, which is the correct amount of friction for a rename that
// changes what the deployment serves.

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { apiFunctionTable, clientApiPaths, resolveApiRoute } from './apiRouteTable.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ai = apiFunctionTable(repoRoot, 'api/ai');

test('the api/ai tree yields every function the deployment ships', () => {
  assert.equal(ai.exact.get('generate'), '/api/ai/generate.ts');
  const catchAlls = ai.catchAlls.map((c) => c.module).sort();
  assert.deepEqual(catchAlls, [
    '/api/ai/[...path].ts',
    '/api/ai/lite/[...path].ts',
    '/api/ai/tasks/[...path].ts',
  ]);
  // Longest prefix FIRST, or `lite/status` would be claimed by the root catch-all. Only an
  // ancestor prefix can match at all, so among the ones that do, longer is more specific.
  const lengths = ai.catchAlls.map((c) => c.prefix.length);
  assert.deepEqual(lengths, [...lengths].sort((a, b) => b - a));
  assert.equal(ai.catchAlls.at(-1).prefix, '');
});

test('shared code under api/_lib is never a route', () => {
  for (const route of ai.exact.keys()) assert.ok(!route.startsWith('_'), route);
});

test('a concrete function wins over the catch-all that would otherwise claim it', () => {
  // api/ai/generate.ts is its own function because it carries maxDuration 300 and reads 12 MB
  // bodies; folding it into the light-routes function would hand every config call that
  // configuration.
  assert.equal(resolveApiRoute(ai, 'generate'), '/api/ai/generate.ts');
});

test('every route the real tables declare is reachable, INCLUDING the three that were not', () => {
  // consent had never been routed in a dev server; the three pro-* paths were a dev 404 in every
  // dev server and the whole e2e suite while production served them; the import-analysis task
  // shipped with no entries at all. All four were the SAME allowlist.
  for (const route of ['config', 'consent', 'credentials', 'models']) {
    assert.equal(resolveApiRoute(ai, route), '/api/ai/[...path].ts', route);
  }
  for (const route of ['pro-status', 'pro-generations', 'pro-outcome']) {
    assert.equal(resolveApiRoute(ai, route), '/api/ai/[...path].ts', route);
  }
  for (const route of ['status', 'generations', 'outcome', 'judge']) {
    assert.equal(resolveApiRoute(ai, `lite/${route}`), '/api/ai/lite/[...path].ts', route);
  }
  for (const route of ['import-analysis', 'import-analysis-status', 'import-analysis-outcome']) {
    assert.equal(resolveApiRoute(ai, `tasks/${route}`), '/api/ai/tasks/[...path].ts', route);
  }
});

test('an unknown NAME still reaches the dispatcher, which owns the 404', () => {
  // Production answers `/api/ai/lite/nonexistent` with Lite's own LiteError shape, and the
  // browser client expects that shape. A dev server refusing it itself would train the page on
  // a 404 body that does not exist in production.
  assert.equal(resolveApiRoute(ai, 'lite/nonexistent'), '/api/ai/lite/[...path].ts');
  assert.equal(resolveApiRoute(ai, 'nonexistent'), '/api/ai/[...path].ts');
});

test('a path too DEEP for its catch-all is refused, as the platform refuses it', () => {
  // Measured on production 2026-08-14 - a [...path].ts function routes exactly ONE segment.
  // Serving these in development is what let hosted Pro ship three endpoints that 404'd for
  // every real user while dev, the specs and CI were all green.
  assert.equal(resolveApiRoute(ai, 'pro/status'), null);
  assert.equal(resolveApiRoute(ai, 'lite/a/b'), null);
  assert.equal(resolveApiRoute(ai, 'tasks/import-analysis/status'), null);
});

test('an empty or slash-only path routes nowhere', () => {
  assert.equal(resolveApiRoute(ai, ''), null);
  assert.equal(resolveApiRoute(ai, '/'), null);
});

test('module paths are slash-separated, whatever the host platform separates with', () => {
  // Vite\'s ssrLoadModule takes a POSIX path; path.join would hand it backslashes on Windows,
  // where this repo is developed.
  for (const module of [...ai.exact.values(), ...ai.catchAlls.map((c) => c.module)]) {
    assert.ok(module.startsWith('/api/') && !module.includes('\\'), module);
  }
});

test('every /api path our own client names is served by some function', () => {
  // The same assertion `check-api-route-depth` makes, pinned here so the resolver cannot be
  // loosened without a test noticing - the gate would keep passing on a resolver that says yes
  // to everything.
  const all = apiFunctionTable(repoRoot, 'api');
  const { paths } = clientApiPaths(repoRoot);
  assert.ok(paths.length > 10, 'the client-path scanner found almost nothing - it is broken');
  for (const { file, raw, normalized } of paths) {
    const route = normalized.replace(/^\/api\//, '');
    if (!route) continue;
    assert.ok(resolveApiRoute(all, route), `${file}: ${raw} is served by no api/ function`);
  }
});
