// Unit tests for the production-data contract (src/model/productionData.ts).
//
// These run in the BUILD GATE rather than in Playwright because there is no browser in the
// question: paths in, values out. The module imports nothing, which is what makes one
// `transpileModule` call enough (the csv.test.mjs pattern).
//
// MERGE_PATCH_CONFORMANCE below is the important half. The hosted ingress planned in
// docs/PRODUCTION_DATA_PLAN.md §4 performs the same merge in plpgsql, for write atomicity, and
// two implementations of one semantic is exactly how a system develops two opinions quietly.
// The table is therefore written as DATA, not as prose: when the SQL twin lands, its own
// migration test walks this same list and must agree case for case.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('../src/model/productionData.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const {
  applyPatch,
  deletePath,
  diffResolved,
  flattenLeaves,
  formatValue,
  getPath,
  mergePatch,
  parseLiteral,
  parsePath,
  patchForPath,
  reparseLeaf,
  resolveBindings,
  setPath,
  suggestPath,
} = mod;

/**
 * THE MERGE-PATCH CONTRACT. Every case here is RFC 7386 behaviour that a live production
 * depends on, and every case must hold identically in TypeScript and in the future plpgsql
 * twin. Add a case here before changing either implementation.
 */
const MERGE_PATCH_CONFORMANCE = [
  {
    name: 'a nested patch keeps the siblings it did not mention',
    base: { a: { b: 1, c: 2 } },
    patch: { a: { b: 5 } },
    expect: { a: { b: 5, c: 2 } },
  },
  {
    name: 'null deletes exactly its own key',
    base: { a: { b: 1, c: 2 } },
    patch: { a: { b: null } },
    expect: { a: { c: 2 } },
  },
  {
    name: 'a patch creates the branch it needs',
    base: {},
    patch: { match: { home: { score: 4 } } },
    expect: { match: { home: { score: 4 } } },
  },
  {
    name: 'arrays REPLACE wholesale - no element merging',
    base: { rows: [1, 2, 3] },
    patch: { rows: [9] },
    expect: { rows: [9] },
  },
  {
    name: 'a scalar replaces an object',
    base: { a: { b: 1 } },
    patch: { a: 'gone' },
    expect: { a: 'gone' },
  },
  {
    name: 'an object replaces a scalar',
    base: { a: 'text' },
    patch: { a: { b: 1 } },
    expect: { a: { b: 1 } },
  },
  {
    name: 'deleting a key that is not there is not an error',
    base: { a: 1 },
    patch: { b: null },
    expect: { a: 1 },
  },
  {
    name: 'an empty patch changes nothing',
    base: { a: { b: 1 } },
    patch: {},
    expect: { a: { b: 1 } },
  },
  {
    name: 'false and 0 are values, not absences',
    base: { open: true, votes: 7 },
    patch: { open: false, votes: 0 },
    expect: { open: false, votes: 0 },
  },
  {
    name: 'deleting a whole branch',
    base: { match: { home: { score: 1 } }, weather: { temp: 4 } },
    patch: { weather: null },
    expect: { match: { home: { score: 1 } } },
  },
];

test('merge-patch conformance table (TypeScript side)', () => {
  for (const c of MERGE_PATCH_CONFORMANCE) {
    const frozen = JSON.parse(JSON.stringify(c.base));
    assert.deepEqual(applyPatch(c.base, c.patch), c.expect, c.name);
    // Immutability is part of the contract: React state and the undo story both assume the
    // input tree was not edited underneath them.
    assert.deepEqual(c.base, frozen, `${c.name} - the base must not be mutated`);
  }
});

test('mergePatch at a non-object root replaces, per the RFC', () => {
  assert.equal(mergePatch({ a: 1 }, 'scalar'), 'scalar');
  assert.deepEqual(mergePatch(undefined, { a: 1 }), { a: 1 });
  assert.deepEqual(mergePatch('was a string', { a: 1 }), { a: 1 });
});

test('paths parse, or refuse', () => {
  assert.deepEqual(parsePath('match.home.score'), ['match', 'home', 'score']);
  assert.deepEqual(parsePath('drivers.0.gap'), ['drivers', '0', 'gap']);
  assert.equal(parsePath(''), null);
  assert.equal(parsePath('  '), null);
  assert.equal(parsePath('a..b'), null);
  assert.equal(parsePath('a.'), null);
});

test('getPath walks objects and array indices, and gives up honestly', () => {
  const data = { match: { home: { score: 3 } }, drivers: [{ name: 'A' }, { name: 'B' }] };
  assert.equal(getPath(data, 'match.home.score'), 3);
  assert.equal(getPath(data, 'drivers.1.name'), 'B');
  assert.equal(getPath(data, 'match.away.score'), undefined);
  assert.equal(getPath(data, 'match.home.score.deeper'), undefined);
  assert.equal(getPath(data, 'drivers.9.name'), undefined);
  assert.equal(getPath(data, ''), undefined);
});

test('setPath builds missing branches and edits array elements in place', () => {
  assert.deepEqual(setPath({}, 'match.home.score', 4), { match: { home: { score: 4 } } });
  const withList = { drivers: [{ gap: 'LEADER' }, { gap: '+1.2' }] };
  assert.deepEqual(setPath(withList, 'drivers.1.gap', '+0.9'), {
    drivers: [{ gap: 'LEADER' }, { gap: '+0.9' }],
  });
  // The array survives as an array - the whole reason setPath exists beside mergePatch.
  assert.ok(Array.isArray(setPath(withList, 'drivers.0.gap', 'X').drivers));
  const base = { a: { b: 1 } };
  setPath(base, 'a.c', 2);
  assert.deepEqual(base, { a: { b: 1 } }, 'setPath must not mutate its input');
});

test('deletePath removes a key, splices an array element, and ignores misses', () => {
  assert.deepEqual(deletePath({ a: { b: 1, c: 2 } }, 'a.b'), { a: { c: 2 } });
  assert.deepEqual(deletePath({ rows: [1, 2, 3] }, 'rows.1'), { rows: [1, 3] });
  assert.deepEqual(deletePath({ a: 1 }, 'nope.deep'), { a: 1 });
});

test('patchForPath refuses array indices, which merge-patch cannot express', () => {
  assert.deepEqual(patchForPath('match.home.score', 4), { match: { home: { score: 4 } } });
  assert.equal(patchForPath('drivers.0.gap', 'x'), null);
});

test('formatValue writes strings, or writes nothing at all', () => {
  assert.equal(formatValue('Finland'), 'Finland');
  assert.equal(formatValue(3), '3');
  assert.equal(formatValue(17.4), '17.4');
  assert.equal(formatValue(0), '0');
  assert.equal(formatValue(true), 'true');
  assert.equal(formatValue(false), 'false');
  assert.equal(formatValue(['Yes', 'No']), 'Yes\nNo');
  assert.equal(formatValue([1, 2]), '1\n2');
  // The three "write nothing" cases - a live field keeps its last good value.
  assert.equal(formatValue(undefined), null);
  assert.equal(formatValue(null), null);
  assert.equal(formatValue({ a: 1 }), null);
  assert.equal(formatValue([{ a: 1 }]), null);
  assert.equal(formatValue(NaN), null);
});

test('flattenLeaves finds every bindable leaf, including through arrays of objects', () => {
  const data = {
    match: { home: { name: 'Finland', score: 3 } },
    poll: { open: true, options: [{ label: 'Yes', votes: 72 }] },
    headlines: ['one', 'two'],
  };
  const paths = flattenLeaves(data).map((l) => l.path);
  assert.deepEqual(paths, [
    'match.home.name',
    'match.home.score',
    'poll.open',
    'poll.options.0.label',
    'poll.options.0.votes',
    'headlines',
  ]);
  // A scalar array is ONE leaf (a `lines` field takes it whole), not one leaf per element.
  assert.equal(flattenLeaves(data).find((l) => l.path === 'headlines').text, 'one\ntwo');
});

test('resolveBindings skips what it cannot write, and never invents a blank', () => {
  const data = { match: { home: { score: 3 } }, obj: { deep: { a: 1 } } };
  const bindings = {
    Scorebug: { f1: 'match.home.score', f2: 'match.away.score', f3: 'obj.deep' },
    Ticker: { f0: 'nothing.here' },
  };
  assert.deepEqual(resolveBindings(data, bindings), { Scorebug: { f1: '3' } });
  assert.deepEqual(resolveBindings(data, undefined), {});
});

test('diffResolved sends only what changed, and never a disappearance', () => {
  const before = { A: { f1: '1', f2: 'x' }, B: { f0: 'same' } };
  const after = { A: { f1: '2', f2: 'x' }, B: { f0: 'same' } };
  assert.deepEqual(diffResolved(before, after), { A: { f1: '2' } });
  // A path that vanished is absent from `after`, so nothing is sent - the field keeps its last
  // value rather than going blank on air.
  assert.deepEqual(diffResolved(before, { A: { f2: 'x' }, B: { f0: 'same' } }), {});
  // A cold start reconciles everything once.
  assert.deepEqual(diffResolved({}, after), after);
});

test('suggestPath binds an unambiguous name and refuses a contested one', () => {
  const leaves = flattenLeaves({
    match: { home: { scoreA: 1 }, clock: '12:31' },
    other: { name: 'x' },
    team: { name: 'y' },
  });
  assert.equal(suggestPath('Score A', leaves), 'match.home.scoreA');
  assert.equal(suggestPath('match.clock', leaves), 'match.clock');
  // Two leaves end in `name`: bind nothing rather than guess (the API's `ambiguous` doctrine).
  assert.equal(suggestPath('Name', leaves), null);
  assert.equal(suggestPath('nothing like this', leaves), null);
  assert.equal(suggestPath('', leaves), null);
});

test('parseLiteral reads the value box the way an operator means it', () => {
  assert.equal(parseLiteral('4'), 4);
  assert.equal(parseLiteral('17.4'), 17.4);
  assert.equal(parseLiteral('-2'), -2);
  assert.equal(parseLiteral('true'), true);
  assert.equal(parseLiteral('false'), false);
  assert.equal(parseLiteral('null'), null);
  assert.deepEqual(parseLiteral('[1,2]'), [1, 2]);
  assert.deepEqual(parseLiteral('{"a":1}'), { a: 1 });
  assert.equal(parseLiteral('Finland'), 'Finland');
  // Quoting is how an operator says "the TEXT four".
  assert.equal(parseLiteral('"4"'), '4');
  // Malformed JSON stays the text that was typed rather than throwing into an edit.
  assert.equal(parseLiteral('{not json'), '{not json');
  assert.equal(parseLiteral(''), '');
});

test('reparseLeaf keeps a list a list when its box is edited', () => {
  // The row editor renders a scalar array as newline-joined text. Reading it back with
  // parseLiteral alone would turn ["a","b"] into the single string "a\nb" - the graphic would
  // look identical and the TYPE would have changed under every future consumer.
  assert.deepEqual(reparseLeaf(['a', 'b'], 'a\nb\nc'), ['a', 'b', 'c']);
  assert.deepEqual(reparseLeaf([1, 2], '3\n4'), [3, 4]);
  assert.deepEqual(reparseLeaf(['a'], ''), []);
  // Anything that was NOT a list reads as an ordinary literal.
  assert.equal(reparseLeaf('text', '42'), 42);
  assert.equal(reparseLeaf(3, '4'), 4);
  assert.equal(reparseLeaf(undefined, 'Finland'), 'Finland');
});

test('a clock string is never mistaken for a number', () => {
  // 12:31 must survive as text; a value box that "helpfully" parsed it would air 12.
  assert.equal(parseLiteral('12:31'), '12:31');
  assert.equal(parseLiteral('+1.231'), '+1.231');
});
