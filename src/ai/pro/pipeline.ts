// The NoaCG Pro browser pipeline (docs/NOACG_PRO_PLAN.md): brief -> concept image ->
// interpretation -> deterministic reconstruction -> the injected production validator.
//
// Two model calls, both through the shared gateway with `surface: 'pro'` (the ai.pro
// entitlement gate + the pro-generate ledger row), each bounded by the gateway's own
// attempt budget - there is no hidden retry cascade here. Every run records to the local
// telemetry ring as kind 'pro-generate'. The UI owns nothing pipeline-shaped: it calls
// `generateProConcept` and `compileProConcept` and renders the states between them.

import { callModelDetailed } from '../modelGateway';
import type { ModelImage, ModelRoute } from '../modelTypes';
import type { PurposedImage } from '../../model/imagePurpose';
import { startAiRun } from '../telemetry';
import { downscaleForAnalysis } from '../importAnalysis/client';
import type { SpxValidator } from '../provider';
import type { Resolution } from '../../model/types';
import type { ValidationResult } from '../../validation/validateTemplate';
import { uuid } from '../../model/id';
import {
  PRO_INTERPRET_TOOL,
  PRO_INTERPRET_VERSION,
  proConceptPrompt,
  proInterpretContent,
  proInterpretSystemPrompt,
  type ProBrief,
  type ProInterpretationV1,
} from './contract';
import { normalizeProInterpretation } from './normalize';
import { compileProPlan, ProCompileError, type ProCompileResult } from './compile';
import { fillProLogoSlot } from './logoAsset';

export type ProStage = 'concept' | 'interpret' | 'compile' | 'validate';

/** The tier's curated routes, defined in the dependency-light contract so `api/` can read the
 *  same constant this pipeline obeys (see the note there). Re-exported unchanged: every
 *  existing `import { PRO_STANDARD_ROUTES } from './pipeline'` keeps working. */
export { PRO_STANDARD_ROUTES } from './contract';

/** A generated concept, ready to review: the image plus what it cost. */
export interface ProConcept {
  dataUrl: string;
  mediaType: string;
  width: number;
  height: number;
  model: string;
  costUsd: number | null;
}

export interface ProResult extends ProCompileResult {
  validation: ValidationResult | null;
  concept: ProConcept;
  /** The raw interpretation the compile was built from - what the benchmark saves as a
   *  fixture so regression runs replay it without paying for it again. */
  interpretation?: ProInterpretationV1;
  /**
   * What the interpretation call cost, provider-reported, beside `concept.costUsd`.
   *
   * It is RETURNED rather than left to be dug out of the telemetry ring afterwards. The bench
   * used to read it back off `startAiRun`'s stage records and matched on `stage.name` - a field
   * that does not exist (the record's key is `stage`), so the lookup yielded `null` on every
   * run and the `--max-cost` ceiling silently counted the image half only. A number the caller
   * needs belongs in the return value; a side channel that can go quietly undefined is not a
   * cost control.
   */
  interpretCostUsd: number | null;
}

function conceptDataUrl(image: ModelImage): string {
  return `data:${image.mediaType};base64,${image.base64}`;
}

function measure(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve({ width: el.naturalWidth, height: el.naturalHeight });
    el.onerror = () => reject(new Error('The generated concept could not be decoded.'));
    el.src = dataUrl;
  });
}

/** ONE image call on the explicitly chosen image route. The route is pinned whole (provider
 *  and model), so the session's text-model fallbacks can never answer an image request. */
export async function generateProConcept(brief: ProBrief, imageRoute: ModelRoute): Promise<ProConcept> {
  const run = startAiRun('pro-generate');
  const t0 = Date.now();
  try {
    const result = await callModelDetailed({
      system: 'You generate broadcast graphic design concepts as images.',
      messages: [{ role: 'user', content: proConceptPrompt(brief) }],
      expect: 'image',
      route: imageRoute,
      surface: 'pro',
    });
    const image = result.images?.[0];
    if (!image) throw new Error('The image model returned no image.');
    run.stage('concept', t0, result.model, result.usage);
    run.finish(true);
    const dataUrl = conceptDataUrl(image);
    const size = await measure(dataUrl);
    return {
      dataUrl,
      mediaType: image.mediaType,
      ...size,
      model: result.model,
      costUsd: result.usage.estimatedCost?.amount ?? null,
    };
  } catch (error) {
    run.finish(false);
    throw error;
  }
}

function isProInterpretation(value: unknown): value is ProInterpretationV1 {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.version === 1 && Array.isArray(record.regions) && typeof record.graphicType === 'string';
}

/**
 * Interpret + reconstruct + validate one concept. The interpretation call reads a
 * DOWNSCALED copy (nothing leaves the machine at full size - the import-analysis rule);
 * the compile crops the original. A caller passing `validate` gets the production gate's
 * verdict attached; the template is returned either way, never auto-discarded.
 */
export async function compileProConcept(
  brief: ProBrief,
  concept: ProConcept,
  options: {
    resolution?: Resolution;
    fps?: number;
    validate?: SpxValidator;
    onStage?: (stage: ProStage) => void;
    /** Pin the interpretation's route (the standard tier passes PRO_STANDARD_ROUTES.interpret);
     *  omitted falls through to the session route, the original BYO behaviour. */
    interpretRoute?: ModelRoute;
    /** The user's "use it as it is" upload, filled into the logo slot the compile placed.
     *  It rides the PIPELINE rather than being applied afterwards because the gate has to
     *  see the template the user actually gets: the as-is screen finds a protected picture
     *  by its `<img src>` (assetIntegrity.ts `targetsOf`), so a fill applied after
     *  validation would be screened by nothing at all. */
    logoMark?: PurposedImage | null;
  } = {},
): Promise<ProResult> {
  const run = startAiRun('pro-generate');
  try {
    options.onStage?.('interpret');
    let t0 = Date.now();
    const sent = await downscaleForAnalysis(concept.dataUrl);
    const result = await callModelDetailed({
      system: proInterpretSystemPrompt(PRO_INTERPRET_VERSION),
      messages: [{
        role: 'user',
        content: proInterpretContent(brief, { base64: sent.base64, mediaType: sent.mediaType }),
      }],
      tool: PRO_INTERPRET_TOOL,
      // REASONING TOKENS COUNT AGAINST THIS BUDGET, and they dominate it. Measured
      // 2026-08-08 on the pinned interpretation route: the model spends 2400-3900 output
      // tokens thinking before it writes a character of JSON, so a 4000 cap left roughly a
      // hundred tokens for a document that needs ~2200 - and a busier concept truncated
      // mid-object with finish_reason 'length'. That failure cost 5 of 12 briefs in a paid
      // round, each one throwing away a concept image that had already been paid for.
      // The cap is not a price control (only tokens actually produced are billed); it is
      // the ceiling a runaway answer hits, so it sits well clear of the observed maximum.
      maxTokens: 12000,
      ...(options.interpretRoute ? { route: options.interpretRoute } : {}),
      surface: 'pro',
    });
    // Read the cost BEFORE the shape check: an off-shape answer was still served and still
    // billed, so a throw from here has to carry the number out with it.
    const interpretCostUsd = result.usage.estimatedCost?.amount ?? null;
    if (!isProInterpretation(result.output)) {
      throw new ProCompileError('The design interpretation came back off-shape.', interpretCostUsd ?? undefined);
    }
    run.stage('interpret', t0, result.model, result.usage);

    options.onStage?.('compile');
    t0 = Date.now();
    // The interpretation read the downscaled copy; its bboxes are normalized, so the plan
    // is built against the ORIGINAL concept's pixel frame and the crop stays full quality.
    const plan = normalizeProInterpretation(result.output, { width: concept.width, height: concept.height }, uuid);
    const compiled = fillProLogoSlot(
      await compileProPlan(plan, concept, brief, {
        resolution: options.resolution,
        fps: options.fps,
      }),
      options.logoMark ?? null,
    );
    run.stage('compile', t0);

    let validation: ValidationResult | null = null;
    if (options.validate) {
      options.onStage?.('validate');
      t0 = Date.now();
      validation = await options.validate(compiled.template);
      run.stage('validate', t0);
    }
    run.finish(validation ? validation.ok : true, validation?.errors.map((finding) => finding.rule));
    return { ...compiled, validation, concept, interpretation: result.output, interpretCostUsd };
  } catch (error) {
    run.finish(false);
    throw error;
  }
}
