// The ONE grounded compile pipeline, shared by production and the Lite benchmark.
//
// NoaCG Lite's model call happens server-side (/api/ai/lite/generations); everything after
// the returned DesignSpec is deterministic browser code. Production (claudeProvider's
// grounded path) and the evaluation runners (scripts/ai-lite-*.mjs, loaded through the dev
// server) must compile a spec through the IDENTICAL sequence, or benchmark results stop
// describing the product. That is why the sequence lives here once and both sides import it:
// a benchmark-only compile path is the drift this module exists to make impossible.
// scripts/ai-lite-bench.test.mjs pins that claudeProvider has no second copy.

import { specToTemplate, type DesignSpec } from './designSpec';
import { applyDesignAdjustments } from './designAdjust';
import { applyPolish } from './polish';
import { applySpecLocks, applySpecOutPreset } from './spec/specDesign';
import { demoteSpecFields, ensureSpecFonts } from './spec/specValidate';
import { withSafetyChecks } from './safety';
import { liteSkinPatchErrors, sanitizeLiteSkinPatch } from './liteContract';
import type { LiteSkinPatch } from './liteTypes';
import type { GenerateContext, SpxValidator } from './provider';
import type { AiDiversity } from './telemetry';
import type { SpxTemplate } from '../model/types';
import type { TemplateVariant } from '../model/wizard';
import { ltc01 } from '../templates/lowerThirds/skinCanvas';
import type { ValidationResult } from '../validation/validateTemplate';
import { validateTemplate } from '../validation/validateTemplate';
import { benchTemplateRuntime, mergeResults } from '../validation/runtimeBench';

export interface GroundedAssembly {
  template: SpxTemplate;
  /** What was actually used after clamping — telemetry's diversity record. */
  diversity: AiDiversity;
}

/**
 * Spec → template, exactly as production assembles it: real catalog assemblers, then the
 * spec's compositional parameters as deterministic overrides, then the user's own decisions
 * (uploaded fonts grounded as embedded assets, an explicit exit preset as real keyframes).
 */
export function assembleGroundedTemplate(
  spec: DesignSpec,
  ctx?: GenerateContext,
  /** Assemble THIS chassis instead of the spec's catalog pick (the skin canvas). */
  variantOverride?: TemplateVariant,
): GroundedAssembly {
  const assembled = specToTemplate(spec, ctx, variantOverride);
  const template = applySpecOutPreset(
    ensureSpecFonts(applyDesignAdjustments(assembled.template, spec), ctx?.spec),
    ctx?.spec,
  );
  return { template, diversity: assembled.diversity };
}

/**
 * The validator the app injects for AI results (AiStep): static validation + the live
 * runtime bench, wrapped in the safety screen. Benchmark runs wire this same composition,
 * so "machine-valid" means the same thing in a report as it does in the product.
 */
export function productionSpxValidator(source?: SpxTemplate | null): SpxValidator {
  const base: SpxValidator = async (t) => mergeResults(validateTemplate(t), await benchTemplateRuntime(t));
  return withSafetyChecks(base, source ?? null);
}

/**
 * A Lite decision's server-validated spec, normalized the way liteGroundedResult does it
 * before assembly: catalog fit and no flourish are re-pinned (defense in depth over the
 * server's own semantic validation) and the user's structured setup wins via applySpecLocks.
 */
export function normalizeLiteSpec(raw: DesignSpec, userSpec?: GenerateContext['spec']): DesignSpec {
  return applySpecLocks(
    {
      ...raw,
      fit: 'catalog',
      flourish: null,
      lines: Array.isArray(raw.lines) ? raw.lines : [],
    } as DesignSpec,
    userSpec,
  );
}

// ── The skin path (skeleton + skin, revert on any failure) ───────────────────

/** The block heading the skin's override CSS lands under (the polish gate writes it). */
export const LITE_SKIN_MARKER =
  '/* ── NoaCG Lite skin (AI-authored look — same contracts as the design CSS above) ── */';

export interface LiteSkinnedAssembly {
  template: SpxTemplate;
  validation: ValidationResult;
  diversity: AiDiversity;
}

/** Why a skin did not land — the eval's denominator for "how often do skins survive". */
export type LiteSkinRejection = 'patch' | 'gate' | 'validation';

export interface LiteSkinAttempt {
  assembly: LiteSkinnedAssembly | null;
  rejection?: LiteSkinRejection;
  /** The failing validation's rule codes when rejection === 'validation'. */
  rejectionRules?: string[];
}

/**
 * Try the skeleton-plus-skin assembly: compile the neutral Skin Canvas chassis through the
 * ordinary grounded sequence, apply the skin through the polish gate, validate. Any wall
 * tripping — an illegal patch, a gate rejection, or a failing validation — returns a null
 * assembly WITH the stage that refused it, and the caller REVERTS to the spec's own house
 * chassis. A skin can decline to land, but it can never make a Lite result worse.
 */
export async function attemptLiteSkinDetailed(
  spec: DesignSpec,
  skin: LiteSkinPatch,
  ctx: GenerateContext | undefined,
  validate: SpxValidator,
): Promise<LiteSkinAttempt> {
  // Sanitize again before the gate: the server already did, but this path also serves
  // benchmark runners and any future caller, and the strip is idempotent.
  const { patch } = sanitizeLiteSkinPatch(skin);
  if (!String(patch.css ?? '').trim() || liteSkinPatchErrors(patch).length) {
    return { assembly: null, rejection: 'patch' };
  }
  const { template, diversity } = assembleGroundedTemplate(spec, ctx, ltc01);
  const skinned = applyPolish(template, patch, LITE_SKIN_MARKER);
  if (!skinned) return { assembly: null, rejection: 'gate' };
  const validation = demoteSpecFields(await validate(skinned));
  return validation.ok
    ? { assembly: { template: skinned, validation, diversity } }
    : { assembly: null, rejection: 'validation', rejectionRules: validation.errors.map((e) => e.rule) };
}

/** The assembly-or-null shape the provider consumes (revert stays silent in production). */
export async function attemptLiteSkin(
  spec: DesignSpec,
  skin: LiteSkinPatch,
  ctx: GenerateContext | undefined,
  validate: SpxValidator,
): Promise<LiteSkinnedAssembly | null> {
  return (await attemptLiteSkinDetailed(spec, skin, ctx, validate)).assembly;
}

export interface LiteCompileResult {
  spec: DesignSpec;
  template: SpxTemplate;
  validation: ValidationResult;
  diversity: AiDiversity;
  /** True when the result is the skinned canvas; false = the spec's house chassis. */
  skinApplied: boolean;
  /** What happened to the skin: applied, no skin on the decision, or the revert's stage. */
  skinOutcome: 'applied' | 'none' | `rejected-${LiteSkinRejection}`;
  /** The failing validation's rule codes when skinOutcome === 'rejected-validation'. */
  skinRejectionRules?: string[];
}

/**
 * The full deterministic half of a Lite generation: normalize, assemble, validate. This is
 * what the calibration, regression, and evaluation runners call — one function, the same
 * one production is built from. No repair loop by design: a grounded assembly failing its
 * own bench is a platform bug worth surfacing (src/ai/AGENTS.md).
 */
export async function compileLiteDecision(
  raw: DesignSpec,
  ctx: GenerateContext,
  /** A skin riding the decision: tried first, reverting to the house chassis on failure. */
  skin?: LiteSkinPatch,
): Promise<LiteCompileResult> {
  const spec = normalizeLiteSpec(raw, ctx.spec);
  let skinOutcome: LiteCompileResult['skinOutcome'] = 'none';
  let skinRejectionRules: string[] | undefined;
  if (skin) {
    const attempt = await attemptLiteSkinDetailed(spec, skin, ctx, productionSpxValidator());
    if (attempt.assembly) return { spec, ...attempt.assembly, skinApplied: true, skinOutcome: 'applied' };
    skinOutcome = `rejected-${attempt.rejection ?? 'patch'}`;
    skinRejectionRules = attempt.rejectionRules;
  }
  const { template, diversity } = assembleGroundedTemplate(spec, ctx);
  const validation = demoteSpecFields(await productionSpxValidator()(template));
  return {
    spec, template, validation, diversity,
    skinApplied: false, skinOutcome,
    ...(skinRejectionRules ? { skinRejectionRules } : {}),
  };
}
