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

async function fetchJson(url: string, key?: string, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, {
    headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...headers },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`model catalog returned ${response.status}`);
  return response.json();
}

/**
 * ONE model, as a key that survives the two ways the same model gets named.
 *
 * A direct provider's own listing is the only source of ids its API actually accepts
 * (`claude-sonnet-4-5-20250929`), while published PRICING for those models is a catalog
 * question (`anthropic/claude-sonnet-4.5`). The vendor prefix, the dot-vs-dash separator and
 * the dated snapshot suffix are exactly the three differences, so all three are normalized
 * away and everything else must still match character for character.
 */
export function modelPriceKey(id: string): string {
  const withoutVendor = id.includes('/') ? id.slice(id.indexOf('/') + 1) : id;
  return withoutVendor
    .toLowerCase()
    .replace(/-latest$/, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .replace(/-\d{8}$/, '')
    .replace(/[^a-z0-9]/g, '');
}

export interface CatalogFacts {
  inputPerMillion: number | null;
  outputPerMillion: number | null;
  contextLength: number | null;
  maxOutputTokens: number | null;
  supportsStructuredOutput: boolean;
}

/**
 * Published price and capability for every language model the managed catalog carries, keyed
 * by `modelPriceKey`.
 *
 * NONE of the three direct provider APIs publishes a price with its model listing - measured,
 * not assumed - so a BYO-key row would otherwise have to say "price unavailable" for every
 * model a user might pay for, which is the one number they need before choosing. The managed
 * catalog publishes list prices per million tokens for the same models, so it is read here as
 * a PRICE BOOK. It is never shown or named as a route: the user's own key is what pays.
 *
 * An ambiguous key (two catalog entries normalizing alike) is dropped rather than guessed -
 * a wrong price is worse than a missing one.
 */
async function catalogFacts(): Promise<Map<string, CatalogFacts>> {
  const index = new Map<string, CatalogFacts>();
  const ambiguous = new Set<string>();
  // Deliberately unauthenticated: the listing is public, and the price book must not depend
  // on this deployment happening to hold a managed key.
  const raw = object(await fetchJson(`${AI_GATEWAY_BASE_URL}/models`));
  for (const entry of list(raw.data)) {
    const model = normalizedVercelGateway(entry);
    if (!model || object(entry).type !== 'language') continue;
    const key = modelPriceKey(model.id);
    if (!key) continue;
    if (index.has(key)) {
      ambiguous.add(key);
      continue;
    }
    index.set(key, {
      inputPerMillion: model.inputPerMillion,
      outputPerMillion: model.outputPerMillion,
      contextLength: model.contextLength,
      maxOutputTokens: model.maxOutputTokens,
      supportsStructuredOutput: model.supportsStructuredOutput,
    });
  }
  for (const key of ambiguous) index.delete(key);
  return index;
}

/** A direct provider's own listing, priced from the catalog above.
 *
 *  The filter is the one `vercelGatewayModels` already applies: the harness forces a schema on
 *  every call, so a model that cannot decode one has no place in the picker. An EMPTY price
 *  book (the listing was unreachable) filters nothing - degrading to unpriced suggestions is
 *  honest, degrading to no suggestions at all would read as "your key offers no models". */
export function pricedDirectModels(models: AiDiscoveredModel[], facts: Map<string, CatalogFacts>): AiDiscoveredModel[] {
  if (facts.size === 0) return models;
  const priced: AiDiscoveredModel[] = [];
  for (const model of models) {
    const known = facts.get(modelPriceKey(model.id));
    if (!known || !known.supportsStructuredOutput) continue;
    priced.push({
      ...model,
      inputPerMillion: known.inputPerMillion,
      outputPerMillion: known.outputPerMillion,
      contextLength: model.contextLength ?? known.contextLength,
      maxOutputTokens: model.maxOutputTokens ?? known.maxOutputTokens,
      supportsStructuredOutput: true,
      free: known.inputPerMillion === 0 && known.outputPerMillion === 0,
    });
  }
  return priced;
}

/** The shape every direct-provider row starts from: what its own API states, and nothing
 *  invented. Price, context and capability are filled in by `pricedDirectModels`. */
export function directModel(
  provider: AiProviderId,
  source: AiDiscoveredModel['source'],
  id: string,
  name: string,
  description = '',
): AiDiscoveredModel {
  return {
    provider,
    id,
    name: name || id,
    description,
    contextLength: null,
    maxOutputTokens: null,
    inputPerMillion: null,
    outputPerMillion: null,
    inputModalities: ['text'],
    supportsStructuredOutput: false,
    supportsTools: false,
    supportsSeed: false,
    free: false,
    openWeight: false,
    available: true,
    createdAt: null,
    revision: null,
    source,
  };
}

async function anthropicModels(key: string): Promise<AiDiscoveredModel[]> {
  const raw = object(await fetchJson('https://api.anthropic.com/v1/models?limit=100', undefined, {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
  }));
  return list(raw.data)
    .map(object)
    .filter((model) => text(model.id))
    .map((model) => directModel('anthropic', 'anthropic-api', text(model.id), text(model.display_name)));
}

async function openAiModels(key: string): Promise<AiDiscoveredModel[]> {
  const raw = object(await fetchJson('https://api.openai.com/v1/models', key));
  return list(raw.data)
    .map(object)
    .filter((model) => text(model.id))
    .map((model) => directModel('openai', 'openai-api', text(model.id), text(model.id)));
}

async function googleModels(key: string): Promise<AiDiscoveredModel[]> {
  // The same OpenAI-compatible surface the google adapter posts to, so the ids listed here
  // are exactly the ids that route accepts.
  const raw = object(await fetchJson('https://generativelanguage.googleapis.com/v1beta/openai/models', key));
  return list(raw.data)
    .map(object)
    .filter((model) => text(model.id))
    // Google prefixes its OpenAI-compatible ids with `models/`; the chat endpoint accepts
    // either form, and the bare id is what its own documentation and every price list use.
    .map((model) => {
      const id = text(model.id).replace(/^models\//, '');
      return directModel('google', 'google-generative-ai', id, id);
    });
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

/** A direct provider lists only what its own key can reach, so discovery there needs one. */
async function directProviderModels(provider: AiProviderId, key: string): Promise<AiDiscoveredModel[]> {
  const [listed, facts] = await Promise.all([
    provider === 'anthropic'
      ? anthropicModels(key)
      : provider === 'openai'
        ? openAiModels(key)
        : googleModels(key),
    // A price book that cannot be fetched costs prices, never the listing itself.
    catalogFacts().catch(() => new Map<string, CatalogFacts>()),
  ]);
  return pricedDirectModels(listed, facts);
}

export async function discoverProviderModels(
  provider: AiProviderId,
  key?: string,
  output: DiscoveryOutput = 'text',
  paidBy?: 'user' | 'managed',
): Promise<AiModelCatalogResponse> {
  const cacheKey = `${provider}:${Boolean(key)}:${output}:${paidBy ?? 'none'}`;
  const found = cache.get(cacheKey);
  if (found && Date.now() - found.at < CACHE_MS) return found.value;
  // Image-output discovery exists only where the image adapter does (the Vercel gateway);
  // an empty list is the honest answer for every other provider.
  if (output === 'image' && provider !== 'vercel') {
    return { provider, syncedAt: new Date().toISOString(), models: [] };
  }
  const direct = provider === 'anthropic' || provider === 'openai' || provider === 'google';
  // Without a key a direct provider has nothing to list: its catalog is per-account, and a
  // guessed list would suggest ids that account cannot call.
  if (direct && !key) {
    return { provider, syncedAt: new Date().toISOString(), models: [] };
  }
  const models = provider === 'vercel'
    ? await vercelGatewayModels(key, output)
    : provider === 'huggingface'
      ? await huggingFaceModels(key)
      : await directProviderModels(provider, key as string);
  const value = {
    provider,
    syncedAt: new Date().toISOString(),
    models: models
      .map((model) => (paidBy ? { ...model, paidBy } : model))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}
