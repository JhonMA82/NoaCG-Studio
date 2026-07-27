import type {
  LiteDecision,
  LiteDesignSpec,
  LiteGenerationSpec,
  LiteGenerationRequest,
  LiteLowerThirdIntentKind,
  LiteLowerThirdLineRole,
  LiteUnsupportedCode,
  LiteVariantQualityPrior,
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
  intentKinds: readonly LiteLowerThirdIntentKind[];
  bestFor: readonly string[];
  avoidFor: readonly string[];
  visualWeight: 'light' | 'medium' | 'heavy';
  textCapacity: 'medium' | 'high';
  fieldPattern: string;
  motionCharacter: string;
}

const entries = (
  aiCategory: string,
  category: LiteDesignSpec['category'],
  maxLines: number,
  variants: Omit<LiteCatalogEntry, 'aiCategory' | 'category' | 'maxLines'>[],
): LiteCatalogEntry[] => variants.map((variant) => ({ aiCategory, category, maxLines, ...variant }));

export const LITE_CATALOG: readonly LiteCatalogEntry[] = [
  ...entries('lower-third', 'lower-third', 2, [
    {
      variantId: 'lt11',
      name: 'House Strap',
      description: 'Amber accent, dark broadcast-width panel, strong display name and mono supporting line.',
      style: 'noacg',
      logo: false,
      intentKinds: ['person', 'story', 'event', 'organization'],
      bestFor: ['news', 'corporate', 'public service', 'general interviews'],
      avoidFor: ['delicate documentary supers', 'playful or highly decorative briefs'],
      visualWeight: 'medium',
      textCapacity: 'high',
      fieldPattern: 'primary name or headline, then role or supporting context',
      motionCharacter: 'controlled newsroom reveal; accent leads, text follows',
    },
    {
      variantId: 'lt02',
      name: 'Underline',
      description: 'Panel-free typography with a restrained accent underline and generous whitespace.',
      style: 'minimal',
      logo: false,
      intentKinds: ['person', 'story', 'event', 'organization'],
      bestFor: ['universities', 'interviews', 'corporate', 'clean editorial programmes'],
      avoidFor: ['high-energy sports', 'busy footage without a quiet text area'],
      visualWeight: 'light',
      textCapacity: 'high',
      fieldPattern: 'primary name or subject, then restrained descriptor',
      motionCharacter: 'precise line draw followed by a calm text reveal',
    },
    {
      variantId: 'lt05',
      name: 'Angle Slab',
      description: 'Forward-leaning condensed sport slab with bold hierarchy and fast controlled motion.',
      style: 'sport',
      logo: false,
      intentKinds: ['person', 'team', 'event', 'promotion'],
      bestFor: ['sports', 'esports', 'competitive events', 'high-energy segments'],
      avoidFor: ['long academic titles', 'solemn public information', 'quiet documentary work'],
      visualWeight: 'heavy',
      textCapacity: 'medium',
      fieldPattern: 'short primary identity, then team role or event context',
      motionCharacter: 'fast snap-stinger with a clean settle; never bouncy',
    },
    {
      variantId: 'lt15',
      name: 'Frost Strap',
      description: 'Translucent glass strap with a soft accent edge and calm name-over-role hierarchy.',
      style: 'glass',
      logo: false,
      intentKinds: ['person', 'event', 'organization'],
      bestFor: ['technology', 'streaming', 'creative interviews', 'modern events'],
      avoidFor: ['very bright flat backgrounds', 'hard-news urgency', 'dense supporting copy'],
      visualWeight: 'medium',
      textCapacity: 'medium',
      fieldPattern: 'person or subject name, then short role or descriptor',
      motionCharacter: 'soft resolved entrance with restrained depth; no excessive blur',
    },
    {
      variantId: 'lt25',
      name: 'Masthead',
      description: 'Editorial rule-led composition with a confident name and tracked supporting line.',
      style: 'editorial',
      logo: false,
      intentKinds: ['person', 'story', 'event', 'organization'],
      bestFor: ['public news', 'documentary', 'universities', 'culture and current affairs'],
      avoidFor: ['esports', 'game shows', 'sponsor-heavy promotional graphics'],
      visualWeight: 'light',
      textCapacity: 'high',
      fieldPattern: 'editorial subject or person, then role, source, or location',
      motionCharacter: 'rule draws first, then type enters in reading order',
    },
    {
      variantId: 'lt32',
      name: 'Scrim',
      description: 'Cinematic typography on a quiet gradient scrim that integrates with the shot.',
      style: 'cinematic',
      logo: false,
      intentKinds: ['person', 'story', 'event'],
      bestFor: ['documentary', 'arts', 'film', 'human-interest interviews'],
      avoidFor: ['score updates', 'dense data', 'high-energy calls to action'],
      visualWeight: 'light',
      textCapacity: 'high',
      fieldPattern: 'person or subject name, then quiet role or location',
      motionCharacter: 'slow confident fade and short travel; no overshoot',
    },
  ]),
] as const;

export const LITE_AI_CATEGORIES = ['lower-third'] as const;

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
const lineRoles: LiteLowerThirdLineRole[] = [
  'person-name', 'person-role', 'organization', 'team-name', 'story-headline',
  'event-name', 'location', 'social-handle', 'call-to-action', 'supporting-context',
];
const intentKinds: LiteLowerThirdIntentKind[] = [
  'person', 'story', 'event', 'team', 'organization', 'promotion',
];

const specSchema: Record<string, unknown> = {
  type: 'object',
  required: ['fit', 'reason', 'name', 'summary', 'category', 'variantId', 'intent', 'lines'],
  additionalProperties: false,
  properties: {
    fit: { type: 'string', enum: ['catalog'] },
    reason: { type: 'string', minLength: 1, maxLength: 240 },
    name: { type: 'string', minLength: 1, maxLength: 100 },
    summary: { type: 'string', minLength: 1, maxLength: 240 },
    category: { type: 'string', enum: categories },
    variantId: { type: 'string', enum: variantIds },
    intent: {
      type: 'object',
      required: ['kind', 'primaryRole'],
      additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: intentKinds },
        primaryRole: { type: 'string', enum: lineRoles },
        secondaryRole: { type: 'string', enum: lineRoles },
      },
    },
    lines: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        required: ['title', 'sample', 'role'],
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 80 },
          sample: { type: 'string', maxLength: 500 },
          role: { type: 'string', enum: lineRoles },
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
  { code: 'video-request', pattern: /\b(remotion|hyperframes|3d scene|cinematic sequence|video project)\b|\b(?:create|make|generate|render|produce|export)\b.{0,30}\bvideo\b/i, message: 'Lite creates editable broadcast graphics, not video projects.', suggestion: 'Ask for one lower third for a person, story, event, team, or organization.' },
  { code: 'external-data', pattern: /\b(fetch|api|live feed|database|websocket|real[- ]time data)\b/i, message: 'Lite cannot add external data or network dependencies.', suggestion: 'Ask for editable fields that an operator can update in NoaCG.' },
  { code: 'unsupported-category', pattern: /\b(title card|information card|info card|ticker|countdown|timer|scoreboard|score bug|statistics panel|stats panel|end credits|credits roll|quiz|poll)\b/i, message: 'The first NoaCG Lite release is focused on excellent lower thirds.', suggestion: 'Describe one lower third for a person, story, event, team, or organization.' },
];

export function obviousUnsupportedDecision(prompt: string): LiteDecision | null {
  const match = unsupportedPatterns.find((entry) => entry.pattern.test(prompt));
  return match
    ? { status: 'unsupported', code: match.code, message: match.message, suggestedBrief: match.suggestion }
    : null;
}

export function liteCatalogDigest(): string {
  return LITE_CATALOG.map((entry) =>
    [
      `${entry.variantId} ${entry.name}`,
      `style:${entry.style}`,
      `intents:${entry.intentKinds.join(',')}`,
      `best:${entry.bestFor.join(',')}`,
      `avoid:${entry.avoidFor.join(',')}`,
      `weight:${entry.visualWeight}`,
      `capacity:${entry.textCapacity}`,
      `fields:${entry.fieldPattern}`,
      `motion:${entry.motionCharacter}`,
      `logo:${entry.logo ? 'yes' : 'no'}`,
      entry.description,
    ].join('|'),
  ).join('\n');
}

function qualityPriorDigest(priors: readonly LiteVariantQualityPrior[]): string {
  if (!priors.length) return '';
  return [
    'Aggregate accepted/discarded outcomes are a subtle tie-breaker only after brief, intent, and chassis fit.',
    'Never force a popular chassis onto the wrong brief and never collapse stylistic diversity.',
    ...priors.slice(0, 24).map((prior) => {
      const total = prior.accepted + prior.discarded;
      return `${prior.intentKind}|${prior.variantId}|accepted:${prior.accepted}/${total}`;
    }),
  ].join('\n');
}

export function liteSystemPrompt(
  promptVersion: string,
  qualityPriors: readonly LiteVariantQualityPrior[] = [],
): string {
  return [
    `NoaCG Lite Design Director ${promptVersion}.`,
    'Return exactly one compact structured decision. Never write HTML, CSS, or JavaScript.',
    'This release creates lower thirds only. Choose one listed chassis. The platform compiles it deterministically into an editable broadcast graphic.',
    'Use status unsupported when the request is not one lower third, or needs custom code, advanced state machines, reference recreation, imports, video, external data, or another graphic category.',
    'For unsupported output, give a short plain-language explanation and one actionable simplified brief.',
    'For ready output, fit must be catalog and flourish must be the empty string. Use one or two realistic editable lines and identify the semantic role of each line.',
    'For a person lower third, the first line is the actual person name. Never substitute a faculty, employer, team, or programme for a requested person name. The second line is their role, organization, team, or location as requested.',
    'For story, event, team, organization, and promotion lower thirds, keep the primary identity on line one and only the most useful supporting context on line two.',
    'Line titles describe what an operator edits, such as Name, Role, Team, Headline, Event, or Location. Line samples are the actual on-air copy.',
    'Bespoke palette values need at least 4.5:1 primary-text contrast and 3:1 secondary-text contrast against the panel.',
    'Prioritize legibility, intentional hierarchy, generous spacing, realistic text capacity, correct lower-third conventions, and motion that follows reading order.',
    'A requested visual style should select and tune the nearest compatible chassis, not make the request unsupported.',
    'Catalog:',
    liteCatalogDigest(),
    qualityPriorDigest(qualityPriors),
  ].filter(Boolean).join('\n');
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

function requestedLineRoles(request: LiteGenerationRequest): Set<LiteLowerThirdLineRole> {
  const roles = new Set<LiteLowerThirdLineRole>();
  const labels = request.generationSpec?.fields.map((field) => field.label).join(' ') ?? '';
  const prompt = request.prompt;
  const fieldText = labels.toLowerCase();
  const personSubject = /\b(speaker|reporter|presenter|guest|host|anchor|person|player|athlete|coach)\b/i
    .test(prompt);
  const playerSubject = /\b(player|athlete|coach)\b/i.test(prompt);
  if (/\b(name|speaker|presenter|guest|host|reporter|anchor|player|athlete|coach)\b/.test(fieldText)) {
    roles.add('person-name');
  }
  if (/\b(role|title|position|job|occupation)\b/.test(fieldText)) roles.add('person-role');
  if (/\b(team|club|squad)\b/.test(fieldText)) roles.add('team-name');
  if (/\b(headline|story)\b/.test(fieldText)) roles.add('story-headline');
  if (/\b(event|session|lecture|programme|program)\b/.test(fieldText)) roles.add('event-name');
  if (/\b(location|city|venue)\b/.test(fieldText)) roles.add('location');
  if (/\b(organization|organisation|company|department|faculty|school|university)\b/.test(fieldText)) {
    roles.add('organization');
  }
  if (/\b(handle|username|social)\b/.test(fieldText)) roles.add('social-handle');

  if (personSubject && /\b(name|nickname)\b/i.test(prompt)) roles.add('person-name');
  if (personSubject && /\b(role|title|position|job|occupation)\b/i.test(prompt)) {
    roles.add('person-role');
  }
  if (playerSubject && /\bteam\b/i.test(prompt)) roles.add('team-name');
  if (/\b(?:editable\s+)?headline\b/i.test(prompt)) roles.add('story-headline');
  return roles;
}

function intentMatchesRoles(
  kind: LiteLowerThirdIntentKind,
  roles: readonly LiteLowerThirdLineRole[],
): boolean {
  if (roles.includes('person-name')) return kind === 'person';
  if (roles.includes('story-headline')) return kind === 'story';
  if (roles.includes('event-name')) return kind === 'event';
  if (roles.includes('team-name')) return kind === 'team' || kind === 'person';
  if (roles.includes('organization')) return kind === 'organization' || kind === 'person';
  if (roles.includes('call-to-action') || roles.includes('social-handle')) return kind === 'promotion';
  return true;
}

function relativeLuminance(hex: string): number | null {
  const match = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(hex);
  if (!match) return null;
  const value = match[1];
  const channels = [0, 2, 4].map((index) => {
    const channel = Number.parseInt(value.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number | null {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  if (a === null || b === null) return null;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
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
  const lines = Array.isArray(spec.lines) ? spec.lines : [];
  if (!entry) errors.push('variant_not_allowed');
  if (spec.fit !== 'catalog') errors.push('fit_not_catalog');
  if (entry && spec.category !== entry.category) errors.push('category_variant_mismatch');
  if (entry && aiCategory !== entry.aiCategory) errors.push('ai_category_variant_mismatch');
  if (lines.length < 1 || (entry && lines.length > Math.min(3, entry.maxLines))) {
    errors.push('line_count_invalid');
  }
  const intent = spec.intent;
  const emittedRoles = lines
    .map((line) => line?.role)
    .filter((role): role is LiteLowerThirdLineRole => lineRoles.includes(role as LiteLowerThirdLineRole));
  if (
    !intent
    || !intentKinds.includes(intent.kind)
    || !lineRoles.includes(intent.primaryRole)
    || (intent.secondaryRole !== undefined && !lineRoles.includes(intent.secondaryRole))
  ) {
    errors.push('lower_third_intent_invalid');
  } else {
    if (emittedRoles[0] !== intent.primaryRole) errors.push('primary_role_mismatch');
    if (lines.length > 1 && (!intent.secondaryRole || emittedRoles[1] !== intent.secondaryRole)) {
      errors.push('secondary_role_mismatch');
    }
    if (!intentMatchesRoles(intent.kind, emittedRoles)) errors.push('intent_role_mismatch');
    if (entry && !entry.intentKinds.includes(intent.kind)) errors.push('intent_variant_mismatch');
  }
  if (emittedRoles.length !== lines.length) errors.push('line_role_invalid');
  for (const requiredRole of requestedLineRoles(request)) {
    if (!emittedRoles.includes(requiredRole)) errors.push(`requested_role_missing:${requiredRole}`);
  }
  const extraCount = Array.isArray(spec.extraFields) ? spec.extraFields.length : 0;
  if (lines.length + extraCount > maxFields) errors.push('field_count_exceeded');
  if (extraCount > 0) errors.push('lower_third_extra_fields_forbidden');
  const flourish = (spec as { flourish?: unknown }).flourish;
  if (typeof flourish === 'string' && flourish.trim()) errors.push('flourish_forbidden');
  if (spec.useLogoSlot && !entry?.logo) errors.push('logo_not_supported');
  if (spec.palette) {
    const primaryContrast = contrastRatio(spec.palette.text, spec.palette.panel);
    const secondaryContrast = contrastRatio(spec.palette.textDim, spec.palette.panel);
    if (primaryContrast !== null && primaryContrast < 4.5) errors.push('primary_text_contrast_low');
    if (secondaryContrast !== null && secondaryContrast < 3) errors.push('secondary_text_contrast_low');
  }
  const requested = request.generationSpec?.category;
  if (requested && requested !== 'auto' && requested !== aiCategory) errors.push('requested_category_ignored');
  return errors.length ? { errors } : { decision: { status: 'ready', spec: { ...spec, flourish: null } }, errors: [] };
}
