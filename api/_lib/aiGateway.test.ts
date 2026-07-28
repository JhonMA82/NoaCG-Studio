import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  executeGatewayRequest,
  GatewayError,
  validateGatewayBody,
} from './aiGateway.js';
import { readUserAiKeys, userAiKeysCookie } from './aiCredentials.js';
import type { AiGatewayRequestBody, AiProviderId } from '../../src/ai/modelTypes.js';

const CONTROLLED_ENV = [
  'AI_KEY_ENCRYPTION_SECRET',
  'AI_MODEL_PRICING_JSON',
  'AI_RETRY_LIMIT',
  'PUBLIC_APP_URL',
] as const;
const originalEnv = new Map(CONTROLLED_ENV.map((name) => [name, process.env[name]]));

beforeEach(() => {
  for (const name of CONTROLLED_ENV) delete process.env[name];
  process.env.AI_RETRY_LIMIT = '0';
});

afterEach(() => {
  for (const name of CONTROLLED_ENV) {
    const value = originalEnv.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function body(provider: AiProviderId = 'anthropic', model = 'test-model'): AiGatewayRequestBody {
  return {
    route: { provider, model },
    request: {
      system: 'Return a concise answer.',
      messages: [{ role: 'user', content: 'Hello' }],
      maxTokens: 100,
    },
  };
}

const keyFor = async () => 'server-side-test-key';

test('selects OpenAI Responses and normalizes usage and configured cost', async () => {
  process.env.AI_MODEL_PRICING_JSON = JSON.stringify({
    'openai:test-model': { inputPerMillion: 2, outputPerMillion: 8 },
  });
  let calledUrl = '';
  let sent: Record<string, unknown> = {};
  const result = await executeGatewayRequest(body('openai'), {
    keyFor,
    fetchImpl: async (input, init) => {
      calledUrl = String(input);
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
        usage: { input_tokens: 100, output_tokens: 25 },
      }));
    },
  });

  assert.equal(calledUrl, 'https://api.openai.com/v1/responses');
  assert.equal(sent.model, 'test-model');
  assert.equal(sent.instructions, 'Return a concise answer.');
  assert.deepEqual(result.usage, {
    inputTokens: 100,
    outputTokens: 25,
    totalTokens: 125,
    estimatedCost: { amount: 0.0004, currency: 'USD', source: 'configured' },
  });
  assert.equal(result.provider, 'openai');
});

test('selects OpenRouter through its OpenAI-compatible endpoint', async () => {
  delete process.env.PUBLIC_APP_URL;
  let calledUrl = '';
  let sentHeaders = new Headers();
  const result = await executeGatewayRequest(body('openrouter', 'vendor/model'), {
    keyFor,
    fetchImpl: async (input, init) => {
      calledUrl = String(input);
      sentHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 8, completion_tokens: 3, cost: 0.002 },
      }));
    },
  });

  assert.equal(calledUrl, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(sentHeaders.get('http-referer'), null);
  assert.equal(sentHeaders.get('x-title'), 'NoaCG Studio');
  assert.equal(result.model, 'vendor/model');
  assert.deepEqual(result.usage.estimatedCost, { amount: 0.002, currency: 'USD', source: 'provider' });
});

test('sends a configured public app URL as OpenRouter attribution', async () => {
  process.env.PUBLIC_APP_URL = 'https://noacg-studio.vercel.app';
  let sentHeaders = new Headers();
  await executeGatewayRequest(body('openrouter', 'vendor/model'), {
    keyFor,
    fetchImpl: async (_input, init) => {
      sentHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }));
    },
  });

  assert.equal(sentHeaders.get('http-referer'), 'https://noacg-studio.vercel.app');
});

test('selects Hugging Face through its OpenAI-compatible inference router', async () => {
  const routed = body('huggingface', 'openai/gpt-oss-120b');
  routed.request.temperature = 0.2;
  routed.request.seed = 41723;
  let calledUrl = '';
  let sent: Record<string, unknown> = {};
  const result = await executeGatewayRequest(routed, {
    keyFor,
    fetchImpl: async (input, init) => {
      calledUrl = String(input);
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 7, completion_tokens: 2 },
      }));
    },
  });

  assert.equal(calledUrl, 'https://router.huggingface.co/v1/chat/completions');
  assert.equal(sent.model, 'openai/gpt-oss-120b');
  assert.equal(sent.temperature, 0.2);
  assert.equal(sent.seed, 41723);
  assert.equal(result.provider, 'huggingface');
  assert.deepEqual(result.usage, { inputTokens: 7, outputTokens: 2, totalTokens: 9 });
});

test('enforces managed OpenRouter privacy, endpoint, parameter, fallback, and price controls', async () => {
  let sent: Record<string, unknown> = {};
  const result = await executeGatewayRequest(body('openrouter', 'vendor/model'), {
    keyFor,
    fetchImpl: async (_input, init) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 8,
          prompt_tokens_details: { cached_tokens: 12 },
          completion_tokens_details: { reasoning_tokens: 3 },
          cost: 0.0004,
        },
      }));
    },
  }, {
    maxAttempts: 1,
    retryLimit: 0,
    timeoutMs: 5000,
    openRouter: {
      zdr: true,
      dataCollection: 'deny',
      requireParameters: true,
      allowProviderFallbacks: false,
      only: ['audited/provider'],
      maxInputPerMillion: 0.11,
      maxOutputPerMillion: 0.8,
    },
  });

  const provider = sent.provider as Record<string, unknown>;
  const maxPrice = provider.max_price as Record<string, number>;
  assert.deepEqual({ ...provider, max_price: undefined }, {
    zdr: true,
    data_collection: 'deny',
    require_parameters: true,
    allow_fallbacks: false,
    only: ['audited/provider'],
    max_price: undefined,
  });
  assert.equal(maxPrice.prompt, 0.11);
  assert.equal(maxPrice.completion, 0.8);
  assert.equal(result.usage.cachedInputTokens, 12);
  assert.equal(result.usage.reasoningTokens, 3);
});

test('supports forced-tool structured output through OpenRouter', async () => {
  const structured = body('openrouter', 'vendor/tool-model');
  structured.request.structuredOutput = {
    name: 'result',
    description: 'A required title.',
    schema: {
      type: 'object',
      required: ['title'],
      additionalProperties: false,
      properties: { title: { type: 'string' } },
    },
  };
  let sent: Record<string, unknown> = {};
  const result = await executeGatewayRequest(structured, {
    keyFor,
    fetchImpl: async (_input, init) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              type: 'function',
              function: {
                name: 'result',
                arguments: JSON.stringify({ title: 'Lower third' }),
              },
            }],
          },
        }],
        usage: { prompt_tokens: 8, completion_tokens: 3, cost: 0.0001 },
      }));
    },
  }, {
    maxAttempts: 1,
    retryLimit: 0,
    timeoutMs: 5000,
    openRouter: {
      zdr: false,
      dataCollection: 'deny',
      requireParameters: true,
      allowProviderFallbacks: false,
      only: ['audited/no-training-provider'],
      maxInputPerMillion: 0.1,
      maxOutputPerMillion: 0.2,
      structuredOutputMode: 'tool',
    },
  });

  assert.equal('response_format' in sent, false);
  assert.equal(Array.isArray(sent.tools), true);
  assert.deepEqual(result.output, { title: 'Lower third' });
  assert.equal((sent.provider as Record<string, unknown>).zdr, false);
});

test('reports a missing key before making a provider request', async () => {
  let called = false;
  await assert.rejects(
    executeGatewayRequest(body(), {
      keyFor: async () => '',
      fetchImpl: async () => {
        called = true;
        return new Response();
      },
    }),
    (error: unknown) => error instanceof GatewayError && error.code === 'missing_key',
  );
  assert.equal(called, false);
});

test('rejects malformed provider responses', async () => {
  await assert.rejects(
    executeGatewayRequest(body('openai'), {
      keyFor,
      fetchImpl: async () => new Response(JSON.stringify({ output: [] })),
    }),
    (error: unknown) => error instanceof GatewayError && error.code === 'malformed_response',
  );
});

test('validates structured output after the provider parses it', async () => {
  const structured = body('anthropic');
  structured.request.structuredOutput = {
    name: 'result',
    description: 'A required title.',
    schema: {
      type: 'object',
      required: ['title'],
      additionalProperties: false,
      properties: { title: { type: 'string' } },
    },
  };
  await assert.rejects(
    executeGatewayRequest(structured, {
      keyFor,
      fetchImpl: async () => new Response(JSON.stringify({
        content: [{ type: 'tool_use', name: 'result', input: { wrong: true } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 4 },
      })),
    }),
    (error: unknown) => error instanceof GatewayError && error.code === 'malformed_response',
  );
});

test('enforces structured string and numeric constraints at the gateway boundary', async () => {
  const structured = body('anthropic');
  structured.request.structuredOutput = {
    name: 'result',
    description: 'A bounded color and scale.',
    schema: {
      type: 'object',
      required: ['color', 'scale'],
      additionalProperties: false,
      properties: {
        color: {
          type: 'string',
          maxLength: 9,
          pattern: '^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$',
        },
        scale: { type: 'number', minimum: 0.7, maximum: 1.4 },
      },
    },
  };
  await assert.rejects(
    executeGatewayRequest(structured, {
      keyFor,
      fetchImpl: async () => new Response(JSON.stringify({
        content: [{
          type: 'tool_use',
          name: 'result',
          input: { color: 'red; background: url(https://example.test)', scale: 99 },
        }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 4 },
      })),
    }),
    (error: unknown) => error instanceof GatewayError && error.code === 'malformed_response',
  );
});

test('uses an explicitly ordered fallback but never invents one', async () => {
  const routed = body('anthropic', 'primary');
  routed.fallbacks = [{ provider: 'openai', model: 'fallback' }];
  const calls: string[] = [];
  const result = await executeGatewayRequest(routed, {
    keyFor,
    fetchImpl: async (input) => {
      calls.push(String(input));
      if (String(input).includes('anthropic.com')) return new Response('{}', { status: 503 });
      return new Response(JSON.stringify({
        output: [{ content: [{ type: 'output_text', text: 'fallback ok' }] }],
        usage: { input_tokens: 3, output_tokens: 2 },
      }));
    },
  });
  assert.equal(result.provider, 'openai');
  assert.deepEqual(calls, [
    'https://api.anthropic.com/v1/messages',
    'https://api.openai.com/v1/responses',
  ]);

  const primaryOnlyCalls: string[] = [];
  await assert.rejects(executeGatewayRequest(body('anthropic'), {
    keyFor,
    fetchImpl: async (input) => {
      primaryOnlyCalls.push(String(input));
      return new Response('{}', { status: 503 });
    },
  }));
  assert.deepEqual(primaryOnlyCalls, ['https://api.anthropic.com/v1/messages']);
});

test('retries a transient failure only within the configured bound', async () => {
  process.env.AI_RETRY_LIMIT = '1';
  let calls = 0;
  const result = await executeGatewayRequest(body('openai'), {
    keyFor,
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response('{}', { status: 503 });
      return new Response(JSON.stringify({
        output: [{ content: [{ type: 'output_text', text: 'ok' }] }],
        usage: { input_tokens: 2, output_tokens: 1 },
      }));
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(result.attempts, [{
    route: { provider: 'openai', model: 'test-model' },
    attempts: 2,
  }]);
});

test('shares a hard attempt ceiling across retries and fallback routes', async () => {
  const routed = body('anthropic', 'primary');
  routed.fallbacks = [{ provider: 'openai', model: 'fallback' }];
  const calls: string[] = [];
  await assert.rejects(executeGatewayRequest(routed, {
    keyFor,
    sleep: async () => {},
    fetchImpl: async (input) => {
      calls.push(String(input));
      return new Response('{}', { status: 503 });
    },
  }, { maxAttempts: 2, retryLimit: 2 }));
  assert.equal(calls.length, 2);
  assert.equal(calls.every((url) => url.includes('anthropic.com')), true);
});

test('never includes provider secrets or upstream error text in errors', async () => {
  const secret = 'sk-secret-must-not-leak';
  let caught = '';
  try {
    await executeGatewayRequest(body('openai'), {
      keyFor: async () => secret,
      fetchImpl: async () => new Response(
        JSON.stringify({ error: { message: `bad credential ${secret}` } }),
        { status: 401 },
      ),
    });
  } catch (error) {
    caught = error instanceof Error ? error.message : String(error);
  }
  assert.equal(caught, 'The AI provider rejected its server-side credential.');
  assert.equal(caught.includes(secret), false);
});

test('rejects invalid provider selection and malformed request bodies', () => {
  assert.throws(
    () => validateGatewayBody({
      route: { provider: 'unknown', model: 'x' },
      request: { system: 'x', messages: [{ role: 'user', content: 'x' }] },
    }),
    (error: unknown) => error instanceof GatewayError && error.code === 'invalid_request',
  );
});

test('seals user keys in a tamper-evident HttpOnly cookie', () => {
  const secret = 'sk-user-secret-never-browser-readable';
  process.env.AI_KEY_ENCRYPTION_SECRET = 'test-only-encryption-secret-with-more-than-32-characters';
  const request = new Request('http://localhost/api/ai/credentials', {
    headers: { origin: 'http://localhost' },
  });
  const cookie = userAiKeysCookie(request, { openai: secret });

  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(cookie.includes(secret), false);

  const value = cookie.split(';')[0];
  const restored = readUserAiKeys(new Request('http://localhost/api/ai/config', {
    headers: { cookie: value },
  }));
  assert.deepEqual(restored, { openai: secret });

  const tampered = `${value.slice(0, -1)}${value.endsWith('A') ? 'B' : 'A'}`;
  assert.deepEqual(readUserAiKeys(new Request('http://localhost/api/ai/config', {
    headers: { cookie: tampered },
  })), {});
});
