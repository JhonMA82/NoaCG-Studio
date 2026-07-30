// Ground truth + scoring for the import-analysis vision suite (docs/AI_PLATFORM_PLAN.md §8).
//
// The dataset is MIXED on purpose. Catalog renders give geometry that is exact rather than
// eyeballed - the bounding box, the font and the colour come from the DOM that drew the
// pixels - but they are on-distribution and easy. Authored cases carry the hostile classes
// the plan names (no editable text, odd aspect ratios, flattened artwork, hostile
// typography) and are hand-labelled. Every record says which it is, because a metric that
// mixes exact and hand-made labels without saying so is a metric nobody can act on.
//
// WHAT THE CATALOG CANNOT TELL US. Neither SpxField nor FieldDescriptor carries a semantic
// role, so a catalog render's role is INFERRED from the operator-facing field title. That
// inference is right for "Name" and hopeless for "Line 2", so a record marks each region's
// role source and scoring simply skips the ones it could not derive. Silently guessing
// would manufacture agreement or disagreement that means nothing either way.

export const VISION_SUITE_ID = 'import-analysis-v1';
export const GROUND_TRUTH_VERSION = 1;

/** Field titles map to contract roles only where the mapping is UNAMBIGUOUS. Anything else
 *  stays null and drops out of role accuracy - see the note above. */
// Ordered most specific first. Trailing "A"/"B"/"1"/"2" is allowed because the catalog
// names paired fields that way ("Team A", "Score B"). Genuinely ambiguous titles - Kicker,
// Label, Detail, Note, Body, Line 1, Step 2, Subtitle, Heading - are deliberately ABSENT:
// they could be almost any role, and a guess here becomes a scoring verdict on the model.
const SUFFIX = String.raw`(\s*[ab12])?`;
const TITLE_ROLE_MAP = [
  [new RegExp(`^(score|result|points)${SUFFIX}$`, 'i'), 'score'],
  [new RegExp(`^(team|club|side)${SUFFIX}$`, 'i'), 'team-name'],
  [/^(name|full name|person|reporter|presenter|player|guest|speaker)$/i, 'person-name'],
  [/^(role|title|job|position|function|credit)$/i, 'person-role'],
  [/^(org|organisation|organization|company|channel|network|publication|source|platform)$/i, 'organization'],
  [/^(headline|story|topic|subject)$/i, 'story-headline'],
  [/^(event|programme|program|show|show name|occasion)$/i, 'event-name'],
  [/^(location|place|city|venue|where|dateline)$/i, 'location'],
  [/^(time|clock|kickoff|duration|minute|period|ends|next time)$/i, 'time'],
  [/^(start time.*|countdown.*)$/i, 'time'],
];

/** A side prefix names WHICH instance, never a different role: "Left name" and "Right name"
 *  are both person-name in a two-up layout. Stripped before matching so paired designs do
 *  not fall out of role coverage for a reason that carries no semantic weight. */
const SIDE_PREFIX = /^(left|right|home|away|first|second)\s+/i;

export function roleFromTitle(title) {
  const cleaned = (title ?? '').trim().replace(SIDE_PREFIX, '');
  for (const [pattern, role] of TITLE_ROLE_MAP) if (pattern.test(cleaned)) return role;
  return null;
}

/** Bundled face -> the contract's font id and letterform class. The analysis contract can
 *  only ever name one of these seven, so ground truth speaks the same restricted language
 *  (src/ai/importAnalysis/contract.ts). */
const FONT_MAP = [
  [/bebas/i, { fontId: 'bebas-neue', classification: 'display' }],
  [/oswald/i, { fontId: 'oswald', classification: 'condensed' }],
  [/jetbrains/i, { fontId: 'jetbrains-mono', classification: 'mono' }],
  [/space\s*grotesk/i, { fontId: 'space-grotesk', classification: 'sans' }],
  [/manrope/i, { fontId: 'manrope', classification: 'sans' }],
  [/archivo/i, { fontId: 'archivo', classification: 'sans' }],
  [/inter/i, { fontId: 'inter', classification: 'sans' }],
];

export function fontFromFamily(family) {
  for (const [pattern, value] of FONT_MAP) if (pattern.test(family ?? '')) return value;
  return { fontId: null, classification: 'sans' };
}

export function validateRecord(record) {
  const errors = [];
  const need = (cond, message) => { if (!cond) errors.push(message); };
  need(record.version === GROUND_TRUTH_VERSION, `version must be ${GROUND_TRUTH_VERSION}`);
  need(typeof record.id === 'string' && record.id, 'id required');
  need(['catalog-render', 'authored'].includes(record.source), 'source must be catalog-render or authored');
  need(['dev', 'holdout'].includes(record.split), 'split must be dev or holdout');
  need(typeof record.image === 'string' && record.image, 'image required');
  need(record.truth && typeof record.truth === 'object', 'truth required');
  if (record.truth) {
    need(typeof record.truth.graphicType === 'string', 'truth.graphicType required');
    need(Array.isArray(record.truth.regions), 'truth.regions must be an array');
    for (const [i, region] of (record.truth.regions ?? []).entries()) {
      const b = region.bbox ?? {};
      const inRange = (v) => typeof v === 'number' && v >= 0 && v <= 1;
      need(inRange(b.x) && inRange(b.y) && inRange(b.w) && inRange(b.h),
        `region ${i}: bbox must be normalized 0..1`);
      need(['text', 'logo', 'image', 'decorative'].includes(region.kind), `region ${i}: bad kind`);
    }
    // The hallucination tripwire only works when a no-text image is DECLARED as one:
    // "zero regions because the labeller stopped early" and "zero regions because there is
    // genuinely nothing" are the same JSON otherwise.
    need(typeof record.truth.hasEditableText === 'boolean',
      'truth.hasEditableText required - the no-editable-text tripwire depends on it');
  }
  return { ok: errors.length === 0, errors };
}

export function iou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const overlap = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - overlap;
  return union > 0 ? overlap / union : 0;
}

/** Greedy highest-IoU matching, each region used once. Greedy rather than optimal because
 *  broadcast regions barely overlap - a Hungarian solve would return the same pairs and be
 *  harder to read when a score needs explaining. */
export function matchRegions(truthRegions, predictedRegions, threshold = 0.5) {
  const pairs = [];
  for (const [ti, t] of truthRegions.entries()) {
    for (const [pi, p] of predictedRegions.entries()) pairs.push({ ti, pi, score: iou(t.bbox, p.bbox) });
  }
  pairs.sort((a, b) => b.score - a.score);
  const usedTruth = new Set();
  const usedPred = new Set();
  const matched = [];
  for (const pair of pairs) {
    if (pair.score < threshold || usedTruth.has(pair.ti) || usedPred.has(pair.pi)) continue;
    usedTruth.add(pair.ti);
    usedPred.add(pair.pi);
    matched.push({ ...pair, truth: truthRegions[pair.ti], predicted: predictedRegions[pair.pi] });
  }
  return {
    matched,
    missedTruth: truthRegions.filter((_, i) => !usedTruth.has(i)),
    extraPredicted: predictedRegions.filter((_, i) => !usedPred.has(i)),
  };
}

const hexToRgb = (hex) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

/** Plain RGB distance, 0..1. Not a perceptual metric - it answers "did it read the colour
 *  roughly right", which is all a field default needs. */
export function colorDelta(a, b) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return null;
  return Math.sqrt((ca.r - cb.r) ** 2 + (ca.g - cb.g) ** 2 + (ca.b - cb.b) ** 2) / (255 * Math.sqrt(3));
}

/**
 * Score one prediction against one ground-truth record. Returns per-metric numbers plus the
 * denominators, so a caller can aggregate honestly instead of averaging averages.
 *
 * Region metrics run over the kinds the record claims authority for (catalog renders know
 * their TEXT regions exactly and say nothing about decoration), so a model is never
 * penalized for reporting something the ground truth never attempted to cover.
 */
export function scoreAnalysis(record, prediction, options = {}) {
  const threshold = options.iouThreshold ?? 0.5;
  const truth = record.truth;
  const authoritative = new Set(truth.authoritativeKinds ?? ['text']);

  if (!prediction) {
    return { schemaOk: false, graphicTypeCorrect: false, hallucinatedRegions: 0, counts: {} };
  }

  const truthRegions = truth.regions.filter((r) => authoritative.has(r.kind));
  const predRegions = (prediction.regions ?? []).filter((r) => authoritative.has(r.kind));
  const { matched, missedTruth, extraPredicted } = matchRegions(truthRegions, predRegions, threshold);

  // Role/font/colour accuracy count only where ground truth actually knows the answer.
  let roleChecked = 0;
  let roleCorrect = 0;
  let fontClassChecked = 0;
  let fontClassCorrect = 0;
  let fontIdChecked = 0;
  let fontIdCorrect = 0;
  const colorDeltas = [];
  for (const pair of matched) {
    const t = pair.truth;
    const p = pair.predicted;
    if (t.role) {
      roleChecked += 1;
      if (t.role === p.role) roleCorrect += 1;
    }
    if (t.typography?.classification) {
      fontClassChecked += 1;
      if (t.typography.classification === p.typography?.classification) fontClassCorrect += 1;
    }
    if (t.typography?.fontId) {
      fontIdChecked += 1;
      if (t.typography.fontId === p.typography?.suggestedFontId) fontIdCorrect += 1;
    }
    const delta = colorDelta(t.typography?.color, p.typography?.color);
    if (delta !== null) colorDeltas.push(delta);
  }

  // The tripwire: regions invented on artwork that has no editable text at all. Counted
  // separately from ordinary false positives because it is the failure that would put
  // nonsense fields in front of a user who imported a finished graphic.
  const hallucinatedRegions = truth.hasEditableText ? 0 : predRegions.length;

  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    schemaOk: true,
    graphicTypeCorrect: prediction.graphicType === truth.graphicType,
    precision: predRegions.length ? matched.length / predRegions.length : null,
    recall: truthRegions.length ? matched.length / truthRegions.length : null,
    meanIou: mean(matched.map((m) => m.score)),
    roleAccuracy: roleChecked ? roleCorrect / roleChecked : null,
    fontClassAccuracy: fontClassChecked ? fontClassCorrect / fontClassChecked : null,
    fontIdAccuracy: fontIdChecked ? fontIdCorrect / fontIdChecked : null,
    meanColorDelta: mean(colorDeltas),
    hallucinatedRegions,
    // Simulated user-edit effort (plan §8): every region the operator would have to fix,
    // add or delete before the proposal is usable. One number a non-technical reader can
    // act on, where precision and recall are two they cannot.
    editsRequired: missedTruth.length + extraPredicted.length
      + matched.filter((m) => m.truth.role && m.truth.role !== m.predicted.role).length,
    counts: {
      truthRegions: truthRegions.length,
      predictedRegions: predRegions.length,
      matched: matched.length,
      missed: missedTruth.length,
      extra: extraPredicted.length,
      roleChecked,
      fontClassChecked,
      fontIdChecked,
    },
  };
}
