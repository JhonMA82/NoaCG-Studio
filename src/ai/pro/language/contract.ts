// THE DESIGN LANGUAGE - Pro Phase A's whole model surface (docs/NOACG_PRO_PLAN.md §15.5).
//
// WHY THIS EXISTS. Three paid rounds asked a model to COMPOSE a panel. Airable moved 6 → 7 of
// 12 while clean marks went 2/12 → 11/12 and contract failures went to zero, because every
// failure left over was a panel-layout decision: text on the design's own rule, text overflowing
// onto the picture, a composition stranding the words in a corner, furniture around the mark
// inflating the graphic. §15.3 ranks what has ever moved a rate - asking for judgement moved
// nothing, stating a boundary moved a lot, REMOVING THE DECISION moved most and stayed removed.
//
// So Phase A removes the decision. The platform owns each graphic type's structure and spacing;
// the model's entire contribution is the design LANGUAGE - palette, type scale and weight, shape
// and corner language, accent form and weight, density, motion character. That is `applyLogoSlot`
// and `fillBrandMark` generalised from the mark to the whole composition.
//
// THE SHAPE OF THIS FILE IS THE POINT: every field below is an ENUM, a bundled font id, or a
// hex colour. There is not one number the model can get wrong, because there is not one number
// the model is asked for. A geometry field here would be a panel decision wearing a different
// name, and the five failure classes would come back through it.
//
// Three rules this file is written under, all of them paid for:
//   1. A PROPERTY THE MODEL STILL EMITS MAY NOT SIMPLY BE DELETED. `additionalProperties: false`
//      turns a retired property into a refusal rather than a no-op - deleting Lite's dead `zone`
//      cost 29/30 → 26/30. Teach it away in the DESCRIPTION, measure the emission rate to zero,
//      then remove it (src/ai/AGENTS.md).
//   2. SHOWN-BUT-ILLEGAL IS THE DEFECT. Every enum below is what `normalize` accepts, and the
//      normalizer never invents a value the schema did not offer.
//   3. THE FONT LIST IS READ FROM THE REGISTRY, never transcribed. A hand-copied list is a
//      claim about the build that goes stale silently.

import { FONTS } from '../../../model/fonts';
import type { ModelTool } from '../../modelGateway';

/** Bumped when a normalized language stops meaning what it meant. Written into the record a
 *  round keeps, so a stored language is never read under the wrong rules. */
export const DESIGN_LANGUAGE_VERSION = 1;

export const PANEL_TREATMENTS = ['solid', 'translucent', 'blurred', 'none'] as const;
export const CORNERS = ['sharp', 'soft', 'round', 'pill'] as const;
export const ACCENT_FORMS = ['edge-bar', 'top-rule', 'underline', 'block', 'none'] as const;
export const ACCENT_WEIGHTS = ['hairline', 'medium', 'heavy'] as const;
export const TYPE_WEIGHTS = ['regular', 'medium', 'semibold', 'bold', 'black'] as const;
export const TYPE_STEPS = ['subtle', 'clear', 'strong'] as const;
export const TEXT_CASES = ['as-written', 'caps'] as const;
export const TRACKINGS = ['tight', 'normal', 'wide'] as const;
export const DENSITIES = ['compact', 'balanced', 'airy'] as const;
export const MOTION_CHARACTERS = ['snap', 'glide', 'reveal', 'fade'] as const;
export const MOTION_PACES = ['fast', 'measured', 'slow'] as const;

export type PanelTreatment = (typeof PANEL_TREATMENTS)[number];
export type Corner = (typeof CORNERS)[number];
export type AccentForm = (typeof ACCENT_FORMS)[number];
export type AccentWeight = (typeof ACCENT_WEIGHTS)[number];
export type TypeWeight = (typeof TYPE_WEIGHTS)[number];
export type TypeStep = (typeof TYPE_STEPS)[number];
export type TextCase = (typeof TEXT_CASES)[number];
export type Tracking = (typeof TRACKINGS)[number];
export type Density = (typeof DENSITIES)[number];
export type MotionCharacter = (typeof MOTION_CHARACTERS)[number];
export type MotionPace = (typeof MOTION_PACES)[number];

/** The four roles a broadcast package is actually built from. Same vocabulary as the wizard's
 *  `Palette` and Lite's brand request, so a brand's own colours drop straight in. */
export interface LanguagePalette {
  accent: string;
  panel: string;
  text: string;
  textDim: string;
}

export interface DesignLanguage {
  version: number;
  /** What the model calls this look. Shown to the user; never parsed. */
  name: string;
  /** Why this language answers the brief. Read by a human reviewing a round, never rendered. */
  rationale: string;
  palette: LanguagePalette;
  typography: {
    /** A bundled font id - the heading face; the supporting line follows it. */
    fontId: string;
    headingWeight: TypeWeight;
    supportingWeight: TypeWeight;
    /** How far the supporting line steps down from the heading. */
    step: TypeStep;
    headingCase: TextCase;
    supportingCase: TextCase;
    tracking: Tracking;
  };
  shape: { corner: Corner; panel: PanelTreatment };
  accent: { form: AccentForm; weight: AccentWeight };
  density: Density;
  motion: { character: MotionCharacter; pace: MotionPace };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The house language, and the fallback every unreadable field falls back TO. Deliberately the
 *  NoaCG package: a normalized language is always a graphic somebody would air. */
export const HOUSE_LANGUAGE: DesignLanguage = {
  version: DESIGN_LANGUAGE_VERSION,
  name: 'House',
  rationale: 'The NoaCG house package - the fallback a malformed answer degrades to.',
  palette: { accent: '#f6a623', panel: '#0a0c10', text: '#ffffff', textDim: '#aab2bd' },
  typography: {
    fontId: 'space-grotesk',
    headingWeight: 'bold',
    supportingWeight: 'medium',
    step: 'clear',
    headingCase: 'as-written',
    supportingCase: 'caps',
    tracking: 'normal',
  },
  shape: { corner: 'sharp', panel: 'blurred' },
  accent: { form: 'edge-bar', weight: 'medium' },
  density: 'balanced',
  motion: { character: 'reveal', pace: 'measured' },
};

/** Every bundled face, read from the registry so the enum cannot go stale against the build. */
export function bundledFontIds(): string[] {
  return FONTS.map((f) => f.id);
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T) : fallback;
}

function hex(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX.test(value.trim()) ? value.trim().toLowerCase() : fallback;
}

function text(value: unknown, fallback: string, max: number): string {
  const v = typeof value === 'string' ? value.trim() : '';
  return v ? v.slice(0, max) : fallback;
}

/**
 * Normalize whatever the model returned into a language the composer can render.
 *
 * IT NEVER FAILS AND IT NEVER INVENTS. Each field is either one of the values the schema
 * offered or the house value - which is why the composer downstream has no defensive branches
 * and no clamping of its own. A partial or malformed answer degrades to a house-shaped graphic
 * rather than to an error, because a round that returns nothing measures nothing.
 */
export function normalizeDesignLanguage(raw: unknown): DesignLanguage {
  const r = (raw ?? {}) as Record<string, unknown>;
  const palette = (r.palette ?? {}) as Record<string, unknown>;
  const typography = (r.typography ?? {}) as Record<string, unknown>;
  const shape = (r.shape ?? {}) as Record<string, unknown>;
  const accent = (r.accent ?? {}) as Record<string, unknown>;
  const motion = (r.motion ?? {}) as Record<string, unknown>;
  const house = HOUSE_LANGUAGE;
  return {
    version: DESIGN_LANGUAGE_VERSION,
    name: text(r.name, house.name, 60),
    rationale: text(r.rationale, house.rationale, 400),
    palette: {
      accent: hex(palette.accent, house.palette.accent),
      panel: hex(palette.panel, house.palette.panel),
      text: hex(palette.text, house.palette.text),
      textDim: hex(palette.textDim, house.palette.textDim),
    },
    typography: {
      fontId: pick(typography.fontId, bundledFontIds(), house.typography.fontId),
      headingWeight: pick(typography.headingWeight, TYPE_WEIGHTS, house.typography.headingWeight),
      supportingWeight: pick(typography.supportingWeight, TYPE_WEIGHTS, house.typography.supportingWeight),
      step: pick(typography.step, TYPE_STEPS, house.typography.step),
      headingCase: pick(typography.headingCase, TEXT_CASES, house.typography.headingCase),
      supportingCase: pick(typography.supportingCase, TEXT_CASES, house.typography.supportingCase),
      tracking: pick(typography.tracking, TRACKINGS, house.typography.tracking),
    },
    shape: {
      corner: pick(shape.corner, CORNERS, house.shape.corner),
      panel: pick(shape.panel, PANEL_TREATMENTS, house.shape.panel),
    },
    accent: {
      form: pick(accent.form, ACCENT_FORMS, house.accent.form),
      weight: pick(accent.weight, ACCENT_WEIGHTS, house.accent.weight),
    },
    density: pick(r.density, DENSITIES, house.density),
    motion: {
      character: pick(motion.character, MOTION_CHARACTERS, house.motion.character),
      pace: pick(motion.pace, MOTION_PACES, house.motion.pace),
    },
  };
}

/** Which fields the model did NOT answer legibly - the honest half of "it never fails".
 *  Recorded per generation so a round can see a language that was mostly the house's. */
export function languageFallbacks(raw: unknown, normalized: DesignLanguage): string[] {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  const check = (path: string, got: unknown, used: string) => {
    if (typeof got !== 'string' || got.trim().toLowerCase() !== used) out.push(`${path}→${used}`);
  };
  const palette = (r.palette ?? {}) as Record<string, unknown>;
  for (const role of ['accent', 'panel', 'text', 'textDim'] as const) {
    check(`palette.${role}`, palette[role], normalized.palette[role]);
  }
  const typography = (r.typography ?? {}) as Record<string, unknown>;
  for (const key of ['fontId', 'headingWeight', 'supportingWeight', 'step', 'headingCase', 'supportingCase', 'tracking'] as const) {
    check(`typography.${key}`, typography[key], normalized.typography[key]);
  }
  const shape = (r.shape ?? {}) as Record<string, unknown>;
  check('shape.corner', shape.corner, normalized.shape.corner);
  check('shape.panel', shape.panel, normalized.shape.panel);
  const accent = (r.accent ?? {}) as Record<string, unknown>;
  check('accent.form', accent.form, normalized.accent.form);
  check('accent.weight', accent.weight, normalized.accent.weight);
  check('density', r.density, normalized.density);
  const motion = (r.motion ?? {}) as Record<string, unknown>;
  check('motion.character', motion.character, normalized.motion.character);
  check('motion.pace', motion.pace, normalized.motion.pace);
  return out;
}

/**
 * The forced structured call. Every description is INSPECTION - what the value means for the
 * graphic on air - rather than a list of failures to avoid, because a prohibition suppresses
 * the behaviour it constrains (src/ai/AGENTS.md).
 */
export const DESIGN_LANGUAGE_TOOL: ModelTool = {
  name: 'emit_design_language',
  description:
    'Decide the on-air DESIGN LANGUAGE for this channel: the palette, typographic voice, shape '
    + 'and accent language, density and motion character that every one of its graphics will be '
    + 'built in. You are not composing a single graphic - the platform lays each graphic type '
    + 'out. You are deciding what they all LOOK like.',
  input_schema: {
    type: 'object',
    required: ['name', 'rationale', 'palette', 'typography', 'shape', 'accent', 'density', 'motion'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', description: 'A short name for this look, e.g. "Harbour Nightly".' },
      rationale: {
        type: 'string',
        description: 'One or two sentences on why this language answers the brief\'s own world. '
          + 'A public-broadcast newsroom and a Saturday-night entertainment show are not the same '
          + 'design problem with different colours.',
      },
      palette: {
        type: 'object',
        required: ['accent', 'panel', 'text', 'textDim'],
        additionalProperties: false,
        properties: {
          accent: { type: 'string', description: 'The one colour the channel is known by, as #rrggbb.' },
          panel: { type: 'string', description: 'The surface the words sit on, as #rrggbb.' },
          text: { type: 'string', description: 'The primary text colour, as #rrggbb. It must read on the panel.' },
          textDim: { type: 'string', description: 'The supporting text colour, as #rrggbb - present but subordinate.' },
        },
      },
      typography: {
        type: 'object',
        required: ['fontId', 'headingWeight', 'supportingWeight', 'step', 'headingCase', 'supportingCase', 'tracking'],
        additionalProperties: false,
        properties: {
          fontId: {
            type: 'string',
            description: 'The typeface, from the bundled set.',
            enum: bundledFontIds(),
          },
          headingWeight: { type: 'string', enum: [...TYPE_WEIGHTS], description: 'The weight of the primary line.' },
          supportingWeight: { type: 'string', enum: [...TYPE_WEIGHTS], description: 'The weight of the supporting line.' },
          step: {
            type: 'string',
            enum: [...TYPE_STEPS],
            description: 'How far the supporting line steps down from the heading: subtle keeps them near '
              + 'peers, clear is the ordinary broadcast hierarchy, strong makes the supporting line a label.',
          },
          headingCase: { type: 'string', enum: [...TEXT_CASES], description: 'Case of the primary line.' },
          supportingCase: { type: 'string', enum: [...TEXT_CASES], description: 'Case of the supporting line.' },
          tracking: { type: 'string', enum: [...TRACKINGS], description: 'Letter-spacing character across the package.' },
        },
      },
      shape: {
        type: 'object',
        required: ['corner', 'panel'],
        additionalProperties: false,
        properties: {
          corner: { type: 'string', enum: [...CORNERS], description: 'The corner language of every surface.' },
          panel: {
            type: 'string',
            enum: [...PANEL_TREATMENTS],
            description: 'How the surface behind the words behaves: solid, translucent, blurred, '
              + 'or none at all for a super that sits directly on the picture.',
          },
        },
      },
      accent: {
        type: 'object',
        required: ['form', 'weight'],
        additionalProperties: false,
        properties: {
          form: {
            type: 'string',
            enum: [...ACCENT_FORMS],
            description: 'Where the accent colour becomes a shape: a bar fused to the leading edge, '
              + 'a rule across the top, an underline beneath the words, a solid block behind the '
              + 'supporting line, or nothing.',
          },
          weight: { type: 'string', enum: [...ACCENT_WEIGHTS], description: 'How heavy that shape is.' },
        },
      },
      density: {
        type: 'string',
        enum: [...DENSITIES],
        description: 'How much air the package carries. The platform turns this into real padding '
          + 'and gaps against the type size; you are choosing the character, not the pixels.',
      },
      motion: {
        type: 'object',
        required: ['character', 'pace'],
        additionalProperties: false,
        properties: {
          character: {
            type: 'string',
            enum: [...MOTION_CHARACTERS],
            description: 'How the graphic arrives, and whether that arrival serves the reading order.',
          },
          pace: { type: 'string', enum: [...MOTION_PACES], description: 'How quickly it resolves.' },
        },
      },
    },
  },
};
