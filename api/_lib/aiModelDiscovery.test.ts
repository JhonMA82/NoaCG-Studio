import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizedHuggingFace, normalizedOpenRouter } from './aiModelDiscovery.js';

test('normalizes OpenRouter video capabilities, per-token pricing, and free routes', () => {
  const model = normalizedOpenRouter({
    id: 'vendor/coder:free',
    canonical_slug: 'vendor/coder-20260728',
    name: 'Coder',
    created: 1_785_254_546,
    context_length: 131_072,
    hugging_face_id: 'vendor/coder',
    architecture: { input_modalities: ['text', 'image'] },
    pricing: { prompt: '0', completion: '0' },
    top_provider: { max_completion_tokens: 32_768 },
    supported_parameters: ['structured_outputs', 'tools', 'tool_choice', 'seed'],
    expiration_date: null,
  });
  assert.ok(model);
  assert.equal(model.free, true);
  assert.equal(model.openWeight, true);
  assert.equal(model.supportsStructuredOutput, true);
  assert.equal(model.supportsSeed, true);
  assert.equal(model.revision, 'vendor/coder-20260728');
  assert.equal(model.maxOutputTokens, 32_768);
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

test('an image route reads its price from image_output, not image', () => {
  // Measured against the live listing 2026-08-01: 38 of 40 image-output models publish
  // `image_output` and only 4 publish `image`, which prices an image the caller SENDS IN.
  // Where a model carries both they disagree by up to ~835x, so reading the wrong key does
  // not degrade to a blank - it prints a confident wrong price. These are real numbers from
  // x-ai/grok-imagine-image-quality.
  const model = normalizedOpenRouter({
    id: 'x-ai/grok-imagine-image-quality',
    name: 'Grok Imagine',
    pricing: { prompt: '0', completion: '0', image: '0.01', image_output: '0.00001197604790419162' },
  });
  assert.ok(model);
  assert.equal(Math.round((model.imageOutputPerMillion ?? 0) * 100) / 100, 11.98);
  // The vision-input price must not leak in: 0.01 per token would read as $10,000 per million.
  assert.notEqual(model.imageOutputPerMillion, 10_000);
});

test('a model that publishes no image_output price reports null, never zero', () => {
  const model = normalizedOpenRouter({ id: 'vendor/text-only', name: 'Text', pricing: { prompt: '0.0000005' } });
  assert.ok(model);
  assert.equal(model.imageOutputPerMillion, null);
});
