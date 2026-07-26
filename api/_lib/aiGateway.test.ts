import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  executeGatewayRequest,
  GatewayError,
  validateGatewayBody,
} from './aiGateway.ts';
import { readUserAiKeys, userAiKeysCookie } from './aiCredentials.ts';
import type { AiGatewayRequestBody, AiProviderId } from '../../src/ai/modelTypes.ts';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.AI_RETRY_LIMIT = '0';
  delete process.env.AI_MODEL_PRICING_JSON;
});

afterEach(() => {
  process.env = { ...originalEnv };
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
