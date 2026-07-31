// The STRUCTURAL ANCHOR vocabulary - the one place that answers "does a catalog structure
// carry this intent, and which one" (docs/CREATIVE_MODE_PLAN.md §2).
//
// It lives in templates/ rather than in ai/ because TWO layers need the same answer and
// neither may import the other: the ROUTER (src/ai/structuralIntent.ts) asks it before the
// design call to decide adapt-vs-create, and the SATISFACTION CHECK
// (src/validation/structuralIntentCheck.ts) asks it afterwards to decide whether the
// graphic that came back is the graphic that was asked for. A second copy of this table
// would let those two disagree - the router sending a brief down the catalog path while the
// check has no idea which structure was promised - so there is exactly one.
//
// Everything resolves LIVE against the type registry and the catalog, so catalog growth
// updates both routing and satisfaction by itself (the brief-bank decay rule): the day a
// stinger design lands, `full-frame-reveal` starts resolving and nothing here changes.

import { CATEGORIES, type TemplateCategory } from '../model/wizard';
import type { StructuralIntent } from '../model/structuralIntent';
import { typeById, TYPES } from './types/registry';
import { variantById, variantsFor } from './catalog';

/** Composition families the router can anchor to catalog structures. ADVISORY vocabulary:
 *  an unlisted family word routes like novel (create), it never fails. */
export const FAMILY_ANCHORS: Record<string, { types?: string[]; categories?: TemplateCategory[] }> = {
  strap: { categories: ['lower-third'] },
  card: { categories: ['info-card'] },
  board: { categories: ['results-board', 'infographic'] },
  table: { categories: ['results-board'] },
  bracket: { types: ['bracket'] },
  tree: { types: ['bracket'] },
  split: { categories: ['versus', 'matchup'] },
  versus: { categories: ['versus', 'matchup'] },
  'ring-meter': { categories: ['infographic'] },
  strip: { categories: ['ticker'] },
  'full-frame-reveal': { categories: ['reveal'] },
  tower: { types: ['timing-tower'] },
  stack: { types: ['timing-tower'] },
};

/** An anchor is `type:<id>` or `category:<id>` - the resolved structure, not the word the
 *  model happened to use for it. */
export type StructuralAnchor = string;

const categoryHasVariants = (c: TemplateCategory): boolean => variantsFor(c).length > 0;

/** One identifier resolved against EVERY vocabulary: a graphic-type id, a family word's
 *  live anchors, or a catalog category. Which vocabulary a word belongs to is not the
 *  model's problem - the job is recognizing the structure it named. */
export function resolveAnchor(word: string | undefined): StructuralAnchor | null {
  if (!word) return null;
  if (typeById(word)) return `type:${word}`;
  const anchors = FAMILY_ANCHORS[word];
  if (anchors) {
    for (const t of anchors.types ?? []) {
      if (typeById(t)) return `type:${t}`;
    }
    for (const c of anchors.categories ?? []) {
      if (categoryHasVariants(c)) return `category:${c}`;
    }
    return null;
  }
  if (categoryHasVariants(word as TemplateCategory)) return `category:${word}`;
  return null;
}

/** Does a catalog structure carry this intent? Checked LIVE against the registry and
 *  catalog, so a family gains fit the day its designs land (and a stale expected-route
 *  table shows up as a routing diff, not silent drift).
 *
 *  The kind says whether the model matched a listed structure; the NAME of that structure
 *  may land in either id slot - measured on the 2026-07-30 open-model runs, small models
 *  routinely emit kind=type with the id in `families`, or a family word in `typeId`
 *  ("type:strap"). Punishing the slot turned correct classifications into false CREATEs,
 *  so a declared match resolves every named identifier against every vocabulary
 *  (requirements over labels, the §6 rule). Hybrid and novel stay unfit by declaration. */
export function structuralFit(intent: StructuralIntent): { fit: boolean; anchor?: StructuralAnchor } {
  if (intent.kind !== 'type' && intent.kind !== 'family') return { fit: false };
  const words =
    intent.kind === 'type'
      ? [intent.typeId, ...(intent.families ?? [])]
      : [...(intent.families ?? []), intent.typeId];
  for (const word of words) {
    const anchor = resolveAnchor(word);
    if (anchor) return { fit: true, anchor };
  }
  return { fit: false };
}

/** Does the anchor still name something the catalog can build? The brief-bank decay rule's
 *  primitive - an expected-route table is only trusted while its anchors resolve. */
export function anchorResolves(anchor: StructuralAnchor): boolean {
  const [kind, id] = anchor.split(':');
  if (kind === 'type') return Boolean(typeById(id));
  if (kind === 'category') return categoryHasVariants(id as TemplateCategory);
  return false;
}

/** Every anchor a catalog VARIANT satisfies: its own category, and the graphic type it is a
 *  design of when it has one. This is the "what did we actually build" half of the
 *  satisfaction question - `variant.typeId` is the registry back-pointer, so a promoted
 *  design answers for its type as well as its category. */
export function anchorsSatisfiedBy(variantId: string): StructuralAnchor[] {
  const variant = variantById(variantId);
  if (!variant) return [];
  const anchors = [`category:${variant.category}`];
  if (variant.typeId) anchors.push(`type:${variant.typeId}`);
  return anchors;
}

/**
 * Does the assembled variant satisfy the anchor the intent promised?
 *
 * The failure this exists for: routing correctly sends a stinger brief down the CATALOG
 * path (the catalog does carry transitions), and the design stage then returns a lower
 * third. Routing was right, validity was fine, and the user got the wrong graphic - the
 * benchmark's single most common defect. Nothing measured it, because the router stopped
 * caring once it had chosen a path and the satisfaction check only ever ran on the custom
 * path.
 *
 * Answered by IDENTITY, not by similarity: an anchor the variant does not carry is a miss,
 * and an anchor that no longer resolves is not the variant's fault (an unresolvable anchor
 * means the catalog moved, which is a routing-table finding, not a satisfaction one).
 */
export function variantSatisfiesAnchor(variantId: string, anchor: StructuralAnchor): boolean {
  if (!anchorResolves(anchor)) return true;
  return anchorsSatisfiedBy(variantId).includes(anchor);
}

/** The intent prompt's known-structure listing: type ids + categories + family words.
 *  Hundreds of tokens, not thousands - the digest stays out of the intent stage. */
export function structuralVocabulary(): string {
  const types = TYPES.map((t) => `${t.id} (${t.name})`).join(', ');
  const categories = CATEGORIES.map((c) => c.id).join(', ');
  const families = Object.keys(FAMILY_ANCHORS).join(', ');
  // Scope notes come from the registry itself (GraphicType.structuralScope), so the router's
  // idea of a type's coverage cannot drift from the type - the day the bracket learns double
  // elimination, its note changes here in the same commit.
  const scoped = TYPES.filter((t) => t.structuralScope);
  const scopeNotes = scoped.length
    ? [
        'Scope notes - what a listed structure actually covers. A brief that matches a noted',
        'entry but needs structure its note excludes is beyondScope, not a plain match:',
        ...scoped.map((t) => `- ${t.id}: ${t.structuralScope}`),
      ].join('\n')
    : '';
  return [
    `Known graphic types: ${types}.`,
    `Known catalog categories: ${categories}.`,
    `Known composition families: ${families}.`,
    ...(scopeNotes ? [scopeNotes] : []),
  ].join('\n');
}
