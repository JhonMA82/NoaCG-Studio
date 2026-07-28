// Browser client for the server-side model gateway. It deliberately contains no provider
// credentials and exposes the same structured/text call shape the existing harness uses.

import { getAccessToken } from '../backend/auth';
import { defaultModelForProvider, loadAiSettings } from './settings';
import type {
  AiGatewayErrorBody,
  AiGatewayRequestBody,
  AiGatewayResponseBody,
  ModelContentBlock,
  ModelRequest,
  ModelResult,
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
    ...providerNeutralRequest
  } = request;
  const body: AiGatewayRequestBody = {
    request: {
      ...providerNeutralRequest,
      ...(settings.temperature !== null && settings.provider === 'openrouter'
        ? { temperature: settings.temperature }
        : {}),
      ...(settings.seed !== null && settings.provider === 'openrouter'
        ? { seed: settings.seed }
        : {}),
      ...(settings.temperature !== null && settings.provider === 'huggingface'
        ? { temperature: settings.temperature }
        : {}),
      ...(settings.seed !== null && settings.provider === 'huggingface'
        ? { seed: settings.seed }
        : {}),
      ...(structuredOutput ? { structuredOutput } : {}),
    },
    route: { provider: settings.provider, model },
    ...(settings.fallbacks.length ? { fallbacks: settings.fallbacks } : {}),
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
