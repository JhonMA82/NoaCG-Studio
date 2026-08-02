// What the feedback endpoint will and will not store.
//
// `feedbackRow` is the whole boundary between "a person typed something" and a database row, and
// it is the only validator on this project that has to admit free text. So the tests below are
// about what may ACCOMPANY that text - and about the two cases where dropping a submission would
// silently lose a real one.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { feedbackRow } from './feedbackStore.js';
import {
  FEEDBACK_MAX_REASONS,
  FEEDBACK_MESSAGE_MAX,
  GENERATION_FEEDBACK_REASONS,
  IMPLICIT_DISCARD_REASONS,
  LITE_DISCARD_REASONS,
} from '../../src/feedback/contract.js';

const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';

test('a bare thumb is a complete submission', () => {
  // The rating IS the data point. Requiring a reason or a message would make the flow the
  // interruption it must not be, and would collect only from people who were going to write a
  // paragraph anyway.
  const row = feedbackRow({ kind: 'beta', sentiment: 'positive' });
  assert.ok(row);
  assert.deepEqual(row.reasons, []);
  assert.equal(row.message, '');
});

test('a generation rating does NOT require a ledger id', () => {
  // Only NoaCG Lite writes an `ai_generations` row and hands its id to the browser. A Pro
  // result, a BYO harness run and the offline stub all produce a graphic with no id in
  // existence, so requiring one would collect ratings from a single tier and report the result
  // as satisfaction with the product.
  const row = feedbackRow({ kind: 'generation', sentiment: 'negative', tier: 'pro' });
  assert.ok(row);
  assert.equal(row.generationId, null);
  assert.equal(row.tier, 'pro');
});

test('reasons are validated against the KIND, not against one merged list', () => {
  // A beta reason filed against a generation would make the per-reason counts on the admin page
  // a mixed bag of two vocabularies.
  const generation = feedbackRow({
    kind: 'generation',
    sentiment: 'negative',
    reasons: ['hard-to-read', 'bug'],
  });
  assert.deepEqual(generation?.reasons, ['hard-to-read']);

  const beta = feedbackRow({ kind: 'beta', sentiment: 'negative', reasons: ['bug', 'hard-to-read'] });
  assert.deepEqual(beta?.reasons, ['bug']);
});

test('reasons are deduplicated and capped', () => {
  const row = feedbackRow({
    kind: 'generation',
    sentiment: 'negative',
    reasons: [...GENERATION_FEEDBACK_REASONS, ...GENERATION_FEEDBACK_REASONS],
  });
  assert.ok(row);
  assert.equal(row.reasons.length, FEEDBACK_MAX_REASONS);
  assert.equal(new Set(row.reasons).size, row.reasons.length);
});

test('an over-long message is REFUSED, not truncated', () => {
  // Quietly storing half of somebody's paragraph is worse than not storing it, and the CHECK
  // constraint would reject the row anyway. The browser caps the field at the same number, so a
  // real user cannot reach this.
  assert.equal(feedbackRow({ kind: 'beta', sentiment: 'negative', message: 'x'.repeat(FEEDBACK_MESSAGE_MAX + 1) }), null);
  const atLimit = feedbackRow({ kind: 'beta', sentiment: 'negative', message: 'x'.repeat(FEEDBACK_MESSAGE_MAX) });
  assert.ok(atLimit);
});

test('the enumerated fields refuse anything outside their vocabulary', () => {
  assert.equal(feedbackRow({ kind: 'praise', sentiment: 'positive' }), null);
  assert.equal(feedbackRow({ kind: 'beta', sentiment: 'lukewarm' }), null);
  assert.equal(feedbackRow({ kind: 'beta' }), null);
  assert.equal(feedbackRow(null), null);
  assert.equal(feedbackRow([]), null);

  // A free-text area or tier is dropped to null rather than stored - the columns are
  // enumerated at the database and a rejected row would lose the whole note.
  const row = feedbackRow({ kind: 'beta', sentiment: 'positive', area: 'https://example.com/app', tier: 'deluxe' });
  assert.ok(row);
  assert.equal(row.area, null);
  assert.equal(row.tier, null);
});

test('ids must look like ids', () => {
  const good = feedbackRow({ kind: 'generation', sentiment: 'negative', generationId: UUID, visitorId: UUID });
  assert.equal(good?.generationId, UUID);
  assert.equal(good?.visitorId, UUID);

  const bad = feedbackRow({ kind: 'generation', sentiment: 'negative', generationId: 'or 1=1', visitorId: 'nope' });
  assert.ok(bad);
  assert.equal(bad.generationId, null);
  assert.equal(bad.visitorId, null);
});

test('a variant id is a slug, so the column cannot become free text', () => {
  assert.equal(feedbackRow({ kind: 'generation', sentiment: 'negative', variantId: 'ltc01' })?.variantId, 'ltc01');
  assert.equal(
    feedbackRow({ kind: 'generation', sentiment: 'negative', variantId: 'the one with the blue bar' })?.variantId,
    null,
  );
});

test('the generation reason vocabulary is the 0011 set minus the two the APP writes', () => {
  // The join that keeps this from becoming a second feedback system: a reason picked in the
  // card and a reason recorded by a discard have to be directly comparable. `regenerated` and
  // `closed` are written when a result is replaced or the wizard is closed - implicit signals,
  // not answers to "what was wrong" - so they are the only difference.
  assert.deepEqual(
    [...LITE_DISCARD_REASONS].sort(),
    [...IMPLICIT_DISCARD_REASONS, ...GENERATION_FEEDBACK_REASONS].sort(),
  );
  for (const implicit of IMPLICIT_DISCARD_REASONS) {
    assert.equal(
      (GENERATION_FEEDBACK_REASONS as readonly string[]).includes(implicit),
      false,
      `${implicit} is written by the app and must not be offered as a reason to pick`,
    );
  }
});
