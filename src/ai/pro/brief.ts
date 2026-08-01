// Maps the SHARED Create-with-AI brief (the prompt, the "More control" GenerationSpec, and
// the step's uploads) onto the v1 ProBrief - the one deterministic seam between the unified
// wizard workflow and the image-guided pipeline. Pro is a TIER of the same creation flow,
// not a second flow, so the user authors one brief and this file translates it; nothing
// here calls a model. Dependency-light like contract.ts.

import type { GenerationSpec } from '../../model/generationSpec';
import type { PurposedImage } from '../../model/imagePurpose';
import { PRO_LIMITS, type ProBrief } from './contract';

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
