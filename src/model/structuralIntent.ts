// StructuralIntent - the CREATE boundary's typed contract (docs/CREATIVE_MODE_PLAN.md §6):
// WHAT MUST EXIST in a graphic - information, relationships, repetition, states - never how
// it looks (that is the design spec's job). MODEL layer, like generationSpec.ts: the ai
// harness authors it and the validation layer verifies against it, so the shape has to live
// below both. Versioned; additive fields never bump the version.
//
// The `kind` is deliberately NOT an enum wall (plan §6): a known type, a composition
// family, a hybrid, or a frankly novel structure are all valid answers, each with a
// confidence - and requirements, not the label, drive verification, so a mislabelled
// intent with correct parts still verifies correctly.

import type { Zone9 } from './wizard';

/** How the user asked to generate (plan §2). Structural fit is necessary but NOT
 *  sufficient for adapt: an explicit mode is never overridden by routing. */
export type GenerationMode = 'adapt' | 'create' | 'auto';

export type IntentConfidence = 'high' | 'medium' | 'low';

/** One structural element the graphic must carry. Roles are open words ("row", "chart",
 *  "side", "timer") - vocabulary, never an enum the model must fit. */
export interface IntentPart {
  id: string;
  role: string;
  /** The part repeats per data item (rows, ties, competitors). Repeating content binds to
   *  ONE list field (the house textarea convention), never to N numbered fields. */
  repeating?: boolean;
  /** For a repeating part: what one item is made of ("position", "name", "gap"). */
  itemParts?: string[];
}

export interface IntentField {
  key: string;
  /** 'list' = one textarea, one item per line (the repeating-data convention). */
  role: 'line' | 'list' | 'number' | 'logo' | 'image' | 'hidden';
  label: string;
  sample?: string;
}

export interface IntentState {
  id: string;
  trigger: 'operator' | 'timer';
  description?: string;
}

/** What kind of graphic the brief asks for - a union, deliberately not one enum. */
export interface IntentKind {
  kind: 'type' | 'family' | 'hybrid' | 'novel';
  /** kind='type': a graphic-type id from the registry vocabulary (unknown ids are treated
   *  as low-confidence, never rejected). */
  typeId?: string;
  /** kind='family' | 'hybrid': composition families (open strings; unknown words degrade
   *  to novel-like routing, never fail). */
  families?: string[];
  /** kind='novel': one sentence describing the structure. */
  novelDescription?: string;
}

export interface StructuralIntent extends IntentKind {
  version: 1;
  confidence: IntentConfidence;
  summary: string;
  parts: IntentPart[];
  fields: IntentField[];
  states?: IntentState[];
  placement?: Zone9;
  tone?: string[];
  /** The user explicitly asked for something original/new-looking. Detected from the
   *  brief's own words, never inferred from the graphic kind. */
  originalityRequested: boolean;
  originalityEvidence?: string;
}

/** The routing decision, surfaced on the result and in telemetry so the routing benchmark
 *  reads what actually happened rather than reconstructing it. */
export interface RouteDecision {
  mode: GenerationMode;
  route: 'adapt' | 'create';
  reason: string;
}

export const INTENT_ZONES: Zone9[] = [
  'top-left', 'top-center', 'top-right',
  'mid-left', 'mid-center', 'mid-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

const asArray = <T>(v: unknown, max: number): T[] => (Array.isArray(v) ? (v as T[]).slice(0, max) : []);

const INTENT_KINDS = ['type', 'family', 'hybrid', 'novel'];

/**
 * Did this payload actually answer the intent question? A forced-tool call can still come
 * back carrying some other tool's output (a provider quirk, a misrouted mock), and
 * normalizing that would launder garbage into an honest-looking low-confidence 'novel' -
 * which auto would then route to create. `kind` is the one required field no other tool
 * emits, so its absence means the question was never answered and the caller must treat
 * the stage as failed (fall back to the pre-routing flow), not route on it.
 */
export function isIntentAnswer(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && INTENT_KINDS.includes((raw as { kind?: unknown }).kind as string);
}

/** Clamp a raw tool emit into a well-formed intent. Unknown words survive (they route
 *  conservatively); malformed shapes clamp instead of failing - the platform owns
 *  correctness, the emit owns meaning. */
export function normalizeIntent(raw: unknown): StructuralIntent {
  const r = (raw ?? {}) as Record<string, unknown>;
  const kind = INTENT_KINDS.includes(r.kind as string)
    ? (r.kind as StructuralIntent['kind'])
    : 'novel';
  const confidence = ['high', 'medium', 'low'].includes(r.confidence as string)
    ? (r.confidence as IntentConfidence)
    : 'low';
  return {
    version: 1,
    kind,
    ...(typeof r.typeId === 'string' ? { typeId: r.typeId } : {}),
    families: asArray<string>(r.families, 3).filter((f) => typeof f === 'string'),
    ...(typeof r.novelDescription === 'string' ? { novelDescription: r.novelDescription } : {}),
    confidence,
    summary: typeof r.summary === 'string' ? r.summary : '',
    parts: asArray<IntentPart>(r.parts, 12).filter((p) => p && typeof p.id === 'string' && typeof p.role === 'string'),
    fields: asArray<IntentField>(r.fields, 12).filter((f) => f && typeof f.key === 'string' && typeof f.label === 'string'),
    states: asArray<IntentState>(r.states, 6).filter((s) => s && typeof s.id === 'string'),
    ...(INTENT_ZONES.includes(r.placement as Zone9) ? { placement: r.placement as Zone9 } : {}),
    tone: asArray<string>(r.tone, 5).filter((t) => typeof t === 'string'),
    originalityRequested: r.originalityRequested === true,
    ...(typeof r.originalityEvidence === 'string' ? { originalityEvidence: r.originalityEvidence } : {}),
  };
}
