// The browser's own entitlement, fetched once and shared.
//
// It lives in backend/ rather than in entitlements/ deliberately: entitlements/ is a PURE
// layer-0 contract that api/, the tests and the browser all compile, and putting a fetch in it
// would end that. This module is the SERVICE half - it talks to the network and holds the
// cache; the rules it fetches are still the ones in entitlements/contract.ts, resolved on the
// server, with no second copy anywhere.
//
// A module-level promise rather than a per-caller fetch: the render panel, the video render
// panel and the template browser all want the same answer, and three components mounting at
// once must not become three requests.
//
// DEGRADES TO THE DEFAULTS, always. No backend, an unreachable server, a malformed body - all
// resolve to the anonymous answer with nothing hidden, which keeps the offline editor and the
// free-forever catalog whole. This is UX; the server re-checks every gated path.

import { getAccessToken } from './auth';
import { isBackendConfigured } from './config';
import { ANONYMOUS_PLAN, FEATURE_KEYS, LIMIT_KEYS, type FeatureKey, type LimitKey } from '../entitlements/contract';
import type { MyEntitlement } from '../entitlements/clientTypes';

export function defaultEntitlement(): MyEntitlement {
  const features = {} as Record<FeatureKey, boolean>;
  for (const key of FEATURE_KEYS) features[key] = ANONYMOUS_PLAN.features[key] ?? false;
  const limits = {} as Record<LimitKey, number | null>;
  for (const key of LIMIT_KEYS) limits[key] = null;
  return {
    signedIn: false,
    suspended: false,
    features,
    limits,
    renderTier: ANONYMOUS_PLAN.renderTier,
    renderFormats: null,
    hiddenTemplates: [],
  };
}

// Keyed on the ACCESS TOKEN rather than invalidated by an auth listener. Signing in or out is
// exactly a token change, so the key does the invalidation for free - and it avoids a value
// cycle (auth would have to import this module to reset it, while this module needs auth for
// the token), which the architecture bans because those bite at module-init time.
let cached: { key: string; value: Promise<MyEntitlement> } | null = null;

async function load(token: string | null): Promise<MyEntitlement> {
  if (!isBackendConfigured()) return defaultEntitlement();
  try {
    const response = await fetch('/api/me/entitlement', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) return defaultEntitlement();
    const body = (await response.json()) as MyEntitlement;
    // Trust the shape only as far as the fields that get used; a malformed body must not
    // become a TypeError inside a render.
    if (!body || typeof body !== 'object' || !body.features) return defaultEntitlement();
    return {
      ...defaultEntitlement(),
      ...body,
      hiddenTemplates: Array.isArray(body.hiddenTemplates) ? body.hiddenTemplates : [],
    };
  } catch {
    return defaultEntitlement();
  }
}

/** Drop the shared answer so the next read refetches. The token key already covers signing in
 *  and out; this is for a change the token cannot show - an admin editing this user's plan
 *  while they have the page open. */
export function resetMyEntitlement(): void {
  cached = null;
}

export async function myEntitlement(): Promise<MyEntitlement> {
  const token = await getAccessToken().catch(() => null);
  const key = token ?? '';
  if (cached?.key !== key) cached = { key, value: load(token) };
  return cached.value;
}
