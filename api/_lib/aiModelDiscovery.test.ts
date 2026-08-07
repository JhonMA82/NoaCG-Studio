import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizedHuggingFace, normalizedVercelGateway } from './aiModelDiscovery.js';

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
