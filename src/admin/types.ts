// The wire contract between api/admin/* and the admin page. Types only - this file is
// imported by both sides, so it must stay free of runtime code, React and browser globals.
//
// What is NOT here is as deliberate as what is: no table names, no column names, no role
// predicate, no route list beyond the calls the page actually makes. The admin bundle is a
// public static asset (docs/ADMIN.md section 1), so anything written here is readable by
// anyone. Identifiers and labels are fine; a description of the schema is not.

import type { EntitlementValue, FeatureKey, LimitKey } from '../entitlements/contract';

export type AdminRole = 'owner' | 'admin' | 'support';

/** GET /api/admin/session. The whole answer: who am I, and what may I do. */
export interface AdminSessionResponse {
  email: string;
  role: AdminRole;
}

/** Every admin endpoint has exactly one failure shape. The page never distinguishes
 *  "not allowed" from "no such route", because the server does not either. */
export interface AdminErrorResponse {
  error: { code: string; message: string };
}

// ── users ──────────────────────────────────────────────────────────────────────────────

export type AccountState = 'active' | 'suspended';

/** One row in the user list. Enough to triage; the detail call carries the rest. */
export interface AdminUserSummary {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  /** Set when the account was invited and has not yet accepted. */
  pendingInvite: boolean;
  state: AccountState;
  planName: string;
  isAdmin: AdminRole | null;
  /** Rolling 30-day AI generation count and provider cost. */
  aiGenerations30d: number;
  aiCostUsd30d: number;
}

export interface AdminUserListResponse {
  users: AdminUserSummary[];
  /** True when the account directory was longer than one page and the list is a prefix. */
  truncated: boolean;
  total: number;
}

/** A grant or override as the admin page sees it. */
export interface AdminGrant {
  id: string;
  kind: 'feature' | 'quota';
  key: string;
  value: boolean | number | null;
  reason: string;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  /** Present only on revoked rows, which the page shows greyed rather than hiding. */
  revokedAt: string | null;
}

/** What this user actually gets, and why, straight off the resolver. */
export interface AdminAccess {
  planKey: string;
  planName: string;
  planExpiresAt: string | null;
  features: Record<FeatureKey, EntitlementValue<boolean>>;
  limits: Record<LimitKey, EntitlementValue<number | null>>;
  renderTier: EntitlementValue<string>;
}

/** Measured usage. Always the truth from the ledgers, never an estimate. */
export interface AdminUsage {
  aiGenerations30d: number;
  aiSuccesses30d: number;
  aiFailures30d: number;
  aiCostUsd30d: number;
  aiGenerationsToday: number;
  renderJobs30d: number;
  documents: number;
  storageBytes: number;
  /** Allowance keys the user is currently at or over. Empty when nothing is pinched. */
  atLimit: LimitKey[];
}

export interface AdminUserDetail {
  user: AdminUserSummary;
  access: AdminAccess;
  usage: AdminUsage;
  grants: AdminGrant[];
  recentActivity: AdminActivityEntry[];
}

export interface AdminActivityEntry {
  at: string;
  kind: 'ai' | 'render' | 'admin';
  summary: string;
}

// ── plans ──────────────────────────────────────────────────────────────────────────────

export interface AdminPlan {
  id: string;
  key: string;
  name: string;
  description: string;
  status: 'active' | 'archived';
  isDefault: boolean;
  features: Partial<Record<FeatureKey, boolean>>;
  limits: Partial<Record<LimitKey, number | null>>;
  renderTier: string;
  renderFormats: string[] | null;
  /** Billing preparation only. Nothing in the product reads this. */
  billing: { amountCents?: number; currency?: string; interval?: string; externalPriceRef?: string };
  sortOrder: number;
  /** How many users are on this plan right now, so archiving is an informed decision. */
  assignedCount: number;
}

export interface AdminPlanListResponse {
  plans: AdminPlan[];
  /** The tier names a plan may name, so the editor offers a list instead of a free text box. */
  renderTiers: string[];
  /** The cloud render formats a plan may allow. */
  renderFormats: string[];
}

// ── audit ──────────────────────────────────────────────────────────────────────────────

export interface AdminAuditEntry {
  id: string;
  at: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
}

export interface AdminAuditResponse {
  entries: AdminAuditEntry[];
  /** Pass back as `before` to page further into the past. */
  nextBefore: string | null;
}

// ── usage dashboard ────────────────────────────────────────────────────────────────────

export interface AdminUsageDay {
  day: string;
  generations: number;
  successes: number;
  failures: number;
  costUsd: number;
}

export interface AdminUsageOverview {
  days: AdminUsageDay[];
  /** Rejection reason -> count, over the window. The operator's first debugging surface. */
  failureReasons: { reason: string; count: number }[];
  /** Users who hit an allowance in the window, worst first. */
  pinched: { userId: string; email: string; refusals: number; lastAt: string }[];
  totals: { generations: number; costUsd: number; gatewayRequests: number; renderJobs: number };
  /** Today's spend against the deployment's daily fleet ceiling. */
  fleetSpendTodayUsd: number;
  fleetSpendCeilingUsd: number;
}

// ── system controls ────────────────────────────────────────────────────────────────────

export interface AdminSystemState {
  /** Feature kill switches. A false value disables the feature for EVERY user, plans and
   *  grants included - it is an incident control, not an entitlement. */
  disabledFeatures: FeatureKey[];
  /** Approved model routes and whether each is currently allowed to serve traffic. */
  models: { provider: string; model: string; enabled: boolean; note: string }[];
  /** Shown to every visitor when set. Empty means no notice. */
  maintenanceNotice: { message: string; level: 'info' | 'warning'; until: string | null } | null;
  /** Users who see beta-marked features and templates regardless of their plan. */
  betaUserIds: string[];
}

// ── templates ──────────────────────────────────────────────────────────────────────────

export type TemplateVisibility = 'public' | 'beta' | 'internal' | 'hidden';

export interface AdminTemplateEntry {
  key: string;
  source: 'catalog' | 'community';
  name: string;
  category: string;
  visibility: TemplateVisibility;
  /** Community rows only: the moderation status the gallery already tracks. */
  status: string | null;
  /** Times this template was used to create a graphic, from the funnel ledger. */
  uses: number;
  note: string;
}

export interface AdminTemplateListResponse {
  templates: AdminTemplateEntry[];
  /** True when the funnel ledger is not available, so `uses` is zero for a reason. */
  usageUnavailable: boolean;
}
