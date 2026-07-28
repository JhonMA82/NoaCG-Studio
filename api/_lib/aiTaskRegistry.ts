// The AI TASK REGISTRY (docs/AI_PLATFORM_PLAN.md §4): a typed map taskId -> TaskProfile.
// TaskProfile is LiteProfile generalized LITERALLY - schema ref + version, allowed
// tiers, token/image/resolution limits, timeout/retry, route policy, ledger kind - and
// deliberately nothing more: no capability negotiation until a third harness needs it
// (plan §13). Server-only; the browser mirror of a task stays whatever its own status
// endpoint exposes today (availability, limits, allowance - never routes).

import { liteProfile, type LiteProfile } from './aiLiteProfile.js';
import { importAnalysisProfile, type ImportAnalysisProfile } from './aiImportAnalysisProfile.js';
import { approvedModelRoute, modelRouteKey } from './aiModelCatalog.js';
import type { ModelPrice } from './aiGateway.js';
import type { ModelRoute } from '../../src/ai/modelTypes.js';
import { IMPORT_ANALYSIS_LIMITS } from '../../src/ai/importAnalysis/contract.js';

export type AiTaskId = 'lite-design-spec' | 'imported-graphic-analysis';
export const LITE_TASK_ID: AiTaskId = 'lite-design-spec';
export const IMPORT_ANALYSIS_TASK_ID: AiTaskId = 'imported-graphic-analysis';

export type AiTaskTier = 'anonymous' | 'free' | 'byo' | 'paid';

/** A structured-contract reference: identity + version, never the schema itself -
 *  the schema stays owned by the task's harness (src/ai/AGENTS.md doctrine). */
export interface TaskSchemaRef {
  id: string;
  version: string;
}

export interface TaskLimits {
  outputTokens: number;
  repairOutputTokens: number;
  estimatedInputTokens: number;
  maxImages: number;
  /** Client-side downscale ceiling for vision tasks; null for text-only tasks. */
  maxImageResolution: { width: number; height: number } | null;
}

export interface TaskRoutePolicy {
  primary: ModelRoute;
  fallbacks: ModelRoute[];
  prices: Record<string, ModelPrice>;
  openRouterProviders: string[];
  requireZdr: boolean;
  structuredMode: 'json-schema' | 'tool';
  maxProviderCostUsd: number;
}

export type TaskLedgerKind = 'ai_generations' | 'ai_gateway_requests';

export interface TaskProfile {
  taskId: AiTaskId;
  enabled: boolean;
  schema: TaskSchemaRef;
  tiers: readonly AiTaskTier[];
  limits: TaskLimits;
  timeoutMs: number;
  maxAttempts: number;
  retryLimit: number;
  routePolicy: TaskRoutePolicy;
  /** Which ledger the task writes and the row discriminator it writes there. The
   *  ai_generations `profile` column pins its allowed values with a CHECK constraint
   *  (migration 0010), so a task introducing a new value ships that migration in the
   *  same commit (root AGENTS.md non-negotiable 6). */
  ledger: { kind: TaskLedgerKind; profile: string };
}

/** NoaCG Lite re-expressed as the first task profile: a VIEW over liteProfile(), so the
 *  AI_LITE_* env configuration stays single-sourced and /api/ai/lite/* behavior is
 *  unchanged. Callers that already built the request's LiteProfile pass it in rather
 *  than re-reading the environment. */
export function liteTaskProfile(profile: LiteProfile = liteProfile()): TaskProfile {
  return {
    taskId: LITE_TASK_ID,
    enabled: profile.enabled,
    schema: {
      // The skin experiment widens the structured contract, so the ref names which
      // shape the managed model is actually held to (liteContract.LITE_READY_OUTPUT*).
      id: profile.skinEnabled ? 'lite-ready-decision-skin' : 'lite-ready-decision',
      version: profile.promptVersion,
    },
    tiers: ['free'],
    limits: {
      outputTokens: profile.outputTokens,
      repairOutputTokens: profile.repairOutputTokens,
      estimatedInputTokens: profile.estimatedInputTokens,
      // Lite sends no images to the model; logo uploads ride the deterministic
      // browser pipeline and never reach a provider.
      maxImages: 0,
      maxImageResolution: null,
    },
    timeoutMs: profile.timeoutMs,
    maxAttempts: profile.maxAttempts,
    retryLimit: 0,
    routePolicy: {
      primary: profile.primary,
      fallbacks: [profile.fallback],
      prices: profile.prices,
      openRouterProviders: profile.openRouterProviders,
      requireZdr: profile.requireZdr,
      structuredMode: profile.openRouterStructuredMode,
      maxProviderCostUsd: profile.maxProviderCostUsd,
    },
    ledger: { kind: 'ai_generations', profile: profile.id },
  };
}

/** The imported-graphic-analysis task (plan §6): one vision call, proposal-only output,
 *  free tier, quotas per the ratified decision 3. Derived from its own env profile the
 *  same way the Lite view derives from liteProfile(). */
export function importAnalysisTaskProfile(profile: ImportAnalysisProfile = importAnalysisProfile()): TaskProfile {
  return {
    taskId: IMPORT_ANALYSIS_TASK_ID,
    enabled: profile.enabled,
    schema: { id: 'import-analysis', version: profile.promptVersion },
    tiers: ['free'],
    limits: {
      outputTokens: profile.outputTokens,
      repairOutputTokens: profile.outputTokens,
      estimatedInputTokens: profile.estimatedInputTokens,
      maxImages: IMPORT_ANALYSIS_LIMITS.maxImages,
      maxImageResolution: {
        width: IMPORT_ANALYSIS_LIMITS.maxWidth,
        height: IMPORT_ANALYSIS_LIMITS.maxHeight,
      },
    },
    timeoutMs: profile.timeoutMs,
    maxAttempts: profile.maxAttempts,
    retryLimit: 1,
    routePolicy: {
      primary: profile.route,
      // Deliberately no fallback: the vision benchmark picks ONE launch route (plan §8);
      // a second route enters as explicit configuration when it earns its place.
      fallbacks: [],
      prices: profile.prices,
      openRouterProviders: profile.openRouterProviders,
      requireZdr: profile.requireZdr,
      structuredMode: 'json-schema',
      maxProviderCostUsd: profile.maxProviderCostUsd,
    },
    ledger: { kind: 'ai_generations', profile: profile.id },
  };
}

const TASKS: Record<AiTaskId, () => TaskProfile> = {
  'lite-design-spec': () => liteTaskProfile(),
  'imported-graphic-analysis': () => importAnalysisTaskProfile(),
};

export function taskProfile(taskId: AiTaskId): TaskProfile {
  return TASKS[taskId]();
}

function routeConfigured(policy: TaskRoutePolicy, route: ModelRoute): boolean {
  if (route.provider !== 'openrouter') return true;
  return Boolean(policy.prices[modelRouteKey(route)]) && policy.openRouterProviders.length > 0;
}

/** True when the task's managed spend is free-tier: those routes must be catalog-
 *  approved. BYO/paid-only tasks spend the caller's own money on explicitly chosen
 *  routes, so the catalog does not constrain them. */
function catalogConstrained(task: TaskProfile): boolean {
  return task.tiers.includes('free') || task.tiers.includes('anonymous');
}

/** The registry's fail-closed gate, generalizing liteProfileConfigured(): every
 *  OpenRouter route needs a current price and a provider allowlist, and every
 *  free-tier route must be a catalog-approved entry. Approval never keys off
 *  openWeights - that flag is promotion-time preference metadata (plan §15.1). */
export function taskConfigured(task: TaskProfile): boolean {
  const routes = [task.routePolicy.primary, ...task.routePolicy.fallbacks];
  if (!routes.every((route) => routeConfigured(task.routePolicy, route))) return false;
  return !catalogConstrained(task) || routes.every(approvedModelRoute);
}
