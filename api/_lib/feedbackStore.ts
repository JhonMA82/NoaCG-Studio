// Validation and the write for `user_feedback` (migration 0028).
//
// Same posture as funnelEvents.ts, and for the same reasons: the browser is not trusted to send
// a well-formed submission, everything below is an allowlist, and a write failure must never
// surface to the person who was trying to help us. What differs is that ONE field here is
// deliberately free text - so the boundary work is about what may accompany it rather than
// about scrubbing it.
//
// THE CONTEXT IS DERIVED, NEVER ACCEPTED. A generation rating arrives carrying a generation id
// and nothing else about the generation. The route, chassis and intent facet are read here from
// `ai_generations`, because the browser is not told which model answered (Lite hides it on
// purpose) and a client-supplied one would be unverifiable. They are then COPIED onto the
// feedback row rather than left to a join: a Lite retry rewrites the ledger row in place, and a
// join would silently re-attribute an old complaint to whatever model ran last.

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseSecretKey } from './jobStore.js';
import {
  FEEDBACK_AREAS,
  FEEDBACK_KINDS,
  FEEDBACK_MAX_REASONS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_SENTIMENTS,
  reasonsFor,
  type FeedbackSubmission,
} from '../../src/feedback/contract.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A variant id is a slug this codebase writes (`ltc01`, `lower-third-slab`, ...). The regex is
 *  the contract, so a client cannot turn the column into free text by sending one. */
const VARIANT_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const TIERS = ['lite', 'pro', 'custom'] as const;

export interface FeedbackRow {
  kind: string;
  sentiment: string;
  reasons: string[];
  message: string;
  generationId: string | null;
  /** Client-declared, and only ever used where the ledger has nothing to say - see the header. */
  tier: string | null;
  variantId: string | null;
  area: string | null;
  visitorId: string | null;
}

function oneOf<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : null;
}

/**
 * A submission normalized into a row, or null when it is not usable.
 *
 * NULL IS A DROP, NOT AN ERROR, and the endpoint answers identically either way - a person
 * writing us a note must never be shown a validation failure, and a response that distinguished
 * accepted from dropped would tell a prober which generation ids exist.
 *
 * The one thing NOT silently dropped is an over-long message: it is refused by the CHECK
 * constraint and rejected here first, because quietly storing half of somebody's paragraph is
 * worse than not storing it. The browser caps the field at the same number, so a real user
 * cannot reach this path.
 */
export function feedbackRow(input: unknown): FeedbackRow | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const body = input as Partial<FeedbackSubmission> & Record<string, unknown>;

  const kind = oneOf(body.kind, FEEDBACK_KINDS);
  const sentiment = oneOf(body.sentiment, FEEDBACK_SENTIMENTS);
  if (!kind || !sentiment) return null;

  // Reasons are validated against the KIND, so a beta reason cannot be filed against a
  // generation and vice versa - which is what keeps the admin page's per-reason counts
  // meaningful rather than a mixed bag of two vocabularies.
  const allowed = reasonsFor(kind);
  const raw = Array.isArray(body.reasons) ? body.reasons : [];
  const reasons = [...new Set(raw.filter((value): value is string => oneOf(value, allowed) !== null))]
    .slice(0, FEEDBACK_MAX_REASONS);

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length > FEEDBACK_MESSAGE_MAX) return null;

  // A submission with no sentiment reason and no words is still a rating - the thumb IS the
  // data point, and requiring more would make the flow the interruption it must not be.

  // Not required even for a generation rating: only Lite writes a ledger row and hands its id
  // to the browser, so demanding one would collect ratings from a single tier and call the
  // result product satisfaction. A beta note never carries one.
  const generationId = kind === 'generation' && typeof body.generationId === 'string'
    && UUID_RE.test(body.generationId)
    ? body.generationId.toLowerCase()
    : null;

  return {
    kind,
    sentiment,
    reasons,
    message,
    generationId,
    tier: oneOf(body.tier, TIERS),
    variantId: typeof body.variantId === 'string' && VARIANT_RE.test(body.variantId)
      ? body.variantId
      : null,
    area: oneOf(body.area, FEEDBACK_AREAS),
    visitorId: typeof body.visitorId === 'string' && UUID_RE.test(body.visitorId)
      ? body.visitorId.toLowerCase()
      : null,
  };
}

export function feedbackStoreConfigured(): boolean {
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
  return Boolean(url && supabaseSecretKey());
}

let client: SupabaseClient | null = null;
async function sb(): Promise<SupabaseClient> {
  if (client) return client;
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(url, supabaseSecretKey(), { auth: { persistSession: false } });
  return client;
}

/** Test seam, matching resetAdminDb(): drop the memoized client so a test can change the env. */
export function resetFeedbackStore(): void {
  client = null;
}

interface GenerationContext {
  tier: string | null;
  model: string | null;
  variantId: string | null;
  intentKind: string | null;
  promptVersion: string | null;
}

const NO_CONTEXT: GenerationContext = {
  tier: null, model: null, variantId: null, intentKind: null, promptVersion: null,
};

/**
 * The investigation context for one generation, read from the ledger.
 *
 * OWNERSHIP IS CHECKED WHEN THERE IS AN OWNER TO CHECK. A signed-in caller may only attach
 * feedback to their own generation; an anonymous one cannot attach it to any, because
 * `ai_generations.user_id` is NOT NULL and there is nothing to match against. Both failures
 * return NO_CONTEXT rather than refusing the submission - the note is still worth keeping, it
 * simply arrives without a route attached, and refusing would make the endpoint a
 * generation-id oracle (the same reasoning as the Lite judge, src/ai/AGENTS.md).
 */
async function generationContext(generationId: string, userId: string | null): Promise<GenerationContext> {
  if (!userId) return NO_CONTEXT;
  try {
    const { data } = await (await sb())
      .from('ai_generations')
      .select('user_id, profile, model, resolved_variant_id, intent_kind, prompt_version')
      .eq('id', generationId)
      .maybeSingle();
    if (!data || data.user_id !== userId) return NO_CONTEXT;
    const profile = typeof data.profile === 'string' ? data.profile : null;
    return {
      // `profile` is the ledger's word for what this project calls a tier. Mapped rather than
      // stored raw, so the admin filter offers the vocabulary the product uses.
      tier: profile === 'lite' || profile === 'pro' || profile === 'custom' ? profile : null,
      model: typeof data.model === 'string' ? data.model.slice(0, 120) : null,
      variantId: typeof data.resolved_variant_id === 'string' ? data.resolved_variant_id.slice(0, 80) : null,
      intentKind: typeof data.intent_kind === 'string' ? data.intent_kind.slice(0, 40) : null,
      promptVersion: typeof data.prompt_version === 'string' ? data.prompt_version.slice(0, 64) : null,
    };
  } catch {
    return NO_CONTEXT;
  }
}

/**
 * Store one submission. Best-effort throughout, like every other ledger write on this project.
 *
 * A second rating on the same generation REPLACES the first (the partial unique index in 0028
 * plus this upsert): somebody changing their mind is one opinion, not two, and counting both
 * would weight satisfaction toward whoever clicked most. `status` and `admin_note` are
 * deliberately left out of the update - a re-rating must not reopen a triaged item or erase a
 * note an admin wrote about it.
 */
export async function recordFeedback(row: FeedbackRow, userId: string | null): Promise<void> {
  if (!feedbackStoreConfigured()) return;
  try {
    const context = row.generationId ? await generationContext(row.generationId, userId) : NO_CONTEXT;
    const values = {
      kind: row.kind,
      sentiment: row.sentiment,
      reasons: row.reasons,
      message: row.message,
      user_id: userId,
      visitor_id: row.visitorId,
      area: row.area,
      generation_id: row.generationId,
      // The ledger wins where it has an answer; the client's declaration is the fallback for a
      // generation that never wrote a ledger row (Pro, BYO, the offline stub). `model` and
      // `intent_kind` have no client fallback at all - the browser is not told the model, and
      // an intent facet is the server's classification - so they stay null rather than guessed.
      tier: context.tier ?? row.tier,
      model: context.model,
      variant_id: context.variantId ?? row.variantId,
      intent_kind: context.intentKind,
      prompt_version: context.promptVersion,
    };
    const db = await sb();
    const { error } = row.generationId
      ? await db.from('user_feedback').upsert(values, { onConflict: 'generation_id' })
      : await db.from('user_feedback').insert(values);
    if (error) console.warn('Feedback write failed:', error.message);
  } catch (error) {
    console.warn('Feedback write failed:', error instanceof Error ? error.message : error);
  }
}
