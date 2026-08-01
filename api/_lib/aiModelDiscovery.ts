// Live provider-model DISCOVERY for GET /api/ai/models: normalizes OpenRouter's Models
// API and Hugging Face's Inference Providers router into one shape the browser picker
// and the video benchmark read. This is a live listing, not an approval - the audited
// approved-route catalog that free-tier task profiles must reference is
// api/_lib/aiModelCatalog.ts.
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
    // The generated-image side of the bill, per OUTPUT IMAGE TOKEN - so it scales like the
    // prompt/completion prices above and is normalized the same way.
    //
    // It is `image_output`, NOT `image`: measured against the live listing, 38 of 40
    // image-output models carry `image_output` and only 4 carry `image`, which is the price of
    // an image the caller SENDS IN (vision). Where a model publishes both they disagree by up
    // to ~835x (x-ai/grok-imagine-image-quality: image 0.01, image_output 0.0000120), so
    // reading the wrong one does not degrade to a missing price - it prints a confident,
    // wrong one.
    //
    // Deliberately NOT converted to a price per image: that needs the tokens one image costs,
    // which varies by model and resolution and which the listing does not publish. Inventing
    // that factor would be a money figure nobody verified.
    imageOutputPerMillion: perMillion(pricing.image_output),
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
  // Index arithmetic rather than `.at(-1)`, and it has to stay that way: VERCEL COMPILES THE
  // api/ FUNCTIONS WITH THE ROOT tsconfig.json, whose lib is ES2020 - not tsconfig.api.json,
  // whose ES2022 lib is what `npm run build` typechecks against. So `.at()` passes every local
  // gate and then fails the production build with TS2550, which is exactly what happened here:
  // every deployment from d512f6e onward errored while the repo stayed green.
  const segments = id.split('/');
  return {
    provider: 'huggingface',
    id,
    name: segments[segments.length - 1] || id,
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

async function openRouterModels(key: string | undefined, output: DiscoveryOutput): Promise<AiDiscoveredModel[]> {
  // The text listing keeps its structured-output requirement (the harness forces schemas);
  // the image listing asks only for image output - image models rarely declare
  // structured_outputs and never need it.
  const url = output === 'image'
    ? 'https://openrouter.ai/api/v1/models?output_modalities=image'
    : 'https://openrouter.ai/api/v1/models?output_modalities=text&supported_parameters=structured_outputs';
  const raw = object(await fetchJson(url, key));
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

export type DiscoveryOutput = 'text' | 'image';

export async function discoverProviderModels(
  provider: AiProviderId,
  key?: string,
  output: DiscoveryOutput = 'text',
): Promise<AiModelCatalogResponse> {
  const cacheKey = `${provider}:${Boolean(key)}:${output}`;
  const found = cache.get(cacheKey);
  if (found && Date.now() - found.at < CACHE_MS) return found.value;
  // Image-output discovery exists only where the gateway's image adapter does (OpenRouter);
  // an empty list is the honest answer for every other provider.
  if (provider !== 'openrouter' && provider !== 'huggingface') {
    return { provider, syncedAt: new Date().toISOString(), models: [] };
  }
  if (output === 'image' && provider !== 'openrouter') {
    return { provider, syncedAt: new Date().toISOString(), models: [] };
  }
  const models = provider === 'openrouter'
    ? await openRouterModels(key, output)
    : await huggingFaceModels(key);
  const value = {
    provider,
    syncedAt: new Date().toISOString(),
    models: models.sort((a, b) => a.name.localeCompare(b.name)),
  };
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}
