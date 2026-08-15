// RETIRED 2026-08-15 (docs/NOACG_PRO_PLAN.md §16, and the directory's own note in
// eslint.config.js). NO USER REACHES THIS. The product's Pro tier runs
// `src/ai/pro/language/pipeline.ts` - one text call for a design language, composed through the
// catalog's own assembler - and a build-time boundary refuses any import of this directory from
// anywhere a user can reach. What is left here is bench-only: `scripts/pro-bench.mjs` replays
// the checked-in fixture bank through it, which is the evidence for the §16 finding.
//
// The NoaCG Pro browser pipeline as it was: brief -> concept image -> interpretation ->
// deterministic reconstruction -> the injected production validator.
//
// Two model calls, both through the shared gateway with `surface: 'pro'` (the ai.pro
// entitlement gate + the pro-generate ledger row), each bounded by the gateway's own
// attempt budget - there is no hidden retry cascade here. Every run records to the local
// telemetry ring as kind 'pro-generate'.

import { callModelDetailed } from '../../modelGateway';
import { outputBudget, type ModelImage, type ModelRoute } from '../../modelTypes';
import type { PurposedImage } from '../../../model/imagePurpose';
import { startAiRun } from '../../telemetry';
import { downscaleForAnalysis } from '../../importAnalysis/client';
import type { SpxValidator } from '../../provider';
import type { Resolution } from '../../../model/types';
import type { ValidationResult } from '../../../validation/validateTemplate';
import { uuid } from '../../../model/id';
import {
  PRO_INTERPRET_TOOL,
  PRO_INTERPRET_VERSION,
  PRO_MAX_GENERATION_COST_USD,
  proConceptPrompt,
  proInterpretContent,
  proInterpretSystemPrompt,
  proSpendExceeds,
  type ProBrief,
  type ProInterpretationV1,
} from '../contract';
import { normalizeProInterpretation } from './normalize';
import type { ProSession } from '../session';
import { compileProPlan, ProCompileError, validateProCompile, type ProCompileResult } from './compile';
import { fillProLogoSlot } from './logoAsset';

export type ProStage = 'concept' | 'interpret' | 'compile' | 'validate';

/**
 * A generation stopped because it spent past `PRO_MAX_GENERATION_COST_USD`.
 *
 * It extends `ProCompileError` so it carries its cost out the same way every other paid
 * failure here does - the bench and the UI already add `error.costUsd` to the running total,
 * and a ceiling breach that reported nothing would be the one failure that under-counts spend.
 *
 * The ceiling is enforced in the BROWSER because Pro rides the general model surface rather
 * than a server task profile (there is no `pro-*` entry in api/_lib/aiTaskRegistry.ts). That
 * makes it a cost control, not a security boundary: it bounds what the product does with a
 * caller's own key, and the managed side stays protected by the fleet ceiling and the approved
 * catalog. A server-side booking of the Lite shape lands with the day Pro becomes a registered
 * task; until then this is the only thing standing between a route change and an open tap.
 */
export class ProCostCeilingError extends ProCompileError {
  readonly ceilingUsd: number;

  constructor(spentUsd: number, ceilingUsd: number) {
    super(
      `This Pro generation cost $${spentUsd.toFixed(4)}, past its $${ceilingUsd.toFixed(2)} ceiling, and was stopped.`,
      spentUsd,
    );
    this.name = 'ProCostCeilingError';
    this.ceilingUsd = ceilingUsd;
  }
}

/** The tier's curated routes, defined in the dependency-light contract so `api/` can read the
 *  same constant this pipeline obeys (see the note there). Re-exported unchanged: every
 *  existing `import { PRO_STANDARD_ROUTES } from './pipeline'` keeps working. */
export { PRO_STANDARD_ROUTES } from '../contract';

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
 *  and model), so the session's text-model fallbacks can never answer an image request.
 *
 *  `session` is the HOSTED reservation this call is paid for by, when there is one. Passing
 *  null is the bring-your-own-key and offline-stub path, unchanged from before hosted Pro
 *  existed: no reservation, no allowance, the caller's own key.
 *
 *  The per-generation ceiling (`PRO_MAX_GENERATION_COST_USD`) is enforced in
 *  `compileProConcept`, not here - see the note at the cost read below for why a breach must
 *  not cost the caller the image it already paid for. On the hosted path the server enforces
 *  the same ceiling against the same number, which is the half a browser cannot be trusted
 *  with; these two are deliberately the same constant. */
export async function generateProConcept(
  brief: ProBrief,
  imageRoute: ModelRoute,
  session: ProSession | null = null,
): Promise<ProConcept> {
  const run = startAiRun('pro-generate');
  const t0 = Date.now();
  try {
    const result = await callModelDetailed({
      system: 'You generate tightly framed broadcast graphic artwork as images, without scene mockups or backdrops.',
      messages: [{ role: 'user', content: proConceptPrompt(brief) }],
      expect: 'image',
      route: imageRoute,
      surface: 'pro',
      ...(session ? { proGenerationId: session.generationId } : {}),
    });
    const image = result.images?.[0];
    if (!image) throw new Error('The image model returned no image.');
    run.stage('concept', t0, result.model, result.usage);
    const costUsd = result.usage.estimatedCost?.amount ?? null;
    // A breach is NOT thrown here, deliberately. The image is already drawn and already billed,
    // so throwing could refund nothing and would destroy the expensive half of the run - the
    // 2026-08-08 mistake, where twelve paid concepts were lost to an early return. The concept
    // comes back with its cost attached and `compileProConcept` refuses BEFORE the second call,
    // which is the only spend a ceiling can still prevent. The picture stays inspectable, and a
    // route that has quietly re-priced is visible in the number rather than in a stack trace.
    run.finish(true);
    const dataUrl = conceptDataUrl(image);
    const size = await measure(dataUrl);
    return {
      dataUrl,
      mediaType: image.mediaType,
      ...size,
      model: result.model,
      costUsd,
    };
  } catch (error) {
    run.finish(false);
    throw error;
  }
}

function isProInterpretation(value: unknown): value is ProInterpretationV1 {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.version === 1
    && Array.isArray(record.regions)
    && typeof record.graphicType === 'string'
    && typeof record.canvasPlacement === 'object'
    && record.canvasPlacement !== null;
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
    /** The whole generation's ceiling, concept included. Defaults to
     *  `PRO_MAX_GENERATION_COST_USD`; the bench passes its own when probing a route. */
    maxCostUsd?: number;
    /** The hosted reservation paying for this generation, when there is one. Null is the
     *  bring-your-own-key and offline path (src/ai/pro/session.ts). */
    session?: ProSession | null;
  } = {},
): Promise<ProResult> {
  const ceiling = options.maxCostUsd ?? PRO_MAX_GENERATION_COST_USD;
  // Refuse BEFORE the interpretation call when the concept alone already spent the ceiling.
  // `generateProConcept` throws on that, so the case that reaches here is a concept from
  // somewhere else - a saved fixture, a retry against a re-priced route - and the whole point
  // of a ceiling is that the expensive call does not happen.
  if (proSpendExceeds({ conceptUsd: concept.costUsd }, ceiling)) {
    throw new ProCostCeilingError(concept.costUsd ?? 0, ceiling);
  }
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
      // The call this rule was measured on: a ~2,200-token interpretation that truncated
      // mid-object on a flat 4,000 budget, because the route spent 2,400-3,900 of it
      // thinking first. `outputBudget` (modelTypes.ts) owns the reasoning allowance; this
      // states only what the ANSWER needs.
      //
      // Raised 4,000 -> 7,000 on 2026-08-09: `portrait-logo` still hit the ceiling in the
      // full-bank round and threw away a concept that had already been paid for
      // (benchmarks/pro/round-2026-08-09/ROUND.md). A brief with many regions writes a much
      // longer document than the 2,200-token case this was sized against, and the failure
      // mode is not degradation - the whole interpretation is lost, along with $0.067 of
      // image. The ceiling is the wrong place to be frugal: an unused allowance costs
      // nothing, because billing is on tokens produced, not tokens permitted.
      maxTokens: outputBudget(7000),
      ...(options.interpretRoute ? { route: options.interpretRoute } : {}),
      surface: 'pro',
      ...(options.session ? { proGenerationId: options.session.generationId } : {}),
    });
    // Read the cost BEFORE the shape check: an off-shape answer was still served and still
    // billed, so a throw from here has to carry the number out with it.
    const interpretCostUsd = result.usage.estimatedCost?.amount ?? null;
    // Both calls are in now, so this is the real per-generation total the ceiling is about.
    // It runs BEFORE the shape check for the same reason that check reads the cost first: a
    // breach is a breach whether or not the answer was usable, and reporting the cheaper of
    // the two failures would understate what the run spent.
    if (proSpendExceeds({ conceptUsd: concept.costUsd, interpretUsd: interpretCostUsd }, ceiling)) {
      throw new ProCostCeilingError((concept.costUsd ?? 0) + (interpretCostUsd ?? 0), ceiling);
    }
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

    options.onStage?.('validate');
    t0 = Date.now();
    // The gate AND the compiler's own refusals, in one verdict (compile.ts
    // `validateProCompile`). It runs even with no injected validator, because a refused erase
    // is a finding this pipeline owns rather than one it was handed.
    const validation: ValidationResult | null = await validateProCompile(compiled, options.validate);
    run.stage('validate', t0);
    run.finish(validation ? validation.ok : true, validation?.errors.map((finding) => finding.rule));
    return { ...compiled, validation, concept, interpretation: result.output, interpretCostUsd };
  } catch (error) {
    run.finish(false);
    throw error;
  }
}
