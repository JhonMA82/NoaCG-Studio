// THE CUSTOM LANE's engine - the iterate protocol as PRODUCT code
// (docs/NOACG_PRO_PLAN.md §21.2 follow-on, §22-§23: the owner-directed custom lane).
//
// WHAT WAS MEASURED, AND WHERE. The one-shot free-form coder is retired (~30% airable across
// four checkpoints, §21.1); what survived its read is this protocol - the same coder given the
// instruments' findings and, where the route can see, the rendered frame, fed back until the
// graphic is clean or the round budget is spent. The seven §22.1 gate leaks are closed and the
// 2026-08-19 re-read cleared 21/21 with zero deliver-signal leak (§23.1). One clean round
// justifies PRODUCTIZING FOR VALIDATION - never a ship: whether this lane reaches customers is
// decided by the P4 confirmation round and the owner's read of it, which is why the whole lane
// sits behind a server flag that defaults OFF (`AI_PRO_CUSTOM_ENABLED`, api/_lib/aiProProfile.ts).
//
// FAIL-CLOSED IS THE CONTRACT. A run that still carries blocking findings when the budget is
// spent returns `status: 'refused'` WITH its findings - it never dresses the last emit up as a
// success, because the deliver-signal leak (§22: the owner aired 12 of 24 "delivered-clean")
// is the defect class this lane's whole design answers. The refusal is a first-class result
// the UI renders honestly ("checked, and not ready"), never an exception.
//
// THE PROMPT IS THE MEASURED ONE. `coderSystemPrompt(neutralSkeletonTemplate())` is exactly
// what every iterate round ran (spike/run.ts `spikeSystemPrompt` composes the same pair), so
// the product engine reproduces the thing the evidence is about. The skeleton moved HERE from
// the retired `creative/` so the product never imports retired code.
//
// THE SCREENSHOT IS AN INJECTED SEAM. The measured winner on wide types is the VISION-fed loop
// (findings-only died there: 3/21, §22.1), and a browser cannot screenshot its own iframe -
// so `capture` is an option the caller supplies. The bench's Playwright runner passes a real
// one; the product passes none today and the loop runs findings-only, which the §21.2 read
// measured as equal on the lower-third types the product would start with. Whether
// findings-only is enough for what the product OFFERS is a P4 confirmation-round question,
// not something this file assumes.

import {
  coderSystemPrompt,
  convertEmittedRegion,
  TEMPLATE_TOOL,
  toTemplate,
  type EmittedTemplate,
} from '../../claudeProvider';
import { callModelDetailed, type ContentBlock } from '../../modelGateway';
import { outputBudget, type AiGatewaySurface, type ModelRoute } from '../../modelTypes';
import type { SpxValidator } from '../../provider';
import type { ValidationResult } from '../../../validation/validateTemplate';
import type { SpxTemplate } from '../../../model/types';
import type { ProSession } from '../session';
import {
  designRulesPromptBlock,
  type LegibilityMode,
  type ViewingTarget,
} from '../../../model/designRules';
import { neutralSkeletonTemplate } from './neutralSkeleton';

export interface CustomScreenshot {
  mediaType: string;
  base64: string;
}

export interface ProCustomBrief {
  /** The user's prose. Free-form by design - this lane exists for what the package types
   *  cannot express. */
  brief: string;
  /** The operator fields the graphic must carry, in order (f0..). Sample values are what an
   *  operator would type - the same live-field teaching every coder path states. */
  fields: { title: string; sample: string }[];
}

export interface ProCustomOptions {
  brief: ProCustomBrief;
  route: ModelRoute;
  /** The injected production gate - validateTemplate + the runtime bench, exactly what the
   *  app wires for every other AI path. The loop's findings come from it. */
  validate: SpxValidator;
  /** The hosted reservation paying for the calls, or null on BYO/bench. */
  session?: ProSession | null;
  /** 'pro' in the product; a bench run passes 'spike' so a measurement never books a
   *  classroom's allowance. */
  surface?: AiGatewaySurface;
  legibility?: { target: ViewingTarget; mode: LegibilityMode; format?: { width: number; height: number } };
  /** Rounds INCLUDING the first emit. Default 4 - the measured protocol's budget, and the
   *  server's maxCallsPerGeneration, so the loop can never out-spend its reservation. */
  maxRounds?: number;
  /** Render the candidate and return a frame the route can look at, or null where no capture
   *  exists. See the header - the product runs findings-only until a rasterizer exists. */
  capture?: (template: SpxTemplate) => Promise<CustomScreenshot | null>;
  onStage?: (stage: 'emit' | 'measure', round: number) => void;
}

export interface ProCustomResult {
  /** 'delivered' = the gate passed with nothing blocking. 'refused' = the budget is spent and
   *  findings remain - the honest stop, carrying exactly what is still wrong. */
  status: 'delivered' | 'refused';
  template: SpxTemplate;
  validation: ValidationResult;
  /** The findings still standing (empty on 'delivered'). */
  findings: string[];
  rounds: number;
  costUsd: number;
  usage: { input: number; output: number; reasoning: number };
  model: string;
}

/**
 * The iteration message: what was measured, then the files, then the frame. The findings come
 * FIRST because they are the contract - the screenshot is evidence, not the brief. ONE source
 * for this shape: the bench's iterate arm renders its message through this same function, so a
 * paid round measures the exact conversation the product would hold.
 */
export function iterationMessage(
  findings: string[], template: SpxTemplate, screenshot?: CustomScreenshot | null,
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

/**
 * Which findings BLOCK delivery. Every validation error, always - and the design-rule
 * legibility findings whatever their severity, because §22.1's first named leak was exactly
 * a collision finding demoted to advisory on a type nobody had calibrated. Ordinary bench
 * warnings stay teaching material: the bench is chatty by design, and a lane that blocks on
 * every note never delivers anything.
 */
export function blockingFindings(validation: ValidationResult): string[] {
  const errors = validation.errors ?? [];
  const warnings = (validation.warnings ?? []).filter((w) =>
    w.rule.startsWith('legibility-') || w.rule.startsWith('pro-plate-'));
  return [...errors, ...warnings].map((f) => `${f.rule}: ${f.message}`);
}

/**
 * The stop rule, pure so it is testable without a model: delivered when nothing blocks;
 * another round while budget remains; refused - findings attached - when it is spent.
 */
export function loopVerdict(
  findings: string[], round: number, maxRounds: number,
): 'delivered' | 'iterate' | 'refused' {
  if (!findings.length) return 'delivered';
  return round < maxRounds ? 'iterate' : 'refused';
}

/** The first-round user message: the brief, the field contract, the design rules. */
export function customUserMessage(brief: ProCustomBrief, rules?: ProCustomOptions['legibility']): ContentBlock[] {
  const fields = brief.fields
    .map((f, i) => `- f${i} (${f.title}), sample value: "${f.sample}"`)
    .join('\n');
  const text = `Design and build a broadcast graphic for this brief.

## The brief
${brief.brief}

## What it must carry
${fields}

Every field is a LIVE operator field - the sample values above are what an operator types on
air, so the design must hold when they change length. What it is judged as: the rendered
graphic, on air, over real footage - hierarchy, proportion, spacing, the composition as a
whole, whether the motion serves the reading order. Answer the brief's own world.

Do NOT place a brand mark or logo: the platform owns mark placement.`;
  const blocks: ContentBlock[] = [{ type: 'text', text }];
  if (rules) {
    const format = rules.format ?? { width: 1920, height: 1080 };
    blocks.push({ type: 'text', text: designRulesPromptBlock(rules.target, rules.mode, format) });
  }
  return blocks;
}

/** Run the custom lane end to end: emit, measure, feed back, stop honestly. */
export async function runProCustomLoop(options: ProCustomOptions): Promise<ProCustomResult> {
  const maxRounds = options.maxRounds ?? 4;
  const system = coderSystemPrompt(neutralSkeletonTemplate());
  const messages: { role: 'user' | 'assistant'; content: ContentBlock[] | string }[] = [
    { role: 'user', content: customUserMessage(options.brief, options.legibility) },
  ];
  const usage = { input: 0, output: 0, reasoning: 0 };
  let costUsd = 0;

  let round = 0;

  for (;;) {
    round += 1;
    options.onStage?.('emit', round);
    const result = await callModelDetailed({
      system,
      messages,
      tool: TEMPLATE_TOOL,
      route: options.route,
      surface: options.surface ?? 'pro',
      cacheSystem: true,
      maxTokens: outputBudget(7000),
      ...(options.session ? { proGenerationId: options.session.generationId } : {}),
    });
    usage.input += result.usage.inputTokens ?? 0;
    usage.output += result.usage.outputTokens ?? 0;
    usage.reasoning += result.usage.reasoningTokens ?? 0;
    costUsd += result.usage.estimatedCost?.amount ?? 0;


    options.onStage?.('measure', round);
    const template = convertEmittedRegion(toTemplate(result.output as EmittedTemplate));
    const validation = await options.validate(template);
    const findings = blockingFindings(validation);

    const verdict = loopVerdict(findings, round, maxRounds);
    if (verdict !== 'iterate') {
      return {
        status: verdict,
        template,
        validation,
        findings: verdict === 'delivered' ? [] : findings,
        rounds: round,
        costUsd,
        usage,
        model: result.model,
      };
    }
    const screenshot = options.capture ? await options.capture(template) : null;
    messages.push(
      { role: 'assistant', content: 'I generated a template; here is what its render measured.' },
      { role: 'user', content: iterationMessage(findings, template, screenshot) },
    );
  }
}
