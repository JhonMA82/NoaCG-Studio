// The browser's view of its own entitlement - the wire shape of GET /api/me/entitlement.
//
// FLAT on purpose: values, no sources. "Why does this hold" is an operator's question, answered
// on the admin surface against an actor allowed to ask it. Shipping the sources here would tell
// every user which grants and overrides exist on their account.
//
// Everything here is UX. The server re-resolves and re-checks on every gated path, so a client
// that lies to itself only ever gets a refusal it could have predicted.

import type { FeatureKey, LimitKey } from './contract';

export interface MyEntitlement {
  signedIn: boolean;
  suspended: boolean;
  features: Record<FeatureKey, boolean>;
  limits: Record<LimitKey, number | null>;
  /** The render tier name; the caps themselves live in src/render/limits.ts. */
  renderTier: string;
  /** Null means "whatever the tier already allows". */
  renderFormats: readonly string[] | null;
  /** Catalog and community template keys this caller must not be shown. */
  hiddenTemplates: string[];
}
