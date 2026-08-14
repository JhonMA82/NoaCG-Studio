// Browser client for the server-side model gateway. It deliberately contains no provider
// credentials and exposes the same structured/text call shape the existing harness uses.

import { getAccessToken } from '../backend/auth';
import { defaultModelForProvider, loadAiSettings } from './settings';
import type {
  AiGatewayErrorBody,
  AiGatewayRequestBody,
  AiGatewayResponseBody,
  AiGatewaySurface,
  ModelContentBlock,
  ModelRequest,
  ModelResult,
  ModelRoute,
  StructuredOutput,
} from './modelTypes';

export type ContentBlock = ModelContentBlock;

export interface ModelTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface GatewayModelRequest extends Omit<ModelRequest, 'structuredOutput'> {
  /** Compatibility shape used by the established harness's forced structured calls. */
  tool?: ModelTool;
  /** The product surface this call belongs to, when the server gates that surface. Callers
   *  never set it by hand: `src/ai/video/videoGateway.ts` and `src/ai/pro/proGateway.ts`
   *  are the only places it is filled in, so a new gated call cannot forget it. */
  surface?: AiGatewaySurface;
  /** The hosted NoaCG Pro reservation paying for this call (src/ai/pro/session.ts). Absent on
   *  a bring-your-own-key run, which spends the caller's own money and needs no allowance. */
  proGenerationId?: string;
  /** Pin the FULL route for this call, bypassing the session's provider/model AND its
   *  fallbacks. For calls whose modality the session route cannot serve (an image
   *  generation on a text session model), where a settings fallback would be a silent
   *  route change into the wrong capability. */
  route?: ModelRoute;
}

export async function callModelDetailed(request: GatewayModelRequest): Promise<ModelResult> {
  const settings = loadAiSettings();
  const model = request.model
    ?? (request.modelRole === 'fast' ? defaultModelForProvider(settings.provider, 'fast') : settings.model)
    ?? settings.model;
  const structuredOutput: StructuredOutput | undefined = request.tool
    ? {
        name: request.tool.name,
        description: request.tool.description,
        schema: request.tool.input_schema,
      }
    : undefined;
  const {
    tool: _tool,
    model: _model,
    modelRole: _modelRole,
    surface,
    proGenerationId,
    route: pinnedRoute,
    ...providerNeutralRequest
  } = request;
  const route = pinnedRoute ?? { provider: settings.provider, model };
  const body: AiGatewayRequestBody = {
    request: {
      ...providerNeutralRequest,
      ...(settings.temperature !== null && route.provider === 'vercel'
        ? { temperature: settings.temperature }
        : {}),
      ...(settings.seed !== null && route.provider === 'vercel'
        ? { seed: settings.seed }
        : {}),
      ...(settings.temperature !== null && route.provider === 'huggingface'
        ? { temperature: settings.temperature }
        : {}),
      ...(settings.seed !== null && route.provider === 'huggingface'
        ? { seed: settings.seed }
        : {}),
      ...(structuredOutput ? { structuredOutput } : {}),
    },
    route,
    // A pinned route means exactly that route: the session's fallbacks belong to the
    // session model, not to a call that pinned a different capability.
    ...(!pinnedRoute && settings.fallbacks.length ? { fallbacks: settings.fallbacks } : {}),
    ...(surface ? { surface } : {}),
    ...(proGenerationId ? { proGenerationId } : {}),
  };
  const token = await getAccessToken();
  const response = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as AiGatewayErrorBody | null;
    throw new Error(error?.error.message ?? 'The AI request failed.');
  }
  return response.json() as Promise<AiGatewayResponseBody>;
}

export async function callModel(request: GatewayModelRequest): Promise<unknown> {
  return (await callModelDetailed(request)).output;
}
