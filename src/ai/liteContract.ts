import type {
  LiteDecision,
  LiteDesignSpec,
  LiteGenerationSpec,
  LiteGenerationRequest,
  LiteUnsupportedCode,
} from './liteTypes';
import type { StructuredOutput } from './modelTypes';

export interface LiteCatalogEntry {
  aiCategory: string;
  category: LiteDesignSpec['category'];
  variantId: string;
  name: string;
  description: string;
  style: 'noacg' | 'minimal' | 'sport' | 'glass' | 'editorial' | 'cinematic';
  maxLines: number;
  logo: boolean;
}

const entries = (
  aiCategory: string,
  category: LiteDesignSpec['category'],
  maxLines: number,
  variants: Omit<LiteCatalogEntry, 'aiCategory' | 'category' | 'maxLines'>[],
): LiteCatalogEntry[] => variants.map((variant) => ({ aiCategory, category, maxLines, ...variant }));

export const LITE_CATALOG: readonly LiteCatalogEntry[] = [
  ...entries('lower-third', 'lower-third', 2, [
    { variantId: 'lt11', name: 'House Strap', description: 'Amber accent, dark panel, strong name hierarchy.', style: 'noacg', logo: false },
    { variantId: 'lt02', name: 'Underline', description: 'Panel-free typography with a restrained accent rule.', style: 'minimal', logo: false },
    { variantId: 'lt05', name: 'Angle Slab', description: 'Forward-leaning, condensed sport treatment.', style: 'sport', logo: false },
    { variantId: 'lt15', name: 'Frost Strap', description: 'Soft glass panel and calm hierarchy.', style: 'glass', logo: false },
    { variantId: 'lt25', name: 'Masthead', description: 'Editorial rule, serif-like scale, tracked supporting line.', style: 'editorial', logo: false },
    { variantId: 'lt32', name: 'Scrim', description: 'Cinematic typography on a quiet gradient scrim.', style: 'cinematic', logo: false },
  ]),
  ...entries('title', 'info-card', 5, [
    { variantId: 'card05', name: 'House Title', description: 'NoaCG opener with a large title and soft glow.', style: 'noacg', logo: true },
    { variantId: 'card07', name: 'Clean Title', description: 'Panel-free title with generous whitespace.', style: 'minimal', logo: true },
    { variantId: 'card08', name: 'Slab Title', description: 'Large condensed sport title on an angled slab.', style: 'sport', logo: true },
    { variantId: 'card09', name: 'Frost Title', description: 'Centered glass opener with a calm entrance.', style: 'glass', logo: true },
    { variantId: 'card10', name: 'Session Title', description: 'Conference or lecture session opener.', style: 'minimal', logo: true },
    { variantId: 'card11', name: 'Keynote Title', description: 'Frosted keynote or presentation opener.', style: 'glass', logo: true },
    { variantId: 'card12', name: 'Segment Title', description: 'Heavy sports or esports segment opener.', style: 'sport', logo: true },
    { variantId: 'card13', name: 'Service Title', description: 'Centered house-style ceremony opener.', style: 'noacg', logo: true },
  ]),
  ...entries('topic-card', 'info-card', 5, [
    { variantId: 'card01', name: 'Hairline Card', description: 'Minimal topic typography beside one accent line.', style: 'minimal', logo: true },
    { variantId: 'card02', name: 'Slab Card', description: 'Sport information card with a strong accent edge.', style: 'sport', logo: true },
    { variantId: 'card03', name: 'Frosted Panel', description: 'Glass panel for lineups, information, and schedules.', style: 'glass', logo: true },
    { variantId: 'card06', name: 'House Topic', description: 'NoaCG panel for a heading and supporting points.', style: 'noacg', logo: true },
    { variantId: 'card14', name: 'Chapter Card', description: 'Quiet chapter or section marker.', style: 'minimal', logo: true },
    { variantId: 'card15', name: 'Question Card', description: 'Frosted question and supporting context.', style: 'glass', logo: true },
    { variantId: 'card16', name: 'Topic Slab', description: 'Sport talking point with heavy hierarchy.', style: 'sport', logo: true },
    { variantId: 'card17', name: 'Key Term', description: 'House-style explainer for a term and definition.', style: 'noacg', logo: true },
  ]),
  ...entries('ticker', 'ticker', 3, [
    { variantId: 'tk01', name: 'News Crawl', description: 'Classic continuous news crawl.', style: 'noacg', logo: false },
    { variantId: 'tk02', name: 'Split Rail', description: 'Label rail and continuously moving information.', style: 'minimal', logo: false },
    { variantId: 'tk03', name: 'Market Strip', description: 'Compact values and updates.', style: 'minimal', logo: false },
    { variantId: 'tk04', name: 'Sport Crawl', description: 'Energetic scores and results strip.', style: 'sport', logo: false },
    { variantId: 'tk05', name: 'Frost Crawl', description: 'Soft glass continuous ticker.', style: 'glass', logo: false },
    { variantId: 'tk06', name: 'Editorial Crawl', description: 'Restrained editorial information strip.', style: 'editorial', logo: false },
    { variantId: 'tk11', name: 'House Ticker', description: 'NoaCG continuous information ticker.', style: 'noacg', logo: false },
    { variantId: 'tk12', name: 'Clean Ticker', description: 'Minimal continuous information ticker.', style: 'minimal', logo: false },
    { variantId: 'tk13', name: 'Sport Ticker', description: 'Bold sport information ticker.', style: 'sport', logo: false },
    { variantId: 'tk14', name: 'Glass Ticker', description: 'Translucent information ticker.', style: 'glass', logo: false },
    { variantId: 'tk15', name: 'Campus Ticker', description: 'Clear announcements and notices.', style: 'noacg', logo: false },
    { variantId: 'tk16', name: 'Results Ticker', description: 'Compact scores and statistics.', style: 'sport', logo: false },
    { variantId: 'tk17', name: 'Programme Ticker', description: 'Schedule and programme information.', style: 'editorial', logo: false },
    { variantId: 'tk20', name: 'Headline Ticker', description: 'Prominent label with a readable crawl.', style: 'noacg', logo: false },
  ]),
  ...entries('countdown', 'game-timer', 2, [
    { variantId: 'gt01', name: 'House Countdown', description: 'Clear countdown with NoaCG hierarchy.', style: 'noacg', logo: false },
    { variantId: 'gt02', name: 'Minimal Countdown', description: 'Simple, highly legible timer.', style: 'minimal', logo: false },
    { variantId: 'gt05', name: 'Sport Countdown', description: 'Condensed energetic event timer.', style: 'sport', logo: false },
    { variantId: 'gt06', name: 'Glass Countdown', description: 'Frosted event countdown.', style: 'glass', logo: false },
  ]),
  ...entries('scoreboard', 'scoreboard', 8, [
    { variantId: 'sb01', name: 'House Scoreboard', description: 'Known deterministic two-team score graphic.', style: 'noacg', logo: true },
    { variantId: 'sb02', name: 'Minimal Scoreboard', description: 'Clean two-team score graphic.', style: 'minimal', logo: true },
    { variantId: 'sb03', name: 'Sport Scoreboard', description: 'Bold two-team competitive score graphic.', style: 'sport', logo: true },
    { variantId: 'sb04', name: 'Glass Scoreboard', description: 'Frosted two-team score graphic.', style: 'glass', logo: true },
  ]),
  ...entries('stats-panel', 'infographic', 8, [
    { variantId: 'ig01', name: 'Big Stat', description: 'One headline statistic with supporting context.', style: 'noacg', logo: false },
    { variantId: 'ig03', name: 'Timing Tower', description: 'Compact ordered timing or result values.', style: 'sport', logo: false },
    { variantId: 'ig05', name: 'Rising Total', description: 'A focused total or progress statistic.', style: 'minimal', logo: false },
    { variantId: 'ig07', name: 'Comparison Bars', description: 'A small deterministic comparison of values.', style: 'editorial', logo: false },
  ]),
] as const;

export const LITE_AI_CATEGORIES = [
  'lower-third',
  'title',
  'topic-card',
  'ticker',
  'countdown',
  'scoreboard',
  'stats-panel',
] as const;

const variantIds = LITE_CATALOG.map((entry) => entry.variantId);
const categories = [...new Set(LITE_CATALOG.map((entry) => entry.category))];
const safeColor = {
  type: 'string',
  pattern: '^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$',
  maxLength: 9,
};
const zones = [
  'top-left', 'top-center', 'top-right',
  'mid-left', 'mid-center', 'mid-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

const specSchema: Record<string, unknown> = {
  type: 'object',
  required: ['fit', 'reason', 'name', 'summary', 'category', 'variantId', 'lines'],
  additionalProperties: false,
  properties: {
    fit: { type: 'string', enum: ['catalog'] },
    reason: { type: 'string', minLength: 1, maxLength: 240 },
    name: { type: 'string', minLength: 1, maxLength: 100 },
    summary: { type: 'string', minLength: 1, maxLength: 240 },
    category: { type: 'string', enum: categories },
    variantId: { type: 'string', enum: variantIds },
    lines: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        required: ['title', 'sample'],
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 80 },
          sample: { type: 'string', maxLength: 500 },
        },
      },
    },
    extraFields: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        required: ['title', 'ftype', 'value'],
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 80 },
          ftype: { type: 'string', enum: ['textfield', 'textarea', 'number', 'filelist'] },
          value: { type: 'string', maxLength: 500 },
        },
      },
    },
    useLogoSlot: { type: 'boolean' },
    zone: { type: 'string', enum: zones },
    paletteId: { type: 'string', maxLength: 80 },
    palette: {
      type: 'object',
      required: ['accent', 'text', 'textDim', 'panel'],
      additionalProperties: false,
      properties: {
        accent: safeColor,
        text: safeColor,
        textDim: safeColor,
        panel: safeColor,
      },
    },
    fontId: { type: 'string', maxLength: 80 },
    sizeScale: { type: 'number', minimum: 0.7, maximum: 1.4 },
    animation: {
      type: 'object',
      additionalProperties: false,
      properties: {
        presetId: { type: 'string', maxLength: 80 },
        easing: { type: 'string', maxLength: 80 },
        speed: { type: 'number', enum: [0.75, 1, 1.5] },
        steps: { type: 'boolean' },
      },
    },
    motionCharacter: { type: 'string', maxLength: 100 },
    typography: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scaleRatio: { type: 'number' },
        headingWeight: { type: 'string', enum: ['regular', 'semibold', 'bold', 'black'] },
        kickerCase: { type: 'string', enum: ['caps', 'as-written'] },
        tracking: { type: 'string', enum: ['tight', 'normal', 'wide'] },
      },
    },
    density: { type: 'string', enum: ['airy', 'standard', 'compact'] },
    alignment: { type: 'string', enum: ['left', 'center', 'right'] },
    shape: {
      type: 'object',
      additionalProperties: false,
      properties: {
        corner: { type: 'string', enum: ['sharp', 'soft', 'round'] },
        accentForm: { type: 'string', enum: ['bar', 'hairline', 'block', 'none'] },
        panel: { type: 'string', enum: ['solid', 'translucent', 'outline', 'none'] },
      },
    },
    flourish: { type: 'string', enum: [''] },
  },
};

export const LITE_DECISION_OUTPUT: StructuredOutput = {
  name: 'emit_noacg_lite_decision',
  description: 'Return one supported catalog-grounded design decision or an explicit unsupported result.',
  schema: {
    oneOf: [
      {
        type: 'object',
        required: ['status', 'aiCategory', 'spec'],
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: ['ready'] },
          aiCategory: { type: 'string', enum: LITE_AI_CATEGORIES },
          spec: specSchema,
        },
      },
      {
        type: 'object',
        required: ['status', 'unsupportedCode', 'message', 'suggestedBrief'],
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: ['unsupported'] },
          unsupportedCode: {
            type: 'string',
            enum: ['unsupported-category', 'multi-graphic-request', 'advanced-state-machine', 'reference-recreation', 'import-conversion', 'video-request', 'external-data', 'too-complex'],
          },
          message: { type: 'string', minLength: 1, maxLength: 300 },
          suggestedBrief: { type: 'string', minLength: 1, maxLength: 300 },
        },
      },
    ],
  },
};

const unsupportedPatterns: { code: LiteUnsupportedCode; pattern: RegExp; message: string; suggestion: string }[] = [
  { code: 'multi-graphic-request', pattern: /\b(package|graphics package|set of (?:three|four|five|\d+)|multiple graphics)\b/i, message: 'Lite creates one graphic at a time.', suggestion: 'Describe the single most important graphic you need first.' },
  { code: 'advanced-state-machine', pattern: /\b(branching|state machine|multiple parallel states|conditional transition)\b/i, message: 'Lite does not create advanced branching or parallel state machines.', suggestion: 'Ask for one graphic with a simple entrance, hold, update, and exit.' },
  { code: 'reference-recreation', pattern: /\b(recreate|replicate|copy|pixel[- ]perfect).{0,40}\b(screenshot|reference|image|graphic)\b/i, message: 'Lite does not recreate graphics from reference images.', suggestion: 'Describe the desired palette, hierarchy, mood, and graphic type in words.' },
  { code: 'import-conversion', pattern: /\b(convert|repair|rewrite).{0,40}\b(import|html|zip|template)\b/i, message: 'Lite does not convert or repair imported templates.', suggestion: 'Ask Lite to create a new common graphic from a short brief.' },
  { code: 'video-request', pattern: /\b(video|remotion|hyperframes|3d scene|cinematic sequence)\b/i, message: 'Lite creates editable broadcast graphics, not video projects.', suggestion: 'Ask for a title card, lower third, ticker, timer, scoreboard, or statistics graphic.' },
  { code: 'external-data', pattern: /\b(fetch|api|live feed|database|websocket|real[- ]time data)\b/i, message: 'Lite cannot add external data or network dependencies.', suggestion: 'Ask for editable fields that an operator can update in NoaCG.' },
];

export function obviousUnsupportedDecision(prompt: string): LiteDecision | null {
  const match = unsupportedPatterns.find((entry) => entry.pattern.test(prompt));
  return match
    ? { status: 'unsupported', code: match.code, message: match.message, suggestedBrief: match.suggestion }
    : null;
}

export function liteCatalogDigest(): string {
  return LITE_CATALOG.map((entry) =>
    `${entry.aiCategory}|${entry.category}|${entry.variantId}|${entry.name}|${entry.style}|${entry.maxLines} lines|logo:${entry.logo ? 'yes' : 'no'}|${entry.description}`,
  ).join('\n');
}

export function liteSystemPrompt(promptVersion: string): string {
  return [
    `NoaCG Lite Design Director ${promptVersion}.`,
    'Return exactly one compact structured decision. Never write HTML, CSS, or JavaScript.',
    'Choose only a listed category and variant. The platform compiles it deterministically into an editable broadcast graphic.',
    'Use status unsupported when the request needs multiple graphics, custom code, advanced state machines, reference recreation, imports, video, external data, or a graphic category not listed.',
    'For unsupported output, give a short plain-language explanation and one actionable simplified brief.',
    'For ready output, fit must be catalog and flourish must be the empty string. Use realistic editable sample copy. Bespoke palette values must be six-digit hex colors. Prioritize legibility, intentional hierarchy, spacing, text capacity, and correct broadcast conventions.',
    'A requested visual style should select and tune the nearest compatible chassis, not make the request unsupported.',
    'Catalog:',
    liteCatalogDigest(),
  ].join('\n');
}

function compactGenerationSpec(spec: LiteGenerationSpec | null | undefined): unknown {
  if (!spec) return undefined;
  return {
    category: spec.category,
    fields: spec.fields.map(({ label, kind, description, example }) => ({ label, kind, description, example })),
    styleNotes: spec.styleNotes,
    mood: spec.mood,
    avoidNotes: spec.avoidNotes,
    brandColors: spec.brandColors,
    animation: spec.animation,
  };
}

export function liteRequestText(request: LiteGenerationRequest): string {
  return JSON.stringify({
    brief: request.prompt,
    generationSpec: compactGenerationSpec(request.generationSpec),
    priorSpec: request.priorSpec,
    conversation: request.conversation,
    palette: request.palette,
    primaryFont: request.primaryFont,
    hasLogo: request.hasLogo,
    resolution: request.resolution,
    fps: request.fps,
  });
}

export interface LiteSemanticResult {
  decision?: LiteDecision;
  errors: string[];
}

export function validateLiteDecision(
  value: unknown,
  request: LiteGenerationRequest,
  maxFields = 8,
): LiteSemanticResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { errors: ['decision_not_object'] };
  const output = value as Record<string, unknown>;
  if (output.status === 'unsupported') {
    const code = output.unsupportedCode;
    if (typeof code !== 'string' || !code || ![
      'unsupported-category', 'multi-graphic-request', 'advanced-state-machine', 'reference-recreation',
      'import-conversion', 'video-request', 'external-data', 'too-complex',
    ].includes(code)) return { errors: ['unsupported_code_invalid'] };
    const message = typeof output.message === 'string' ? output.message.trim() : '';
    if (!message) return { errors: ['unsupported_message_missing'] };
    return {
      decision: {
        status: 'unsupported',
        code: code as LiteUnsupportedCode,
        message: message.slice(0, 300),
        ...(typeof output.suggestedBrief === 'string' && output.suggestedBrief.trim()
          ? { suggestedBrief: output.suggestedBrief.trim().slice(0, 300) }
          : {}),
      },
      errors: [],
    };
  }
  if (output.status !== 'ready') return { errors: ['status_invalid'] };
  if (!output.spec || typeof output.spec !== 'object' || Array.isArray(output.spec)) return { errors: ['spec_missing'] };
  const spec = output.spec as unknown as LiteDesignSpec;
  const aiCategory = output.aiCategory;
  const entry = LITE_CATALOG.find((candidate) => candidate.variantId === spec.variantId);
  const errors: string[] = [];
  if (!entry) errors.push('variant_not_allowed');
  if (spec.fit !== 'catalog') errors.push('fit_not_catalog');
  if (entry && spec.category !== entry.category) errors.push('category_variant_mismatch');
  if (entry && aiCategory !== entry.aiCategory) errors.push('ai_category_variant_mismatch');
  if (!Array.isArray(spec.lines) || spec.lines.length < 1 || (entry && spec.lines.length > Math.min(3, entry.maxLines))) {
    errors.push('line_count_invalid');
  }
  const extraCount = Array.isArray(spec.extraFields) ? spec.extraFields.length : 0;
  if (spec.lines.length + extraCount > maxFields) errors.push('field_count_exceeded');
  const flourish = (spec as { flourish?: unknown }).flourish;
  if (typeof flourish === 'string' && flourish.trim()) errors.push('flourish_forbidden');
  if (spec.useLogoSlot && !entry?.logo) errors.push('logo_not_supported');
  const requested = request.generationSpec?.category;
  if (requested && requested !== 'auto' && requested !== aiCategory) errors.push('requested_category_ignored');
  return errors.length ? { errors } : { decision: { status: 'ready', spec: { ...spec, flourish: null } }, errors: [] };
}
