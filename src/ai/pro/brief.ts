// Maps the SHARED Create-with-AI brief (the prompt, the "More control" GenerationSpec, and
// the step's uploads) onto the v1 ProBrief - the one deterministic seam between the unified
// wizard workflow and the image-guided pipeline. Pro is a TIER of the same creation flow,
// not a second flow, so the user authors one brief and this file translates it; nothing
// here calls a model. Dependency-light like contract.ts.

import type { GenerationSpec } from '../../model/generationSpec';
import type { PurposedImage } from '../../model/imagePurpose';
import type { LineSpec } from '../../model/wizard';
import { markShapeFromAspect, type LiteMarkDescriptor } from '../liteTypes';
import { PRO_LIMITS, type ProBrief } from './contract';
import type { LanguageBrief } from './language/prompt';

/** The graphic categories the v1 pipeline can compile (docs/NOACG_PRO_PLAN.md §11 - the
 *  contract carries `graphicType` so widening is an allowlist change, and this list is the
 *  UI's copy of that allowlist). */
export const PRO_SUPPORTED_CATEGORIES = ['lower-third'] as const;

/** 'auto' is supported: with no explicit pick, v1 designs the one type it can compile. */
export function proCategorySupported(spec: GenerationSpec | null): boolean {
  if (!spec) return true;
  return spec.category === 'auto'
    || (PRO_SUPPORTED_CATEGORIES as readonly string[]).includes(spec.category);
}

/**
 * Build the ProBrief the standard tier generates from. The mapping is honest about what v1
 * carries: the first two text fields become the name/title lines (their example values ride
 * into the concept so the design is judged with realistic content lengths), an as-is upload
 * or a requested image field asks for a logo slot, and the look decisions (style, mood,
 * avoid, exact brand colours) travel as concept direction text.
 */
export function standardProBrief(
  prompt: string,
  spec: GenerationSpec | null,
  uploads: PurposedImage[],
): ProBrief {
  const textFields = (spec?.fields ?? []).filter((f) => f.kind === 'text' || f.kind === 'lines');
  const line = (index: number, fallback: string): string => {
    const field = textFields[index];
    return field?.example?.trim() || field?.label?.trim() || fallback;
  };
  const brand = spec?.brandColors;
  const direction = [
    prompt.trim(),
    spec?.styleNotes?.trim() ? `Visual style: ${spec.styleNotes.trim()}` : '',
    spec?.mood?.trim() ? `Mood: ${spec.mood.trim()}` : '',
    spec?.avoidNotes?.trim() ? `Avoid: ${spec.avoidNotes.trim()}` : '',
    brand
      ? `Brand colours - accent ${brand.accent}, text ${brand.text}, panel ${brand.panel}. Use the accent exactly.`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, PRO_LIMITS.briefChars);
  return {
    brief: direction,
    name: line(0, 'Alexandra Riva'),
    title: line(1, 'Chief Correspondent'),
    includeLogo:
      uploads.some((u) => u.purpose === 'asset')
      || (spec?.fields ?? []).some((f) => f.kind === 'image'),
  };
}

// ── Phase A: the SAME wizard brief, mapped onto the design-language call ──────────────────────
//
// The functions below are the live mapping (docs/NOACG_PRO_PLAN.md §15, §16); `standardProBrief`
// above belongs to the retired concept-and-reconstruct engine. Both read the one brief the user
// authored, which is the whole reason this file exists: Pro is a TIER of the shared creation
// flow, so there is no second brief vocabulary anywhere.

/** The two lines a v1 Pro graphic carries, from the user's own field setup. Content, never
 *  design - the language decides how they read, the platform decides where they sit. */
export function proLines(spec: GenerationSpec | null): LineSpec[] {
  const textFields = (spec?.fields ?? []).filter((f) => f.kind === 'text' || f.kind === 'lines');
  const line = (index: number, fallbackTitle: string, fallbackSample: string): LineSpec => {
    const field = textFields[index];
    return {
      title: field?.label?.trim() || fallbackTitle,
      sample: field?.example?.trim() || fallbackSample,
    };
  };
  return [line(0, 'Name', 'Alexandra Riva'), line(1, 'Title', 'Chief Correspondent')];
}

/**
 * The customer's brand, rendered in the vocabulary the design-language call speaks.
 *
 * SHORT, and shorter than the bench's own `brandBlock` (src/ai/spike/brand.ts), because the two
 * are answering different questions. The bench arm asks a model to WRITE a template, so it has
 * to hand over an `@font-face` verbatim and explain the logo slot. Phase A's model writes no
 * code and places no mark: the platform owns both. What is left is the only thing a language
 * decision needs - the colours, the face, and what the mark's ink will have to survive.
 *
 * The mark is described in MEASURED, CONTENT-FREE facts (`LiteMarkDescriptor`, the same
 * descriptor Lite sends), so the pixels never enter a prompt and the two tiers describe a mark
 * one way. Telling the model about the ink is a nudge and is known not to bind - the §15.8 round
 * said "its ink is dark" and the model chose the brand's navy anyway - which is why the platform
 * also MEASURES it afterwards and gives the mark's column a field when it cannot read
 * (`markFieldFor`, compose.ts). The prompt is the cheap half; the composer is the half that holds.
 */
export function proBrandSection(
  spec: GenerationSpec | null,
  mark: LiteMarkDescriptor | null,
): string | null {
  const brand = spec?.brandColors ?? null;
  const primary = spec?.fonts?.primary;
  const face = primary?.customFont?.family?.trim() || primary?.fontId?.trim() || '';
  if (!brand && !face && !mark) return null;
  const lines: string[] = ['## The customer\'s brand'];
  if (brand) {
    lines.push(
      '',
      'These are their identity, not a tint over someone else\'s design - build the language\'s'
      + ' colour system from them:',
      `- Accent: ${brand.accent} - the one colour the channel is known by.`,
      `- Panel: ${brand.panel} - the surface their words sit on.`,
      `- Text: ${brand.text}, supporting text: ${brand.textDim}.`,
    );
  }
  if (face) lines.push('', `Their typeface is ${face}; pick the bundled face closest to it.`);
  if (mark) lines.push('', `Brand mark: ${proMarkFacts(mark)}`);
  return lines.join('\n');
}

/** The mark in words, on the same cuts Lite and the bench already use. */
export function proMarkFacts(mark: LiteMarkDescriptor): string {
  const backing = mark.backing === 'own-field'
    ? 'it brings its own background field, so it reads on any surface'
    : 'its backing is transparent, so its ink composites onto whatever surface you choose';
  const ink = mark.backing === 'own-field' || !mark.ink
    ? ''
    : mark.ink === 'light'
      ? ' Its ink is light (a knockout) - it needs a dark surface to read.'
      : ' Its ink is dark - it needs a light surface to read.';
  return `a ${mark.shape}; ${backing}.${ink}`;
}

/** Turn a measured probe into the descriptor above. Kept here beside its one reader so the
 *  ink cuts are not transcribed a third time. */
export function proMarkDescriptor(
  probe: { aspect: number; backing: 'own-field' | 'transparent'; inkLuminance: number },
): LiteMarkDescriptor {
  return {
    shape: markShapeFromAspect(probe.aspect),
    backing: probe.backing,
    ...(probe.backing === 'transparent'
      ? { ink: probe.inkLuminance >= 0.5 ? ('light' as const) : ('dark' as const) }
      : {}),
  };
}

/**
 * The brief the design-language call reads: the user's prompt plus their look decisions, with
 * the brand rendered separately because the prompt keeps the two apart.
 *
 * The brand COLOURS no longer ride the direction text (`standardProBrief` puts them there, in a
 * sentence saying "use the accent exactly"): the language schema has four real colour fields, so
 * a colour asked for in prose is a decision expressed where nothing can check it.
 */
export function standardProLanguageBrief(
  prompt: string,
  spec: GenerationSpec | null,
  mark: LiteMarkDescriptor | null,
): LanguageBrief {
  const direction = [
    prompt.trim(),
    spec?.styleNotes?.trim() ? `Visual style: ${spec.styleNotes.trim()}` : '',
    spec?.mood?.trim() ? `Mood: ${spec.mood.trim()}` : '',
    spec?.avoidNotes?.trim() ? `Avoid: ${spec.avoidNotes.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, PRO_LIMITS.briefChars);
  const brandSection = proBrandSection(spec, mark);
  return { brief: direction, ...(brandSection ? { brandSection } : {}) };
}
