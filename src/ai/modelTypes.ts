// Provider-neutral model-call contracts shared by the browser gateway client and the
// server adapters. Creative AI's higher-level AIProvider contract remains the product
// seam; these types only normalize the model transport beneath the existing harness.

export const AI_PROVIDER_IDS = ['anthropic', 'openai', 'openrouter'] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export interface ModelRoute {
  provider: AiProviderId;
  model: string;
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
  /** Force a schema-validated object result. */
  structuredOutput?: StructuredOutput;
  /** Override the selected route's model for this call. */
  model?: string;
  /** Select the configured low-cost model for classification/planning stages. */
  modelRole?: 'default' | 'fast';
  /** Anthropic can cache a repeated system prompt; other adapters safely ignore this hint. */
  cacheSystem?: boolean;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
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

export interface ModelResult {
  output: unknown;
  usage: ModelUsage;
  provider: AiProviderId;
  model: string;
  attempts: ModelAttempt[];
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

export interface AiGatewayRequestBody {
  request: ModelRequest;
  route: ModelRoute;
  /** Fallback is opt-in and ordered. An empty list means never change provider/model. */
  fallbacks?: ModelRoute[];
}

export type AiGatewayResponseBody = ModelResult;
