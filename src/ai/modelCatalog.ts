// Browser-safe model discovery for providers with large, fast-changing catalogs.
// Credentials stay on the server. The UI receives only public model metadata normalized by
// /api/ai/models and may still accept an opaque model id when discovery is unavailable.

import { getAccessToken } from '../backend/auth';
import type {
  AiDiscoveredModel,
  AiModelCatalogResponse,
  AiProviderId,
} from './modelTypes';
export type { AiDiscoveredModel, AiModelCatalogResponse } from './modelTypes';

const cache = new Map<AiProviderId, AiModelCatalogResponse>();

export function cachedDiscoveredModels(provider: AiProviderId): AiDiscoveredModel[] {
  return cache.get(provider)?.models ?? [];
}

export async function discoverAiModels(
  provider: AiProviderId,
  options: { refresh?: boolean } = {},
): Promise<AiModelCatalogResponse> {
  if (!options.refresh) {
    const found = cache.get(provider);
    if (found) return found;
  }
  const token = await getAccessToken();
  const response = await fetch(`/api/ai/models?provider=${encodeURIComponent(provider)}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error('Could not load the provider model catalog.');
  const catalog = await response.json() as AiModelCatalogResponse;
  cache.set(provider, catalog);
  return catalog;
}

/** Models that can run both structured video stages and emit a full composition. */
export function videoCompatibleModels(models: AiDiscoveredModel[]): AiDiscoveredModel[] {
  return models.filter((model) =>
    model.available
    && model.supportsStructuredOutput
    && model.inputModalities.includes('text')
    && (model.contextLength === null || model.contextLength >= 32_000)
    && (model.maxOutputTokens === null || model.maxOutputTokens >= 16_000)
  );
}

export function modelPriceLabel(model: AiDiscoveredModel): string {
  if (model.free) return 'Free';
  if (model.inputPerMillion === null || model.outputPerMillion === null) return 'Price unavailable';
  return `$${model.inputPerMillion.toFixed(2)} in / $${model.outputPerMillion.toFixed(2)} out per 1M`;
}
