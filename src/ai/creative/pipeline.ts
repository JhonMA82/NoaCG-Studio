// The Creative Mode pilot pipeline (docs/CREATIVE_MODE_PLAN.md §3.2, §8, §10) - the four
// ablation arms, run by the bench rig and by nothing else.
//
//   A  control        the frozen custom coder, invoked exactly as production invokes it
//   B  de-anchored    the same coder, a NEUTRAL skeleton example, the full intent carried
//   C  staged CREATE  concepts -> creative spec -> scaffold compile -> style -> verify/repair
//   D  C + critique   one rendered-frame inspection and one focused repair
//
// A-vs-B isolates the catalog example plus intent carriage; B-vs-C isolates staging and the
// scaffold compile; C-vs-D isolates the critique. Nothing here is reachable from the product:
// there is no production entry point, no UI, and no route into claudeProvider - arm A calls
// the provider, the provider never calls this.
//
// THE FROZEN CONTROL (§8): arm A is `claudeProvider.generate(..., { mode: 'create' })`. The
// coder's prompt, its example, designNotes and its repair policy are untouched by this file.

import type { SpxTemplate } from '../../model/types';
import type { StructuralIntent } from '../../model/structuralIntent';
import type { ValidationIssue, ValidationResult } from '../../validation/validateTemplate';
import { validateTemplate } from '../../validation/validateTemplate';
import { callModelDetailed, type ContentBlock } from '../modelGateway';
import type { GenerateContext, SpxValidator, StructuralIntentChecker } from '../provider';
import type { AiUsage } from '../telemetry';
import { aiRunRecords } from '../telemetry';
import {
  claudeProvider,
  coderSystemPrompt,
  contextText,
  convertEmittedRegion,
  imageBlocks,
  TEMPLATE_TOOL,
  toTemplate,
  type EmittedTemplate,
} from '../claudeProvider';
import { findingsList, repairLoop } from '../shared/repairLoop';
import { normalizeConcepts, normalizeCreativeSpec, type ConceptDirection, type CreativeSpec } from './contracts';
import { cardsForFamily, cardsForIntent } from './knowledgeCards';
import {
  CONCEPTS_TOOL,
  conceptsSystemPrompt,
  CREATIVE_SPEC_TOOL,
  creativeSpecSystemPrompt,
  intentBrief,
} from './stages';
import { compileScaffold, type CompiledScaffold } from './scaffold';
import { applyCreativeStyle, creativeStyleSystemPrompt, CREATIVE_STYLE_TOOL, type CreativeStylePatch } from './style';
import { CRITIQUE_TOOL, critiqueRepairMessage, critiqueSystemPrompt, normalizeCritique, type CritiqueVerdict } from './critique';
import { neutralSkeletonTemplate } from './neutralSkeleton';

export const CREATIVE_ARMS = ['A', 'B', 'C', 'D'] as const;
export type CreativeArm = (typeof CREATIVE_ARMS)[number];

export interface CreativeStageRecord {
  stage: string;
  ms: number;
  model?: string;
  usage?: AiUsage;
}

/** A settled hold frame of a template, as a base64 PNG (no data: prefix). Injected, like the
 *  validator: capture needs a real browser rig, and the pipeline stays free of it. */
export type FrameCapture = (template: SpxTemplate) => Promise<string | null>;

export interface CreativeRunInput {
  brief: string;
  /** Stage 1's output, run ONCE per brief and shared across arms: the arms compare
   *  generation, not routing, so re-classifying per arm would only add noise and cost. */
  intent: StructuralIntent;
  context: GenerateContext;
  validate: SpxValidator;
  structuralCheck?: StructuralIntentChecker;
  /** Arm D only. */
  capture?: FrameCapture;
  /** Arm D only: the model that LOOKS at the frame. Separate because the candidate under
   *  test is usually a text model - a cheap open coder has no eyes, and pointing the
   *  critique at a VLM is what makes the arm runnable at all. */
  critiqueModel?: string;
  onProgress?: (stage: string) => void;
}

export interface CreativeRunResult {
  arm: CreativeArm;
  ok: boolean;
  template: SpxTemplate | null;
  validation: ValidationResult | null;
  /** The structural-satisfaction findings (plan §11 criterion 2). Empty = every required
   *  part is present in the rendered result. */
  structural: ValidationIssue[];
  concepts: ConceptDirection[];
  spec: CreativeSpec | null;
  /** False when the style stage's patch was refused by the gate and the scaffold stands. */
  styleApplied: boolean;
  critique?: CritiqueVerdict;
  /** Arm D: whether the focused repair's patch landed. */
  critiqueRepairApplied?: boolean;
  repairRounds: number;
  stages: CreativeStageRecord[];
  totalMs: number;
  error?: string;
}

const now = () => Date.now();

/** One arm's stage ledger - what §12's cost and latency numbers are computed from. */
class Ledger {
  readonly stages: CreativeStageRecord[] = [];
  record(stage: string, startedMs: number, model?: string, usage?: AiUsage): void {
    this.stages.push({ stage, ms: now() - startedMs, ...(model ? { model } : {}), ...(usage ? { usage } : {}) });
  }
}

async function runStructuralCheck(
  template: SpxTemplate | null,
  input: CreativeRunInput,
): Promise<ValidationIssue[]> {
  if (!template || !input.structuralCheck) return [];
  try {
    return await input.structuralCheck(template, input.intent);
  } catch {
    return [];
  }
}

// ── Arm A: the frozen control ────────────────────────────────────────────────

async function runControlArm(input: CreativeRunInput): Promise<CreativeRunResult> {
  const started = now();
  const before = aiRunRecords().length;
  input.onProgress?.('Control arm…');
  try {
    const change = await claudeProvider.generate(input.brief, input.context, {
      mode: 'create',
      validate: input.validate,
      structuralCheck: input.structuralCheck,
    });
    // The provider records its own stages through the telemetry ring, so the arm reads them
    // there rather than re-measuring what it cannot see inside.
    const record = aiRunRecords().slice(before).pop();
    return {
      arm: 'A',
      ok: change.validation?.ok ?? true,
      template: change.template,
      validation: change.validation ?? null,
      // Parts findings are warnings; kind findings are blocking errors on grounded results
      // (owner decision 2026-07-31) - criterion 2 reads both, wherever they landed.
      structural: [...(change.validation?.errors ?? []), ...(change.validation?.warnings ?? [])]
        .filter((f) => f.rule === 'structural-intent' || f.rule === 'structural-kind'),
      concepts: [],
      spec: null,
      styleApplied: false,
      repairRounds: record?.repairRounds ?? 0,
      stages: (record?.stages ?? []).map((s) => ({ stage: s.stage, ms: s.ms, ...(s.model ? { model: s.model } : {}), ...(s.usage ? { usage: s.usage } : {}) })),
      totalMs: now() - started,
    };
  } catch (e) {
    return emptyResult('A', started, e);
  }
}

// ── Arm B: the de-anchored coder ─────────────────────────────────────────────

/** Arm B's user content: the same context text the control gets, plus the WHOLE structural
 *  intent instead of the control's four forwarded sentences (the F4 half of the A-vs-B
 *  comparison). */
function deAnchoredContent(input: CreativeRunInput): ContentBlock[] {
  return [
    ...imageBlocks(input.context),
    { type: 'text', text: contextText(input.brief, input.context) },
    { type: 'text', text: intentBrief(input.intent) },
  ];
}

async function runDeAnchoredArm(input: CreativeRunInput): Promise<CreativeRunResult> {
  const started = now();
  const ledger = new Ledger();
  let repairRounds = 0;
  input.onProgress?.('De-anchored coder…');
  try {
    const system = coderSystemPrompt(neutralSkeletonTemplate());
    const content = deAnchoredContent(input);
    const t0 = now();
    const first = await callModelDetailed({ system, messages: [{ role: 'user', content }], tool: TEMPLATE_TOOL, cacheSystem: true });
    ledger.record('coder', t0, first.model, first.usage);

    const ground = (e: EmittedTemplate): SpxTemplate => convertEmittedRegion(toTemplate(e, input.context));
    const { emitted, validation } = await repairLoop<EmittedTemplate, ValidationResult>({
      emitted: first.output as EmittedTemplate,
      validate: async (e) => input.validate(ground(e)),
      reEmit: async (findings, current, round) => {
        repairRounds += 1;
        const t = now();
        const repair = await callModelDetailed({
          system,
          messages: [
            { role: 'user', content },
            { role: 'assistant', content: `I generated a template but it failed the platform's checks.` },
            {
              role: 'user',
              content: [{
                type: 'text',
                text: `These findings must be fixed:\n${findingsList(findings)}\n\n` +
                  `Return the COMPLETE corrected template through the tool.\n\n` +
                  `Current html:\n${current.html}\n\nCurrent css:\n${current.css}\n\nCurrent js:\n${current.js}`,
              }],
            },
          ],
          tool: TEMPLATE_TOOL,
          cacheSystem: true,
        });
        ledger.record(`repair-${round}`, t, repair.model, repair.usage);
        return repair.output as EmittedTemplate;
      },
    });

    const template = ground(emitted);
    return {
      arm: 'B',
      ok: validation.ok,
      template,
      validation,
      structural: await runStructuralCheck(template, input),
      concepts: [],
      spec: null,
      styleApplied: false,
      repairRounds,
      stages: ledger.stages,
      totalMs: now() - started,
    };
  } catch (e) {
    return emptyResult('B', started, e, ledger);
  }
}

// ── Arms C and D: the staged CREATE pipeline ─────────────────────────────────

/**
 * Pick one of the three concept directions when the caller wants a single result (plan §3.2
 * stage 4: the user picks through the alternatives picker, or the platform auto-picks by
 * stated criteria). The criterion here is deliberate and stated: the direction whose reading
 * order covers the most REQUIRED parts wins, ties going to the first - originality is never
 * bought by dropping content, so the concept that carries the brief best is the one to build.
 */
export function autoPickConcept(concepts: ConceptDirection[], intent: StructuralIntent): ConceptDirection | null {
  if (!concepts.length) return null;
  const required = new Set(intent.parts.map((p) => p.id.toLowerCase()));
  let best = concepts[0];
  let bestScore = -1;
  for (const concept of concepts) {
    const covered = concept.hierarchyOrder.filter((id) => required.has(id.toLowerCase())).length;
    if (covered > bestScore) {
      best = concept;
      bestScore = covered;
    }
  }
  return best;
}

async function runStagedArm(arm: 'C' | 'D', input: CreativeRunInput): Promise<CreativeRunResult> {
  const started = now();
  const ledger = new Ledger();
  let concepts: ConceptDirection[] = [];
  let spec: CreativeSpec | null = null;
  let repairRounds = 0;

  try {
    const briefCards = cardsForIntent(input.intent, input.brief);
    const userText = `${contextText(input.brief, input.context)}\n\n${intentBrief(input.intent)}`;
    const userContent: ContentBlock[] = [...imageBlocks(input.context), { type: 'text', text: userText }];

    // Stage 4 - three concept directions.
    input.onProgress?.('Sketching directions…');
    const t4 = now();
    const conceptCall = await callModelDetailed({
      system: conceptsSystemPrompt(briefCards),
      messages: [{ role: 'user', content: userContent }],
      tool: CONCEPTS_TOOL,
      maxTokens: 1600,
    });
    ledger.record('concepts', t4, conceptCall.model, conceptCall.usage);
    concepts = normalizeConcepts(conceptCall.output);
    const chosen = autoPickConcept(concepts, input.intent);
    if (!chosen) throw new Error('The concept stage returned no usable direction.');

    // Stage 5 - the CreativeSpec.
    input.onProgress?.('Designing…');
    const specCards = cardsForFamily(chosen.compositionFamily);
    const t5 = now();
    const specCall = await callModelDetailed({
      system: creativeSpecSystemPrompt(specCards.length ? specCards : briefCards, chosen),
      messages: [{ role: 'user', content: userContent }],
      tool: CREATIVE_SPEC_TOOL,
      maxTokens: 2600,
    });
    ledger.record('creative-spec', t5, specCall.model, specCall.usage);
    spec = normalizeCreativeSpec(specCall.output, input.intent);

    // Stage 6 - the deterministic compile.
    const t6 = now();
    const scaffold = compileScaffold(spec, input.intent, input.context);
    ledger.record('scaffold', t6);

    // Stages 7 + 8 + 9 - style, verify, bounded repair. The scaffold is the floor: a style
    // patch the gate refuses leaves a plain but correct graphic, never a broken one.
    input.onProgress?.('Writing the design…');
    const styled = await styleWithRepair(scaffold, spec, specCards.length ? specCards : briefCards, input, ledger, () => { repairRounds += 1; });

    let template = styled.template;
    let validation = styled.validation;
    let critique: CritiqueVerdict | undefined;
    let critiqueRepairApplied: boolean | undefined;

    // Stage 10 - the rendered critique and ONE focused repair. Arm D only, bench-only.
    if (arm === 'D' && input.capture) {
      input.onProgress?.('Looking at the frame…');
      const shot = await input.capture(template);
      if (shot) {
        const t10 = now();
        const critiqueCall = await callModelDetailed({
          system: critiqueSystemPrompt(input.intent, spec),
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: shot } },
              { type: 'text', text: 'Inspect this rendered frame and answer the questions.' },
            ],
          }],
          tool: CRITIQUE_TOOL,
          maxTokens: 1200,
          ...(input.critiqueModel ? { model: input.critiqueModel } : {}),
        });
        ledger.record('critique', t10, critiqueCall.model, critiqueCall.usage);
        critique = normalizeCritique(critiqueCall.output);
        if (critique.findings.length) {
          const fixed = await styleRepairFromCritique(scaffold, spec, styled.patch, critique, input, ledger);
          critiqueRepairApplied = Boolean(fixed);
          if (fixed) {
            template = fixed.template;
            validation = fixed.validation;
          }
        } else {
          critiqueRepairApplied = false;
        }
      }
    }

    return {
      arm,
      ok: validation.ok,
      template,
      validation,
      structural: await runStructuralCheck(template, input),
      concepts,
      spec,
      styleApplied: styled.styleApplied,
      ...(critique ? { critique } : {}),
      ...(critiqueRepairApplied !== undefined ? { critiqueRepairApplied } : {}),
      repairRounds,
      stages: ledger.stages,
      totalMs: now() - started,
    };
  } catch (e) {
    const failed = emptyResult(arm, started, e, ledger);
    return { ...failed, concepts, spec };
  }
}

interface StyledResult {
  template: SpxTemplate;
  validation: ValidationResult;
  styleApplied: boolean;
  patch: CreativeStylePatch | null;
}

/** Stage 7 with stages 8-9 wrapped around it: emit the design, validate, hand the findings
 *  back at most twice. The patch is re-applied to the SCAFFOLD every round, never stacked -
 *  a repair must replace the design, not append a second one over it. */
async function styleWithRepair(
  scaffold: CompiledScaffold,
  spec: CreativeSpec,
  cards: ReturnType<typeof cardsForIntent>,
  input: CreativeRunInput,
  ledger: Ledger,
  onRepair: () => void,
): Promise<StyledResult> {
  const system = creativeStyleSystemPrompt(spec, scaffold, cards);
  const brief: ContentBlock[] = [
    ...imageBlocks(input.context),
    { type: 'text', text: `${contextText(input.brief, input.context)}\n\n${intentBrief(input.intent)}` },
  ];

  const t0 = now();
  const first = await callModelDetailed({
    system,
    messages: [{ role: 'user', content: brief }],
    tool: CREATIVE_STYLE_TOOL,
    maxTokens: 4000,
    cacheSystem: true,
  });
  ledger.record('style', t0, first.model, first.usage);

  const apply = (patch: CreativeStylePatch | null): SpxTemplate =>
    (patch && applyCreativeStyle(scaffold, patch)) || scaffold.template;

  const { emitted, validation } = await repairLoop<CreativeStylePatch, ValidationResult>({
    emitted: first.output as CreativeStylePatch,
    validate: async (patch) => input.validate(apply(patch)),
    reEmit: async (findings, current, round) => {
      onRepair();
      const t = now();
      const repair = await callModelDetailed({
        system,
        messages: [
          { role: 'user', content: brief },
          { role: 'assistant', content: `I designed the graphic but it failed the platform's checks.` },
          {
            role: 'user',
            content: [{
              type: 'text',
              text: `These findings must be fixed:\n${findingsList(findings)}\n\n` +
                `Return the COMPLETE corrected style patch through the tool.\n\n` +
                `Your current CSS:\n${current.css}`,
            }],
          },
        ],
        tool: CREATIVE_STYLE_TOOL,
        maxTokens: 4000,
        cacheSystem: true,
      });
      ledger.record(`style-repair-${round}`, t, repair.model, repair.usage);
      return repair.output as CreativeStylePatch;
    },
  });

  const template = apply(emitted);
  return {
    template,
    validation,
    styleApplied: template !== scaffold.template,
    patch: emitted,
  };
}

/** The critique's ONE focused repair (plan §9): the findings go back to the style stage, the
 *  new patch is validated like any other, and a patch that fails or is refused by the gate
 *  changes nothing - a critique may improve a result, never break one. */
async function styleRepairFromCritique(
  scaffold: CompiledScaffold,
  spec: CreativeSpec,
  patch: CreativeStylePatch | null,
  critique: CritiqueVerdict,
  input: CreativeRunInput,
  ledger: Ledger,
): Promise<{ template: SpxTemplate; validation: ValidationResult } | null> {
  if (!patch) return null;
  const system = creativeStyleSystemPrompt(spec, scaffold, cardsForFamily(spec.layout.family));
  const t = now();
  const repair = await callModelDetailed({
    system,
    messages: [
      { role: 'user', content: [{ type: 'text', text: `${contextText(input.brief, input.context)}\n\n${intentBrief(input.intent)}` }] },
      { role: 'assistant', content: `I designed the graphic. Current CSS:\n${patch.css}` },
      { role: 'user', content: [{ type: 'text', text: critiqueRepairMessage(critique) }] },
    ],
    tool: CREATIVE_STYLE_TOOL,
    maxTokens: 4000,
    cacheSystem: true,
  });
  ledger.record('critique-repair', t, repair.model, repair.usage);

  const applied = applyCreativeStyle(scaffold, repair.output as CreativeStylePatch);
  if (!applied) return null;
  const validation = await input.validate(applied);
  return validation.ok ? { template: applied, validation } : null;
}

// ── Entry point ──────────────────────────────────────────────────────────────

function emptyResult(arm: CreativeArm, started: number, error: unknown, ledger?: Ledger): CreativeRunResult {
  return {
    arm,
    ok: false,
    template: null,
    validation: null,
    structural: [],
    concepts: [],
    spec: null,
    styleApplied: false,
    repairRounds: 0,
    stages: ledger?.stages ?? [],
    totalMs: now() - started,
    error: error instanceof Error ? error.message : String(error),
  };
}

/** Run ONE arm for one brief. The bench rig owns iteration, ordering and the spend ceiling. */
export async function runCreativeArm(arm: CreativeArm, input: CreativeRunInput): Promise<CreativeRunResult> {
  if (arm === 'A') return runControlArm(input);
  if (arm === 'B') return runDeAnchoredArm(input);
  return runStagedArm(arm, input);
}

/** The scaffold on its own - no model calls, no cost. The free e2e coverage compiles specs
 *  through this, and a rig can use it to prove the compile half before spending anything. */
export function compileScaffoldOnly(spec: CreativeSpec, intent: StructuralIntent, ctx?: GenerateContext): {
  scaffold: CompiledScaffold;
  validation: ValidationResult;
} {
  const scaffold = compileScaffold(spec, intent, ctx);
  return { scaffold, validation: validateTemplate(scaffold.template) };
}
