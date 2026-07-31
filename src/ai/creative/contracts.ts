// Creative Mode phase C - the two new inter-stage contracts (docs/CREATIVE_MODE_PLAN.md §4,
// §6). Both follow the house pattern of StructuralIntent and DesignSpec: a versioned typed
// shape plus a NORMALIZER that clamps a raw model emit instead of rejecting it - the platform
// owns correctness, the emit owns meaning.
//
// StructuralIntent (src/model/structuralIntent.ts) says what must EXIST. These two say how a
// creation gets there:
//   ConceptDirection - a ~200-token design DIRECTION, no code and no chassis id (stage 4);
//   CreativeSpec     - the chosen direction made concrete (stage 5), carried WHOLE into the
//                      compile and style stages, which is how F4 (the design stage's
//                      decisions dying at the coder boundary) is fixed by construction.
//
// The separation rule (§6) is enforced here by shape: CreativeSpec references intent part ids
// and never re-declares functional requirements; ConceptDirection carries no geometry at all.

import type { Zone9 } from '../../model/wizard';
import type { StructuralIntent } from '../../model/structuralIntent';

// ── ConceptDirection v1 (stage 4) ────────────────────────────────────────────

/** The composition families the knowledge cards teach (§5). An OPEN vocabulary: an emit may
 *  name something else and it survives normalization - the list is what the cards cover, not
 *  a wall a brief has to fit (the F2 lesson, applied one level up). */
export const COMPOSITION_FAMILIES = [
  'strap', 'tower', 'board', 'split', 'bracket', 'card', 'ring', 'full-frame', 'strip',
] as const;

export interface ConceptDirection {
  version: 1;
  /** Stable index-derived id ('c1'…'c3') - assigned by the platform, never by the model. */
  id: string;
  /** Short human label ("Ledger", "Floodlit split"). */
  name: string;
  /** The composition family this direction reads as (open word). */
  compositionFamily: string;
  /** The reading order, as intent part ids or role words - first read first. */
  hierarchyOrder: string[];
  /** How colour behaves ("one hot accent on near-black", "paper warm, ink dark"). */
  paletteCharacter: string;
  /** How it moves ("cut-fast, no bounce", "settling rise"). */
  motionCharacter: string;
  /** One line: why this direction serves the brief. */
  rationale: string;
}

/** Two directions COUNT as different only when they differ in both the composition family
 *  and the reading order (§11 criterion 5 - palette or motion variation alone is a reskin). */
export function conceptsDiffer(a: ConceptDirection, b: ConceptDirection): boolean {
  const order = (c: ConceptDirection) => c.hierarchyOrder.join('>').toLowerCase();
  return a.compositionFamily.toLowerCase() !== b.compositionFamily.toLowerCase()
    && order(a) !== order(b);
}

/** How many of the emitted directions are genuinely distinct from at least one other. The
 *  bench reports this per brief; the threshold (2 of 3) lives in the go/no-go sheet. */
export function distinctConceptCount(concepts: ConceptDirection[]): number {
  return concepts.filter((c, i) => concepts.some((o, j) => i !== j && conceptsDiffer(c, o))).length;
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.trim() : fallback);
const strList = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean).slice(0, max) : [];

export function normalizeConcepts(raw: unknown): ConceptDirection[] {
  const list = Array.isArray((raw as { concepts?: unknown })?.concepts)
    ? ((raw as { concepts: unknown[] }).concepts)
    : Array.isArray(raw) ? (raw as unknown[]) : [];
  return list.slice(0, 3).map((entry, i) => {
    const r = (entry ?? {}) as Record<string, unknown>;
    return {
      version: 1 as const,
      id: `c${i + 1}`,
      name: str(r.name, `Direction ${i + 1}`),
      compositionFamily: str(r.compositionFamily, 'card'),
      hierarchyOrder: strList(r.hierarchyOrder, 8),
      paletteCharacter: str(r.paletteCharacter),
      motionCharacter: str(r.motionCharacter),
      rationale: str(r.rationale),
    };
  });
}

// ── CreativeSpec v1 (stage 5) ────────────────────────────────────────────────

/** A region's weight in the reading order - what the type ladder and the entrance order are
 *  derived from. Three steps, deliberately: a finer ladder is a number nobody can defend. */
export type RegionEmphasis = 'primary' | 'secondary' | 'support';

export interface CreativeRegionSpec {
  /** Matches a StructuralIntent part id wherever one exists (the §6 reference rule). */
  id: string;
  /** Open role word, carried from the intent ("name", "score", "tie", "timer"). */
  role: string;
  emphasis: RegionEmphasis;
  /** The region repeats per data item. Compiled onto ONE list field + a rebuild runtime (the
   *  house textarea convention), never onto N numbered fields. */
  repeating?: boolean;
  /** For a repeating region: the parts of ONE item, in order - the `|` columns of a line. */
  itemParts?: string[];
  /** Intent field keys this region shows, in order. Unknown keys are dropped at compile. */
  fieldKeys?: string[];
  /** Region-level type treatment. Sizes are ladder steps, not pixels: the compiler owns the
   *  numbers so the type floor cannot be argued away by an emit (plan §3.4). */
  typography?: {
    caseStyle?: 'as-typed' | 'upper';
    weight?: 'regular' | 'semibold' | 'bold' | 'black';
    tracking?: 'tight' | 'normal' | 'wide';
  };
}

export interface CreativeStateSpec {
  /** References a StructuralIntent state id. */
  id: string;
  trigger: 'operator' | 'timer';
  /** Region ids this state brings ON - compiled as a middle step's `reveals`. */
  revealRegions?: string[];
  description?: string;
}

export interface CreativeSpec {
  version: 1;
  /** Which ConceptDirection this spec makes concrete. */
  conceptId: string;
  name: string;
  summary: string;
  layout: {
    /** The concept's composition family, carried through so the cards and the compiler agree. */
    family: string;
    /** How the regions relate. The compiler turns this into the box's display rule; a style
     *  patch may override it entirely - this is the STARTING composition, not a cage. */
    arrangement: 'stack' | 'row' | 'grid' | 'split';
    /** Full-frame graphics ignore the zone and fill the canvas (a versus card, a bracket). */
    fullFrame: boolean;
    zone: Zone9;
    /** 0.85 compact … 1.2 large, clamped. */
    sizeScale: number;
  };
  regions: CreativeRegionSpec[];
  palette: { accent: string; text: string; textDim: string; panel: string };
  /** A bundled font id (model/fonts.ts). An unknown id falls back at compile time. */
  fontId: string;
  motion: {
    /** Region ids in entrance order - the reading order made temporal. */
    entranceOrder: string[];
    character: 'rise' | 'glide' | 'fade' | 'snap' | 'wipe';
    /** Entrance length in seconds (0.4 … 2.0, clamped). */
    seconds: number;
  };
  states?: CreativeStateSpec[];
  /** What the STYLE stage must get right in this design, in one or two sentences. */
  designNote: string;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGBA = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/i;
const colour = (v: unknown, fallback: string): string => {
  const s = str(v);
  return HEX.test(s) || RGBA.test(s) ? s : fallback;
};
const clamp = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(str(v) as T) ? (str(v) as T) : fallback;

const ZONES: Zone9[] = [
  'top-left', 'top-center', 'top-right',
  'mid-left', 'mid-center', 'mid-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

/** The default palette a malformed emit clamps to: the product's own dark control-room look,
 *  which is legible over anything and never a silent black-on-black. */
const FALLBACK_PALETTE = { accent: '#ffb020', text: '#ffffff', textDim: '#c8ccd4', panel: 'rgba(12,14,18,0.88)' };

/**
 * Clamp a raw stage-5 emit into a well-formed CreativeSpec. Nothing here rejects: an
 * off-shape region list degrades to one content region, an unknown zone to the intent's,
 * an illegal colour to the fallback - the compile stage must always have something to
 * build, and the VERIFY stage is what decides whether the result served the brief.
 */
export function normalizeCreativeSpec(raw: unknown, intent: StructuralIntent): CreativeSpec {
  const r = (raw ?? {}) as Record<string, unknown>;
  const layout = (r.layout ?? {}) as Record<string, unknown>;
  const motion = (r.motion ?? {}) as Record<string, unknown>;
  const palette = (r.palette ?? {}) as Record<string, unknown>;

  const regions = (Array.isArray(r.regions) ? r.regions : [])
    .map((entry, i) => {
      const g = (entry ?? {}) as Record<string, unknown>;
      const id = str(g.id) || `r${i + 1}`;
      return {
        id: id.replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
        role: str(g.role, 'content'),
        emphasis: oneOf<RegionEmphasis>(g.emphasis, ['primary', 'secondary', 'support'], i === 0 ? 'primary' : 'secondary'),
        ...(g.repeating === true ? { repeating: true as const } : {}),
        itemParts: strList(g.itemParts, 6),
        fieldKeys: strList(g.fieldKeys, 8),
        typography: {
          caseStyle: oneOf(((g.typography ?? {}) as Record<string, unknown>).caseStyle, ['as-typed', 'upper'] as const, 'as-typed'),
          weight: oneOf(((g.typography ?? {}) as Record<string, unknown>).weight, ['regular', 'semibold', 'bold', 'black'] as const, 'semibold'),
          tracking: oneOf(((g.typography ?? {}) as Record<string, unknown>).tracking, ['tight', 'normal', 'wide'] as const, 'normal'),
        },
      };
    })
    .slice(0, 10);

  // A spec with no regions still compiles: every intent part becomes one, so the verify
  // stage measures the brief rather than the emit's silence.
  const fallbackRegions: CreativeRegionSpec[] = intent.parts.length
    ? intent.parts.map((p, i) => ({
        id: p.id,
        role: p.role,
        emphasis: (i === 0 ? 'primary' : 'secondary') as RegionEmphasis,
        ...(p.repeating ? { repeating: true as const } : {}),
        itemParts: p.itemParts ?? [],
        fieldKeys: [],
        typography: { caseStyle: 'as-typed' as const, weight: 'semibold' as const, tracking: 'normal' as const },
      }))
    : [{
        id: 'content',
        role: 'content',
        emphasis: 'primary',
        itemParts: [],
        fieldKeys: [],
        typography: { caseStyle: 'as-typed', weight: 'semibold', tracking: 'normal' },
      }];

  // ONE repeating region per graphic: repeating data rides one textarea (the house list
  // convention), the compiled runtime rebuilds one rows container, and the scaffold gives
  // that container a fixed id - a second repeating region would duplicate the DOM id and
  // stay empty forever (the bracket smoke's br-in-progress C compiled exactly that:
  // benchmarks/creative/v1/SMOKE-2026-07-31.md item 6). Later repeating flags demote to
  // plain regions; their itemParts survive as ordinary content the verify stage measures.
  const finalRegions = (regions.length ? regions : fallbackRegions).map((g, i, all) => {
    const firstRepeating = all.findIndex((o) => o.repeating);
    if (!g.repeating || i === firstRepeating) return g;
    const { repeating: _dropped, ...plain } = g;
    return plain;
  });
  const known = new Set(finalRegions.map((g) => g.id));

  const states = (Array.isArray(r.states) ? r.states : [])
    .map((entry) => {
      const s = (entry ?? {}) as Record<string, unknown>;
      return {
        id: str(s.id),
        trigger: oneOf(s.trigger, ['operator', 'timer'] as const, 'operator'),
        revealRegions: strList(s.revealRegions, 6).filter((id) => known.has(id)),
        ...(str(s.description) ? { description: str(s.description) } : {}),
      };
    })
    .filter((s) => Boolean(s.id))
    .slice(0, 4);

  const entranceOrder = strList(motion.entranceOrder, 10).filter((id) => known.has(id));

  return {
    version: 1,
    conceptId: str(r.conceptId, 'c1'),
    name: str(r.name, 'Creative graphic'),
    summary: str(r.summary),
    layout: {
      family: str(layout.family, 'card'),
      arrangement: oneOf(layout.arrangement, ['stack', 'row', 'grid', 'split'] as const, 'stack'),
      fullFrame: layout.fullFrame === true,
      zone: ZONES.includes(str(layout.zone) as Zone9)
        ? (str(layout.zone) as Zone9)
        : intent.placement ?? 'bottom-left',
      sizeScale: clamp(layout.sizeScale, 0.85, 1.2, 1),
    },
    regions: finalRegions,
    palette: {
      accent: colour(palette.accent, FALLBACK_PALETTE.accent),
      text: colour(palette.text, FALLBACK_PALETTE.text),
      textDim: colour(palette.textDim, FALLBACK_PALETTE.textDim),
      panel: colour(palette.panel, FALLBACK_PALETTE.panel),
    },
    fontId: str(r.fontId, 'inter'),
    motion: {
      // An emit that named no order (or named regions that do not exist) still gets the
      // reading order: the region list IS the fallback entrance order.
      entranceOrder: entranceOrder.length ? entranceOrder : finalRegions.map((g) => g.id),
      character: oneOf(motion.character, ['rise', 'glide', 'fade', 'snap', 'wipe'] as const, 'rise'),
      seconds: clamp(motion.seconds, 0.4, 2, 0.9),
    },
    ...(states.length ? { states } : {}),
    designNote: str(r.designNote),
  };
}
