// The feedback vocabulary - one pure module, no DOM, no import.meta, no process.env, no
// Supabase. Held to the same discipline as src/entitlements/contract.ts and for the same
// reason: the browser form, the API validator, the admin inbox and the database CHECK
// constraints all have to agree about what a valid piece of feedback is, and four copies of a
// string list is four chances to disagree.
//
// WHAT THIS IS NOT. It is not a second quality signal. The generation ledger already records a
// content-free outcome per Lite generation - resolved chassis, intent facet, enumerated discard
// reason (migration 0011) - and `ai_lite_variant_quality()` feeds it back into the Lite prompt
// as a tie-breaker. That system stays exactly as it is. This one answers the question that one
// deliberately cannot: WHY, in the user's own words.
//
// So the two are joined rather than parallel: `GENERATION_FEEDBACK_REASONS` below is the same
// enumerated vocabulary the 0011 CHECK constraint already allows, minus the two values a user
// never picks (`regenerated` and `closed` are written by the app when a result is replaced or
// the wizard is closed - they are implicit signals, not answers to "what was wrong"). The Lite
// outcome endpoint imports its own list from here, so the third copy that used to live in
// api/_lib/lite/outcome.ts is gone.

/** A general "how is the beta going" note, or a rating attached to one generation. */
export const FEEDBACK_KINDS = ['beta', 'generation'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/**
 * The satisfaction axis, and it is deliberately two-valued.
 *
 * A generation rating has to cost one click or it will not happen - the brief for this is
 * "optional, no interruption, no mandatory step", and a five-point scale on a card the user is
 * about to close collects nothing. Two values also make "overall satisfaction" ONE arithmetic
 * across both surfaces; a scale here and a thumb there would produce two numbers that cannot be
 * added and an admin page that has to explain why.
 */
export const FEEDBACK_SENTIMENTS = ['positive', 'negative'] as const;
export type FeedbackSentiment = (typeof FEEDBACK_SENTIMENTS)[number];

/**
 * Why a generated graphic was not good enough. THE SAME SET migration 0011 already constrains
 * `ai_generations.feedback_reason` to, minus the two implicit ones - so a reason picked in the
 * feedback card and a reason recorded by a discard are directly comparable rather than being
 * two vocabularies that happen to overlap.
 */
export const GENERATION_FEEDBACK_REASONS = [
  'wrong-style',
  'hard-to-read',
  'missing-information',
  'wrong-layout',
  'poor-motion',
  'other',
] as const;
export type GenerationFeedbackReason = (typeof GENERATION_FEEDBACK_REASONS)[number];

/** The two the APP writes rather than the user: a result replaced by another generation, and a
 *  wizard closed on an unused result. Kept out of the pickable list above and added back here,
 *  so the Lite outcome endpoint has one source for its full set. */
export const IMPLICIT_DISCARD_REASONS = ['regenerated', 'closed'] as const;

/** Everything `ai_generations.feedback_reason` may hold - the 0011 CHECK constraint, expressed
 *  once in TypeScript so the endpoint validator cannot drift from the database. */
export const LITE_DISCARD_REASONS = [
  ...IMPLICIT_DISCARD_REASONS,
  ...GENERATION_FEEDBACK_REASONS,
] as const;
export type LiteDiscardReason = (typeof LITE_DISCARD_REASONS)[number];

/** What a general beta note is about. Broad on purpose: a taxonomy fine enough to be precise is
 *  too fine to pick from, and the free text is where precision actually lives. */
export const BETA_FEEDBACK_REASONS = [
  'bug',
  'confusing',
  'missing-feature',
  'too-slow',
  'export-problem',
  'other',
] as const;
export type BetaFeedbackReason = (typeof BETA_FEEDBACK_REASONS)[number];

/** Where in the product the note was written. A low-cardinality slug, never a URL or a route:
 *  the funnel's `detail` discipline (docs/FUNNEL_EVENTS.md) applied to the same kind of field. */
export const FEEDBACK_AREAS = ['wizard', 'editor', 'home', 'control', 'video', 'export', 'other'] as const;
export type FeedbackArea = (typeof FEEDBACK_AREAS)[number];

/** Admin triage. `new` until somebody looks; `reviewed` means read and understood; `resolved`
 *  means the thing it was about has changed. Three states because two cannot distinguish
 *  "I have read this" from "this is done", which is the distinction an inbox exists for. */
export const FEEDBACK_STATUSES = ['new', 'reviewed', 'resolved'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** Long enough for a real paragraph, short enough that the column can never become a data
 *  channel. Enforced in the browser (as a counter), at the endpoint (truncation is refused, not
 *  applied) and by a CHECK constraint. */
export const FEEDBACK_MESSAGE_MAX = 2000;

/** At most this many structured reasons on one submission - the picker is a short list and a
 *  submission naming all of them is telling us nothing. */
export const FEEDBACK_MAX_REASONS = 4;

export function isGenerationReason(value: unknown): value is GenerationFeedbackReason {
  return typeof value === 'string' && (GENERATION_FEEDBACK_REASONS as readonly string[]).includes(value);
}

export function isBetaReason(value: unknown): value is BetaFeedbackReason {
  return typeof value === 'string' && (BETA_FEEDBACK_REASONS as readonly string[]).includes(value);
}

/** The reasons offered for one kind of feedback. One function rather than a branch at each call
 *  site, so the form, the validator and the admin filter all offer the same list. */
export function reasonsFor(kind: FeedbackKind): readonly string[] {
  return kind === 'generation' ? GENERATION_FEEDBACK_REASONS : BETA_FEEDBACK_REASONS;
}

/** Human labels. Server-written slugs are what travel; these exist so the browser and the admin
 *  page do not each invent their own wording for the same reason code. */
export const FEEDBACK_REASON_LABELS: Record<string, string> = {
  'wrong-style': 'Wrong style or look',
  'hard-to-read': 'Hard to read',
  'missing-information': 'Missing information',
  'wrong-layout': 'Wrong layout',
  'poor-motion': 'Poor animation',
  bug: 'Something is broken',
  confusing: 'Confusing to use',
  'missing-feature': 'Missing a feature I need',
  'too-slow': 'Too slow',
  'export-problem': 'Problem with export',
  other: 'Something else',
  regenerated: 'Replaced by another generation',
  closed: 'Closed without using it',
};

// ── the wire shapes ────────────────────────────────────────────────────────────────────

/**
 * What the browser POSTs to /api/me/feedback.
 *
 * Note what is ABSENT and cannot be added: no prompt, no brief, no template, no asset, no page
 * URL. A generation submission carries the generation's ID and nothing else about it - the
 * server looks up the route, model, chassis and intent facet itself, from the ledger, because
 * the browser is not told the model in the first place (Lite hides it deliberately) and a
 * client-supplied one could not be trusted anyway.
 */
export interface FeedbackSubmission {
  kind: FeedbackKind;
  sentiment: FeedbackSentiment;
  /** Enumerated, validated against `reasonsFor(kind)`. May be empty: a thumb with no reason is
   *  still a rating, and demanding a reason is the interruption this flow must not be. */
  reasons: string[];
  /** The user's own words. Optional, and the only free text anywhere in this system. */
  message?: string;
  /**
   * The Lite ledger row this rating is about, when there is one.
   *
   * OPTIONAL EVEN FOR A GENERATION RATING, and that is not laxity. Only NoaCG Lite writes an
   * `ai_generations` row and hands its id to the browser; a Pro generation, a BYO-key harness
   * run and an offline stub all produce a graphic with no ledger id in existence. Requiring one
   * would silently collect ratings from a single tier and report the result as satisfaction
   * with the product.
   */
  generationId?: string;
  /**
   * What the browser legitimately knows about its own generation, for the runs with no ledger
   * id. Neither is user content: the tier is a setting the user picked from a fixed list, and a
   * variant id is a slug this codebase writes.
   *
   * When a `generationId` does resolve, the LEDGER wins over both - a client-supplied fact is
   * only ever a fallback for one the server cannot look up.
   */
  tier?: 'lite' | 'pro' | 'custom';
  variantId?: string;
  area?: FeedbackArea;
  /** The funnel's first-party browser id when the visitor has one, so anonymous feedback can be
   *  grouped by browser in the inbox. Never derived from an account, and erased with the rest of
   *  the funnel's local state on opt-out (docs/FUNNEL_EVENTS.md). */
  visitorId?: string;
}

/** Always `{ recorded: true }` on a well-formed submission - and on a dropped one. Like the
 *  funnel route, a response that distinguished "stored" from "dropped" would be a probe oracle,
 *  and a user telling us something must never be answered with an error page. */
export interface FeedbackResponse {
  recorded: true;
}
