// The eligibility checklist, pinned offline against no network.
//
// Two things it has to get right, and both are one-directional risks: a model that CANNOT
// carry funded traffic must never read as eligible (that is how an unaffordable route reaches
// the free tier), and nothing here may ever claim a privacy property nobody audited.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APPROVED_MODEL_CATALOG,
  FUNDED_ROUTE_PRICE_CEILING,
  modelRouteKey,
} from '../aiModelCatalog.js';
import { blockingReasons, missingApprovedRoutes, modelEligibility } from './eligibility.js';
import type { AiDiscoveredModel } from '../../../src/ai/modelTypes.js';

const NOW = Date.parse('2026-07-31T12:00:00Z');

function model(overrides: Partial<AiDiscoveredModel> = {}): AiDiscoveredModel {
  return {
    provider: 'openrouter',
    id: 'vendor/cheap-model',
    name: 'Cheap Model',
    description: '',
    contextLength: 131_072,
    maxOutputTokens: 8_192,
    inputPerMillion: 0.05,
    outputPerMillion: 0.15,
    inputModalities: ['text'],
    supportsStructuredOutput: true,
    supportsTools: false,
    supportsSeed: false,
    free: false,
    openWeight: true,
    available: true,
    createdAt: '2026-07-20T00:00:00Z',
    revision: null,
    source: 'openrouter-models-api',
    ...overrides,
  };
}

test('a cheap, available, structured-output OpenRouter model is eligible with no blocks', () => {
  const [row] = modelEligibility([model()], { now: NOW });
  assert.deepEqual(row.blocks, []);
  assert.equal(row.verdict, 'eligible');
  assert.equal(row.approved, false);
});

test('each ceiling is enforced on its own, so a cheap input cannot subsidize a dear output', () => {
  const dearOutput = model({ outputPerMillion: FUNDED_ROUTE_PRICE_CEILING.outputPerMillion + 0.01 });
  assert.deepEqual(blockingReasons(dearOutput), ['over-price-ceiling']);

  const dearInput = model({ inputPerMillion: FUNDED_ROUTE_PRICE_CEILING.inputPerMillion + 0.01 });
  assert.deepEqual(blockingReasons(dearInput), ['over-price-ceiling']);

  // Exactly at the ceiling is inside it - the constant is the price a funded route MAY cost.
  const atCeiling = model({
    inputPerMillion: FUNDED_ROUTE_PRICE_CEILING.inputPerMillion,
    outputPerMillion: FUNDED_ROUTE_PRICE_CEILING.outputPerMillion,
  });
  assert.deepEqual(blockingReasons(atCeiling), []);
});

test('an unpriced model is blocked rather than treated as free', () => {
  assert.deepEqual(blockingReasons(model({ inputPerMillion: null })), ['price-unknown']);
  assert.deepEqual(blockingReasons(model({ outputPerMillion: null })), ['price-unknown']);
  // And it is reported once, not twice - an unknown price cannot also be over a ceiling.
  assert.equal(blockingReasons(model({ inputPerMillion: null })).length, 1);
});

test('a non-OpenRouter provider is never funded-eligible however cheap it is', () => {
  const blocks = blockingReasons(model({ provider: 'huggingface', inputPerMillion: 0, outputPerMillion: 0 }));
  assert.ok(blocks.indexOf('not-funded-provider') !== -1);
});

test('missing structured output and unavailability each block on their own', () => {
  assert.deepEqual(blockingReasons(model({ supportsStructuredOutput: false })), ['no-structured-output']);
  assert.deepEqual(blockingReasons(model({ available: false })), ['unavailable']);
  // Several failures are all reported, so fixing one does not reveal the next a page later.
  const blocks = blockingReasons(model({ available: false, supportsStructuredOutput: false, inputPerMillion: null }));
  assert.deepEqual(blocks.slice().sort(), ['no-structured-output', 'price-unknown', 'unavailable']);
});

test('ZDR is reported as audited only for a catalog route, never inferred from a listing', () => {
  const approvedRoute = APPROVED_MODEL_CATALOG[0].route;
  const rows = modelEligibility(
    [model({ provider: approvedRoute.provider, id: approvedRoute.model }), model()],
    { now: NOW },
  );

  const [known, unknown] = rows;
  assert.equal(known.approved, true);
  assert.equal(known.verdict, 'approved');
  assert.equal(known.zdr, 'audited');
  assert.equal(known.zdrAvailable, APPROVED_MODEL_CATALOG[0].zdrAvailable);

  // The discovered-only model reports unknown and carries NO boolean at all. A `false` here
  // would read as "audited and refused", which is a different and equally unfounded claim.
  assert.equal(unknown.zdr, 'unknown');
  assert.equal(unknown.zdrAvailable, null);
});

test('an approved route stays approved even when the live listing would block it', () => {
  // Prices move. A catalog entry that has drifted above the ceiling is a promotion decision to
  // revisit, not something this page may silently reclassify - so the verdict still says
  // approved and the blocks say why it would not pass today.
  const approvedRoute = APPROVED_MODEL_CATALOG[0].route;
  const [row] = modelEligibility(
    [model({ provider: approvedRoute.provider, id: approvedRoute.model, outputPerMillion: 99 })],
    { now: NOW },
  );
  assert.equal(row.verdict, 'approved');
  assert.deepEqual(row.blocks, ['over-price-ceiling']);
});

test('"new" means recently listed AND not already approved', () => {
  const rows = modelEligibility(
    [
      model({ id: 'vendor/just-listed', createdAt: '2026-07-25T00:00:00Z' }),
      model({ id: 'vendor/old-news', createdAt: '2025-01-01T00:00:00Z' }),
      model({ id: 'vendor/undated', createdAt: null }),
      model({
        provider: APPROVED_MODEL_CATALOG[0].route.provider,
        id: APPROVED_MODEL_CATALOG[0].route.model,
        createdAt: '2026-07-25T00:00:00Z',
      }),
    ],
    { now: NOW },
  );
  assert.deepEqual(
    rows.map((row) => row.isNew),
    [true, false, false, false],
  );
});

test('nothing in a row can carry provider prose or a quality claim', () => {
  const [row] = modelEligibility(
    [model({ description: 'THE BEST MODEL EVER, rated 10/10 by its vendor' })],
    { now: NOW },
  );
  const serialized = JSON.stringify(row).toLowerCase();
  assert.ok(serialized.indexOf('best model') === -1, 'the provider description must not be forwarded');
  for (const word of ['score', 'rank', 'rating', 'recommend']) {
    assert.ok(serialized.indexOf(word) === -1, `a row must not carry a ${word}`);
  }
});

test('an approved route the provider stopped listing is reported as missing', () => {
  const approved = APPROVED_MODEL_CATALOG.filter((entry) => entry.route.provider === 'openrouter');
  assert.ok(approved.length > 1, 'this test needs more than one approved OpenRouter route');

  const listed = model({ id: approved[0].route.model });
  const missing = missingApprovedRoutes([listed], 'openrouter');
  assert.ok(missing.indexOf(modelRouteKey(approved[0].route)) === -1);
  assert.ok(missing.indexOf(modelRouteKey(approved[1].route)) !== -1);

  // A provider with no approved routes has nothing to be missing.
  assert.deepEqual(missingApprovedRoutes([], 'a-provider-with-no-routes'), []);
});

test('in-use marks the routes the task registry actually points at, and nothing else', () => {
  const live = model({ id: 'vendor/live-primary' });
  const spare = model({ id: 'vendor/live-fallback' });
  const idle = model({ id: 'vendor/nobody-calls-this' });
  const usedBy = new Map([
    ['openrouter:vendor/live-primary', [{ task: 'NoaCG Lite', slot: 'primary' as const }]],
    ['openrouter:vendor/live-fallback', [{ task: 'NoaCG Lite', slot: 'fallback' as const }]],
  ]);

  const rows = modelEligibility([live, spare, idle], { now: NOW, usedBy });
  const byModel = new Map(rows.map((row) => [row.model, row]));
  assert.deepEqual(byModel.get('vendor/live-primary')?.usedBy, [{ task: 'NoaCG Lite', slot: 'primary' }]);
  assert.deepEqual(byModel.get('vendor/live-fallback')?.usedBy, [{ task: 'NoaCG Lite', slot: 'fallback' }]);
  // The overwhelming majority of a 247-model listing is used by nothing. An empty array, never
  // undefined - the page maps over it without a guard.
  assert.deepEqual(byModel.get('vendor/nobody-calls-this')?.usedBy, []);
});

test('omitting the in-use map leaves every route unmarked rather than throwing', () => {
  // Callers that only want eligibility (and the tests above) pass no map at all.
  const [row] = modelEligibility([model()], { now: NOW });
  assert.deepEqual(row.usedBy, []);
});

test('approved and in-use are independent facts', () => {
  // An approved route carrying no traffic, and a live route nobody approved, must both be
  // representable - conflating them is how "we audited it" turns into "it is running".
  const approvedIdle = model({ id: APPROVED_MODEL_CATALOG[0].route.model });
  const liveUnapproved = model({ id: 'vendor/hot-swap' });
  const rows = modelEligibility([approvedIdle, liveUnapproved], {
    now: NOW,
    usedBy: new Map([['openrouter:vendor/hot-swap', [{ task: 'Import analysis', slot: 'primary' as const }]]]),
  });
  const [approved, live] = rows;
  assert.equal(approved.approved, true);
  assert.deepEqual(approved.usedBy, []);
  assert.equal(live.approved, false);
  assert.equal(live.usedBy[0]?.slot, 'primary');
});
