// PHASE 0 SPIKE - one brief, one arm, one candidate (docs/NOACG_PRO_PLAN.md §0.1).
//
// BENCH-ONLY (see exemplars.ts for the deletion condition). The spike's one question is
// whether a strong open-weight checkpoint, given a good brief, a minimal NoaCG scaffold and
// a few excellent complete exemplars, shows enough broadcast-design judgement to justify
// building the specialist around it.
//
// WHAT IS REUSED, AND WHY EACH PIECE IS THE PRODUCTION ONE:
//   - `coderSystemPrompt(neutralSkeletonTemplate())` - the shipped custom-coder system
//     prompt around the NEUTRAL structural skeleton in its example slot. That is exactly the
//     seam the Creative pilot's de-anchored arm used, so no prompt is forked and the frozen
//     benchmark control (src/ai/AGENTS.md) is not touched. The engineering contracts are
//     taught by the skeleton; the DESIGN language is what the arms vary.
//   - `TEMPLATE_TOOL` - the same forced `emit_template` structured call the product makes.
//     A checkpoint that cannot serve it cannot author for NoaCG at all, which is a capability
//     answer worth having before the round rather than after (the qwen3.7-flash precedent,
//     docs/AI_ATTEMPTS.md).
//   - `convertEmittedRegion` + `toTemplate` - the same deterministic grounding the custom
//     path runs, so a spike result is an ordinary SpxTemplate and its editability is measured
//     the way the product measures it.
//   - `repairLoop` at its shipped MAX_REPAIR_ROUNDS = 2, blocking on deterministic findings
//     only, with the same editability demotion a fresh custom build gets: a region the
//     converter cannot read still plays and exports, and burning a scarce repair round on the
//     one finding models reliably fail would measure the harness, not the eye.
//   - `productionSpxValidator` - validateTemplate + benchTemplateRuntime + the safety screen.
//
// WHAT IS NOT HERE, deliberately (plan §0.1 is the scope fence): no BroadcastDesignPlan, no
// visual critic, no decomposed design units, no best-of-two, no new retrieval index, no
// second repair loop, no product wiring.

import {
  coderSystemPrompt,
  convertEmittedRegion,
  EDITABILITY_RULE,
  TEMPLATE_TOOL,
  toTemplate,
  type EmittedTemplate,
} from '../claudeProvider';
import { neutralSkeletonTemplate } from '../creative/neutralSkeleton';
import { callModelDetailed, type ContentBlock } from '../modelGateway';
import { outputBudget, type ModelRoute, type ModelUsage } from '../modelTypes';
import { findingsList, repairLoop } from '../shared/repairLoop';
import type { SpxValidator } from '../provider';
import type { ValidationResult } from '../../validation/validateTemplate';
import type { SpxTemplate } from '../../model/types';
import { exemplarBlock, exemplarsFor } from './exemplars';
import { grammarLesson } from './grammar';
import { brandBlock, fillBrandMark, type BrandFillReport, type SpikeBrand } from './brand';

/** The three arms. `exemplar` sees two or three complete designs; `none` sees the scaffold
 *  alone; `grammar` sees a few hundred tokens of region lesson instead of the designs
 *  (docs/NOACG_PRO_PLAN.md §14 item 3 - the ablation on whether the exemplar block's ~34,500
 *  tokens are buying a convertible timeline a sentence could have taught). The arms differ in
 *  ONE block of the user message and in nothing else. */
export type SpikeArm = 'exemplar' | 'none' | 'grammar';

/** One brief from the 12-brief bank (benchmarks/pro/v1/briefs.json). */
export interface SpikeBrief {
  brief: string;
  name: string;
  title: string;
  includeLogo?: boolean;
}

/** Decoding parameters, PINNED IN THE FIXTURE rather than defaulted here - a round whose
 *  sampling settings are implicit cannot be repeated (benchmarks/pro/v1/spike/decoding.json). */
export interface SpikeDecoding {
  temperature: number;
  seed: number;
  /** Expected answer size for `outputBudget` - a complete three-file template is large. */
  expectedOutputTokens: number;
}

export interface SpikeRunOptions {
  brief: SpikeBrief;
  arm: SpikeArm;
  route: ModelRoute;
  decoding: SpikeDecoding;
  validate: SpxValidator;
  /** The BRAND round's condition (docs/NOACG_PRO_PLAN.md §14 item 0): when present, the brief
   *  is conditioned on this brand in BOTH arms, the emitted design must declare a mark slot,
   *  and the ground step fills it with the brand's real mark before validation. */
  brand?: SpikeBrand;
  onProgress?: (message: string) => void;
}

export interface SpikeRunResult {
  template: SpxTemplate;
  emitted: EmittedTemplate;
  validation: ValidationResult;
  /** How many repair rounds actually fired (0, 1 or 2). */
  repairRounds: number;
  /** Which exemplars the arm was shown, and how retrieval chose them. Empty on `none`. */
  exemplarIds: string[];
  exemplarReason: string;
  /** What the deterministic mark fill did (brand rounds only): which slot the design declared,
   *  the bundled path, and whether the model broke the no-src contract. */
  fill?: BrandFillReport;
  costUsd: number;
  usage: { input: number; output: number };
  model: string;
}

/**
 * The brief as the model receives it. The FIELD CONTRACT is stated (this is a lower third
 * carrying these two live values) because the spike measures design judgement, not the
 * model's ability to guess how many fields a strap has - and the deterministic gate would
 * otherwise fail results for a reason that has nothing to do with the eye.
 */
export function spikeUserMessage(brief: SpikeBrief, armBlock: string, brand?: SpikeBrand): ContentBlock[] {
  // On a brand round the mark is always present and its contract is the brand block's; the
  // bare filelist line is the generic Phase 0 shape, kept for brand-less runs.
  const logoLine = brand
    ? '\n- The customer\'s brand mark, in the slot you declare (see "The brand mark\'s slot" below).'
    : brief.includeLogo
      ? '\n- A brand mark: one `filelist` image field, with a visible placeholder when empty.'
      : '';
  const brandSection = brand ? `${brandBlock(brand)}\n\n` : '';
  const judged = brand
    ? `The rendered graphic, on air, over real footage: hierarchy, proportion, spacing, the
composition as a whole, whether the motion serves the reading order - and whether the result
is unmistakably ${brand.name}'s graphic rather than anyone's. Answer the brief's own world -
a public-broadcast newsroom and a Saturday-night entertainment show are not the same design
problem with different colours.`
    : `The rendered graphic, on air, over real footage: hierarchy, proportion, spacing, the
composition as a whole, and whether the motion serves the reading order. Answer the brief's
own world - a public-broadcast newsroom and a Saturday-night entertainment show are not the
same design problem with different colours.`;
  const text = `Design and build a LOWER THIRD for this brief.

## The brief
${brief.brief}

## What it must carry
- The primary line (f0), sample value: "${brief.name}"
- The supporting line (f1), sample value: "${brief.title}"${logoLine}

Both lines are LIVE operator fields - the sample values above are what an operator types on
the day, so the composition has to hold text of roughly that length and a good deal longer
without breaking.

${brandSection}## What is being judged
${judged}

${armBlock}`;
  return [{ type: 'text', text }];
}

/** The system prompt both arms share: the shipped coder prompt around the NEUTRAL skeleton. */
export function spikeSystemPrompt(): string {
  return coderSystemPrompt(neutralSkeletonTemplate());
}

export async function runSpikeBrief(options: SpikeRunOptions): Promise<SpikeRunResult> {
  const { brief, arm, route, decoding, validate, brand } = options;
  const selection = arm === 'exemplar'
    ? exemplarsFor(brief.brief)
    : { variants: [], reason: `${arm} arm - no exemplars` };
  // The one block the arms vary. `grammar` and `none` both show no designs; what separates
  // them is whether the region lesson is present, which is the ablation's whole question.
  const armBlock = arm === 'exemplar' ? exemplarBlock(selection.variants)
    : arm === 'grammar' ? grammarLesson()
      : '';
  const userContent = spikeUserMessage(brief, armBlock, brand);
  const system = spikeSystemPrompt();

  const call = (messages: { role: 'user' | 'assistant'; content: ContentBlock[] | string }[]) =>
    callModelDetailed({
      system,
      messages,
      tool: TEMPLATE_TOOL,
      route,
      // The `spike` surface exists for one reason: it is the only way a browser harness can
      // ask the gateway for FORCED-FUNCTION tool use. Without it the call goes out as a
      // non-strict `json_schema` hint, which both pinned open-weight checkpoints ignore -
      // one wrapping its answer, the other inventing an SPX-definition-shaped object
      // (api/_lib/aiSurfacePolicy.ts, docs/AI_ATTEMPTS.md). Dropping this line does not
      // degrade the round, it ends it.
      surface: 'spike',
      cacheSystem: true,
      temperature: decoding.temperature,
      seed: decoding.seed,
      maxTokens: outputBudget(decoding.expectedOutputTokens),
    });

  options.onProgress?.(`${brief.name} · ${arm} · writing the code`);
  const first = await call([{ role: 'user', content: userContent }]);

  // Provider-reported where the gateway reports it, operator-priced otherwise; an
  // unreported cost counts as zero, which is the same honest limit the Pro ceiling carries.
  let costUsd = 0;
  const usage = { input: 0, output: 0 };
  const account = (u: ModelUsage | undefined) => {
    usage.input += u?.inputTokens ?? 0;
    usage.output += u?.outputTokens ?? 0;
    costUsd += u?.estimatedCost?.amount ?? 0;
  };
  account(first.usage);

  // The same deterministic grounding the custom path runs on every emit - plus, on a brand
  // round, the mark FILL, inside the ground step on purpose: every repair round then
  // re-validates a FILLED template (the as-is screen has a baked src to find), and the
  // template the gates measure is the template the human sees.
  let lastFill: BrandFillReport | undefined;
  const ground = (e: EmittedTemplate): SpxTemplate => {
    const converted = convertEmittedRegion(toTemplate(e));
    if (!brand) return converted;
    const filled = fillBrandMark(converted, brand);
    lastFill = filled.fill;
    return filled.template;
  };

  let repairRounds = 0;
  const { emitted, validation } = await repairLoop<
    { emitted: EmittedTemplate; template: SpxTemplate },
    ValidationResult
  >({
    emitted: {
      emitted: first.output as EmittedTemplate,
      template: ground(first.output as EmittedTemplate),
    },
    validate: async (current) => validate(current.template),
    // A FRESH build's unreadable region demotes to a warning, exactly as it does in the
    // product: the graphic still plays and exports, its timeline is read-only, and the
    // finding still rides along in any round a functional error triggers.
    blocking: (v) => v.errors.filter((e) => e.rule !== EDITABILITY_RULE),
    reEmit: async (findings, current, round) => {
      repairRounds = round;
      options.onProgress?.(`${brief.name} · ${arm} · repair round ${round}`);
      const repair = await call([
        { role: 'user', content: userContent },
        { role: 'assistant', content: 'I generated a template but it failed the platform\'s checks.' },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Your template failed these checks. Fix ALL of them and re-emit the complete template:
${findingsList(findings)}

=== index.html ===
${current.template.html}

=== template.css ===
${current.template.css}

=== template.js ===
${current.template.js}`,
            },
          ],
        },
      ]);
      account(repair.usage);
      const next = repair.output as EmittedTemplate;
      return { emitted: next, template: ground(next) };
    },
  });

  return {
    template: emitted.template,
    emitted: emitted.emitted,
    validation,
    repairRounds,
    exemplarIds: selection.variants.map((v) => v.id),
    exemplarReason: selection.reason,
    fill: lastFill,
    costUsd,
    usage,
    model: first.model,
  };
}
