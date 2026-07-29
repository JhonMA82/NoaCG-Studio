// Scoring tests for the import-analysis vision suite. The gold and floor arms pin the two
// ENDS of the range; a real model lands in the middle, which is exactly where a silently
// broken metric would go unnoticed - a matcher that never matches reads as "the model is
// bad", and one that always matches reads as "the model is good".

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { colorDelta, iou, matchRegions, roleFromTitle, scoreAnalysis } from './ai-vision-bench/groundTruth.mjs';

const box = (x, y, w, h) => ({ x, y, w, h });
const region = (bbox, over = {}) => ({ kind: 'text', bbox, role: 'person-name', typography: { classification: 'sans', fontId: 'inter', color: '#ffffff' }, ...over });
const record = (regions, over = {}) => ({
  version: 1, id: 't', source: 'authored', split: 'dev', image: 'i.png',
  truth: { graphicType: 'lower-third', canvas: { aspect: 16 / 9 }, hasEditableText: true, authoritativeKinds: ['text'], regions, ...over },
});
const predict = (regions, over = {}) => ({ version: 1, graphicType: 'lower-third', regions, warnings: [], ...over });

test('iou is 1 for identical boxes and 0 for disjoint ones', () => {
  assert.equal(iou(box(0, 0, 1, 1), box(0, 0, 1, 1)), 1);
  assert.equal(iou(box(0, 0, 0.1, 0.1), box(0.5, 0.5, 0.1, 0.1)), 0);
  // Half-overlapping equal boxes: intersection 0.5, union 1.5.
  assert.ok(Math.abs(iou(box(0, 0, 1, 1), box(0.5, 0, 1, 1)) - 1 / 3) < 1e-9);
});

test('a near-miss box still matches, a far-miss does not - the middle of the range', () => {
  const truth = [region(box(0.1, 0.8, 0.3, 0.06))];
  // Shifted by a fifth of its width: still clearly the same region to a human.
  const near = matchRegions(truth, [region(box(0.16, 0.8, 0.3, 0.06))]);
  assert.equal(near.matched.length, 1, 'a slightly shifted box should match');
  assert.ok(near.matched[0].score > 0.5 && near.matched[0].score < 1, 'and score strictly between floor and gold');
  // Shifted by more than its own width: a different region.
  const far = matchRegions(truth, [region(box(0.5, 0.8, 0.3, 0.06))]);
  assert.equal(far.matched.length, 0);
  assert.equal(far.missedTruth.length, 1);
  assert.equal(far.extraPredicted.length, 1);
});

test('each region is used once, so one big prediction cannot claim two truths', () => {
  const truth = [region(box(0.1, 0.8, 0.2, 0.05)), region(box(0.1, 0.87, 0.2, 0.05))];
  const result = matchRegions(truth, [region(box(0.1, 0.8, 0.2, 0.12))]);
  assert.ok(result.matched.length <= 1);
  assert.equal(result.matched.length + result.missedTruth.length, 2);
});

test('regions of a kind the truth is not authoritative for are ignored entirely', () => {
  const truth = record([region(box(0.1, 0.8, 0.3, 0.06))]);
  // The model also reports decoration. Ground truth says nothing about decoration, so this
  // must not count as a false positive.
  const score = scoreAnalysis(truth, predict([
    region(box(0.1, 0.8, 0.3, 0.06)),
    region(box(0, 0, 1, 0.2), { kind: 'decorative' }),
  ]));
  assert.equal(score.precision, 1, 'a decorative extra must not reduce precision');
  assert.equal(score.recall, 1);
});

test('a truth region with no derivable role drops out of role accuracy', () => {
  const truth = record([
    region(box(0.1, 0.8, 0.3, 0.06), { role: null }),
    region(box(0.1, 0.87, 0.3, 0.06), { role: 'person-role' }),
  ]);
  const score = scoreAnalysis(truth, predict([
    region(box(0.1, 0.8, 0.3, 0.06), { role: 'organization' }), // wrong, but truth has no role
    region(box(0.1, 0.87, 0.3, 0.06), { role: 'person-role' }),
  ]));
  assert.equal(score.counts.roleChecked, 1, 'only the region whose role is known is checked');
  assert.equal(score.roleAccuracy, 1);
});

test('the no-editable-text tripwire counts every invented region', () => {
  const truth = record([], { hasEditableText: false });
  const clean = scoreAnalysis(truth, predict([]));
  assert.equal(clean.hallucinatedRegions, 0);
  const invented = scoreAnalysis(truth, predict([region(box(0.1, 0.8, 0.3, 0.06))]));
  assert.equal(invented.hallucinatedRegions, 1);
});

test('edits required counts misses, extras and role corrections', () => {
  const truth = record([
    region(box(0.1, 0.8, 0.3, 0.06), { role: 'person-name' }),
    region(box(0.1, 0.9, 0.3, 0.06), { role: 'person-role' }),
  ]);
  const score = scoreAnalysis(truth, predict([
    region(box(0.1, 0.8, 0.3, 0.06), { role: 'organization' }), // matched, wrong role -> 1 edit
    region(box(0.6, 0.2, 0.2, 0.05)), // extra -> 1 edit
    // second truth region missed -> 1 edit
  ]));
  assert.equal(score.editsRequired, 3);
});

test('a null prediction scores as a schema failure rather than throwing', () => {
  const score = scoreAnalysis(record([region(box(0.1, 0.8, 0.3, 0.06))]), null);
  assert.equal(score.schemaOk, false);
  assert.equal(score.graphicTypeCorrect, false);
});

test('colour delta is 0 for identical and 1 for opposite corners of the cube', () => {
  assert.equal(colorDelta('#ffffff', '#ffffff'), 0);
  assert.ok(Math.abs(colorDelta('#000000', '#ffffff') - 1) < 1e-9);
  assert.equal(colorDelta('#ffffff', 'not-a-colour'), null);
});

test('role derivation maps the unambiguous titles and refuses the rest', () => {
  assert.equal(roleFromTitle('Name'), 'person-name');
  assert.equal(roleFromTitle('Team A'), 'team-name');
  assert.equal(roleFromTitle('Score B'), 'score');
  assert.equal(roleFromTitle('Left name'), 'person-name', 'a side prefix names the instance, not the role');
  // These could be almost anything - guessing would become a verdict on the model.
  assert.equal(roleFromTitle('Kicker'), null);
  assert.equal(roleFromTitle('Line 1'), null);
  assert.equal(roleFromTitle(''), null);
});
