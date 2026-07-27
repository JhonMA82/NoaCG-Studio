import { bearerToken, ipHash, json, methodGuard, readJson } from '../../_lib/http.js';
import { verifyUser } from '../../_lib/auth.js';
import { managedAiKey } from '../../_lib/aiCredentials.js';
import {
  executeGatewayRequest,
  estimateModelCost,
  GatewayError,
  type GatewayExecutionPolicy,
} from '../../_lib/aiGateway.js';
import { liteError } from '../../_lib/aiLiteHttp.js';
import {
  liteOpenRouterPolicy,
  liteProfile,
  liteProfileConfigured,
  liteProfileForUser,
  routePrice,
} from '../../_lib/aiLiteProfile.js';
import { admitLiteIp } from '../../_lib/aiLiteRateLimit.js';
import {
  getLiteGenerationStore,
  liteLedgerConfigured,
  modelResultPatch,
  type LiteGenerationRecord,
  type LiteReservation,
} from '../../_lib/aiLiteStore.js';
import {
  LITE_AI_CATEGORIES,
  LITE_DECISION_OUTPUT,
  liteRequestText,
  liteSystemPrompt,
  obviousUnsupportedDecision,
  validateLiteDecision,
} from '../../../src/ai/liteContract.js';
import type { LiteGenerationRequest, LiteGenerationResult } from '../../../src/ai/liteTypes.js';
import type { ModelResult, ModelRoute, ModelUsage } from '../../../src/ai/modelTypes.js';
import { validateProjectFormat } from '../../../src/model/projectFormat.js';

const MAX_BODY_BYTES = 32_000;
const ALLOWED_CATEGORY = new Set<string>(['auto', ...LITE_AI_CATEGORIES]);
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;

function recordType(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object expected');
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const set = new Set(allowed);
  return Object.keys(value).every((key) => set.has(key));
}

function validateRequest(value: unknown, profile: ReturnType<typeof liteProfile>): LiteGenerationRequest {
  const body = recordType(value);
  if (!onlyKeys(body, [
    'idempotencyKey', 'prompt', 'generationSpec', 'priorSpec', 'conversation',
    'palette', 'primaryFont', 'hasLogo', 'resolution', 'fps',
  ])) throw new Error('unknown field');
  if (typeof body.idempotencyKey !== 'string' || !IDEMPOTENCY.test(body.idempotencyKey)) throw new Error('idempotency');
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > profile.limits.promptCharacters) {
    throw new Error('prompt');
  }
  const resolution = recordType(body.resolution);
  if (!onlyKeys(resolution, ['width', 'height'])) throw new Error('resolution');
  if (!Number.isInteger(resolution.width) || !Number.isInteger(resolution.height)) {
    throw new Error('resolution');
  }
  if (
    validateProjectFormat(
      { width: Number(resolution.width), height: Number(resolution.height) },
      Number(body.fps),
    ).length > 0
  ) throw new Error('project format');
  if (body.generationSpec !== undefined && body.generationSpec !== null) {
    const spec = recordType(body.generationSpec);
    if (!onlyKeys(spec, [
      'version', 'category', 'fields', 'styleNotes', 'mood', 'avoidNotes',
      'brandColors', 'animation',
    ])) throw new Error('generation spec');
    if (spec.version !== 1 || typeof spec.category !== 'string' || !ALLOWED_CATEGORY.has(spec.category)) {
      throw new Error('generation spec');
    }
    if (!Array.isArray(spec.fields) || spec.fields.length > profile.limits.fields) throw new Error('fields');
    for (const field of spec.fields) {
      const item = recordType(field);
      if (!onlyKeys(item, ['label', 'kind', 'description', 'example'])) throw new Error('field');
      if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 80) throw new Error('field label');
      if (typeof item.example === 'string' && item.example.length > 500) throw new Error('field example');
    }
  }
  if (body.conversation !== undefined) {
    if (!Array.isArray(body.conversation) || body.conversation.length > profile.limits.conversationTurns) {
      throw new Error('conversation');
    }
    let characters = 0;
    for (const turn of body.conversation) {
      const item = recordType(turn);
      if (!onlyKeys(item, ['role', 'content'])) throw new Error('conversation');
      if ((item.role !== 'user' && item.role !== 'assistant') || typeof item.content !== 'string') throw new Error('conversation');
      characters += item.content.length;
    }
    if (characters > profile.limits.conversationCharacters) throw new Error('conversation length');
  }
  if (body.hasLogo !== undefined && typeof body.hasLogo !== 'boolean') throw new Error('logo');
  if (body.hasLogo === true && profile.limits.logos < 1) throw new Error('logo unsupported');
  if (body.palette !== undefined && body.palette !== null) {
    const palette = recordType(body.palette);
    if (!onlyKeys(palette, ['accent', 'text', 'textDim', 'panel'])) throw new Error('palette');
    if (!['accent', 'text', 'textDim', 'panel'].every((key) =>
      typeof palette[key] === 'string' && String(palette[key]).length <= 80
    )) throw new Error('palette');
  }
  if (body.primaryFont !== undefined && body.primaryFont !== null) {
    const font = recordType(body.primaryFont);
    if (!onlyKeys(font, ['family', 'uploaded'])) throw new Error('font');
    if (typeof font.family !== 'string' || font.family.length > 120 || typeof font.uploaded !== 'boolean') throw new Error('font');
  }
  if (body.priorSpec !== undefined) {
    const prior = recordType(body.priorSpec);
    if (!onlyKeys(prior, [
      'fit', 'reason', 'name', 'summary', 'category', 'variantId', 'lines',
      'intent', 'extraFields', 'useLogoSlot', 'zone', 'paletteId', 'palette', 'fontId',
      'sizeScale', 'animation', 'motionCharacter', 'typography', 'density',
      'alignment', 'shape', 'flourish',
    ])) throw new Error('prior spec');
    if (prior.fit !== 'catalog' || typeof prior.variantId !== 'string') throw new Error('prior spec');
  }
  return {
    ...(body as unknown as LiteGenerationRequest),
    prompt: body.prompt.trim(),
    resolution: { width: Number(resolution.width), height: Number(resolution.height) },
    fps: Number(body.fps),
  };
}

function policyFor(
  profile: ReturnType<typeof liteProfile>,
  route: ModelRoute,
  maxAttempts: number,
): GatewayExecutionPolicy {
  const openRouterRoute = route.provider === 'openrouter'
    ? route
    : [profile.primary, profile.fallback].find((candidate) => candidate.provider === 'openrouter');
  const openRouter = openRouterRoute ? liteOpenRouterPolicy(profile, openRouterRoute) : undefined;
  if (openRouterRoute && !openRouter) throw new Error('OpenRouter routing policy is not configured.');
  return {
    maxAttempts,
    retryLimit: 0,
    timeoutMs: profile.timeoutMs,
    ...(openRouter ? { openRouter } : {}),
  };
}

function zeroUsage(): ModelUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

function aggregateResults(first: ModelResult, second: ModelResult): ModelResult {
  const firstCost = first.usage.estimatedCost?.amount ?? 0;
  const secondCost = second.usage.estimatedCost?.amount ?? 0;
  return {
    ...second,
    attempts: [...first.attempts, ...second.attempts],
    usage: {
      inputTokens: first.usage.inputTokens + second.usage.inputTokens,
      outputTokens: first.usage.outputTokens + second.usage.outputTokens,
      totalTokens: first.usage.totalTokens + second.usage.totalTokens,
      cachedInputTokens: (first.usage.cachedInputTokens ?? 0) + (second.usage.cachedInputTokens ?? 0),
      reasoningTokens: (first.usage.reasoningTokens ?? 0) + (second.usage.reasoningTokens ?? 0),
      ...(firstCost || secondCost
        ? {
            estimatedCost: {
              amount: firstCost + secondCost,
              currency: 'USD' as const,
              source: first.usage.estimatedCost?.source === 'provider' || second.usage.estimatedCost?.source === 'provider'
                ? 'provider' as const
                : 'configured' as const,
            },
          }
        : {}),
    },
  };
}

function withProfileCost(result: ModelResult, profile: ReturnType<typeof liteProfile>): ModelResult {
  if (result.usage.estimatedCost) return result;
  const price = routePrice(profile, { provider: result.provider, model: result.model });
  const amount = estimateModelCost(
    { provider: result.provider, model: result.model },
    result.usage.inputTokens,
    result.usage.outputTokens,
    price ?? undefined,
  );
  return amount === null
    ? result
    : {
        ...result,
        usage: {
          ...result.usage,
          estimatedCost: { amount, currency: 'USD', source: 'configured' },
        },
      };
}

function reservationError(reservation: Exclude<LiteReservation, { status: 'created' }>): Response {
  if (reservation.status === 'duplicate') {
    return liteError('duplicate_request', 'This generation request was already processed.', 409);
  }
  if (reservation.status === 'user-concurrency') {
    return liteError('already_running', 'Finish the current Lite generation before starting another.', 409, true);
  }
  if (reservation.status === 'fleet-concurrency' || reservation.status === 'fleet-spend') {
    return liteError('fleet_capacity', 'NoaCG Lite has reached its current shared capacity. Try again later.', 503, true);
  }
  return liteError('allowance_exhausted', 'Your current NoaCG Lite allowance has been used.', 429);
}

function gatewayResponse(error: GatewayError): Response {
  if (error.code === 'rate_limited' || error.code === 'unavailable' || error.code === 'timeout') {
    return liteError('provider_unavailable', error.message, error.status, true);
  }
  return liteError('generation_failed', error.message, error.status, false);
}

async function failRecord(
  record: LiteGenerationRecord | null,
  reason: string,
  result?: ModelResult,
  conservativeCostUsd?: number,
): Promise<void> {
  if (!record) return;
  await (await getLiteGenerationStore()).update(record.id, {
    ...(result ? modelResultPatch(result) : {}),
    ...(!result && conservativeCostUsd ? { providerCostUsd: conservativeCostUsd } : {}),
    status: 'failed',
    rejectionReason: reason.slice(0, 80),
  });
}

function internalFailureCode(error: unknown): string {
  if (!(error instanceof Error)) return 'internal';
  if (error.message.startsWith('Lite generation update failed:')) return 'ledger_update';
  if (error.message.startsWith('Lite generation lookup failed:')) return 'ledger_lookup';
  if (error.message.startsWith('Lite quality-prior lookup failed:')) return 'quality_prior_lookup';
  return 'internal';
}

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'POST');
    if (guard) return guard;

    let profile = liteProfile();
    if (!profile.enabled) return liteError('profile_disabled', 'NoaCG Lite is currently unavailable.', 503, true);
    if (!liteProfileConfigured(profile) || !liteLedgerConfigured()) {
      return liteError('profile_not_configured', 'NoaCG Lite is not fully configured.', 503);
    }
    if (![profile.primary, profile.fallback].every((route) => Boolean(managedAiKey(route.provider)))) {
      return liteError('profile_not_configured', 'NoaCG Lite has no configured managed route.', 503);
    }
    const callerIpHash = ipHash(req);
    const admission = admitLiteIp(callerIpHash);
    if (!admission.allowed) {
      return liteError('rate_limited', 'Too many Lite requests from this network. Try again shortly.', 429, true, {
        'retry-after': String(admission.retryAfterSeconds),
      });
    }
    const user = await verifyUser(bearerToken(req));
    if (!user) return liteError('authentication_required', 'Sign in to use NoaCG Lite.', 401);
    profile = liteProfileForUser(profile, user.userId);

    let request: LiteGenerationRequest;
    try {
      request = validateRequest(await readJson<unknown>(req, MAX_BODY_BYTES), profile);
    } catch {
      return liteError('invalid_request', 'The Lite request exceeds its supported size or shape.', 400);
    }

    const unsupported = obviousUnsupportedDecision(request.prompt);
    if (unsupported) {
      const result: LiteGenerationResult = {
        generationId: `unsupported-${crypto.randomUUID()}`,
        decision: unsupported,
        usage: zeroUsage(),
        attemptCount: 0,
        repairCount: 0,
        expiresAt: new Date(Date.now() + profile.expiryMs).toISOString(),
      };
      return json(result);
    }

    const worstPrimary = estimateModelCost(
      profile.primary,
      profile.estimatedInputTokens,
      profile.outputTokens,
      routePrice(profile, profile.primary) ?? undefined,
    );
    const worstFallback = estimateModelCost(
      profile.fallback,
      profile.estimatedInputTokens,
      profile.outputTokens,
      routePrice(profile, profile.fallback) ?? undefined,
    );
    if (worstPrimary === null || worstFallback === null || worstPrimary + worstFallback > profile.maxProviderCostUsd) {
      return liteError('cost_ceiling', 'The configured Lite routes exceed the per-request cost ceiling.', 503);
    }

    const store = await getLiteGenerationStore();
    const now = Date.now();
    const requestedCategory = request.generationSpec?.category;
    const reservation = await store.reserve({
      userId: user.userId,
      ipHash: callerIpHash,
      idempotencyKey: request.idempotencyKey,
      requestedCategory: requestedCategory && requestedCategory !== 'auto' ? requestedCategory : null,
      now,
      profile,
    });
    if (reservation.status !== 'created') return reservationError(reservation);
    let record: LiteGenerationRecord | null = reservation.record;
    record = await store.update(record.id, { status: 'model_running' });
    const qualityPriors = await store.qualityPriors({
      now,
      windowDays: profile.qualityPriorWindowDays,
      minSamples: profile.qualityPriorMinSamples,
    }).catch(() => []);
    const trustedSystemPrompt = liteSystemPrompt(profile.promptVersion, qualityPriors);

    const modelRequest = {
      system: trustedSystemPrompt,
      messages: [{ role: 'user' as const, content: liteRequestText(request) }],
      maxTokens: profile.outputTokens,
      structuredOutput: LITE_DECISION_OUTPUT,
      cacheSystem: true,
    };

    let accountedResult: ModelResult | undefined;
    try {
      let modelResult = withProfileCost(await executeGatewayRequest(
        { request: modelRequest, route: profile.primary, fallbacks: [profile.fallback] },
        { keyFor: async (provider) => managedAiKey(provider) },
        policyFor(profile, profile.primary, profile.maxAttempts),
      ), profile);
      accountedResult = modelResult;
      let semantic = validateLiteDecision(modelResult.output, request, profile.limits.fields);
      const usedAttempts = modelResult.attempts.reduce((sum, item) => sum + item.attempts, 0);

      if (!semantic.decision && usedAttempts < profile.maxAttempts) {
        const repairRoute = { provider: modelResult.provider, model: modelResult.model };
        const repair = withProfileCost(await executeGatewayRequest(
          {
            request: {
              system: trustedSystemPrompt,
              messages: [{
                role: 'user',
                content: JSON.stringify({
                  task: 'Repair only the structured decision so it obeys the listed rules.',
                  ruleErrors: semantic.errors,
                  invalidDecision: modelResult.output,
                  request: JSON.parse(liteRequestText(request)),
                }),
              }],
              maxTokens: profile.repairOutputTokens,
              structuredOutput: LITE_DECISION_OUTPUT,
              cacheSystem: true,
            },
            route: repairRoute,
          },
          { keyFor: async (provider) => managedAiKey(provider) },
          policyFor(profile, repairRoute, profile.maxAttempts - usedAttempts),
        ), profile);
        modelResult = aggregateResults(modelResult, repair);
        accountedResult = modelResult;
        semantic = validateLiteDecision(repair.output, request, profile.limits.fields);
        record = await store.update(record?.id ?? '', { repairCount: 1 });
      }

      if (!semantic.decision) {
        await failRecord(record, semantic.errors.join(','), modelResult);
        return liteError('generation_failed', 'Lite could not produce a usable design decision for this brief.', 422);
      }
      const actualCost = modelResult.usage.estimatedCost?.amount ?? 0;
      if (actualCost > profile.maxProviderCostUsd) {
        await store.update(record?.id ?? '', { ...modelResultPatch(modelResult), status: 'failed', rejectionReason: 'cost_ceiling' });
        return liteError('cost_ceiling', 'This Lite generation exceeded its cost ceiling and was stopped.', 503);
      }
      const resolvedCategory = semantic.decision.status === 'ready'
        ? semantic.decision.spec.category
        : null;
      const resolvedVariantId = semantic.decision.status === 'ready'
        ? semantic.decision.spec.variantId
        : null;
      const intentKind = semantic.decision.status === 'ready'
        ? semantic.decision.spec.intent.kind
        : null;
      record = await store.update(record?.id ?? '', {
        ...modelResultPatch(modelResult),
        status: semantic.decision.status === 'ready' ? 'spec_ready' : 'unsupported',
        resolvedCategory,
        resolvedVariantId,
        intentKind,
        rejectionReason: semantic.decision.status === 'unsupported' ? semantic.decision.code : null,
      });
      if (!record) return liteError('generation_failed', 'Lite could not persist the generation outcome.', 500);
      const result: LiteGenerationResult = {
        generationId: record.id,
        decision: semantic.decision,
        usage: modelResult.usage,
        attemptCount: record.attemptCount,
        repairCount: record.repairCount,
        expiresAt: new Date(record.expiresAt).toISOString(),
      };
      return json(result);
    } catch (error) {
      await failRecord(
        record,
        error instanceof GatewayError ? error.code : internalFailureCode(error),
        accountedResult,
        accountedResult ? undefined : profile.maxProviderCostUsd,
      );
      return error instanceof GatewayError
        ? gatewayResponse(error)
        : liteError('generation_failed', 'NoaCG Lite could not complete this generation.', 500);
    }
  },
};
