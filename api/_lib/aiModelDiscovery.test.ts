import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  directModel,
  modelPriceKey,
  normalizedHuggingFace,
  normalizedVercelGateway,
  pricedDirectModels,
  type CatalogFacts,
} from './aiModelDiscovery.js';

test('normalizes gateway capabilities, per-token pricing, and free routes', () => {
  // A real listing entry's shape (GET https://ai-gateway.vercel.sh/v1/models), not a
  // hand-invented one: the gateway publishes capabilities as TAGS and prices per token as
  // decimal STRINGS, and carries no per-parameter support matrix at all.
  const model = normalizedVercelGateway({
    id: 'vendor/coder',
    name: 'Coder',
    created: 1_785_254_546,
    context_window: 131_072,
    max_tokens: 32_768,
    type: 'language',
    tags: ['tool-use', 'vision', 'free'],
    modalities: { input: ['text', 'image'], output: ['text'] },
    supported_parameters: ['max_tokens', 'temperature', 'tools', 'tool_choice', 'seed'],
    pricing: { input: '0', output: '0' },
  });
  assert.ok(model);
  assert.equal(model.free, true);
  assert.equal(model.contextLength, 131_072);
  assert.equal(model.maxOutputTokens, 32_768);
  assert.deepEqual(model.inputModalities, ['text', 'image']);
  // Structured output is read off the `tool-use` tag, because the gateway publishes no
  // structured-output flag anywhere. Reading a `structured_outputs` parameter that does not
  // exist would mark every model in the listing incapable and empty the picker.
  assert.equal(model.supportsStructuredOutput, true);
  assert.equal(model.supportsTools, true);
  assert.equal(model.supportsSeed, true);
  // Open-weight status is not published by the gateway. False means "not stated"; the audited
  // catalog carries the promotion-time flag.
  assert.equal(model.openWeight, false);
  assert.equal(model.available, true);
});

test('a model without the tool-use tag cannot be trusted with a forced schema', () => {
  // The mutation twin of the assertion above: if supportsStructuredOutput were hardcoded true,
  // the picker would offer models that fail on the harness's first call.
  const model = normalizedVercelGateway({
    id: 'vendor/plain',
    type: 'language',
    tags: [],
    modalities: { input: ['text'], output: ['text'] },
    pricing: { input: '0.0000005', output: '0.000001' },
  });
  assert.ok(model);
  assert.equal(model.supportsStructuredOutput, false);
  assert.equal(model.inputPerMillion, 0.5);
  assert.equal(model.outputPerMillion, 1);
});

test('a deprecated model is reported unavailable rather than silently listed', () => {
  const model = normalizedVercelGateway({
    id: 'vendor/retired',
    type: 'language',
    tags: ['tool-use'],
    modalities: { input: ['text'], output: ['text'] },
    pricing: { input: '0.000001', output: '0.000002' },
    deprecated_at: '2020-01-01T00:00:00.000Z',
  });
  assert.ok(model);
  assert.equal(model.available, false);
});

test('keeps only live structured Hugging Face endpoints as available inference routes', () => {
  const model = normalizedHuggingFace({
    id: 'vendor/open-coder',
    architecture: { input_modalities: ['text'] },
    providers: [
      {
        provider: 'broken',
        status: 'error',
        supports_structured_output: true,
        pricing: { input: 0.1, output: 0.2 },
      },
      {
        provider: 'live',
        status: 'live',
        supports_structured_output: true,
        supports_tools: true,
        context_length: 65_536,
        pricing: { input: 0.3, output: 0.8 },
      },
    ],
  });
  assert.ok(model);
  assert.equal(model.available, true);
  assert.equal(model.contextLength, 65_536);
  assert.equal(model.inputPerMillion, 0.3);
  assert.equal(model.outputPerMillion, 0.8);
});

test('an image route reports the gateway price PER IMAGE, in the gateway unit it publishes', () => {
  // Vercel publishes `pricing.image` as dollars for ONE generated image. The OpenRouter field
  // this replaced (`image_output`) was per million output image tokens, and carrying the old
  // unit forward would have shown a $0.03 image as "$0.03 per million" - off by six orders of
  // magnitude on a money column, which is worse than showing nothing.
  const model = normalizedVercelGateway({
    id: 'vendor/imagen',
    name: 'Imagen',
    type: 'image',
    modalities: { input: ['text'], output: ['image'] },
    pricing: { input: '0.0000005', image: '0.03' },
  });
  assert.ok(model);
  assert.equal(model.imagePriceUsd, 0.03);
});

test('the price key spans the two ways one model is named', () => {
  // Verified against the live gateway listing on 2026-08-14: 72 language models for the three
  // direct vendors, no two normalizing alike, and the dated/dotted direct ids landing on their
  // catalog twin. A direct API answers with `claude-sonnet-4-5-20250929`; the price book calls
  // the same model `anthropic/claude-sonnet-4.5`.
  assert.equal(modelPriceKey('claude-sonnet-4-5-20250929'), modelPriceKey('anthropic/claude-sonnet-4.5'));
  assert.equal(modelPriceKey('gpt-4o-2024-08-06'), modelPriceKey('openai/gpt-4o'));
  assert.equal(modelPriceKey('gemini-2.5-flash'), modelPriceKey('google/gemini-2.5-flash'));
  assert.equal(modelPriceKey('gemini-2.5-flash-latest'), modelPriceKey('google/gemini-2.5-flash'));
  // Two genuinely different models must NOT collapse - a wrong price is worse than none.
  assert.notEqual(modelPriceKey('claude-opus-4.8'), modelPriceKey('claude-opus-4.8-fast'));
  assert.notEqual(modelPriceKey('gpt-5.6-luna'), modelPriceKey('gpt-5.6-sol'));
});

test('a direct-provider row is priced from the catalog and filtered to schema-capable models', () => {
  const facts = new Map<string, CatalogFacts>([
    [modelPriceKey('anthropic/claude-sonnet-4.5'), {
      inputPerMillion: 3,
      outputPerMillion: 15,
      contextLength: 200_000,
      maxOutputTokens: 64_000,
      supportsStructuredOutput: true,
    }],
    [modelPriceKey('anthropic/claude-legacy'), {
      inputPerMillion: 1,
      outputPerMillion: 2,
      contextLength: 100_000,
      maxOutputTokens: 4_096,
      supportsStructuredOutput: false,
    }],
  ]);
  const rows = pricedDirectModels(
    [
      directModel('anthropic', 'anthropic-api', 'claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5'),
      directModel('anthropic', 'anthropic-api', 'claude-legacy', 'Claude Legacy'),
      directModel('anthropic', 'anthropic-api', 'claude-unlisted', 'Claude Unlisted'),
    ],
    facts,
  );
  // Priced, and only the model the harness's forced schema can actually run on. The unlisted
  // id is not refused anywhere - the model box takes free text - it is simply not suggested.
  assert.deepEqual(rows.map((row) => row.id), ['claude-sonnet-4-5-20250929']);
  assert.equal(rows[0].inputPerMillion, 3);
  assert.equal(rows[0].outputPerMillion, 15);
  assert.equal(rows[0].contextLength, 200_000);
});

test('an unreachable price book costs prices, never the listing', () => {
  // The mutation twin: filtering against an EMPTY book would drop every model and read as
  // "your key offers nothing", which is a lie about the account rather than about a price.
  const rows = pricedDirectModels(
    [directModel('google', 'google-generative-ai', 'gemini-2.5-flash', 'gemini-2.5-flash')],
    new Map<string, CatalogFacts>(),
  );
  assert.deepEqual(rows.map((row) => row.id), ['gemini-2.5-flash']);
  assert.equal(rows[0].inputPerMillion, null);
});

test('a model that publishes no per-image price reports null, never zero', () => {
  // Which is the normal case for the routes NoaCG actually uses: the Pro concept model is a
  // multimodal LANGUAGE model that answers with an image and bills through output tokens, so
  // it has no per-image price and must not be shown as free.
  const model = normalizedVercelGateway({
    id: 'google/gemini-3.1-flash-image',
    type: 'language',
    tags: ['image-generation', 'vision'],
    modalities: { input: ['text', 'image'], output: ['text', 'image'] },
    pricing: { input: '0.0000005', output: '0.000003' },
  });
  assert.ok(model);
  assert.equal(model.imagePriceUsd, null);
  assert.equal(model.outputPerMillion, 3);
});
