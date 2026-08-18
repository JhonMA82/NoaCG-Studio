// THE RECREATE ARM - the free-form coder pointed at a finished PICTURE of a broadcast
// graphic (a customer's exported PNG/JPEG), asked to rebuild it as a real NoaCG template:
// same look, every piece of text an operator field, panels that react to content length.
//
// BENCH-ONLY (see exemplars.ts for the deletion condition) - the runner is
// scripts/import-recreate-spike.mjs, and nothing in the product reaches this module.
//
// WHY THIS IS NOT THE RETIRED RECONSTRUCTION ENGINE (docs/AI_ATTEMPTS.md "interpret →
// compile"). That engine generated a concept image and had a deterministic rectangle
// compiler rebuild it - it died on the compiler's four measured defects, not on the model's
// eyes. Here there is NO compiler: the reference is a real customer picture (ground truth
// exists), the coder writes the HTML itself under the same frozen contract as every arm, and
// iterate loop - the mechanism the 2026-08-17/18 rounds measured (9/12 and 10/21 airable) -
// feeds back instrument findings, a similarity read against the reference, and both frames.
//
// WHAT IS DELIBERATELY THE SAME AS iterate.ts: spikeSystemPrompt (the frozen benchmark
// control - recreation specifics ride the USER message), TEMPLATE_TOOL, convertEmittedRegion
// + toTemplate grounding, pinned decoding, and the runner-owned loop with iterationMessage.
// An emit here is contract-compatible with every other spike ledger.

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
import { spikeSystemPrompt, type SpikeDecoding } from './run';
import { iterationMessage, type IterateScreenshot } from './iterate';

/** The reference picture, fitted to the 1920x1080 frame by the runner. */
export interface RecreateReference {
  mediaType: string;
  base64: string;
  /** True when the picture carries a painted transparency checkerboard (a JPEG "with alpha"
   *  downloaded from a stock site) - the model is told it means EMPTY, never a pattern. */
  checkerboard: boolean;
}

export interface RecreateEmitOptions {
  /** The graphic's working name - reaches the emitted template's name only. */
  name: string;
  reference: RecreateReference;
  route: ModelRoute;
  decoding: SpikeDecoding;
  validate: SpxValidator;
  /** Absent on the first round. Present = an iteration: the previous emit's three files, the
   *  findings its render measured (instruments + the similarity read), and the rendered
   *  frame. The reference stays in the conversation's first message, so every round sees
   *  both pictures. */
  previous?: {
    template: SpxTemplate;
    findings: string[];
    screenshot?: IterateScreenshot;
  };
}

export interface RecreateEmitResult {
  template: SpxTemplate;
  emitted: EmittedTemplate;
  validation: ValidationResult;
  usage: { input: number; output: number; reasoning: number };
  costUsd: number;
  model: string;
}

/**
 * The recreation contract. It rides the USER message - the spike system prompt is the frozen
 * benchmark control and stays byte-identical (the iterate arm's own rule). Everything here is
 * an inspection the runner actually performs: the similarity read, the long-value stress
 * frames, the field paint drive and the control-page smoke are the measurements these
 * sentences answer to, so the contract cannot rot into wishes.
 */
export function recreateUserMessage(name: string, reference: RecreateReference): ContentBlock[] {
  const checkerNote = reference.checkerboard
    ? `\n- The grey CHECKERBOARD in the picture is a transparency stand-in from the export, not
  artwork: those areas are EMPTY. Paint nothing there and never draw the pattern.`
    : `\n- The flat, featureless area AROUND the graphic is the export's backdrop stand-in, not
  artwork: the template's page stays transparent there so live video shows through. Rebuild
  only the graphic itself.`;
  const text = `Rebuild the broadcast graphic in the attached picture as a complete template.
The picture is the ground truth: your render will be compared against it at 1920x1080, and
differences will come back to you as findings. Match its layout, colours, panel shapes,
typography, spacing and alignment closely enough that the two frames read as the same design.

Rules for the rebuild (each one is measured by the harness):
- EVERY piece of text visible in the picture becomes its own operator field (fN in the
  definition, id="fN" on the element), with the picture's exact words as that field's sample
  value. Scores, clocks and numbers are fields too - an operator retypes them live.
- Panels and straps size themselves from their CONTENT (fit-content, max-width, min-width),
  so a longer name grows the panel or shrinks the type gracefully; nothing may clip, overlap
  or escape its panel when a value runs twice as long. This is stress-tested with long values.
- Decorative artwork (crests, avatars, icons, texture) is rebuilt in CSS/SVG when it is
  simple geometry; where it is a real image (a photo, a logo), emit an EMPTY image slot the
  operator fills - never draw a stand-in logo or fake photograph.
- Choose the bundled typeface closest to the picture's letterforms; approximate weights and
  tracking rather than substituting a different voice.
- Give the graphic an entrance and an exit in the design's own spirit (a strap slides, a
  scorebug pops, a panel fades) through the standard animation region.${checkerNote}
- The template is named "${name}".

Emit the complete template now - all three files.`;
  return [
    { type: 'text', text },
    {
      type: 'image',
      source: { type: 'base64', media_type: reference.mediaType, data: reference.base64 },
    },
  ];
}

export async function recreateEmit(options: RecreateEmitOptions): Promise<RecreateEmitResult> {
  const { name, reference, route, decoding, validate, previous } = options;

  const messages: { role: 'user' | 'assistant'; content: ContentBlock[] | string }[] = [
    { role: 'user', content: recreateUserMessage(name, reference) },
  ];
  if (previous) {
    messages.push(
      { role: 'assistant', content: 'I generated a template; here is what its render measured.' },
      {
        role: 'user',
        content: iterationMessage(previous.findings, previous.template, previous.screenshot),
      },
    );
  }

  const result = await callModelDetailed({
    system: spikeSystemPrompt(),
    messages,
    tool: TEMPLATE_TOOL,
    route,
    // Same forced-function surface as every spike arm, for the same reason (run.ts says why).
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
  const template = convertEmittedRegion(toTemplate(emitted));
  const validation = await validate(template);

  return { template, emitted, validation, usage, costUsd, model: result.model };
}
