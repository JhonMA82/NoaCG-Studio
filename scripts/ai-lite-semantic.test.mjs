import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildApiRuntime } from './api-runtime-build.mjs';
import { LITE_SEMANTIC_FIXTURES } from './ai-lite-semantic-fixtures.mjs';

const runtime = await buildApiRuntime(['api/_lib/aiLiteProfile.ts']);
const contract = await import(pathToFileURL(path.join(runtime.outputDir, 'src/ai/liteContract.js')).href);
after(async () => { await runtime.cleanup(); });

test('one registry owns the complete lower-third contract', () => {
  assert.equal(contract.CATEGORY_CONTRACTS.length, 1);
  const lowerThird = contract.categoryContract('lower-third');
  assert.deepEqual(lowerThird.visibleFields, { min: 1, max: 4 });
  assert.deepEqual(lowerThird.operatorEvents, ['play', 'update', 'next', 'stop']);
  assert.equal(lowerThird.stateMachine.owner, 'graphic-type');
  assert.equal(lowerThird.compatibleReferenceChassis.length, contract.LITE_CATALOG.length);
});

test('locked semantic briefs retrieve a relevant, small, diverse reference set', () => {
  for (const fixture of LITE_SEMANTIC_FIXTURES) {
    const result = contract.retrieveLiteReferenceSet(fixture.request);
    assert.ok(result.entries.length >= 3 && result.entries.length <= contract.LITE_REFERENCE_LIMIT, fixture.id);
    assert.ok(fixture.expectedReferences.includes(result.entries[0].variantId), `${fixture.id}: ${result.entries[0].variantId}`);
    assert.ok(new Set(result.entries.map((entry) => entry.style)).size >= 2, `${fixture.id}: references collapsed`);
  }
});

test('locked decisions satisfy category, slots, capacity, and structured style semantics', () => {
  for (const fixture of LITE_SEMANTIC_FIXTURES) {
    const result = contract.validateLiteDecision(fixture.decision, fixture.request);
    assert.deepEqual(result.errors, [], `${fixture.id}: ${result.errors.join(', ')}`);
    assert.equal(result.decision?.status, 'ready', fixture.id);
  }
});

test('manual category wins and ambiguous auto inference returns choices', () => {
  const fixture = structuredClone(LITE_SEMANTIC_FIXTURES[2]);
  fixture.decision.spec.categoryInference.category = 'title';
  assert.ok(contract.validateLiteDecision(fixture.decision, fixture.request).errors.includes('manual_category_ignored'));

  const ambiguous = structuredClone(LITE_SEMANTIC_FIXTURES[0]);
  ambiguous.decision.spec.categoryInference.confidence = 0.61;
  ambiguous.decision.spec.categoryInference.alternatives = [
    { category: 'title', confidence: 0.56, reason: 'The wording may describe an opening title.' },
  ];
  const result = contract.validateLiteDecision(ambiguous.decision, ambiguous.request);
  assert.equal(result.decision?.status, 'unsupported');
  assert.equal(result.decision?.code, 'category-ambiguous');
  assert.equal(result.decision?.categoryChoices?.length, 2);
});

test('the output schema requires inference and every style-intent axis', () => {
  const spec = contract.LITE_READY_OUTPUT.schema.properties.spec;
  assert.ok(spec.required.includes('categoryInference'));
  assert.ok(spec.required.includes('styleIntent'));
  assert.deepEqual(spec.properties.styleIntent.required.sort(), [
    'energy', 'era', 'material', 'mood', 'motion', 'paletteDirection', 'shapeLanguage',
    'texture', 'typographyCharacter',
  ]);
});
