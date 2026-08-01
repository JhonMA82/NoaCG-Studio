// Provider-neutral model-call contracts shared by the browser gateway client and the
// server adapters. Creative AI's higher-level AIProvider contract remains the product
// seam; these types only normalize the model transport beneath the existing harness.

export const AI_PROVIDER_IDS = ['anthropic', 'openai', 'openrouter', 'huggingface'] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export interface ModelRoute {
  provider: AiProviderId;
  model: string;
}

export interface AiDiscoveredModel {
  provider: AiProviderId;
  id: string;
  name: string;
  description: string;
  contextLength: number | null;
  maxOutputTokens: number | null;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
  inputModalities: string[];
  supportsStructuredOutput: boolean;
  supportsTools: boolean;
  supportsSeed: boolean;
  free: boolean;
  openWeight: boolean;
  available: boolean;
  createdAt: string | null;
  revision: string | null;
  /** Per-image price, where the provider publishes one. Additive and optional: only image
   *  routes carry it, and a missing value means "not published", never "free". */
  perImageUsd?: number | null;
  source: 'openrouter-models-api' | 'huggingface-router';
}

export interface AiModelCatalogResponse {
  provider: AiProviderId;
  syncedAt: string;
  models: AiDiscoveredModel[];
  warning?: string;
}

export type ModelContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface StructuredOutput {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

export interface ModelRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: ModelContentBlock[] | string }[];
  maxTokens?: number;
  /** Ask the route for a generated IMAGE instead of text. Only adapters whose provider
   *  actually offers image output accept it (OpenRouter today); everything else refuses
   *  with a normalized error rather than silently answering in the wrong modality.
   *  Mutually exclusive with structuredOutput. */
  expect?: 'image';
  /** Force a schema-validated object result. */
  structuredOutput?: StructuredOutput;
  /** Override the selected route's model for this call. */
  model?: string;
  /** Select the configured low-cost model for classification/planning stages. */
  modelRole?: 'default' | 'fast';
  /** Anthropic can cache a repeated system prompt; other adapters safely ignore this hint. */
  cacheSystem?: boolean;
  /** Reproducible benchmark settings. Adapters ignore unsupported values. */
  temperature?: number;
  seed?: number;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Input tokens served from a provider cache, when reported. Included in inputTokens. */
  cachedInputTokens?: number;
  /** Reasoning tokens, when separately reported. Included in outputTokens. */
  reasoningTokens?: number;
  /** An estimate only, derived from explicit operator pricing or provider-reported cost. */
  estimatedCost?: {
    amount: number;
    currency: 'USD';
    source: 'configured' | 'provider';
  };
}

export interface ModelAttempt {
  route: ModelRoute;
  attempts: number;
}

/** One generated image, normalized out of whatever shape the provider returned it in. */
export interface ModelImage {
  base64: string;
  mediaType: string;
}

export interface ModelResult {
  output: unknown;
  usage: ModelUsage;
  provider: AiProviderId;
  model: string;
  attempts: ModelAttempt[];
  /** Present only for `expect: 'image'` requests. */
  images?: ModelImage[];
}

export type AiGatewayErrorCode =
  | 'invalid_request'
  | 'missing_key'
  | 'authentication_required'
  | 'provider_rejected'
  | 'rate_limited'
  | 'timeout'
  | 'malformed_response'
  | 'unavailable';

export interface AiGatewayErrorBody {
  error: {
    code: AiGatewayErrorCode;
    message: string;
    retryable: boolean;
  };
}

/** Which PRODUCT SURFACE issued a gateway call, when the answer changes what the server is
 *  allowed to do. The gateway is otherwise surface-agnostic on purpose - the SPX harness, the
 *  brainstorm call and a bare prompt all look alike to it - so this stays a small, closed set
 *  that only grows when a surface has its own entitlement.
 *
 *  Today that is video (`ai.video`) and NoaCG Pro (`ai.pro`): each is a feature a plan, a
 *  grant or an instance-wide kill switch can withdraw, and without a discriminator those
 *  harnesses are indistinguishable from every other call on the same endpoint
 *  (docs/ADMIN.md, the enforcement table). */
export type AiGatewaySurface = 'video' | 'pro';

export interface AiGatewayRequestBody {
  request: ModelRequest;
  route: ModelRoute;
  /** Fallback is opt-in and ordered. An empty list means never change provider/model. */
  fallbacks?: ModelRoute[];
  /** Absent means the general harness, which no feature key gates. */
  surface?: AiGatewaySurface;
}

export type AiGatewayResponseBody = ModelResult;
