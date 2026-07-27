import {
  AI_PROVIDER_IDS,
  isAiProviderId,
  type AiGatewayErrorCode,
  type AiGatewayRequestBody,
  type AiProviderId,
  type ModelContentBlock,
  type ModelRequest,
  type ModelResult,
  type ModelRoute,
  type ModelUsage,
} from '../../src/ai/modelTypes.js';

type Fetch = typeof fetch;

export interface ProviderAdapter {
  id: AiProviderId;
  endpoint: string;
  createRequest(request: ModelRequest, route: ModelRoute, key: string, policy?: GatewayExecutionPolicy): RequestInit;
  parseResponse(data: unknown, request: ModelRequest, route: ModelRoute): { output: unknown; usage: ModelUsage };
}

export class GatewayError extends Error {
  readonly code: AiGatewayErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    code: AiGatewayErrorCode,
    message: string,
    status: number,
    retryable: boolean,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

const safeNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

function totalUsage(
  inputTokens: unknown,
  outputTokens: unknown,
  estimatedCost?: ModelUsage['estimatedCost'],
  cachedInputTokens?: unknown,
  reasoningTokens?: unknown,
): ModelUsage {
  const input = safeNumber(inputTokens);
  const output = safeNumber(outputTokens);
  const cached = safeNumber(cachedInputTokens);
  const reasoning = safeNumber(reasoningTokens);
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
    ...(cached ? { cachedInputTokens: cached } : {}),
    ...(reasoning ? { reasoningTokens: reasoning } : {}),
    ...(estimatedCost ? { estimatedCost } : {}),
  };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GatewayError('malformed_response', 'The AI provider returned an invalid response.', 502, false);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new GatewayError('malformed_response', 'The AI provider returned an invalid response.', 502, false);
  }
  return value;
}

function parseStructured(text: string): unknown {
  try {
    return object(JSON.parse(text));
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError('malformed_response', 'The AI provider returned an invalid structured result.', 502, false);
  }
}

function schemaAccepts(value: unknown, schemaValue: unknown): boolean {
  if (!schemaValue || typeof schemaValue !== 'object' || Array.isArray(schemaValue)) return false;
  const schema = schemaValue as Record<string, unknown>;
  if (Array.isArray(schema.oneOf)) {
    return schema.oneOf.filter((candidate) => schemaAccepts(value, candidate)).length === 1;
  }
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.some((candidate) => schemaAccepts(value, candidate));
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) return false;
  if (Array.isArray(schema.type)) {
    return schema.type.some((type) => schemaAccepts(value, { ...schema, type }));
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
      ? schema.properties as Record<string, unknown>
      : {};
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : [];
    if (required.some((key) => !(key in record))) return false;
    if (schema.additionalProperties === false && Object.keys(record).some((key) => !(key in properties))) return false;
    return Object.entries(record).every(([key, item]) => !(key in properties) || schemaAccepts(item, properties[key]));
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return false;
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) return false;
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) return false;
    return schema.items === undefined || value.every((item) => schemaAccepts(item, schema.items));
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') return false;
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) return false;
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) return false;
    if (typeof schema.pattern === 'string') {
      try {
        if (!new RegExp(schema.pattern).test(value)) return false;
      } catch {
        return false;
      }
    }
    return true;
  }
  if (schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    if (typeof schema.minimum === 'number' && value < schema.minimum) return false;
    if (typeof schema.maximum === 'number' && value > schema.maximum) return false;
    return true;
  }
  if (schema.type === 'integer') return Number.isInteger(value);
  if (schema.type === 'boolean') return typeof value === 'boolean';
  if (schema.type === 'null') return value === null;
  return schema.type === undefined;
}

function validateStructuredOutput(output: unknown, request: ModelRequest): void {
  if (request.structuredOutput && !schemaAccepts(output, request.structuredOutput.schema)) {
    throw new GatewayError('malformed_response', 'The model returned a result that did not match the required structure.', 502, false);
  }
}

function dataUrl(block: Extract<ModelContentBlock, { type: 'image' }>): string {
  return `data:${block.source.media_type};base64,${block.source.data}`;
}

function openAiInput(messages: ModelRequest['messages']): unknown[] {
  return messages.map((message) => {
    if (typeof message.content === 'string') return { role: message.role, content: message.content };
    const content = message.content.map((block) =>
      block.type === 'text'
        ? { type: message.role === 'assistant' ? 'output_text' : 'input_text', text: block.text }
        : { type: 'input_image', image_url: dataUrl(block), detail: 'auto' },
    );
    return { role: message.role, content };
  });
}

function chatContent(messages: ModelRequest['messages']): unknown[] {
  return messages.map((message) => {
    if (typeof message.content === 'string') return { role: message.role, content: message.content };
    return {
      role: message.role,
      content: message.content.map((block) =>
        block.type === 'text'
          ? { type: 'text', text: block.text }
          : { type: 'image_url', image_url: { url: dataUrl(block) } },
      ),
    };
  });
}

function providerCost(value: unknown): ModelUsage['estimatedCost'] {
  const amount = safeNumber(value);
  return amount > 0 ? { amount, currency: 'USD', source: 'provider' } : undefined;
}

export const anthropicAdapter: ProviderAdapter = {
  id: 'anthropic',
  endpoint: 'https://api.anthropic.com/v1/messages',
  createRequest(request, route, key) {
    const body = {
      model: route.model,
      max_tokens: request.maxTokens ?? 16000,
      system: request.cacheSystem
        ? [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }]
        : request.system,
      messages: request.messages,
      ...(request.structuredOutput
        ? {
            tools: [{
              name: request.structuredOutput.name,
              description: request.structuredOutput.description,
              input_schema: request.structuredOutput.schema,
            }],
            tool_choice: { type: 'tool', name: request.structuredOutput.name },
          }
        : {}),
    };
    return {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    };
  },
  parseResponse(value, request) {
    const data = object(value);
    if (data.stop_reason === 'max_tokens') {
      throw new GatewayError('malformed_response', 'The AI response was cut off. Try a simpler request.', 502, false);
    }
    const content = array(data.content).map(object);
    const usage = object(data.usage ?? {});
    let output: unknown;
    if (request.structuredOutput) {
      const call = content.find((item) => item.type === 'tool_use');
      if (!call || call.name !== request.structuredOutput.name || !('input' in call)) {
        throw new GatewayError('malformed_response', 'The model did not return the expected structured result.', 502, false);
      }
      output = object(call.input);
    } else {
      const text = content
        .filter((item) => item.type === 'text' && typeof item.text === 'string')
        .map((item) => item.text as string)
        .join('\n');
      if (!text) throw new GatewayError('malformed_response', 'The AI provider returned an empty response.', 502, false);
      output = text;
    }
    const inputTokens =
      safeNumber(usage.input_tokens)
      + safeNumber(usage.cache_creation_input_tokens)
      + safeNumber(usage.cache_read_input_tokens);
    return {
      output,
      usage: totalUsage(
        inputTokens,
        usage.output_tokens,
        undefined,
        usage.cache_read_input_tokens,
      ),
    };
  },
};

export const openAiAdapter: ProviderAdapter = {
  id: 'openai',
  endpoint: 'https://api.openai.com/v1/responses',
  createRequest(request, route, key) {
    const body = {
      model: route.model,
      instructions: request.system,
      input: openAiInput(request.messages),
      max_output_tokens: request.maxTokens ?? 16000,
      ...(request.structuredOutput
        ? {
            text: {
              format: {
                type: 'json_schema',
                name: request.structuredOutput.name,
                description: request.structuredOutput.description,
                // Existing NoaCG schemas contain optional fields. The server validates
                // every parsed result against the same schema before it reaches the harness.
                strict: false,
                schema: request.structuredOutput.schema,
              },
            },
          }
        : {}),
    };
    return {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    };
  },
  parseResponse(value, request) {
    const data = object(value);
    const incomplete = data.status === 'incomplete' ? object(data.incomplete_details ?? {}) : null;
    if (incomplete?.reason === 'max_output_tokens') {
      throw new GatewayError('malformed_response', 'The AI response was cut off. Try a simpler request.', 502, false);
    }
    const text = typeof data.output_text === 'string'
      ? data.output_text
      : array(data.output)
          .map(object)
          .flatMap((item) => Array.isArray(item.content) ? item.content.map(object) : [])
          .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
          .map((item) => item.text as string)
          .join('\n');
    if (!text) throw new GatewayError('malformed_response', 'The AI provider returned an empty response.', 502, false);
    const usage = object(data.usage ?? {});
    const inputDetails = data.usage && typeof data.usage === 'object'
      ? object(usage.input_tokens_details ?? {})
      : {};
    const outputDetails = data.usage && typeof data.usage === 'object'
      ? object(usage.output_tokens_details ?? {})
      : {};
    return {
      output: request.structuredOutput ? parseStructured(text) : text,
      usage: totalUsage(
        usage.input_tokens,
        usage.output_tokens,
        undefined,
        inputDetails.cached_tokens,
        outputDetails.reasoning_tokens,
      ),
    };
  },
};

export const openRouterAdapter: ProviderAdapter = {
  id: 'openrouter',
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  createRequest(request, route, key, policy) {
    const publicAppUrl = (process.env.PUBLIC_APP_URL ?? '').trim();
    const body = {
      model: route.model,
      messages: [{ role: 'system', content: request.system }, ...chatContent(request.messages)],
      max_tokens: request.maxTokens ?? 16000,
      ...(request.structuredOutput
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: request.structuredOutput.name,
                description: request.structuredOutput.description,
                strict: false,
                schema: request.structuredOutput.schema,
              },
            },
          }
        : {}),
      ...(policy?.openRouter
        ? {
            provider: {
              zdr: policy.openRouter.zdr,
              data_collection: policy.openRouter.dataCollection,
              require_parameters: policy.openRouter.requireParameters,
              allow_fallbacks: policy.openRouter.allowProviderFallbacks,
              only: policy.openRouter.only,
              max_price: {
                prompt: policy.openRouter.maxInputPerMillion,
                completion: policy.openRouter.maxOutputPerMillion,
              },
            },
          }
        : {}),
    };
    return {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        'x-title': 'NoaCG Studio',
        ...(publicAppUrl ? { 'http-referer': publicAppUrl } : {}),
      },
      body: JSON.stringify(body),
    };
  },
  parseResponse(value, request) {
    const data = object(value);
    const choice = object(array(data.choices)[0]);
    const message = object(choice.message);
    const text = typeof message.content === 'string'
      ? message.content
      : Array.isArray(message.content)
        ? message.content
            .map(object)
            .filter((part) => typeof part.text === 'string')
            .map((part) => part.text as string)
            .join('\n')
        : '';
    if (!text) throw new GatewayError('malformed_response', 'The AI provider returned an empty response.', 502, false);
    const usage = object(data.usage ?? {});
    const promptDetails = usage.prompt_tokens_details && typeof usage.prompt_tokens_details === 'object'
      ? object(usage.prompt_tokens_details)
      : {};
    const completionDetails = usage.completion_tokens_details && typeof usage.completion_tokens_details === 'object'
      ? object(usage.completion_tokens_details)
      : {};
    return {
      output: request.structuredOutput ? parseStructured(text) : text,
      usage: totalUsage(
        usage.prompt_tokens,
        usage.completion_tokens,
        providerCost(usage.cost),
        promptDetails.cached_tokens,
        completionDetails.reasoning_tokens,
      ),
    };
  },
};

export const AI_ADAPTERS: Record<AiProviderId, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openAiAdapter,
  openrouter: openRouterAdapter,
};

function validateRoute(value: unknown): ModelRoute {
  const route = object(value);
  if (!isAiProviderId(route.provider) || typeof route.model !== 'string' || !route.model.trim() || route.model.length > 160) {
    throw new GatewayError('invalid_request', 'Select a valid AI provider and model.', 400, false);
  }
  return { provider: route.provider, model: route.model.trim() };
}

function validContent(content: unknown): boolean {
  if (typeof content === 'string') return content.length <= 2_000_000;
  if (!Array.isArray(content)) return false;
  return content.every((block) => {
    if (!block || typeof block !== 'object') return false;
    const item = block as Record<string, unknown>;
    if (item.type === 'text') return typeof item.text === 'string' && item.text.length <= 2_000_000;
    if (item.type !== 'image' || !item.source || typeof item.source !== 'object') return false;
    const source = item.source as Record<string, unknown>;
    return source.type === 'base64'
      && typeof source.media_type === 'string'
      && typeof source.data === 'string'
      && source.data.length <= 8_000_000;
  });
}

export function validateGatewayBody(value: unknown): AiGatewayRequestBody {
  const body = object(value);
  const request = object(body.request);
  if (typeof request.system !== 'string' || request.system.length > 2_000_000 || !Array.isArray(request.messages)) {
    throw new GatewayError('invalid_request', 'The AI request is invalid.', 400, false);
  }
  const messages = request.messages as unknown[];
  if (messages.length === 0 || messages.length > 40 || !messages.every((value) => {
    if (!value || typeof value !== 'object') return false;
    const message = value as Record<string, unknown>;
    return (message.role === 'user' || message.role === 'assistant') && validContent(message.content);
  })) {
    throw new GatewayError('invalid_request', 'The AI request messages are invalid.', 400, false);
  }
  const maxTokens = request.maxTokens;
  if (maxTokens !== undefined && (!Number.isInteger(maxTokens) || (maxTokens as number) < 1 || (maxTokens as number) > 100_000)) {
    throw new GatewayError('invalid_request', 'The AI token limit is invalid.', 400, false);
  }
  if (request.structuredOutput !== undefined) {
    const structured = object(request.structuredOutput);
    if (
      typeof structured.name !== 'string'
      || !/^[A-Za-z0-9_-]{1,64}$/.test(structured.name)
      || typeof structured.description !== 'string'
      || !structured.schema
      || typeof structured.schema !== 'object'
    ) {
      throw new GatewayError('invalid_request', 'The structured-output schema is invalid.', 400, false);
    }
  }
  const fallbacks = body.fallbacks === undefined ? [] : array(body.fallbacks).map(validateRoute);
  if (fallbacks.length > 3) throw new GatewayError('invalid_request', 'Too many AI fallback routes.', 400, false);
  return {
    request: request as unknown as ModelRequest,
    route: validateRoute(body.route),
    ...(fallbacks.length ? { fallbacks } : {}),
  };
}

function configuredTimeoutMs(): number {
  const value = Number(process.env.AI_TIMEOUT_MS ?? 120_000);
  return Number.isFinite(value) ? Math.min(300_000, Math.max(5_000, Math.round(value))) : 120_000;
}

function configuredRetryLimit(): number {
  const value = Number(process.env.AI_RETRY_LIMIT ?? 1);
  return Number.isFinite(value) ? Math.min(2, Math.max(0, Math.round(value))) : 1;
}

function providerFailure(status: number): GatewayError {
  if (status === 408) return new GatewayError('timeout', 'The AI provider timed out.', 504, true);
  if (status === 429) return new GatewayError('rate_limited', 'The AI provider is busy. Try again shortly.', 429, true);
  if (status === 401 || status === 403) {
    return new GatewayError('provider_rejected', 'The AI provider rejected its server-side credential.', 502, false);
  }
  if (status >= 500) return new GatewayError('unavailable', 'The AI provider is temporarily unavailable.', 503, true);
  return new GatewayError('provider_rejected', 'The AI provider rejected the request.', 502, false);
}

async function oneAttempt(
  adapter: ProviderAdapter,
  request: ModelRequest,
  route: ModelRoute,
  key: string,
  fetchImpl: Fetch,
  policy?: GatewayExecutionPolicy,
): Promise<{ output: unknown; usage: ModelUsage }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), policy?.timeoutMs ?? configuredTimeoutMs());
  try {
    const response = await fetchImpl(adapter.endpoint, {
      ...adapter.createRequest(request, route, key, policy),
      signal: controller.signal,
    });
    if (!response.ok) throw providerFailure(response.status);
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new GatewayError('malformed_response', 'The AI provider returned an invalid response.', 502, false);
    }
    return adapter.parseResponse(data, request, route);
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    if (controller.signal.aborted) throw new GatewayError('timeout', 'The AI provider timed out.', 504, true);
    throw new GatewayError('unavailable', 'The AI provider could not be reached.', 503, true);
  } finally {
    clearTimeout(timer);
  }
}

export interface GatewayDependencies {
  fetchImpl?: Fetch;
  keyFor(provider: AiProviderId): Promise<string>;
  sleep?: (ms: number) => Promise<void>;
}

export interface OpenRouterRoutingPolicy {
  zdr: true;
  dataCollection: 'deny';
  requireParameters: true;
  allowProviderFallbacks: false;
  only: string[];
  maxInputPerMillion: number;
  maxOutputPerMillion: number;
}

export interface GatewayExecutionPolicy {
  /** Total provider attempts across all routes, including retries. */
  maxAttempts?: number;
  retryLimit?: number;
  timeoutMs?: number;
  openRouter?: OpenRouterRoutingPolicy;
}

export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

export function configuredPrice(route: ModelRoute): ModelPrice | null {
  const raw = process.env.AI_MODEL_PRICING_JSON;
  if (!raw) return null;
  try {
    const prices = JSON.parse(raw) as Record<string, unknown>;
    const entry = object(prices[`${route.provider}:${route.model}`]);
    const inputPerMillion = safeNumber(entry.inputPerMillion);
    const outputPerMillion = safeNumber(entry.outputPerMillion);
    return inputPerMillion || outputPerMillion ? { inputPerMillion, outputPerMillion } : null;
  } catch {
    return null;
  }
}

export function estimateModelCost(
  route: ModelRoute,
  inputTokens: number,
  outputTokens: number,
  override?: ModelPrice,
): number | null {
  const price = override ?? configuredPrice(route);
  if (!price) return null;
  return (inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) / 1_000_000;
}

function withEstimatedCost(usage: ModelUsage, route: ModelRoute): ModelUsage {
  if (usage.estimatedCost) return usage;
  const price = configuredPrice(route);
  if (!price) return usage;
  return {
    ...usage,
    estimatedCost: {
      amount: (usage.inputTokens * price.inputPerMillion + usage.outputTokens * price.outputPerMillion) / 1_000_000,
      currency: 'USD',
      source: 'configured',
    },
  };
}

/** Execute a normalized request. Provider changes occur only along the explicit route list. */
export async function executeGatewayRequest(
  body: AiGatewayRequestBody,
  dependencies: GatewayDependencies,
  policy?: GatewayExecutionPolicy,
): Promise<ModelResult> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const sleep = dependencies.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const routes = [body.route, ...(body.fallbacks ?? [])];
  const attempts: ModelResult['attempts'] = [];
  let lastError: GatewayError | null = null;
  let totalAttempts = 0;
  const retries = policy?.retryLimit ?? configuredRetryLimit();
  const maxAttempts = policy?.maxAttempts ?? Number.POSITIVE_INFINITY;

  for (const route of routes) {
    if (totalAttempts >= maxAttempts) break;
    const key = await dependencies.keyFor(route.provider);
    if (!key) {
      lastError = new GatewayError('missing_key', `No ${route.provider} API key is configured.`, 412, false);
      attempts.push({ route, attempts: 0 });
      continue;
    }
    const adapter = AI_ADAPTERS[route.provider];
    let routeAttempts = 0;
    for (let retry = 0; retry <= retries && totalAttempts < maxAttempts; retry++) {
      routeAttempts += 1;
      totalAttempts += 1;
      try {
        const result = await oneAttempt(adapter, body.request, route, key, fetchImpl, policy);
        validateStructuredOutput(result.output, body.request);
        attempts.push({ route, attempts: routeAttempts });
        return {
          output: result.output,
          usage: withEstimatedCost(result.usage, route),
          provider: route.provider,
          model: route.model,
          attempts,
        };
      } catch (error) {
        lastError = error instanceof GatewayError
          ? error
          : new GatewayError('unavailable', 'The AI provider could not be reached.', 503, true);
        if (!lastError.retryable || retry === retries || totalAttempts >= maxAttempts) break;
        await sleep(250 * (retry + 1));
      }
    }
    attempts.push({ route, attempts: routeAttempts });
    if (lastError && !lastError.retryable) break;
  }

  throw lastError ?? new GatewayError('unavailable', 'No AI route was available.', 503, false);
}

export function providerConfigured(provider: AiProviderId, userKeys: Partial<Record<AiProviderId, string>>): boolean {
  const envNames: Record<AiProviderId, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
  };
  return Boolean(userKeys[provider] || process.env[envNames[provider]]);
}

export function configuredProviders(userKeys: Partial<Record<AiProviderId, string>>): AiProviderId[] {
  return AI_PROVIDER_IDS.filter((provider) => providerConfigured(provider, userKeys));
}
