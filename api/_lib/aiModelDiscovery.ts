// Live provider-model DISCOVERY for GET /api/ai/models: normalizes Vercel AI Gateway's
// models listing and Hugging Face's Inference Providers router into one shape the browser
// picker and the video benchmark read. This is a live listing, not an approval - the audited
// approved-route catalog that free-tier task profiles must reference is
// api/_lib/aiModelCatalog.ts.
import { AI_GATEWAY_BASE_URL } from './aiGateway.js';
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

export function normalizedVercelGateway(value: unknown): AiDiscoveredModel | null {
  const model = object(value);
  const id = text(model.id);
  if (!id) return null;
  const modalities = object(model.modalities);
  const pricing = object(model.pricing);
  const parameters = strings(model.supported_parameters);
  const tags = strings(model.tags);
  const inputPerMillion = perMillion(pricing.input);
  const outputPerMillion = perMillion(pricing.output);
  const deprecated = text(model.deprecated_at);
  const deprecatedAt = deprecated ? Date.parse(deprecated) : Number.POSITIVE_INFINITY;
  return {
    provider: 'vercel',
    id,
    name: text(model.name) || id,
    description: text(model.description),
    contextLength: finite(model.context_window),
    maxOutputTokens: finite(model.max_tokens),
    inputPerMillion,
    outputPerMillion,
    inputModalities: strings(modalities.input),
    // The gateway publishes CAPABILITY TAGS rather than a per-parameter support matrix, and
    // there is no `structured_outputs` or `response_format` entry in `supported_parameters`
    // to read - measured across the whole live listing, not assumed. `tool-use` is the honest
    // signal available: it is exactly the capability the gateway's forced-function structured
    // mode needs, and every model that decodes a JSON schema carries it. Reading a missing
    // field would have marked all 322 models incapable and emptied the picker.
    supportsStructuredOutput: tags.includes('tool-use'),
    supportsTools: tags.includes('tool-use'),
    supportsSeed: parameters.includes('seed'),
    free: tags.includes('free') || (inputPerMillion === 0 && outputPerMillion === 0),
    // Not published by the gateway - see the field's note in modelTypes.ts. False here means
    // "not stated"; the audited catalog carries the promotion-time flag.
    openWeight: false,
    available: !Number.isFinite(deprecatedAt) || deprecatedAt > Date.now(),
    createdAt: isoFromEpoch(model.created),
    revision: null,
    // Vercel publishes a price per GENERATED IMAGE, and only for dedicated image models. A
    // multimodal language model answering with an image (the Pro concept route's shape) bills
    // through its ordinary output tokens, so it correctly carries no value here rather than a
    // zero that would read as free.
    imagePriceUsd: finite(pricing.image),
    source: 'vercel-ai-gateway',
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

/** Whether a listing entry can answer in the modality the caller asked for. The gateway
 *  serves one unfiltered listing (there is no server-side `output_modalities` query the way
 *  OpenRouter had), so the split happens here - and it reads the model's declared output
 *  modalities rather than its `type`, because the models that matter most to NoaCG are
 *  `type: 'language'` entries that also emit images. */
function answersIn(value: unknown, output: DiscoveryOutput): boolean {
  const outputs = strings(object(object(value).modalities).output);
  return output === 'image' ? outputs.includes('image') : outputs.includes('text');
}

async function vercelGatewayModels(key: string | undefined, output: DiscoveryOutput): Promise<AiDiscoveredModel[]> {
  const raw = object(await fetchJson(`${AI_GATEWAY_BASE_URL}/models`, key));
  return list(raw.data)
    .filter((entry) => object(entry).type === 'language' && answersIn(entry, output))
    .map(normalizedVercelGateway)
    .filter((model): model is AiDiscoveredModel => model !== null)
    // A text listing still serves the harness, which forces a schema on every call, so an
    // entry that cannot decode one has no place in the picker. The image listing keeps every
    // image-capable model: an image request forces no schema and needs none.
    .filter((model) => output === 'image' || model.supportsStructuredOutput);
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
  // Image-output discovery exists only where the image adapter does (the Vercel gateway);
  // an empty list is the honest answer for every other provider.
  if (provider !== 'vercel' && provider !== 'huggingface') {
    return { provider, syncedAt: new Date().toISOString(), models: [] };
  }
  if (output === 'image' && provider !== 'vercel') {
    return { provider, syncedAt: new Date().toISOString(), models: [] };
  }
  const models = provider === 'vercel'
    ? await vercelGatewayModels(key, output)
    : await huggingFaceModels(key);
  const value = {
    provider,
    syncedAt: new Date().toISOString(),
    models: models.sort((a, b) => a.name.localeCompare(b.name)),
  };
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}
