// guards: src/control/cueStaging.ts
//
// What the hosted control page airs for one cue (src/control/cueStaging.ts): the cue as
// prepared, the edits staged for THAT cue in the shared buffer, and the bound values over both.
//
// The defect this pins (issue #1036, the vMix walk): the shared staging buffer is keyed by
// graphic on the server, and the page laid the whole graphic's buffer over every cue. A name
// corrected on one guest's lower third then showed in, and aired with, every other guest's cue of
// the same graphic. The page itself needs a backend to mount, so the rule is pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// The module imports types only, so one transpile is the whole load (the own-staged precedent).
const source = readFileSync(fileURLToPath(new URL('../src/control/cueStaging.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { cueStageData, hostedCueValues } = await import(`data:text/javascript,${encodeURIComponent(js)}`);

const LT = 'Lower third';
const hairline = { id: 'c1', graphic: LT, label: 'Hairline', values: { f0: 'Alexandra Riva', f1: 'Chief Correspondent' } };
const ben = { id: 'c2', graphic: LT, label: 'Ben, guest', values: { f0: 'Ben Guest', f1: 'Second cue' } };
const bug = { id: 'c3', graphic: 'Bug', label: 'Bug', values: { f0: 'LIVE' } };
const cues = [hairline, ben, bug];

/** The shared buffer after the page staged `data` for `cue`, merged the way control_stage merges. */
const stage = (staged, cue, data) => ({ ...staged, [cue.graphic]: { ...staged[cue.graphic], ...cueStageData(cue.id, data) } });

test('an edit to one cue does not show in, or air with, another cue of the same graphic', () => {
  const staged = stage({}, hairline, { f0: 'Mirko Walk' });
  assert.deepEqual(hostedCueValues(hairline, staged, {}, cues), { f0: 'Mirko Walk', f1: 'Chief Correspondent' });
  assert.deepEqual(hostedCueValues(ben, staged, {}, cues), { f0: 'Ben Guest', f1: 'Second cue' });
});

test('each cue keeps its own edits, whichever was staged last', () => {
  let staged = stage({}, hairline, { f0: 'Mirko Walk' });
  staged = stage(staged, ben, { f1: 'Guest of the week' });
  assert.deepEqual(hostedCueValues(hairline, staged, {}, cues), { f0: 'Mirko Walk', f1: 'Chief Correspondent' });
  assert.deepEqual(hostedCueValues(ben, staged, {}, cues), { f0: 'Ben Guest', f1: 'Guest of the week' });
});

test('an edit staged on one screen counts on every screen that reads the same buffer', () => {
  // Every open page reads the same `control_shows.staged`; it is the only input they share.
  const staged = stage({}, ben, { f0: 'Ben Guesty' });
  const elsewhere = JSON.parse(JSON.stringify(staged));
  assert.equal(hostedCueValues(ben, elsewhere, {}, cues).f0, 'Ben Guesty');
  assert.equal(hostedCueValues(hairline, elsewhere, {}, cues).f0, 'Alexandra Riva');
});

test('a graphic-wide value staged by an older build counts only where the graphic has one cue', () => {
  // A buffer lasts as long as the production, so values staged before cue-scoped staging stay in
  // it. With one cue the graphic and the cue are the same thing; with several nobody can tell
  // which cue the value was typed for, so it counts for none of them.
  const staged = { [LT]: { f0: 'Mirko Walk' }, Bug: { f0: 'REPLAY' } };
  assert.equal(hostedCueValues(ben, staged, {}, cues).f0, 'Ben Guest');
  assert.equal(hostedCueValues(hairline, staged, {}, cues).f0, 'Alexandra Riva');
  assert.equal(hostedCueValues(bug, staged, {}, cues).f0, 'REPLAY');
  assert.equal(hostedCueValues(bug, stage(staged, bug, { f0: 'BREAKING' }), {}, cues).f0, 'BREAKING', 'the cue-scoped edit wins');
});

test('bound values sit over the cue and every staged edit', () => {
  const staged = stage({}, ben, { f0: 'Ben Guesty', f1: '7' });
  assert.deepEqual(hostedCueValues(ben, staged, { [LT]: { f1: '4' } }, cues), { f0: 'Ben Guesty', f1: '4' });
});

test('an edit to one cue is never read by a cue whose id is a prefix of it', () => {
  const a = { id: 'c', graphic: LT, label: 'A', values: { f0: 'A' } };
  const b = { id: 'c1', graphic: LT, label: 'B', values: { f0: 'B' } };
  const staged = stage({}, b, { f0: 'B edited' });
  assert.deepEqual(hostedCueValues(a, staged, {}, [a, b]), { f0: 'A' });
  assert.deepEqual(hostedCueValues(b, staged, {}, [a, b]), { f0: 'B edited' });
});
