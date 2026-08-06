// Browser-safe AI routing preferences. API keys never enter this module or localStorage:
// managed keys stay in server environment variables, while optional user keys are sealed
// by /api/ai/credentials into an HttpOnly cookie.

import { getAccessToken } from '../backend/auth';
import {
  AI_PROVIDER_IDS,
  isAiProviderId,
  type AiGatewayErrorBody,
  type AiProviderId,
  type ModelRoute,
} from './modelTypes';

const STORAGE_KEY = 'spx-gfx-ai';

export interface AiModelOption {
  provider: AiProviderId;
  id: string;
  label: string;
  blurb: string;
  role?: 'default' | 'fast';
}

export interface AiProviderOption {
  id: AiProviderId;
  label: string;
  blurb: string;
}

export const AI_PROVIDERS: AiProviderOption[] = [
  { id: 'openrouter', label: 'OpenRouter', blurb: 'Open-weight models through OpenRouter’s OpenAI-compatible API - the NoaCG default.' },
  { id: 'anthropic', label: 'Anthropic', blurb: 'Claude models through the existing NoaCG harness.' },
  { id: 'openai', label: 'OpenAI', blurb: 'OpenAI models through the Responses API.' },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    blurb: 'Open-weight models with a compatible hosted Inference Provider endpoint.',
  },
];

/** Central model catalog. The rest of NoaCG only stores opaque provider/model routes. */
export const AI_MODELS: AiModelOption[] = [
  {
    provider: 'anthropic',
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    blurb: 'Recommended Claude route for design and code.',
    role: 'default',
  },
  {
    provider: 'anthropic',
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
    blurb: 'Maximum Claude quality; slower and more expensive.',
  },
  {
    provider: 'anthropic',
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    blurb: 'Fast Claude route for lightweight planning stages.',
    role: 'fast',
  },
  {
    provider: 'openai',
    // Tiered exactly like the OpenRouter entry below, and dead in the same way: the direct API
    // lists gpt-5.6-luna / -sol / -terra and no bare `gpt-5.6`. Luna is the cost-efficient tier
    // - the cheapest suggestion for a route the user pays for with their own key.
    id: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    blurb: 'OpenAI Responses API route for design and code.',
    role: 'default',
  },
  {
    provider: 'openrouter',
    id: 'qwen/qwen3-coder-next',
    label: 'Qwen3 Coder Next',
    blurb: 'Open-weight default route for design and code.',
    role: 'default',
  },
  {
    provider: 'openrouter',
    id: 'qwen/qwen3-30b-a3b-instruct-2507',
    label: 'Qwen3 30B A3B',
    blurb: 'Fast, cheap open-weight route for structured planning stages.',
    role: 'fast',
  },
  {
    provider: 'openrouter',
    // GPT-5.6 ships as named tiers rather than one id - luna (fast, cost-efficient), terra
    // (balanced), sol (flagship), each with a `-pro` twin served at `reasoning.mode: pro`. The
    // bare `openai/gpt-5.6` this suggestion used to name has never existed on OpenRouter, so
    // picking it returned a provider error; scripts/check-model-ids.mjs now catches that class.
    id: 'openai/gpt-5.6-luna',
    label: 'GPT-5.6 Luna via OpenRouter',
    blurb: 'Proprietary route; any supported model id can be entered.',
  },
  {
    provider: 'huggingface',
    id: 'openai/gpt-oss-120b',
    label: 'GPT-OSS 120B via Hugging Face',
    blurb: 'Fallback suggestion when live Hugging Face discovery is unavailable.',
    role: 'default',
  },
];

/** The Create-with-AI execution tiers. 'lite' and 'pro' are managed experiences (no model
 *  picking); 'custom' is the advanced bring-your-own-provider surface. */
export const AI_TIERS = ['lite', 'pro', 'custom'] as const;
export type AiTier = (typeof AI_TIERS)[number];

export function isAiTier(value: unknown): value is AiTier {
  return typeof value === 'string' && (AI_TIERS as readonly string[]).includes(value);
}

export interface AiSettings {
  provider: AiProviderId;
  model: string;
  /** The chosen execution tier; null = not chosen yet (the AI step resolves the default:
   *  Lite when the server offers it, otherwise the custom/BYO surface). */
  tier: AiTier | null;
  /** Explicitly ordered routes only. No entry means no cross-provider fallback. */
  fallbacks: ModelRoute[];
  /** Non-secret availability cache populated by /api/ai/config or a successful key save. */
  configuredProviders: AiProviderId[];
  keyStorageAvailable: boolean | null;
  /**
   * Generate through the NoaCG harness (DesignSpec routing, grounded assembly, runtime
   * bench and alternatives) rather than the plain one-shot path.
   */
  useHarness: boolean;
  /** Optional provider sampling controls, primarily used by the versioned benchmark. */
  temperature: number | null;
  seed: number | null;
  /** The NoaCG Pro concept-image model (an OpenRouter image-output model id). Non-secret,
   *  like every route preference here; null = not chosen yet. */
  proImageModel: string | null;
}

export interface AiProviderStatus {
  id: AiProviderId;
  userKey: boolean;
  managedKey: boolean;
  available: boolean;
  requiresSignIn: boolean;
}

export interface AiConfiguration {
  keyStorageAvailable: boolean;
  providers: AiProviderStatus[];
}

// The silent default - what an unset VITE_AI_PROVIDER resolves to - is an OPEN model via
// OpenRouter, by policy: expensive proprietary routes (Claude, GPT) are chosen deliberately
// (saved settings, env, or the picker), never because an environment variable is missing.
export const DEFAULT_PROVIDER: AiProviderId = 'openrouter';
export const DEFAULT_MODEL = 'qwen/qwen3-coder-next';

function env(name: string): string {
  return String((import.meta.env as Record<string, unknown>)[name] ?? '');
}

export function modelsForProvider(provider: AiProviderId): AiModelOption[] {
  return AI_MODELS.filter((model) => model.provider === provider);
}

export function defaultModelForProvider(provider: AiProviderId, role: 'default' | 'fast' = 'default'): string {
  const models = modelsForProvider(provider);
  return models.find((model) => model.role === role)?.id
    ?? models.find((model) => model.role === 'default')?.id
    ?? models[0]?.id
    ?? '';
}

function validRoutes(value: unknown): ModelRoute[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((route): route is Record<string, unknown> => Boolean(route) && typeof route === 'object' && !Array.isArray(route))
    .filter((route) => isAiProviderId(route.provider) && typeof route.model === 'string' && Boolean(route.model.trim()))
    .slice(0, 3)
    .map((route) => ({ provider: route.provider as AiProviderId, model: String(route.model).trim() }));
}

function envRoutes(): ModelRoute[] {
  try {
    return validRoutes(JSON.parse(env('VITE_AI_FALLBACKS') || '[]'));
  } catch {
    return [];
  }
}

function validProviders(value: unknown): AiProviderId[] {
  if (!Array.isArray(value)) return [];
  return AI_PROVIDER_IDS.filter((provider) => value.includes(provider));
}

function readSaved(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const saved = parsed as Record<string, unknown>;
    // One-way security migration: old releases stored the raw Anthropic key here. Never
    // retransmit it implicitly; erase it and ask the user to enter it into secure storage.
    if ('apiKey' in saved || 'proxyUrl' in saved) {
      delete saved.apiKey;
      delete saved.proxyUrl;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    }
    return saved;
  } catch {
    return {};
  }
}

/** Load only non-secret routing and availability preferences. */
export function loadAiSettings(): AiSettings {
  const saved = readSaved();
  const envProvider = env('VITE_AI_PROVIDER');
  const provider = isAiProviderId(saved.provider)
    ? saved.provider
    : isAiProviderId(envProvider)
      ? envProvider
      : DEFAULT_PROVIDER;
  const model = typeof saved.model === 'string' && saved.model.trim()
    ? saved.model.trim()
    : env('VITE_AI_MODEL') || defaultModelForProvider(provider) || DEFAULT_MODEL;
  return {
    provider,
    model,
    tier: isAiTier(saved.tier) ? saved.tier : null,
    fallbacks: 'fallbacks' in saved ? validRoutes(saved.fallbacks) : envRoutes(),
    configuredProviders: validProviders(saved.configuredProviders),
    keyStorageAvailable: typeof saved.keyStorageAvailable === 'boolean' ? saved.keyStorageAvailable : null,
    useHarness: typeof saved.useHarness === 'boolean' ? saved.useHarness : true,
    temperature:
      typeof saved.temperature === 'number' && Number.isFinite(saved.temperature)
        ? Math.min(2, Math.max(0, saved.temperature))
        : null,
    seed:
      typeof saved.seed === 'number' && Number.isSafeInteger(saved.seed)
        ? saved.seed
        : null,
    proImageModel: typeof saved.proImageModel === 'string' && saved.proImageModel.trim()
      ? saved.proImageModel.trim().slice(0, 160)
      : null,
  };
}

export function saveAiSettings(patch: Partial<AiSettings>): void {
  const current = loadAiSettings();
  const provider = patch.provider ?? current.provider;
  const providerChanged = provider !== current.provider;
  const merged: AiSettings = {
    ...current,
    ...patch,
    provider,
    model: patch.model ?? (providerChanged ? defaultModelForProvider(provider) : current.model),
    fallbacks: validRoutes(patch.fallbacks ?? current.fallbacks),
    configuredProviders: validProviders(patch.configuredProviders ?? current.configuredProviders),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Storage full or unavailable. These are non-secret provider/model PREFERENCES; losing one
    // costs a re-pick, while throwing here would take down whichever surface saved them (the
    // prefs.ts case, measured 2026-08-06 - a full quota unmounted the whole app).
  }
}

export function aiConfigured(settings: AiSettings = loadAiSettings()): boolean {
  return settings.configuredProviders.includes(settings.provider);
}

async function gatewayHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function refreshAiConfiguration(): Promise<AiConfiguration> {
  const response = await fetch('/api/ai/config', { headers: await gatewayHeaders() });
  if (!response.ok) throw new Error('Could not read AI provider configuration.');
  const config = await response.json() as AiConfiguration;
  const available = config.providers.filter((provider) => provider.available).map((provider) => provider.id);
  saveAiSettings({ configuredProviders: available, keyStorageAvailable: config.keyStorageAvailable });
  return config;
}

async function credentialRequest(method: 'PUT' | 'DELETE', provider: AiProviderId, key?: string): Promise<void> {
  const response = await fetch('/api/ai/credentials', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider, ...(key ? { key } : {}) }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as AiGatewayErrorBody | null;
    throw new Error(body?.error.message ?? 'Could not update the provider key.');
  }
}

export async function saveUserAiKey(provider: AiProviderId, key: string): Promise<void> {
  await credentialRequest('PUT', provider, key.trim());
  const current = loadAiSettings();
  saveAiSettings({
    configuredProviders: validProviders([...current.configuredProviders, provider]),
    keyStorageAvailable: true,
  });
}

export async function deleteUserAiKey(provider: AiProviderId): Promise<void> {
  await credentialRequest('DELETE', provider);
  await refreshAiConfiguration();
}
