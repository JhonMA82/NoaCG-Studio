// THE ITERATE ARM - the free-form coder given what every one-shot arm was denied: the
// rendered frame and the instruments' findings, fed back until the graphic is clean or the
// round budget is spent (docs/NOACG_PRO_PLAN.md §20.1 - the custom-lane experiment).
//
// BENCH-ONLY (see exemplars.ts for the deletion condition).
//
// WHY THIS EXISTS. The four-checkpoint one-shot round retired "the model composes an original
// panel in one blind call" - and produced the reason to test THIS instead: the deterministic
// instruments flagged the owner's dominant complaint (a rule drawn over the text) on almost
// exactly the failing cells BEFORE the read. The feedback we can loop back is measured to be
// the right feedback; what was never given to the model is a second look. This arm is the
// smallest honest version of "render, look, fix": same prompt, same tool, same grounding as
// the `none` arm, plus one findings-and-screenshot message per round.
//
// WHAT IS DELIBERATELY THE SAME AS run.ts: coderSystemPrompt over the neutral skeleton,
// TEMPLATE_TOOL, convertEmittedRegion + toTemplate grounding, the brand mark fill inside the
// ground step, pinned decoding. The arms differ in the conversation's TAIL and in nothing
// else, so an iterate result is comparable cell-for-cell with the one-shot rounds.
//
// WHAT IS DIFFERENT: there is NO internal repair loop. The RUNNER owns the loop - a validator
// error, an instrument finding and a mark-gate finding are all just findings, fed back through
// the same message shape, because to the model they are the same thing: something wrong with
// the frame it now gets to see.

import {
  convertEmittedRegion,
  TEMPLATE_TOOL,
  toTemplate,
  type EmittedTemplate,
} from '../claudeProvider';
import { callModelDetailed, type ContentBlock } from '../modelGateway';
import { outputBudget, type ModelRoute, type ModelUsage } from '../modelTypes';
import type { SpxValidator } from '../provider';
import type { ValidationResult } from '../../validation/validateTemplate';
import type { SpxTemplate } from '../../model/types';
import { fillBrandMark, type BrandFillReport, type SpikeBrand } from './brand';
import { spikeSystemPrompt, spikeUserMessage, type SpikeBrief, type SpikeDecoding } from './run';
import {
  designRulesPromptBlock,
  type LegibilityMode,
  type ViewingTarget,
} from '../../model/designRules';

export interface IterateScreenshot {
  mediaType: string;
  base64: string;
}

export interface IterateEmitOptions {
  brief: SpikeBrief;
  route: ModelRoute;
  decoding: SpikeDecoding;
  validate: SpxValidator;
  brand?: SpikeBrand;
  /** The canonical design rules, rendered into the USER message (never the frozen system
   *  prompt - the benchmark control stays a control). Generated from
   *  `src/model/designRules.ts` so the prompt and the instruments cannot drift. */
  rules?: {
    target: ViewingTarget;
    mode: LegibilityMode;
    format?: { width: number; height: number };
  };
  /** Absent on the first round. Present = an iteration: the previous emit's three files, the
   *  findings the render produced, and - where the route can see - the rendered frame. */
  previous?: {
    template: SpxTemplate;
    findings: string[];
    screenshot?: IterateScreenshot;
  };
}

export interface IterateEmitResult {
  template: SpxTemplate;
  emitted: EmittedTemplate;
  validation: ValidationResult;
  fill?: BrandFillReport;
  usage: { input: number; output: number; reasoning: number };
  costUsd: number;
  model: string;
}

/** The iteration message: what was measured, then the files, then the frame. The findings
 *  come FIRST because they are the contract - the screenshot is evidence, not the brief. */
export function iterationMessage(
  findings: string[], template: SpxTemplate, screenshot?: IterateScreenshot,
): ContentBlock[] {
  const text = `Your template rendered with these problems. The graphic is NOT deliverable
until every one of them is fixed - fix ALL of them and re-emit the complete template
(all three files, complete):
${findings.map((f) => `- ${f}`).join('\n')}
${screenshot ? '\nThe attached image is YOUR template, rendered at 1920x1080 with the sample\nvalues - look at it. Every finding above is visible in it.\n' : ''}
=== index.html ===
${template.html}

=== template.css ===
${template.css}

=== template.js ===
${template.js}`;
  const blocks: ContentBlock[] = [{ type: 'text', text }];
  if (screenshot) {
    blocks.push({
      type: 'image',
      source: { type: 'base64', media_type: screenshot.mediaType, data: screenshot.base64 },
    });
  }
  return blocks;
}

export async function iterateEmit(options: IterateEmitOptions): Promise<IterateEmitResult> {
  const { brief, route, decoding, validate, brand, previous, rules } = options;
  const userContent = spikeUserMessage(brief, '', brand);
  if (rules) {
    const format = rules.format ?? { width: 1920, height: 1080 };
    userContent.push({ type: 'text', text: designRulesPromptBlock(rules.target, rules.mode, format) });
  }

  const messages: { role: 'user' | 'assistant'; content: ContentBlock[] | string }[] = [
    { role: 'user', content: userContent },
  ];
  if (previous) {
    messages.push(
      { role: 'assistant', content: 'I generated a template; here is what its render measured.' },
      { role: 'user', content: iterationMessage(previous.findings, previous.template, previous.screenshot) },
    );
  }

  const result = await callModelDetailed({
    system: spikeSystemPrompt(),
    messages,
    tool: TEMPLATE_TOOL,
    route,
    // Same forced-function surface as the one-shot arm, and for the same reason: without it
    // the call degrades to a non-strict hint the checkpoints ignore (run.ts says why).
    surface: 'spike',
    cacheSystem: true,
    temperature: decoding.temperature,
    seed: decoding.seed,
    maxTokens: outputBudget(decoding.expectedOutputTokens),
  });

  const usage = { input: 0, output: 0, reasoning: 0 };
  let costUsd = 0;
  const account = (u: ModelUsage | undefined) => {
    usage.input += u?.inputTokens ?? 0;
    usage.output += u?.outputTokens ?? 0;
    usage.reasoning += u?.reasoningTokens ?? 0;
    costUsd += u?.estimatedCost?.amount ?? 0;
  };
  account(result.usage);

  const emitted = result.output as EmittedTemplate;
  let fill: BrandFillReport | undefined;
  const converted = convertEmittedRegion(toTemplate(emitted));
  let template = converted;
  // includeLogo: false = the owner's no-model-placed-logos ruling (§22.1): the brand
  // conditions the design and NO mark is filled - there is no slot to fill.
  if (brand && brief.includeLogo !== false) {
    const filled = fillBrandMark(converted, brand);
    fill = filled.fill;
    template = filled.template;
  }
  const validation = await validate(template);

  return { template, emitted, validation, fill, usage, costUsd, model: result.model };
}
