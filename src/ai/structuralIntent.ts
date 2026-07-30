// The intent STAGE and ROUTER (docs/CREATIVE_MODE_PLAN.md §2) - the harness half of the
// StructuralIntent contract (the typed shape itself is MODEL layer,
// src/model/structuralIntent.ts, because the validation layer verifies against it too).
//
// The intent stage answers "what must EXIST" BEFORE the catalog-anchored design call runs,
// so a brief the catalog cannot carry is routed honestly instead of being forced into the
// nearest chassis (the F1/F2/F6 failures in the plan). Routing is deterministic: the model
// proposes a classification, `structuralFit` checks it LIVE against the type registry and
// catalog (so catalog growth updates routing by itself - the brief-bank decay rule), and
// `routeIntent` decides.

import type { ModelTool } from './modelGateway';
import { CATEGORIES, type TemplateCategory } from '../model/wizard';
import {
  INTENT_ZONES,
  isIntentAnswer,
  normalizeIntent,
  type GenerationMode,
  type RouteDecision,
  type StructuralIntent,
} from '../model/structuralIntent';
import { typeById, TYPES } from '../templates/types/registry';
import { variantsFor } from '../templates/catalog';

// Re-exported so harness consumers (provider, stub, rigs, specs) keep one import path.
export { isIntentAnswer, normalizeIntent };
export type { GenerationMode, RouteDecision, StructuralIntent };

// ── The forced tool ───────────────────────────────────────────────────────────

export const INTENT_TOOL: ModelTool = {
  name: 'emit_structural_intent',
  description:
    'Return the structural analysis of the brief: what kind of graphic it asks for and what ' +
    'must exist in it. No visual design decisions here - structure, data, and behaviour only.',
  input_schema: {
    type: 'object',
    required: ['kind', 'confidence', 'summary', 'parts', 'fields', 'originalityRequested', 'beyondScope'],
    additionalProperties: false,
    properties: {
      kind: {
        type: 'string',
        enum: ['type', 'family', 'hybrid', 'novel'],
        description:
          'The ladder: type when a listed graphic type matches the structure; else family ' +
          'when a listed composition family does; hybrid ONLY for a genuine combination of ' +
          'two or more listed families; novel only when nothing listed describes the ' +
          'structure. Most briefs match a listed type or family.',
      },
      typeId: { type: 'string', description: 'kind=type: the matching graphic-type id from the list.' },
      families: {
        type: 'array', maxItems: 3, items: { type: 'string' },
        description:
          'kind=family or hybrid: one to three composition family words FROM THE LIST, best ' +
          'match first. Required for those kinds - a family classification without a listed ' +
          'family word is empty.',
      },
      novelDescription: { type: 'string', description: 'kind=novel: one sentence describing the structure.' },
      confidence: {
        type: 'string', enum: ['high', 'medium', 'low'],
        description: 'How sure the classification is. Uncertain = low, honestly.',
      },
      summary: { type: 'string', description: 'One sentence: what this graphic is.' },
      parts: {
        type: 'array', minItems: 1, maxItems: 12,
        description: 'The structural elements the graphic must carry.',
        items: {
          type: 'object',
          required: ['id', 'role'],
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            role: { type: 'string' },
            repeating: { type: 'boolean', description: 'Repeats once per data item (rows, ties, competitors).' },
            itemParts: { type: 'array', maxItems: 6, items: { type: 'string' } },
          },
        },
      },
      fields: {
        type: 'array', maxItems: 12,
        description:
          "The operator's data. Repeating content is ONE list field (a textarea, one item " +
          'per line, "|" between parts) - never numbered fields per item.',
        items: {
          type: 'object',
          required: ['key', 'role', 'label'],
          additionalProperties: false,
          properties: {
            key: { type: 'string' },
            role: { type: 'string', enum: ['line', 'list', 'number', 'logo', 'image', 'hidden'] },
            label: { type: 'string' },
            sample: { type: 'string' },
          },
        },
      },
      states: {
        type: 'array', maxItems: 6,
        description: 'Operator- or timer-driven states beyond plain in/out (a winner reveal, a lock-in).',
        items: {
          type: 'object',
          required: ['id', 'trigger'],
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            trigger: { type: 'string', enum: ['operator', 'timer'] },
            description: { type: 'string' },
          },
        },
      },
      placement: { type: 'string', enum: INTENT_ZONES },
      tone: { type: 'array', maxItems: 5, items: { type: 'string' } },
      originalityRequested: {
        type: 'boolean',
        description:
          "True ONLY when the brief itself asks for originality - 'our own look', 'unlike " +
          "anything', 'nothing like your templates', 'a completely new design'. Never " +
          'inferred from the graphic kind being unusual.',
      },
      originalityEvidence: { type: 'string', description: 'The brief words that asked for originality.' },
      beyondScope: {
        type: 'boolean',
        description:
          'True ONLY when a listed type or family matches the brief AND the brief requires ' +
          'structure that entry\'s scope note excludes (a different tournament system, an ' +
          'extra repeating structure, more sides than the structure holds). False when no ' +
          'scope note is listed for the match, or the requirement fits it. Never true for ' +
          'styling, tone, or content demands.',
      },
      scopeEvidence: { type: 'string', description: 'The unsupported structural requirement, in the brief\'s words.' },
    },
  },
};

// ── The vocabulary (compact - this prompt must stay small, never the 18k digest) ──

/** Composition families the router can anchor to catalog structures. ADVISORY vocabulary:
 *  an unlisted family word routes like novel (create), it never fails. Anchors are checked
 *  LIVE against the registry/catalog, so catalog growth updates routing by itself. */
const FAMILY_ANCHORS: Record<string, { types?: string[]; categories?: TemplateCategory[] }> = {
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

/** The intent prompt's known-structure listing: type ids + categories + family words.
 *  Hundreds of tokens, not thousands - the digest stays out of the intent stage. */
export function intentVocabulary(): string {
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

export function intentSystemPrompt(): string {
  return `You are the structural analyst inside NoaCG Studio, a broadcast graphics tool.
You do NOT design and you do NOT write code. You read the brief and return WHAT MUST EXIST
in the graphic - its kind, its structural parts, its operator data, its states - via the
emit_structural_intent tool.

Rules:
- Classify by the ladder: a listed TYPE when one matches the structure; else a listed
  FAMILY; HYBRID only when the brief genuinely combines the STRUCTURES of two or more
  listed families in one graphic (a schedule board with a countdown ring); NOVEL only when
  nothing listed describes the structure. Most real briefs match a listed type or family -
  the common mistake is drifting to hybrid or novel because a brief is colourful. Ordinary
  extras - a time line, a venue, a sponsor strip, logos, placeholders, an operator moment -
  never make a graphic a hybrid. Uncertain means confidence low.
- Styling, genre, tone, mood boards, background plates, long text, and missing assets
  never change the structure: a concert lower third is still lower-third, a chess
  match-up is still a matchup. The structure changes only when the parts or their
  relationships do - a new repeating group, a different system, or a different COUNT of
  equal sides (a structure built for two competitors does not carry three or more).
- Repeating content (rows, entries, competitors, fixtures) is ONE list field - a textarea,
  one item per line, "|" between an item's parts - and a repeating part. Never N numbered
  fields.
- States are only what the brief needs beyond in/out: a winner reveal, a lock-in, a timed
  clear. Most graphics have none.
- originalityRequested is true ONLY when the brief's own words ask for an original look.
- beyondScope is false for almost every brief. Classify the kind honestly first (a
  double-elimination bracket IS a bracket), then set beyondScope true only when a scope
  note below explicitly excludes something the brief REQUIRES - and quote that requirement
  in scopeEvidence. A brief the note covers is within scope, however elaborate.

${intentVocabulary()}

Return ONLY via the emit_structural_intent tool.`;
}

// ── The route decision (deterministic - the model proposes, this decides) ────

const categoryHasVariants = (c: TemplateCategory): boolean => variantsFor(c).length > 0;

/** One identifier resolved against EVERY vocabulary: a graphic-type id, a family word's
 *  live anchors, or a catalog category. Which vocabulary a word belongs to is not the
 *  model's problem - the router's job is recognizing the structure it named. */
function resolveAnchor(word: string | undefined): string | null {
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
export function structuralFit(intent: StructuralIntent): { fit: boolean; anchor?: string } {
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

/**
 * The deterministic route decision (plan §2). An explicit mode is never overridden. Auto is
 * conservative in the adapt direction on purpose: a catalog-shaped brief with no
 * originality demand behaves exactly as today, and CREATE fires only where the old router
 * demonstrably failed (no structural fit) or the user asked (originality, low-confidence
 * novel/hybrid classifications).
 */
export function routeIntent(intent: StructuralIntent, mode: GenerationMode): RouteDecision {
  if (mode === 'adapt') return { mode, route: 'adapt', reason: 'Explicit adapt request.' };
  if (mode === 'create') return { mode, route: 'create', reason: 'Explicit create request.' };
  if (intent.originalityRequested) {
    return {
      mode,
      route: 'create',
      reason: `The brief asks for an original design${intent.originalityEvidence ? ` ("${intent.originalityEvidence}")` : ''}.`,
    };
  }
  const { fit, anchor } = structuralFit(intent);
  // The scope guard: a recognized structure whose declared scope the brief exceeds must
  // never be adapted onto - that is how a double-elimination brief becomes a silently
  // wrong single-elimination tree. The model judged the brief against the registry's
  // scope note (beyondScope, with evidence); the decision here stays deterministic.
  if (fit && intent.beyondScope) {
    return {
      mode,
      route: 'create',
      reason: `The brief needs structure outside ${anchor}'s scope${intent.scopeEvidence ? ` ("${intent.scopeEvidence}")` : ''}.`,
    };
  }
  if (fit && intent.confidence !== 'low') {
    return { mode, route: 'adapt', reason: `A catalog structure carries the brief (${anchor}).` };
  }
  if (fit) {
    return { mode, route: 'create', reason: `Low-confidence match (${anchor}) - creating rather than guessing.` };
  }
  const label =
    intent.kind === 'novel'
      ? intent.novelDescription || 'a novel structure'
      : intent.kind === 'hybrid'
        ? `a hybrid of ${(intent.families ?? []).join(' + ') || 'families'}`
        : `an unlisted ${intent.kind === 'type' ? 'type' : 'family'} (${intent.typeId ?? intent.families?.[0] ?? 'unknown'})`;
  return { mode, route: 'create', reason: `No catalog structure carries ${label}.` };
}

// ── Fit narrowing for the design-spec tool ───────────────────────────────────

/**
 * Collapse the design-spec tool's `fit` enum to the routed value - the same schema-narrowing
 * mechanism the user's pinned category already uses (spec/specDesign.ts narrowedSpecTool),
 * so the model routes WITHIN the decision instead of being asked to re-make it. Applied
 * ONLY when a route demands it (explicit adapt, or a CREATE decision); an auto->adapt
 * decision leaves the tool untouched, keeping today's flow byte-identical on catalog
 * briefs (the frozen-control rule, plan §8).
 */
export function narrowFitTool(base: ModelTool, fit: 'catalog' | 'custom'): ModelTool {
  const tool = JSON.parse(JSON.stringify(base)) as ModelTool;
  const root = tool.input_schema as { properties?: Record<string, unknown> };
  const alts = root.properties?.alternatives as { items?: { properties?: Record<string, unknown> } } | undefined;
  const schemas = alts?.items?.properties ? [alts.items.properties] : root.properties ? [root.properties] : [];
  for (const props of schemas) {
    const fitProp = props.fit as { enum?: string[] } | undefined;
    if (fitProp) fitProp.enum = [fit];
  }
  return tool;
}
