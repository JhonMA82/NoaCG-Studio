// THE DESIGN RULES - the one canonical module for on-air legibility constraints
// (docs/DESIGN_RULES_PLAN.md §2). Prompting, validation, instruments and tests all READ this;
// nothing copies its numbers. MODEL layer: pure, no DOM, importable by validation, ai,
// templates and the wizard (the entitlements/feedback precedent).
//
// THE STANDARD IS THE OWNER'S. The size table below was ratified 2026-08-18 as the broadcast
// minimum-size rule the blind reads kept asking for ("we need a minimum of what size text we
// can use on which screen - make a rule on the minimum sizes", docs/NOACG_PRO_PLAN.md §22.1
// escape 3). The catalog audit (benchmarks/design-rules/AUDIT-*.md) validates every number
// against shipped designs before anything hard-enforces; where the table and the audit
// disagree, the report says so and the table still wins - the evidence goes to the owner, the
// standard stays the owner's.
//
// RULES CONSTRAIN FAILURE, NEVER STYLE (owner brief §15): a small decorative flourish is
// legal, an unreadable score is not. Decorative text is exempt from size floors and still
// contrast-checked when it carries words.

/** Every rule scales off the SHORT side of the frame, so one table serves 16:9, 9:16 and 1:1. */
export function referenceSize(width: number, height: number): number {
  return Math.min(width, height);
}

/** What a piece of text IS to the viewer - the unit the size table is keyed by.
 *  primary: names, scores, clocks, headlines - the reason the graphic is on screen.
 *  secondary: titles, captions, context lines.
 *  fine: sources, fine print - discouraged, still floor-checked.
 *  decorative: ornament that happens to be text - exempt from size floors, contrast-checked. */
export type TextRole = 'primary' | 'secondary' | 'fine' | 'decorative';

/** 'standard' is the default; 'safe' is the "Guaranteed readable size" checkbox (default OFF).
 *  In safe mode the AI designs FOR big type - fewer fields, simpler composition - it never
 *  inflates a small layout. Persisted per project as an additive optional field (no version
 *  bump - AGENTS.md §5). */
export type LegibilityMode = 'standard' | 'safe';

/** Where the graphic will be WATCHED. Multiplies the size floors. 'venue' is a stub (alias of
 *  tv - distance math deferred, owner brief §19); 'custom' carries a free-text note to the
 *  prompt and multiplies as tv. Internal-only until the rules survive a read (wizard UI is R4). */
export type ViewingProfileId = 'tv' | 'streaming' | 'mobile' | 'venue' | 'custom';

export interface ViewingTarget {
  profile: ViewingProfileId;
  /** Only meaningful on 'custom': the author's own description of the environment, carried
   *  verbatim into the prompt block. */
  note?: string;
}

export const PROFILE_MULTIPLIER: Readonly<Record<ViewingProfileId, number>> = {
  tv: 1,
  streaming: 1.1,
  mobile: 1.25,
  venue: 1, // stub: treated as tv until viewing-distance math exists
  custom: 1,
};

/**
 * THE OWNER SIZE TABLE (ratified 2026-08-18), as fractions of the reference size.
 * A floor composes as `floor(role, mode) * profileMultiplier`.
 *
 * STANDARD: primary 4.6% (~50px @1080) hard; secondary and fine 1.85% (~20px) hard with a
 * warning band under 2.2% (~24px). 20px was chosen over 22 because shipped, owner-passed
 * designs sit at exactly 20px (lt27's supporting line).
 *
 * SAFE: the owner's three floors are primary 6% (band 6-10%), normal text 5%, secondary 4% -
 * mapped onto this module's roles as primary/secondary/fine ("normal text" is the secondary
 * role here; the owner's "secondary" is the fine role). In safe mode there is no warning band:
 * every floor is hard.
 */
export interface SizeFloorSpec {
  /** Hard floor as a fraction of the reference size. */
  hard: number;
  /** Warning band: at or above `hard` but under this warns. Null = no band. */
  warn: number | null;
}

export const SIZE_TABLE: Readonly<
  Record<LegibilityMode, Readonly<Record<Exclude<TextRole, 'decorative'>, SizeFloorSpec>>>
> = {
  standard: {
    primary: { hard: 0.046, warn: null },
    secondary: { hard: 0.0185, warn: 0.022 },
    fine: { hard: 0.0185, warn: 0.022 },
  },
  safe: {
    primary: { hard: 0.06, warn: null },
    secondary: { hard: 0.05, warn: null },
    fine: { hard: 0.04, warn: null },
  },
};

/** Safe mode's primary band tops out here - guidance for the prompt, never a violation. */
export const SAFE_PRIMARY_TARGET_MAX_RATIO = 0.1;

export interface SizeFloorPx {
  hardPx: number;
  warnPx: number | null;
}

/** The composed floor in px for one role on one frame. Null for decorative (exempt). */
export function sizeFloorPx(
  role: TextRole,
  mode: LegibilityMode,
  target: ViewingTarget,
  width: number,
  height: number,
): SizeFloorPx | null {
  if (role === 'decorative') return null;
  const ref = referenceSize(width, height);
  const spec = SIZE_TABLE[mode][role];
  const multiplier = PROFILE_MULTIPLIER[target.profile];
  return {
    hardPx: spec.hard * ref * multiplier,
    warnPx: spec.warn === null ? null : spec.warn * ref * multiplier,
  };
}

export type SizeStatus = 'pass' | 'warn' | 'fail' | 'exempt';

export interface SizeVerdict {
  status: SizeStatus;
  floor: SizeFloorPx | null;
}

export function checkTextSize(
  fontPx: number,
  role: TextRole,
  mode: LegibilityMode,
  target: ViewingTarget,
  width: number,
  height: number,
): SizeVerdict {
  const floor = sizeFloorPx(role, mode, target, width, height);
  if (!floor) return { status: 'exempt', floor: null };
  if (fontPx < floor.hardPx) return { status: 'fail', floor };
  if (floor.warnPx !== null && fontPx < floor.warnPx) return { status: 'warn', floor };
  return { status: 'pass', floor };
}

// ── Weight ──────────────────────────────────────────────────────────────────────────────

/** Informational text renders at computed weight >= 400... */
export const WEIGHT_FLOOR = 400;
/** ...and >= 500 when it is small (under the warning-band ratio) or sits over unprotected
 *  video, where thin strokes dissolve into the picture. */
export const WEIGHT_FLOOR_PROTECTED = 500;
/** "Small" for the weight rule: the same ratio as the standard warning band (~24px @1080). */
export const SMALL_TEXT_RATIO = 0.022;

export function weightFloor(
  fontPx: number,
  width: number,
  height: number,
  overUnprotectedVideo: boolean,
): number {
  const ref = referenceSize(width, height);
  return fontPx < SMALL_TEXT_RATIO * ref || overUnprotectedVideo
    ? WEIGHT_FLOOR_PROTECTED
    : WEIGHT_FLOOR;
}

// ── Strokes ─────────────────────────────────────────────────────────────────────────────

/** A FUNCTIONAL stroke (a divider, a rule that separates content) thinner than this fraction
 *  of the reference (~3px @1080) smears through broadcast compression. WARN in v1:
 *  functional-vs-decorative is not deterministically decidable and the house style ships
 *  deliberate hairlines (docs/DESIGN_LANGUAGE.md). */
export const STROKE_FLOOR_RATIO = 0.0028;

export function strokeFloorPx(width: number, height: number): number {
  return STROKE_FLOOR_RATIO * referenceSize(width, height);
}

// ── Safe area ───────────────────────────────────────────────────────────────────────────

/** Field-bound text and brand marks stay this fraction inside EVERY edge (96/54px @1920x1080).
 *  HARD - the catalog's own 119px edge convention sits comfortably inside, so this breaks
 *  nothing shipped. Decoration is exempt: an accent may bleed off the frame on purpose. */
export const SAFE_AREA_INSET_RATIO = 0.05;

export function safeAreaInset(width: number, height: number): { x: number; y: number } {
  return { x: SAFE_AREA_INSET_RATIO * width, y: SAFE_AREA_INSET_RATIO * height };
}

// ── Contrast + protection ───────────────────────────────────────────────────────────────

export const CONTRAST_FLOOR_NORMAL = 4.5;
export const CONTRAST_FLOOR_LARGE = 3;
/** WCAG's large-text cut, expressed against the reference: ~24px @1080, or ~18.7px bold. */
export const LARGE_TEXT_RATIO = 0.022;
export const LARGE_TEXT_BOLD_RATIO = 0.0173;

export function contrastFloor(fontPx: number, weight: number, width: number, height: number): number {
  const ref = referenceSize(width, height);
  const large = fontPx >= LARGE_TEXT_RATIO * ref
    || (weight >= 700 && fontPx >= LARGE_TEXT_BOLD_RATIO * ref);
  return large ? CONTRAST_FLOOR_LARGE : CONTRAST_FLOOR_NORMAL;
}

/** Text whose backing is UNKNOWABLE (a transparent stack over the picture) must carry a
 *  protective treatment detectable from computed style - a panel, a text-shadow, a stroke, or
 *  a scrim gradient behind it. WARN in v1: the owner PASSED a panel-free minimalist anchor
 *  (lt27), so a hard fail would flag an owner-passed design on day one; the audit calibrates. */
export const PROTECTION_REQUIRED_OVER_UNKNOWABLE = true;

// ── Informational vs decorative classification (stated limitation, not hidden) ──────────

/** Field-bound text (`#fN`) and its adjacent labels are informational, ALWAYS. Standalone
 *  static text is informational when its rendered size reaches this fraction of the reference
 *  (~10px @1080); below it, it is classed decorative WITH A WARNING rather than silently -
 *  so a tiny ornament is exempt while an undersized real label still fails its floor. */
export const STATIC_INFORMATIONAL_MIN_RATIO = 0.009;

// ── The prompt block ────────────────────────────────────────────────────────────────────

const px = (n: number) => `${Math.round(n)}px`;

/**
 * The rules as PROSE for the model, generated from the constants above so prompt and
 * measurement cannot drift (one module, zero drift - owner brief §16). Rides the USER
 * message, never the frozen coder system prompt (the benchmark control, src/ai/AGENTS.md).
 */
export function designRulesPromptBlock(
  target: ViewingTarget,
  mode: LegibilityMode,
  format: { width: number; height: number },
): string {
  const { width, height } = format;
  const primary = sizeFloorPx('primary', mode, target, width, height);
  const secondary = sizeFloorPx('secondary', mode, target, width, height);
  const fine = sizeFloorPx('fine', mode, target, width, height);
  if (!primary || !secondary || !fine) throw new Error('size table incomplete');
  const inset = safeAreaInset(width, height);
  const ref = referenceSize(width, height);

  const lines: string[] = [
    `BROADCAST LEGIBILITY RULES (${width}x${height}, viewed on ${target.profile}${target.note ? ` - ${target.note}` : ''}). These constrain failure, never style - within them, design freely:`,
    `- Primary text (names, scores, clocks, headlines) renders at ${px(primary.hardPx)} or larger.`
      + (mode === 'safe' ? ` Aim for ${px(primary.hardPx)}-${px(SAFE_PRIMARY_TARGET_MAX_RATIO * ref * PROFILE_MULTIPLIER[target.profile])}.` : ''),
    `- Supporting text (titles, captions, context) renders at ${px(secondary.hardPx)} or larger`
      + (secondary.warnPx !== null ? `; prefer ${px(secondary.warnPx)}+` : '')
      + `. Fine print at ${px(fine.hardPx)} or larger - and avoid fine print at all where you can.`,
    '- Decorative text (ornament that happens to be letters) is exempt from size floors but must still be legible against its backing if it carries words a viewer should read.',
    `- Informational text uses font-weight ${WEIGHT_FLOOR} or heavier; use ${WEIGHT_FLOOR_PROTECTED}+ when it is small (under ${px(SMALL_TEXT_RATIO * ref)}) or sits directly over video.`,
    `- Text contrast: at least ${CONTRAST_FLOOR_NORMAL}:1 against its backing (${CONTRAST_FLOOR_LARGE}:1 for large text). Text sitting on a transparent area over the picture MUST carry protection the viewer can see: a panel, a scrim gradient, a text-shadow or an outline.`,
    `- Keep every data field and any brand mark at least ${px(inset.x)} from the left/right edges and ${px(inset.y)} from the top/bottom edges (the safe area). Decorative shapes may bleed.`,
    `- Functional strokes (dividers, rules that separate content) are at least ${px(strokeFloorPx(width, height))} thick; purely decorative hairlines are fine.`,
    '- NOTHING may collide: no accent line or rule over text, no text over text, no element overlapping the brand mark. A collision is never acceptable on any graphic type.',
    '- A ticker/crawl band runs full-bleed or carries EQUAL side margins - never one margin.',
  ];
  if (mode === 'safe') {
    lines.push(
      '- GUARANTEED-READABLE MODE: design FOR big type from the start - fewer fields, a simpler composition, generous panels. Never shrink type to fit a busy layout; remove from the layout instead.',
    );
  }
  return lines.join('\n');
}
