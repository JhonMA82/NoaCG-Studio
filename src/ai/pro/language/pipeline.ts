// THE NoaCG Pro PIPELINE - what pressing Create actually runs (docs/NOACG_PRO_PLAN.md §15, §16).
//
// ONE model call, then deterministic work. The model decides the design LANGUAGE; the platform
// composes the graphic through the catalog's own assembler and scores it through one gate. There
// is no image anywhere in it and no second engine beside it.
//
// WHAT THIS REPLACED, and why replacing rather than adding was the requirement. Until 2026-08-15
// the product ran brief → concept IMAGE → interpretation → raster reconstruction: $0.0777 a
// generation, 86% of it a flat charge for a picture the compiler then failed to keep, and the
// first real hosted generation shipped a graphic printing its own words twice (§16). The panel
// the model had designed was GOOD; the platform's reconstruction of it was what wrecked the
// frame. Meanwhile the composer that scored 26 of 30 on the owner's blind read, at $0.0055 a
// graphic, was reachable only from a bench script. Two live engines is how the wrong one keeps
// shipping, so this file is the only route from the wizard to a Pro graphic.
//
// THERE IS NO BROWSER COST CEILING HERE, and that is a consequence of the shape rather than an
// omission. `PRO_MAX_GENERATION_COST_USD` guarded a two-call pipeline: it existed to stop the
// SECOND call after the first had already spent the budget. With one call there is nothing left
// to prevent - the money is spent by the time a browser could refuse it, and throwing then would
// destroy a finished graphic for no saving, which is exactly the 2026-08-08 mistake. The bound
// that still binds is the server's: `pro-generate` books and settles every call against the same
// constant (api/_lib/aiProProfile.ts), which is the half a browser was never trusted with.

import type { LineSpec, TemplateVariant } from '../../../model/wizard';
import type { AssetFile, Resolution, SpxTemplate } from '../../../model/types';
import type { ValidationResult } from '../../../validation/validateTemplate';
import type { ModelRoute } from '../../modelTypes';
import type { SpxValidator } from '../../provider';
import type { ProSession } from '../session';
import type { ComposeOptions } from './compose';
import type { DesignLanguage, LanguagePalette } from './contract';
import { validateProLanguage } from './gate';
import { generateDesignLanguage } from './generate';
import { composeGraphic, type ProGraphicId } from './graphics';
import type { LanguageBrief } from './prompt';

/** The busy line's states. Three, because there are three things happening. */
export type ProStage = 'design' | 'compose' | 'validate';

/** A brand mark to seat, with the content-free facts `probeMark` measured. The probe is the
 *  caller's to take: it needs a decoded image and this file is engine, not DOM. */
export interface ProMark {
  assetPath: string;
  images: AssetFile[];
  inkLuminance?: number;
  inkSpread?: number;
  backing?: 'transparent' | 'own-field';
}

export interface ProGenerateRequest {
  /** The brief as the model reads it - `pro/brief.ts` maps the wizard's own brief onto it. */
  language: LanguageBrief;
  /** The lines the graphic carries. Content, never design. */
  lines: LineSpec[];
  mark?: ProMark | null;
  resolution?: Resolution;
  fps?: number;
  /**
   * Which graphic of the package to compose. Default is the lower third, which is what the
   * wizard asks for today; the engine renders the same language as a sponsor bug or a countdown
   * (`PRO_GRAPHICS`, graphics.ts), and that is one argument away rather than a second pipeline.
   */
  graphic?: ProGraphicId;
  /**
   * The customer's OWN colours, when they stated any. Identity (accent, panel) is copied verbatim
   * by the platform and the model gets no vote on it - the rule Lite has carried since
   * 2026-08-13 and Pro did not (`proBrandPalette`, pro/brief.ts; `resolvePalette`, paint.ts).
   */
  brandPalette?: LanguagePalette | null;
}

export interface ProGenerateResult {
  template: SpxTemplate;
  /** The variant the graphic was created from - re-creatable with other lines or another zone,
   *  which is what makes a Pro result an ordinary catalog citizen rather than a one-off file. */
  variant: TemplateVariant;
  language: DesignLanguage;
  /** Which decisions the model did not answer legibly and fell back to the house's. */
  fallbacks: string[];
  /** What the platform decided FOR the language, in Lite's adjustment vocabulary. */
  adjustments: string[];
  /** The same divergences as prose, for the result card. */
  notes: string[];
  validation: ValidationResult | null;
  /** Provider-reported, for the whole generation - there is only one call. */
  costUsd: number;
  model: string;
}

/**
 * Design a language and render a graphic in it.
 *
 * `session` is the HOSTED reservation this generation is paid for, when there is one; null is
 * the offline and bring-your-own-key path, unchanged from the engine before it. The session is
 * opened by the caller and closed by the caller, because a reservation covers the GENERATION
 * rather than a call and this function does not own the user's outcome report.
 */
export async function generateProGraphic(
  request: ProGenerateRequest,
  route: ModelRoute,
  options: {
    session?: ProSession | null;
    validate?: SpxValidator;
    onStage?: (stage: ProStage) => void;
  } = {},
): Promise<ProGenerateResult> {
  options.onStage?.('design');
  const generated = await generateDesignLanguage(request.language, route, {
    ...(options.session ? { session: options.session } : {}),
  });

  options.onStage?.('compose');
  const composeOptions: ComposeOptions = {
    lines: request.lines,
    ...(request.resolution ? { resolution: request.resolution } : {}),
    ...(request.fps ? { fps: request.fps } : {}),
    ...(request.mark ? { logo: request.mark } : {}),
    ...(request.brandPalette ? { brandPalette: request.brandPalette } : {}),
  };
  // THE ONE COMPOSE SEAM for every graphic in the package (graphics.ts). A per-type branch here
  // is how a second engine starts: the whole argument of this file is that there is one route
  // from the wizard to a Pro graphic, and a package of three is still one route.
  const composed = composeGraphic(request.graphic ?? 'lower-third', generated.language, composeOptions);

  options.onStage?.('validate');
  // THE ONE SEAM (gate.ts). There is no repair loop and there must not be one: nothing the model
  // returns can make the code invalid, so a failing gate here is a PLATFORM bug worth surfacing
  // rather than something to spend a second call on - the grounded-assembly rule, src/ai/AGENTS.md.
  const validation = await validateProLanguage(composed, generated.fallbacks, options.validate);

  return {
    template: composed.template,
    variant: composed.variant,
    language: generated.language,
    fallbacks: generated.fallbacks,
    adjustments: composed.adjustments,
    notes: composed.notes,
    validation,
    costUsd: generated.costUsd,
    model: generated.model,
  };
}
