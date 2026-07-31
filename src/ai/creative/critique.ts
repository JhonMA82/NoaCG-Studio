// Stage 10 - the rendered visual critique (docs/CREATIVE_MODE_PLAN.md §9). BENCH-ONLY in v1:
// non-gating, disabled in production, and paid only with explicit approval. The pipeline runs
// it as arm D and nowhere else.
//
// The critic asks CONCRETE INSPECTION QUESTIONS, never a generic score - each phrased with
// ABSENCE as its first failure. That wording is the §6d lesson from the Lite eval: a judge
// asked to score "strap shape" scored 5 on a frame that had no strap, because a score axis
// assumes the thing exists. An inspection question cannot make that mistake.
//
// The measured outcome that decides critique's future is not a score either: it is how often
// critique+repair IMPROVED the human verdict versus DAMAGED it versus changed nothing.

import type { ModelTool } from '../modelGateway';
import type { StructuralIntent } from '../../model/structuralIntent';
import type { CreativeSpec } from './contracts';

export interface CritiqueFinding {
  /** Which inspection question failed. */
  question: string;
  /** What is wrong, in the words a designer would use to fix it. */
  problem: string;
  severity: 'blocking' | 'weak';
}

export interface CritiqueVerdict {
  /** True when every inspection question passed - the frame is airworthy as it stands. */
  airworthy: boolean;
  findings: CritiqueFinding[];
}

export const CRITIQUE_TOOL: ModelTool = {
  name: 'emit_frame_critique',
  description:
    'Answer the inspection questions about the rendered frame and return only the ones that ' +
    'FAILED, as concrete problems a designer could fix.',
  input_schema: {
    type: 'object',
    required: ['airworthy', 'findings'],
    additionalProperties: false,
    properties: {
      airworthy: { type: 'boolean', description: 'True when every question passed.' },
      findings: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          required: ['question', 'problem', 'severity'],
          additionalProperties: false,
          properties: {
            question: { type: 'string', description: 'Which inspection question failed (quote it).' },
            problem: { type: 'string', description: 'What is actually wrong in the frame, specifically.' },
            severity: {
              type: 'string',
              enum: ['blocking', 'weak'],
              description: 'blocking = it could not go on air; weak = it works but reads poorly.',
            },
          },
        },
      },
    },
  },
};

/** The inspection questions, in the order a viewer's eye would ask them. */
export function critiqueQuestions(intent: StructuralIntent, spec: CreativeSpec): string[] {
  const parts = intent.parts.map((p) => p.id).join(', ') || 'the brief\'s content';
  return [
    `Is every required element actually VISIBLE in this frame (${parts})? Name any that is missing.`,
    `Is the reading order the one the design intended (${spec.motion.entranceOrder.join(' → ')})? What does the eye take first in fact?`,
    `Is this recognizable as a ${spec.layout.family}? A bracket must read as a tree, a versus as a confrontation, a strap as one person named.`,
    'Is every piece of text fully readable - nothing clipped mid-letter, nothing overlapping, nothing that would fall under 20 px at 1080p?',
    'Is the composition balanced within its area, or is there a hole or a crowd?',
    'Would this look broadcast-appropriate over live pictures - real contrast, no accidental decoration, nothing amateur?',
  ];
}

export function critiqueSystemPrompt(intent: StructuralIntent, spec: CreativeSpec): string {
  return `You are inspecting a single rendered frame of a broadcast graphic, at 1920x1080,
against what it was supposed to be. You are not scoring it and you are not being encouraging:
you are answering specific questions, and only the FAILED answers are returned.

## What this graphic was supposed to be
${spec.name} — ${spec.summary}
A ${spec.layout.family}, ${spec.layout.fullFrame ? 'full frame' : `anchored ${spec.layout.zone}`}.
Required content: ${intent.parts.map((p) => `${p.id} (${p.role})`).join(', ') || '(not stated)'}

## The inspection questions
${critiqueQuestions(intent, spec).map((q, i) => `${i + 1}. ${q}`).join('\n')}

For each question the first possible failure is ABSENCE: if the thing the question is about is
not in the frame at all, that is the finding - never judge the quality of something you cannot
see. Report a question only when it failed, and say what is wrong specifically enough to fix.

Answer with the emit_frame_critique tool. No other output.`;
}

export function normalizeCritique(raw: unknown): CritiqueVerdict {
  const r = (raw ?? {}) as Record<string, unknown>;
  const findings = (Array.isArray(r.findings) ? r.findings : [])
    .map((entry) => {
      const f = (entry ?? {}) as Record<string, unknown>;
      return {
        question: typeof f.question === 'string' ? f.question : '',
        problem: typeof f.problem === 'string' ? f.problem : '',
        severity: f.severity === 'blocking' ? ('blocking' as const) : ('weak' as const),
      };
    })
    .filter((f) => Boolean(f.problem))
    .slice(0, 6);
  // An emit claiming airworthy WHILE listing problems is trusted on the problems: the
  // findings are the evidence, the boolean is a summary of them.
  return { airworthy: findings.length === 0 && r.airworthy !== false, findings };
}

/** The critique's findings as the repair message the style stage reads. */
export function critiqueRepairMessage(verdict: CritiqueVerdict): string {
  return `A rendered frame of your design was inspected. These questions failed:

${verdict.findings.map((f) => `- ${f.question}\n  ${f.severity === 'blocking' ? 'BLOCKING' : 'Weak'}: ${f.problem}`).join('\n')}

Fix exactly these, changing as little else as possible, and return the complete style patch
again (CSS, and region HTML only where you already used it).`;
}
