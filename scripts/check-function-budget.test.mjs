// The counter has to agree with Vercel's routing rule, and the two ways of getting it wrong are
// both silent: count too many and a legitimate endpoint is refused, count too few and production
// stops deploying with nothing to read. So the rule is tested against a fixture tree rather than
// against api/ alone, which can only ever exercise the shape it happens to have today.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FUNCTION_CAP, routedFunctions } from './check-function-budget.mjs';

test('the committed api/ tree fits the cap', () => {
  const functions = routedFunctions();
  assert.equal(
    functions.length <= FUNCTION_CAP,
    true,
    `api/ routes ${functions.length} functions, over the cap of ${FUNCTION_CAP}`,
  );
  // A count that silently fell to zero would pass the cap and prove nothing.
  assert.equal(functions.length > 0, true);
  assert.equal(
    functions.some((name) => name.startsWith('_lib/')),
    false,
    'api/_lib is not routed and must never be counted',
  );
});

test('counts what Vercel routes and skips what it does not', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'fnbudget-'));
  const write = (relative) => {
    mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    writeFileSync(path.join(root, relative), '');
  };

  write('events.ts'); // a plain endpoint
  write('render/start.ts'); // nested, still one function
  write('admin/[...path].ts'); // a catch-all is one function, not one per route
  write('legacy/handler.mjs'); // any runtime extension counts
  write('_lib/http.ts'); // an underscore directory is invisible to routing
  write('_lib/deep/nested/helper.ts'); // ...at any depth
  write('render/_helpers/util.ts'); // ...and not only at the top level
  write('_disabled.ts'); // an underscore FILE is out too
  write('types.d.ts'); // a declaration is not a function
  write('README.md'); // nor is anything without a runtime extension

  assert.deepEqual(routedFunctions(root), [
    'admin/[...path].ts',
    'events.ts',
    'legacy/handler.mjs',
    'render/start.ts',
  ]);
});
