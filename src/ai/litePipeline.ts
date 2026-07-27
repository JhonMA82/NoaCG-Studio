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
import { applySpecLocks, applySpecOutPreset } from './spec/specDesign';
import { demoteSpecFields, ensureSpecFonts } from './spec/specValidate';
import { withSafetyChecks } from './safety';
import type { GenerateContext, SpxValidator } from './provider';
import type { AiDiversity } from './telemetry';
import type { SpxTemplate } from '../model/types';
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
export function assembleGroundedTemplate(spec: DesignSpec, ctx?: GenerateContext): GroundedAssembly {
  const assembled = specToTemplate(spec, ctx);
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

export interface LiteCompileResult {
  spec: DesignSpec;
  template: SpxTemplate;
  validation: ValidationResult;
  diversity: AiDiversity;
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
): Promise<LiteCompileResult> {
  const spec = normalizeLiteSpec(raw, ctx.spec);
  const { template, diversity } = assembleGroundedTemplate(spec, ctx);
  const validation = demoteSpecFields(await productionSpxValidator()(template));
  return { spec, template, validation, diversity };
}
