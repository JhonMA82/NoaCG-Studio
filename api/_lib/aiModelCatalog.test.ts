import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizedHuggingFace, normalizedOpenRouter } from './aiModelCatalog.js';

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
