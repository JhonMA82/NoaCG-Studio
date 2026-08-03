// RETRIEVAL - the shortlist of proven designs a brief should be adapted from.
//
// The product promise is "describe the graphic you need and NoaCG turns a PROVEN broadcast
// design into a customized one". The design stage was already the adaptation machine; what it
// lacked was retrieval. It was handed `catalogDigest()` - 430 variants, ~20,300 tokens, one flat
// list - and asked to find the right one, on the cheapest model in the product. That is the
// single decision the whole grounded path rests on, and nothing narrowed the haystack
// (docs/ADAPT_FIRST_PLAN.md §1.4; the benchmark's most common defect was a lower third assembled
// for a stinger brief).
//
// So this module narrows it, and it does so with NO new model call and NO second retrieval
// system: the ranking is the Browse storefront's own engine (`templates/search.ts` - the
// field-weighted token index, phrase-first alias expansion, and programme relevance already
// serving the wizard's faceted storefront), and the structural filter is the ONE anchor table
// (`templates/structuralAnchor.ts`) the router and the satisfaction check already share. The
// inputs are what the intent stage has already produced before the design call runs.
//
// **Degrade, never fail.** No terms, no matches, no anchor - each step falls back to a wider
// pool, and the last fallback is the full digest, i.e. exactly the pre-retrieval behaviour.

import { ALIASES } from '../model/taxonomy';
import type { StructuralIntent } from '../model/structuralIntent';
import type { TemplateVariant } from '../model/wizard';
import { allTemplateMeta } from '../templates/templateMeta';
import { browseTemplates, NO_BROWSE_FILTERS, type FieldBucket } from '../templates/search';
import {
  anchorResolves,
  structuralFit,
  variantSatisfiesAnchor,
  type StructuralAnchor,
} from '../templates/structuralAnchor';

/** How many proven designs the design stage chooses between. Ten is a shortlist a small model
 *  can hold and a person can be shown; the full catalog is neither. */
export const SHORTLIST_LIMIT = 10;

export interface Shortlist {
  /** The candidates, best first. Empty means "use the full catalog" (see `full`). */
  variants: TemplateVariant[];
  /** The structure the brief was resolved to, when one resolved. */
  anchor: StructuralAnchor | null;
  /** How the shortlist was built - recorded in telemetry and honest about every degrade. */
  reason: string;
  /** True when nothing narrowed the catalog: the caller must show the full digest. */
  full: boolean;
}

export const FULL_CATALOG: Shortlist = {
  variants: [],
  anchor: null,
  reason: 'No structure resolved - the whole catalog is the shortlist.',
  full: true,
};

// ── Term extraction ──────────────────────────────────────────────────────────
//
// The search engine's text score is token-AND: every token must land somewhere or the whole
// query scores zero. A brief is a sentence ("a lower third for our evening news with the
// reporter's name and location"), and the words that never land - our, evening, with - would
// zero the entire query. So a brief is not ONE query. It is a set of terms, each scored
// separately and summed, which is the union the AND semantics cannot express and which makes a
// term that matches nothing harmless instead of fatal.

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'onto', 'over', 'under', 'when',
  'what', 'which', 'their', 'there', 'here', 'have', 'has', 'had', 'will', 'would', 'should',
  'could', 'need', 'needs', 'want', 'wants', 'make', 'makes', 'made', 'create', 'creates',
  'design', 'designs', 'graphic', 'graphics', 'template', 'templates', 'show', 'shows', 'like',
  'some', 'each', 'also', 'about', 'them', 'they', 'your', 'ours', 'been', 'being', 'very',
  'more', 'most', 'less', 'than', 'then', 'both', 'only', 'just', 'must', 'plus', 'plain',
]);

const MAX_TERMS = 12;

/** The alias phrases the brief actually contains - the strongest single signal in the index,
 *  and the reason a phrase must survive as a phrase ("breaking news" is not two words here). */
function aliasPhrases(text: string): string[] {
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  return Object.keys(ALIASES)
    .filter((alias) => hay.includes(` ${alias} `))
    // Longest first, so a phrase is preferred over a word it contains.
    .sort((a, b) => b.length - a.length);
}

/**
 * The terms a brief is searched by, best signal first. Everything here is already written
 * down by the time the design call runs - the intent stage produced the fields, the parts and
 * the tone - so retrieval asks no model anything.
 */
export function briefTerms(brief: string, intent: StructuralIntent | null): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | undefined) => {
    const t = (raw ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim();
    if (!t || t.length < 3 || seen.has(t) || STOPWORDS.has(t)) return;
    seen.add(t);
    terms.push(t);
  };

  for (const phrase of aliasPhrases(brief)) add(phrase);
  for (const t of intent?.tone ?? []) add(t);
  // A field's LABEL and a part's ROLE are indexed at weight 6 and 4 - "location", "role",
  // "standings" name what the graphic carries, which is what a design is chosen by.
  for (const f of intent?.fields ?? []) add(f.label);
  for (const p of intent?.parts ?? []) add(p.role);
  for (const word of brief.toLowerCase().split(/[^a-z0-9]+/)) {
    if (terms.length >= MAX_TERMS) break;
    if (word.length >= 4) add(word);
  }
  return terms.slice(0, MAX_TERMS);
}

// ── The field bucket ─────────────────────────────────────────────────────────

/** The intent's own field list as a Browse bucket. Only fields that PAINT count - the bucket
 *  is over visible content fields, and a hidden config input is not one. */
function bucketFor(intent: StructuralIntent | null): FieldBucket | null {
  if (!intent) return null;
  if ((intent.parts ?? []).some((p) => p.repeating)) return 'repeating';
  if ((intent.fields ?? []).some((f) => f.role === 'list')) return 'repeating';
  const visible = (intent.fields ?? []).filter((f) => f.role !== 'hidden').length;
  if (!visible) return null;
  if (visible <= 1) return '1';
  if (visible === 2) return '2';
  if (visible === 3) return '3';
  if (visible <= 5) return '4-5';
  return '6+';
}

// ── The shortlist ────────────────────────────────────────────────────────────

/**
 * The proven designs this brief should be adapted from, best first.
 *
 * Scoring is the Browse engine's, run once per term and summed: a term the index cannot place
 * contributes nothing rather than zeroing the query. The structural filter is the anchor the
 * intent already resolved, so a shortlist can never offer a design that is not the KIND of
 * graphic asked for - the defect `structuralIntentCheck` was built to catch after the fact.
 *
 * Every narrowing degrades rather than empties: an over-tight field bucket is dropped, a
 * query that matched nothing falls back to the anchor's own designs in catalog order, and no
 * anchor at all returns FULL_CATALOG so the caller keeps today's full digest.
 */
export function shortlistFor(
  brief: string,
  intent: StructuralIntent | null,
  /** The structure to retrieve within when the intent stage did not run. Explicit ADAPT skips
   *  the intent call on purpose (the one-call economy), so the caller supplies the anchor it
   *  already knows - a category the user pinned in the structured setup. */
  anchorOverride?: StructuralAnchor | null,
  limit: number = SHORTLIST_LIMIT,
): Shortlist {
  const resolved = intent ? structuralFit(intent) : { fit: false, anchor: undefined };
  const anchor = resolved.anchor ?? anchorOverride ?? null;
  // `variantSatisfiesAnchor` answers TRUE for an anchor that no longer resolves — an
  // unresolvable anchor is not the variant's fault. That is right for the satisfaction check
  // and wrong here: it would let every design in the catalog "satisfy" a dead anchor and hand
  // the model a shortlist that means nothing. Retrieval needs the anchor to be real.
  if (!anchor || !anchorResolves(anchor)) return FULL_CATALOG;

  const satisfies = (v: TemplateVariant) => variantSatisfiesAnchor(v.id, anchor);
  const pool = allTemplateMeta().map((m) => m.variant).filter(satisfies);
  if (!pool.length) return FULL_CATALOG;

  const terms = briefTerms(brief, intent);
  const bucket = bucketFor(intent);
  const notes: string[] = [];

  // The bucket is a STRICT facet in the storefront and a noisy signal here (the intent's field
  // list is a model's reading of a brief), so it narrows only while it leaves something.
  const bucketed = bucket
    ? new Set(
        browseTemplates({ ...NO_BROWSE_FILTERS, fieldBucket: bucket }).best
          .filter((r) => satisfies(r.variant))
          .map((r) => r.variant.id),
      )
    : null;
  const bucketUsable = bucketed !== null && bucketed.size > 0;
  if (bucket && !bucketUsable) notes.push(`field bucket ${bucket} matched nothing and was dropped`);

  // A term that hits everything ranks nothing. "lower", "third", "name" and "news" match every
  // lower third in the catalog, so summing raw scores makes the shortlist collapse to catalog
  // order once the distinctive words run out - measured: 89 of 89 designs "matched the brief
  // text", and the tail of a worship brief was squad numbers and club crests. Each term is
  // therefore weighted by how RARE it is inside the pool (the standard inverse-document-frequency
  // discount): a term matching the whole pool weighs exactly zero, and "scripture" carries the
  // shortlist instead of tying with "third".
  const scores = new Map<string, number>();
  let distinctive = 0;
  for (const term of terms) {
    const hits = browseTemplates({ ...NO_BROWSE_FILTERS, query: term }).best.filter((r) => satisfies(r.variant));
    if (!hits.length) continue;
    const idf = Math.log(pool.length / hits.length);
    if (idf <= 0) continue;
    distinctive += 1;
    for (const r of hits) scores.set(r.variant.id, (scores.get(r.variant.id) ?? 0) + r.score * idf);
  }

  // A design the field bucket agrees with leads the ones it does not, without excluding them:
  // the bucket answers capacity, and a design one line short of the brief is still a candidate
  // the model may legitimately prefer.
  const BUCKET_BONUS = 12;
  const ranked = pool
    .map((variant, catalogIndex) => ({
      variant,
      score:
        (scores.get(variant.id) ?? 0) +
        (bucketUsable && bucketed.has(variant.id) ? BUCKET_BONUS : 0) +
        (1000 - catalogIndex) / 100000,
    }))
    .sort((a, b) => b.score - a.score);

  // **Do not pad a shortlist with designs the brief did not reach.** Ten slots filled from a
  // pool of 89 put squad numbers and club crests under a worship brief, and a shortlist is a
  // recommendation - a slot spent on an irrelevant design is worse than an empty one. So when
  // anything matched, only matches ship (topped up to a floor, so there is always a choice);
  // when nothing matched there is no signal to respect and catalog order fills the list.
  // A nonzero score is not relevance: a term matching 80 of 89 designs still contributes a
  // sliver to all 80, so "did it match" separates almost nothing. What the scores DO have is a
  // cliff - on a worship brief the two scripture designs score 29 and 11 and the next 60 all
  // score 2.2, the residue of "name" and "lower". The cut is therefore relative to the best
  // match, which is what makes it work the same on a brief with two strong hits and on one
  // with twenty.
  const MIN_SHORTLIST = 4;
  const RELEVANCE_FLOOR = 0.2;
  const top = Math.max(0, ...scores.values());
  const hit = ranked.filter((r) => (scores.get(r.variant.id) ?? 0) >= top * RELEVANCE_FLOOR && top > 0);
  const matched = hit.length;
  if (!terms.length) notes.push('no searchable terms in the brief');
  if (terms.length && !matched) notes.push('no design matched the brief text; ranked by catalog order');

  const chosen = matched
    ? [...hit, ...ranked.filter((r) => !(scores.get(r.variant.id) ?? 0))].slice(
        0,
        Math.min(limit, Math.max(MIN_SHORTLIST, matched)),
      )
    : ranked.slice(0, limit);
  const variants = chosen.map((r) => r.variant);
  const reason = [
    `${variants.length} of ${pool.length} designs carrying ${anchor}`,
    matched
      ? `${matched} above the relevance cut on ${distinctive} distinguishing term${distinctive === 1 ? '' : 's'}`
      : null,
    bucketUsable ? `field bucket ${bucket}` : null,
    ...notes,
  ]
    .filter(Boolean)
    .join('; ');

  return { variants, anchor, reason, full: false };
}
