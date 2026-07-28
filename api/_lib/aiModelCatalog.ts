import type {
  AiDiscoveredModel,
  AiModelCatalogResponse,
  AiProviderId,
} from '../../src/ai/modelTypes.js';

type JsonObject = Record<string, unknown>;

const CACHE_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; value: AiModelCatalogResponse }>();

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function strings(value: unknown): string[] {
  return list(value).filter((item): item is string => typeof item === 'string');
}

function finite(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function isoFromEpoch(value: unknown): string | null {
  const seconds = finite(value);
  if (seconds === null) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function perMillion(value: unknown): number | null {
  const perToken = finite(value);
  return perToken === null ? null : perToken * 1_000_000;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function normalizedOpenRouter(value: unknown): AiDiscoveredModel | null {
  const model = object(value);
  const id = text(model.id);
  if (!id) return null;
  const architecture = object(model.architecture);
  const pricing = object(model.pricing);
  const topProvider = object(model.top_provider);
  const parameters = strings(model.supported_parameters);
  const inputPerMillion = perMillion(pricing.prompt);
  const outputPerMillion = perMillion(pricing.completion);
  const expiration = text(model.expiration_date);
  const expiresAt = expiration ? Date.parse(expiration) : Number.POSITIVE_INFINITY;
  return {
    provider: 'openrouter',
    id,
    name: text(model.name) || id,
    description: text(model.description),
    contextLength: finite(model.context_length),
    maxOutputTokens: finite(topProvider.max_completion_tokens),
    inputPerMillion,
    outputPerMillion,
    inputModalities: strings(architecture.input_modalities),
    supportsStructuredOutput:
      parameters.includes('structured_outputs') || parameters.includes('response_format'),
    supportsTools: parameters.includes('tools') && parameters.includes('tool_choice'),
    supportsSeed: parameters.includes('seed'),
    free: id.endsWith(':free') || (inputPerMillion === 0 && outputPerMillion === 0),
    openWeight: Boolean(text(model.hugging_face_id)),
    available: !Number.isFinite(expiresAt) || expiresAt > Date.now(),
    createdAt: isoFromEpoch(model.created),
    revision: text(model.canonical_slug) || null,
    source: 'openrouter-models-api',
  };
}

export function normalizedHuggingFace(value: unknown): AiDiscoveredModel | null {
  const model = object(value);
  const id = text(model.id);
  if (!id) return null;
  const architecture = object(model.architecture);
  const providers = list(model.providers).map(object);
  const live = providers.filter((provider) => provider.status === 'live');
  const capable = live.filter((provider) => provider.supports_structured_output === true);
  const priced = capable
    .map((provider) => object(provider.pricing))
    .map((pricing) => ({
      input: finite(pricing.input),
      output: finite(pricing.output),
    }))
    .filter((pricing): pricing is { input: number; output: number } =>
      pricing.input !== null && pricing.output !== null,
    );
  const cheapest = priced.sort((a, b) => (a.input + a.output) - (b.input + b.output))[0];
  const contexts = capable
    .map((provider) => finite(provider.context_length))
    .filter((context): context is number => context !== null);
  return {
    provider: 'huggingface',
    id,
    name: id.split('/').at(-1) || id,
    description: '',
    contextLength: contexts.length ? Math.max(...contexts) : null,
    maxOutputTokens: null,
    inputPerMillion: cheapest?.input ?? null,
    outputPerMillion: cheapest?.output ?? null,
    inputModalities: strings(architecture.input_modalities).length
      ? strings(architecture.input_modalities)
      : ['text'],
    supportsStructuredOutput: capable.length > 0,
    supportsTools: capable.some((provider) => provider.supports_tools === true),
    supportsSeed: false,
    free: capable.some((provider) => provider.is_free === true),
    openWeight: true,
    available: capable.length > 0,
    createdAt: isoFromEpoch(model.created),
    revision: null,
    source: 'huggingface-router',
  };
}

async function fetchJson(url: string, key?: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: key ? { authorization: `Bearer ${key}` } : {},
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`model catalog returned ${response.status}`);
  return response.json();
}

async function openRouterModels(key?: string): Promise<AiDiscoveredModel[]> {
  const raw = object(await fetchJson(
    'https://openrouter.ai/api/v1/models?output_modalities=text&supported_parameters=structured_outputs',
    key,
  ));
  return list(raw.data)
    .map(normalizedOpenRouter)
    .filter((model): model is AiDiscoveredModel => model !== null);
}

async function huggingFaceModels(key?: string): Promise<AiDiscoveredModel[]> {
  const raw = object(await fetchJson('https://router.huggingface.co/v1/models', key));
  return list(raw.data)
    .map(normalizedHuggingFace)
    .filter((model): model is AiDiscoveredModel => model !== null);
}

export async function discoverProviderModels(
  provider: AiProviderId,
  key?: string,
): Promise<AiModelCatalogResponse> {
  const cacheKey = `${provider}:${Boolean(key)}`;
  const found = cache.get(cacheKey);
  if (found && Date.now() - found.at < CACHE_MS) return found.value;
  if (provider !== 'openrouter' && provider !== 'huggingface') {
    return { provider, syncedAt: new Date().toISOString(), models: [] };
  }
  const models = provider === 'openrouter'
    ? await openRouterModels(key)
    : await huggingFaceModels(key);
  const value = {
    provider,
    syncedAt: new Date().toISOString(),
    models: models.sort((a, b) => a.name.localeCompare(b.name)),
  };
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}
