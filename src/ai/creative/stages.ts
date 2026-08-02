// The CREATE path's model-bound stages 4, 5 and 7 (docs/CREATIVE_MODE_PLAN.md §3.2): their
// forced tools and their system prompts. Stage 1 (intent) is phase A's and lives in
// src/ai/structuralIntent.ts; stages 6, 8 and 9 are deterministic or already exist.
//
// Every prompt here obeys the anti-anchoring rule (§4): NO catalog design code, no chassis
// ids, no variant listing. What reaches the model is the brief, the structural intent, the
// design-knowledge cards for the matched family (§5), and the platform's own contracts.
//
// The stage shapes follow the measured lesson that cheap open models answer SMALL forced
// structured calls at parity with expensive ones (qwen3-30b 24/24 on the Lite comparison):
// stages 4 and 5 are hundreds of tokens out, and only stage 7 - the design authoring - is a
// medium call.

import type { ModelTool } from '../modelGateway';
import type { StructuralIntent } from '../../model/structuralIntent';
import { FONTS } from '../../model/fonts';
import { cardText, type KnowledgeCard } from './knowledgeCards';
import { COMPOSITION_FAMILIES, type ConceptDirection } from './contracts';

const ZONES = [
  'top-left', 'top-center', 'top-right',
  'mid-left', 'mid-center', 'mid-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

/** The intent as prompt text - the WHOLE structural decision carried forward, which is the
 *  fix for F4 (the design stage's decisions dying at the CREATE boundary). */
export function intentBrief(intent: StructuralIntent): string {
  const kind = intent.kind === 'type' ? `a known graphic type: ${intent.typeId}`
    : intent.kind === 'family' ? `the ${intent.families?.join(' / ')} composition family`
    : intent.kind === 'hybrid' ? `a hybrid of ${intent.families?.join(' + ')}`
    : `a novel structure: ${intent.novelDescription}`;
  const parts = intent.parts.length
    ? intent.parts.map((p) =>
        `- ${p.id} (${p.role})${p.repeating ? ' - REPEATS per data item' : ''}` +
        (p.itemParts?.length ? `; one item is: ${p.itemParts.join(', ')}` : ''),
      ).join('\n')
    : '- (none declared)';
  const fields = intent.fields.length
    ? intent.fields.map((f) => `- ${f.key} (${f.role}): ${f.label}${f.sample ? ` e.g. "${f.sample}"` : ''}`).join('\n')
    : '- (none declared)';
  const states = intent.states?.length
    ? `\nStates the operator can fire:\n${intent.states.map((s) => `- ${s.id} (${s.trigger})${s.description ? `: ${s.description}` : ''}`).join('\n')}`
    : '';
  return `## What must exist (the structural analysis of the brief)
Kind: ${kind} (confidence ${intent.confidence})
Summary: ${intent.summary}

Required parts:
${parts}

Operator data:
${fields}${states}${intent.placement ? `\nPlacement: ${intent.placement}` : ''}${intent.tone?.length ? `\nTone words from the brief: ${intent.tone.join(', ')}` : ''}`;
}

/** The knowledge cards block, or the honest absence of one. */
export function cardsBlock(cards: KnowledgeCard[]): string {
  if (!cards.length) {
    return `## Design knowledge
This structure matches no family the platform has a card for. Reason from the brief and from
first principles of broadcast legibility: one thing read first, nothing under 20 px at 1080p,
everything inside a 5% safe inset, and motion that follows the reading order.`;
  }
  return `## Design knowledge for this structure (anatomy and principles - never a finished design)
${cards.map(cardText).join('\n\n')}`;
}

// ── Stage 4: three concept directions ────────────────────────────────────────

export const CONCEPTS_TOOL: ModelTool = {
  name: 'emit_concept_directions',
  description:
    'Return THREE genuinely different design directions for this graphic. Directions only - ' +
    'no code, no CSS, no measurements, no template ids.',
  input_schema: {
    type: 'object',
    required: ['concepts'],
    additionalProperties: false,
    properties: {
      concepts: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          required: ['name', 'compositionFamily', 'hierarchyOrder', 'paletteCharacter', 'motionCharacter', 'rationale'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', description: 'Two or three words naming the direction ("Ledger", "Floodlit split").' },
            compositionFamily: {
              type: 'string',
              description:
                'How the content is composed. Common answers: ' + COMPOSITION_FAMILIES.join(', ') +
                '. Any other word is allowed when none of those describes it honestly.',
            },
            hierarchyOrder: {
              type: 'array',
              maxItems: 8,
              items: { type: 'string' },
              description: 'The required part ids in READING order - what the eye takes first, second, last.',
            },
            paletteCharacter: { type: 'string', description: 'How colour behaves, in words. No hex values here.' },
            motionCharacter: { type: 'string', description: 'How it moves, in words. No durations here.' },
            rationale: { type: 'string', description: 'One sentence: why this direction serves THIS brief.' },
          },
        },
      },
    },
  },
};

export function conceptsSystemPrompt(cards: KnowledgeCard[]): string {
  return `You are the concept stage of NoaCG Studio's creative path: a broadcast designer
proposing THREE different ways to build one graphic. You are not writing code and you are not
choosing from a catalog - nothing you write here becomes markup.

${cardsBlock(cards)}

## What makes three directions genuinely different
Different COMPOSITION (how the parts are arranged in the frame) and a different READING ORDER.
Two directions that share a composition and a reading order and differ only in colour or motion
are one direction in two coats - that is the failure this stage exists to avoid. At least two of
your three must differ from each other in both.

## What makes a direction good
It follows the programme: a news strap, an esports ranking, a children's timer and an election
board earn different densities, weights, colour energies and speeds. Restraint where the content
is serious. Distinctive without decoration that carries no information. Every direction must
still carry EVERY required part - originality is never achieved by dropping content.

Answer with the emit_concept_directions tool. No other output.`;
}

// ── Stage 5: the CreativeSpec ────────────────────────────────────────────────

const REGION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['id', 'role', 'emphasis'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', description: 'The required part id this region carries (use the ids from the analysis).' },
    role: { type: 'string', description: 'What it is, in a word ("name", "score", "tie", "timer").' },
    emphasis: { type: 'string', enum: ['primary', 'secondary', 'support'], description: 'Its weight in the reading order.' },
    repeating: { type: 'boolean', description: 'True when this region repeats per data item (rows, ties, competitors).' },
    itemParts: {
      type: 'array', maxItems: 6, items: { type: 'string' },
      description: 'For a repeating region: the parts of ONE item, in order - they become the | columns of one typed line.',
    },
    fieldKeys: {
      type: 'array', maxItems: 8, items: { type: 'string' },
      description: 'The operator field keys shown in this region, in order.',
    },
    typography: {
      type: 'object',
      additionalProperties: false,
      properties: {
        caseStyle: { type: 'string', enum: ['as-typed', 'upper'] },
        weight: { type: 'string', enum: ['regular', 'semibold', 'bold', 'black'] },
        tracking: { type: 'string', enum: ['tight', 'normal', 'wide'] },
      },
    },
  },
};

export const CREATIVE_SPEC_TOOL: ModelTool = {
  name: 'emit_creative_spec',
  description:
    'Return the chosen direction as a concrete design specification: regions, palette, type ' +
    'treatment, motion plan. Still no code - the platform compiles this.',
  input_schema: {
    type: 'object',
    required: ['conceptId', 'name', 'summary', 'layout', 'regions', 'palette', 'motion', 'designNote'],
    additionalProperties: false,
    properties: {
      conceptId: { type: 'string', description: 'The id of the direction you are making concrete (c1, c2 or c3).' },
      name: { type: 'string', description: 'Short template name.' },
      summary: { type: 'string', description: 'One sentence describing the graphic for the user.' },
      layout: {
        type: 'object',
        required: ['family', 'arrangement', 'fullFrame', 'zone'],
        additionalProperties: false,
        properties: {
          family: { type: 'string', description: 'The composition family from the chosen direction.' },
          arrangement: {
            type: 'string', enum: ['stack', 'row', 'grid', 'split'],
            description: 'How the regions relate to each other as a starting composition.',
          },
          // MEASURED, not guessed (both 2026-07-31 smoke rounds): 14 of 16 lower-third specs
          // came back fullFrame TRUE, for graphics whose own family word was "strap" and whose
          // zone was "bottom-left". Read as "owns the whole frame", the flag sounds like
          // permission to use the canvas and the answer is always yes. Read as "which of these
          // two things am I making", it is a question about the graphic. The value is
          // load-bearing twice over: the scaffold anchors a zone graphic and centres a
          // full-frame one, and the style gate refuses an opaque frame-filling backdrop on the
          // zone graphics only (style.ts stripFrameFlood, owner ruling 2026-07-31).
          fullFrame: {
            type: 'boolean',
            description:
              'FALSE for a graphic that sits OVER live video and leaves the picture readable ' +
              'around it - a lower third, a name strap, a corner card, a side panel, a ticker. ' +
              'TRUE only for a graphic that replaces the picture and is the whole screen - a ' +
              'versus card, a results board, a full-frame title. If a director would call for ' +
              'this over a live camera, it is FALSE.',
          },
          zone: { type: 'string', enum: ZONES, description: 'Where an over-video graphic anchors (ignored when fullFrame is true).' },
          sizeScale: { type: 'number', description: 'Overall size, 0.85 compact … 1.2 large.' },
        },
      },
      regions: { type: 'array', minItems: 1, maxItems: 10, items: REGION_SCHEMA },
      palette: {
        type: 'object',
        required: ['accent', 'text', 'textDim', 'panel'],
        additionalProperties: false,
        properties: {
          accent: { type: 'string', description: 'Hex, e.g. "#ffb020" - the ONE accent.' },
          text: { type: 'string', description: 'Hex - primary text.' },
          textDim: { type: 'string', description: 'Hex - secondary text. Keep it legible, not decorative.' },
          panel: { type: 'string', description: 'Hex or rgba() - the surface behind the text ("rgba(0,0,0,0)" for none).' },
        },
      },
      fontId: { type: 'string', enum: FONTS.map((f) => f.id), description: 'The bundled typeface.' },
      motion: {
        type: 'object',
        required: ['entranceOrder', 'character'],
        additionalProperties: false,
        properties: {
          entranceOrder: { type: 'array', maxItems: 10, items: { type: 'string' }, description: 'Region ids in entrance order.' },
          character: { type: 'string', enum: ['rise', 'glide', 'fade', 'snap', 'wipe'] },
          seconds: { type: 'number', description: 'Entrance length, 0.4 … 2.0.' },
        },
      },
      states: {
        type: 'array', maxItems: 4,
        items: {
          type: 'object',
          required: ['id', 'trigger'],
          additionalProperties: false,
          properties: {
            id: { type: 'string', description: 'The state id from the analysis.' },
            trigger: { type: 'string', enum: ['operator', 'timer'] },
            revealRegions: { type: 'array', maxItems: 6, items: { type: 'string' }, description: 'Region ids this state brings on.' },
            description: { type: 'string' },
          },
        },
      },
      designNote: { type: 'string', description: 'One or two sentences: what the look must get right. This is what the style stage reads.' },
    },
  },
};

export function creativeSpecSystemPrompt(cards: KnowledgeCard[], concept: ConceptDirection): string {
  return `You are the design-specification stage of NoaCG Studio's creative path. One direction
has been chosen; your job is to make it concrete enough for the platform to compile - and to
keep every structural requirement intact while doing it.

## The chosen direction
${concept.name} - a ${concept.compositionFamily}. Reading order: ${concept.hierarchyOrder.join(' → ') || '(not stated)'}.
Colour: ${concept.paletteCharacter}. Motion: ${concept.motionCharacter}.
Why: ${concept.rationale}

${cardsBlock(cards)}

## The rules the platform enforces after you
- Every required part becomes a REGION. Dropping one is not a design decision.
- Repeating content is ONE list field the operator types, one item per line, with | between an
  item's parts - never one field per row. Say so with repeating: true and itemParts.
- Nothing renders below 20 px at 1080p; the platform clamps sizes, so ask for emphasis, not
  pixels.
- Colours must hold up over live pictures: real contrast between text and its surface, and one
  accent doing one job.
- A state is a second beat the operator fires, and it must reveal something that was not
  already on screen.

Answer with the emit_creative_spec tool. No other output.`;
}
