import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mapLabelsToFields,
  normalizeLabel,
  parseDataUpdate,
  resolveTargetGraphic,
  type PanelGraphicLike,
} from './dataIngest.js';

// The house scorebug's contract (src/templates/scoreboards/scorebugShared.ts) - the shape the
// Yle demo drives, so the mapping is proven against the real field list.
const SCOREBUG: PanelGraphicLike = {
  name: 'House Scorebug',
  fields: [
    { field: 'f0', ftype: 'textfield', title: 'Team A' },
    { field: 'f1', ftype: 'number', title: 'Score A' },
    { field: 'f2', ftype: 'textfield', title: 'Team B' },
    { field: 'f3', ftype: 'number', title: 'Score B' },
    { field: 'f4', ftype: 'textfield', title: 'Period' },
    { field: 'f5', ftype: 'textfield', title: 'Clock' },
    { field: 'f6', ftype: 'color', title: 'Team A colour' },
    { field: 'f7', ftype: 'color', title: 'Team B colour' },
  ],
};

const TICKER: PanelGraphicLike = {
  name: 'Ticker',
  fields: [{ field: 'f0', ftype: 'textarea', title: 'Items' }],
};

// ── parseDataUpdate ──────────────────────────────────────────────────────────────────────────

test('a plain values body parses, with numbers and booleans stringified', () => {
  const r = parseDataUpdate({ values: { 'Score A': 2, Clock: '43:12', Live: true } });
  assert.ok(r.ok);
  assert.deepEqual(r.req.values, { 'Score A': '2', Clock: '43:12', Live: 'true' });
});

test('non-scalar values, empty values, and graphic+cue together are refused', () => {
  assert.equal(parseDataUpdate({ values: { a: { nested: 1 } } }).ok, false);
  assert.equal(parseDataUpdate({ values: {} }).ok, false);
  assert.equal(parseDataUpdate({ graphic: 'A', cue: 'B', values: { x: '1' } }).ok, false);
  assert.equal(parseDataUpdate([]).ok, false);
  assert.equal(parseDataUpdate(null).ok, false);
  assert.equal(parseDataUpdate({ graphic: '  ', values: { x: '1' } }).ok, false);
});

// ── resolveTargetGraphic ─────────────────────────────────────────────────────────────────────

test('a single-graphic production needs no target - the scorebug case', () => {
  const r = resolveTargetGraphic([SCOREBUG], [], {});
  assert.ok(r.ok);
  assert.equal(r.graphic.name, 'House Scorebug');
});

test('a multi-graphic production without a target is refused, naming the graphics', () => {
  const r = resolveTargetGraphic([SCOREBUG, TICKER], [], {});
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /"House Scorebug", "Ticker"/);
});

test('graphic names match normalized, like the dataset binding', () => {
  const r = resolveTargetGraphic([SCOREBUG, TICKER], [], { graphic: '  house scorebug ' });
  assert.ok(r.ok);
  assert.equal(r.graphic.name, 'House Scorebug');
});

test('an unknown graphic is refused with the available names', () => {
  const r = resolveTargetGraphic([SCOREBUG], [], { graphic: 'Lower third' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /No graphic named "Lower third"/);
});

test('a cue label resolves to the graphic its cues drive', () => {
  const cues = [
    { graphic: 'Ticker', label: 'Headlines' },
    { graphic: 'House Scorebug', label: 'Match' },
  ];
  const r = resolveTargetGraphic([SCOREBUG, TICKER], cues, { cue: 'match' });
  assert.ok(r.ok);
  assert.equal(r.graphic.name, 'House Scorebug');
});

test('two same-graphic cues sharing a label are fine; two cross-graphic ones are ambiguous', () => {
  const same = [
    { graphic: 'Ticker', label: 'Loop' },
    { graphic: 'Ticker', label: 'Loop' },
  ];
  assert.ok(resolveTargetGraphic([SCOREBUG, TICKER], same, { cue: 'Loop' }).ok);
  const cross = [
    { graphic: 'Ticker', label: 'Open' },
    { graphic: 'House Scorebug', label: 'Open' },
  ];
  const r = resolveTargetGraphic([SCOREBUG, TICKER], cross, { cue: 'Open' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /ambiguous/);
});

// ── mapLabelsToFields ────────────────────────────────────────────────────────────────────────

test('labels map to fN ids case-insensitively; extras are reported, never dropped silently', () => {
  const m = mapLabelsToFields(SCOREBUG.fields!, {
    'score a': '2',
    'SCORE B': '1',
    ' Clock ': '43:12',
    Referee: 'n/a',
  });
  assert.deepEqual(m.data, { f1: '2', f3: '1', f5: '43:12' });
  assert.deepEqual(m.ignored, ['Referee']);
  assert.deepEqual(m.ambiguous, []);
});

test('the fN id addresses its field even untitled', () => {
  const m = mapLabelsToFields([{ field: 'f0', ftype: 'textfield' }], { f0: 'hello' });
  assert.deepEqual(m.data, { f0: 'hello' });
});

test('a duplicated title is ambiguous and skipped rather than guessed', () => {
  const twins = [
    { field: 'f0', ftype: 'textfield', title: 'Name' },
    { field: 'f1', ftype: 'textfield', title: 'name' },
  ];
  const m = mapLabelsToFields(twins, { Name: 'Anna', f1: 'Ben' });
  assert.deepEqual(m.data, { f1: 'Ben' });
  assert.deepEqual(m.ambiguous, ['Name']);
});

test('a title shaped like another field\'s fN id never captures that id - the id wins, both panel orders', () => {
  // f0 TITLED "F1" while a real f1 exists: addressing "f1" must reach f1, never f0, and
  // must not be reported ambiguous - in either panel order.
  const shadowFirst = [
    { field: 'f0', ftype: 'textfield', title: 'F1' },
    { field: 'f1', ftype: 'number', title: 'Score' },
  ];
  const shadowSecond = [
    { field: 'f1', ftype: 'number', title: 'Score' },
    { field: 'f0', ftype: 'textfield', title: 'F1' },
  ];
  for (const fields of [shadowFirst, shadowSecond]) {
    const m = mapLabelsToFields(fields, { f1: '5' });
    assert.deepEqual(m.data, { f1: '5' });
    assert.deepEqual(m.ambiguous, []);
    assert.deepEqual(m.ignored, []);
  }
});

test('non-data ftypes (buttons, captions) never take a value; hidden fields do', () => {
  const fields = [
    { field: 'f0', ftype: 'button', title: 'Fire' },
    { field: 'f1', ftype: 'hidden', title: 'Duration' },
  ];
  const m = mapLabelsToFields(fields, { Fire: 'x', Duration: '90' });
  assert.deepEqual(m.data, { f1: '90' });
  assert.deepEqual(m.ignored, ['Fire']);
});

test('normalizeLabel is the dataset binding: trim + case-fold', () => {
  assert.equal(normalizeLabel('  Score A '), 'score a');
});
