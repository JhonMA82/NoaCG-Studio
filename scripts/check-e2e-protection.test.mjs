// guards: scripts/check-e2e-protection.mjs, docs/work-specs/e2e-suite-budget/spec.md
// Coverage leaves the gate only with a maintenance entry: what the diff reader counts as removed
// protection, what it lets through, and how an entry covers a spec.
import assert from 'node:assert/strict';
import test from 'node:test';

import { TIMEOUT_CEILING_MS, deletedSpecs, findings, parseMaintenance, readDiff, verdict } from './check-e2e-protection.mjs';

const diff = (file, body, { deleted = false } = {}) => [`diff --git a/${file} b/${file}`, deleted ? 'deleted file mode 100644' : 'index 1..2 100644', `--- a/${file}`, `+++ b/${file}`, '@@ -1,3 +1,3 @@', ...body].join('\n');

test('removed test declarations, unconditional skips and raised timeouts are findings; conditional skips and renames are not', () => {
  const files = readDiff([
    diff('e2e/a.spec.ts', ['-test(\'one\', async () => {});', '-test(\'two\', async () => {});', '+test(\'two renamed\', async () => {});']),
    diff('e2e/b.spec.ts', ['+  test.skip(true, OLD_EDITOR_SKIP);', '+  skipOldEditor();']),
    diff('e2e/c.spec.ts', ['+  test.skip(!haveCreds, \'needs a backend\');', '+test(\'three\', async () => {});']),
    diff('e2e/d.spec.ts', ['+  test.setTimeout(360_000);', '+  test.slow();']),
    diff('e2e/configured/e.spec.ts', ['+  test.setTimeout(300000);']),
  ].join('\n'));
  const found = findings(files);
  assert.deepEqual(found.get('e2e/a.spec.ts'), ['1 test declaration(s) fewer than before']);
  assert.equal(found.get('e2e/b.spec.ts').length, 2);
  assert.equal(found.has('e2e/c.spec.ts'), false, 'a conditional skip and an added test remove nothing');
  assert.deepEqual(found.get('e2e/d.spec.ts'), [
    `a per-test timeout of 360000 ms is added, above the gate's ${TIMEOUT_CEILING_MS} ms ceiling`,
    `test.slow() is added (three times the default, above the gate's ${TIMEOUT_CEILING_MS} ms ceiling)`,
  ]);
  assert.equal(found.has('e2e/configured/e.spec.ts'), false, 'the timeout ceiling is the offline gate\'s, not the configured suite\'s');
});

test('a deleted spec file is a finding, from the diff header or from name-status', () => {
  const files = readDiff(diff('e2e/gone.spec.ts', ['-test(\'x\', async () => {});'], { deleted: true }));
  assert.deepEqual(findings(files).get('e2e/gone.spec.ts'), ['the spec file is deleted', '1 test declaration(s) fewer than before']);
  assert.deepEqual(deletedSpecs('D\te2e/gone.spec.ts\nM\te2e/kept.spec.ts\nR100\te2e/old.spec.ts\tdocs/research/old.spec.ts\nR090\te2e/x.spec.ts\te2e/y.spec.ts'), ['e2e/gone.spec.ts', 'e2e/old.spec.ts']);
  assert.deepEqual(findings(new Map(), ['e2e/gone.spec.ts']).get('e2e/gone.spec.ts'), ['the spec file is deleted or moved out of e2e/']);
});

test('files outside e2e/ and non-spec files are ignored', () => {
  const files = readDiff([diff('src/x.ts', ['-test(\'not a spec\')']), diff('e2e/_create.ts', ['+  test.skip(true, OLD_EDITOR_SKIP);'])].join('\n'));
  assert.equal(files.size, 0);
});

test('a maintenance entry covers its spec, by basename, and only lines in that section count', () => {
  const md = ['# Spec', '', '## Test maintenance', '', '- 2026-10-12 e2e/old-walk.spec.ts: group and ungroup kept by editor-groups journeys; receipt evidence/groups.md', '- `e2e/other.spec.ts`: retired with the old editor surface', '- not a spec line', '', '## Budget exceptions', '', '- e2e/not-covered.spec.ts: 3 min, protects x, expires 2026-11-01'].join('\n');
  const entries = parseMaintenance(md);
  assert.deepEqual(entries.map((e) => e.spec), ['e2e/old-walk.spec.ts', 'e2e/other.spec.ts']);
  const found = new Map([['e2e/old-walk.spec.ts', ['deleted']], ['e2e/not-covered.spec.ts', ['2 test declaration(s) fewer than before']]]);
  const v = verdict(found, entries);
  assert.deepEqual(v.allowed.map((a) => a.spec), ['e2e/old-walk.spec.ts']);
  assert.deepEqual(v.refused.map((r) => r.spec), ['e2e/not-covered.spec.ts'], 'a budget exception is not a maintenance entry');
});
