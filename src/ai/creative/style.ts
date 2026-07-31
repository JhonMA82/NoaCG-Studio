// Stage 7 - STYLE (docs/CREATIVE_MODE_PLAN.md §3.2, §4): the model's design authoring, and
// the gate that bounds it. The compiled scaffold owns every engineering contract; this stage
// owns the LOOK - CSS plus bounded structural HTML inside the marked region slots.
//
// The gate is the applyPolish pattern (src/ai/polish.ts), widened from one root slot to one
// slot per region and narrowed everywhere else: :root, @font-face, the ANIMATION region, the
// SPX definition, every field id and the rows container are untouchable, and a patch that
// breaks any of it returns null so the caller keeps the un-styled scaffold. A style pass can
// decline to improve a result; it can never make one worse.
//
// Note what is deliberately ALLOWED, because it is where the composition freedom lives: the
// patch may re-declare `.creative-box` (display, grid template, order, absolute placement),
// wrap a region's fields in its own elements, and add decorative children. That is the
// difference between "a scaffold with a skin" and "a design" - and whether it is enough is
// exactly what the pilot's diversity criteria measure.

import type { SpxTemplate } from '../../model/types';
import type { ModelTool } from '../modelGateway';
import type { CompiledScaffold } from './scaffold';
import type { CreativeSpec } from './contracts';
import type { KnowledgeCard } from './knowledgeCards';
import { cardsBlock } from './stages';

export interface CreativeStylePatch {
  summary: string;
  /** Design CSS, appended after the scaffold CSS - it wins by cascade. */
  css: string;
  /** Optional per-region inner HTML. Each entry re-composes ONE region's inside. */
  regions?: { id: string; html: string }[];
}

export const CREATIVE_STYLE_TOOL: ModelTool = {
  name: 'emit_creative_style',
  description:
    'Return the design as CSS (appended after the scaffold stylesheet, so it wins by cascade) ' +
    'plus optional re-composed inner HTML per region. Never scripts, never :root, never @font-face.',
  input_schema: {
    type: 'object',
    required: ['summary', 'css'],
    additionalProperties: false,
    properties: {
      summary: { type: 'string', description: 'One sentence: what this design does.' },
      css: {
        type: 'string',
        description:
          'The design CSS. Every colour through the :root vars (var(--accent), var(--text-color), ' +
          'var(--text-dim), var(--panel-bg)); every size as calc(N * var(--scale)) and every ' +
          'font-size as calc(N * var(--scale) * var(--type-scale)). Do NOT redeclare :root or @font-face.',
      },
      regions: {
        type: 'array',
        maxItems: 10,
        description: 'Only where the composition needs different structure inside a region.',
        items: {
          type: 'object',
          required: ['id', 'html'],
          additionalProperties: false,
          properties: {
            id: { type: 'string', description: 'The region id.' },
            html: {
              type: 'string',
              description:
                "The region's COMPLETE new inner HTML. Every id=\"fN\" it had must appear exactly " +
                'once, and a rows container must be kept as it is. No <script>.',
            },
          },
        },
      },
    },
  },
};

// ── The gate ─────────────────────────────────────────────────────────────────

const CSS_FORBIDDEN = /:root\s*\{|@font-face|== ANIMATION|<[a-z!/]|@import|url\s*\(\s*['"]?https?:/i;

export const CREATIVE_STYLE_MARKER =
  '/* ── The design (AI-authored — same contracts as the scaffold CSS above) ── */';

/** Inner-HTML range of the element carrying `data-region="<id>"`, by <div> nesting. */
function regionInnerRange(html: string, id: string): { start: number; end: number } | null {
  const open = html.match(new RegExp(`<div[^>]*data-region="${id.replace(/[^a-z0-9-]/gi, '')}"[^>]*>`));
  if (!open || open.index === undefined) return null;
  const start = open.index + open[0].length;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return { start, end: m.index };
  }
  return null;
}

const countMatches = (haystack: string, re: RegExp): number => (haystack.match(re) ?? []).length;

/**
 * Apply a style patch to a compiled scaffold inside the hard walls. Returns the designed
 * template, or null when ANY wall trips - the caller then keeps the scaffold, which is a
 * plain but correct graphic rather than a broken one.
 */
export function applyCreativeStyle(
  scaffold: CompiledScaffold,
  patch: CreativeStylePatch,
): SpxTemplate | null {
  const { template, prefix } = scaffold;
  if (typeof patch.css !== 'string' || !patch.css.trim()) return null;
  if (CSS_FORBIDDEN.test(patch.css)) return null;

  let html = template.html;
  for (const entry of patch.regions ?? []) {
    const region = scaffold.regions.find((r) => r.id === entry.id);
    if (!region) return null;                       // a region that does not exist is a broken emit
    if (typeof entry.html !== 'string') return null;
    if (/<script|<\/?html|<\/?body|<\/?head/i.test(entry.html)) return null;
    const range = regionInnerRange(html, entry.id);
    if (!range) return null;
    const original = html.slice(range.start, range.end);

    // Every field id the region carried must survive, exactly once - the SPX field -> DOM
    // convention is the whole contract with the operator's control page.
    const ids = [...original.matchAll(/\bid="(f\d+)"/g)].map((m) => m[1]);
    for (const id of new Set(ids)) {
      if (countMatches(entry.html, new RegExp(`\\bid="${id}"`, 'g')) !== 1) return null;
    }
    // …and so must the rows container, or the repeating runtime writes into nothing.
    if (original.includes(`id="${prefix}-rows"`) && !entry.html.includes(`id="${prefix}-rows"`)) return null;
    // An image field stays an <img>: setFieldValue writes a PATH, and a <div id="fN"> would
    // silently render the path as text.
    for (const id of new Set(ids)) {
      const wasImg = new RegExp(`<img[^>]*\\bid="${id}"`).test(original);
      if (wasImg && !new RegExp(`<img[^>]*\\bid="${id}"`).test(entry.html)) return null;
    }
    html = html.slice(0, range.start) + entry.html + html.slice(range.end);
  }

  return { ...template, html, css: `${template.css}\n\n${CREATIVE_STYLE_MARKER}\n${patch.css.trim()}\n` };
}

// ── The prompt ───────────────────────────────────────────────────────────────

/** The scaffold as the style stage sees it: the selectors it may address, and nothing else.
 *  Deliberately a STRUCTURE listing rather than the emitted markup - the model needs to know
 *  what exists, not to be handed a design to preserve. */
export function scaffoldSummary(scaffold: CompiledScaffold): string {
  const { prefix } = scaffold;
  const regions = scaffold.regions.map((r) => {
    const bits = [`\`.${r.selector}\` (${r.emphasis}${r.repeating ? ', repeating' : ''})`];
    if (r.fieldIds.length) bits.push(`text spans: ${r.fieldIds.map((id) => `#${id}`).join(', ')}`);
    if (r.repeating) bits.push(`rows: \`#${prefix}-rows\` > \`.${prefix}-row\` > \`.${prefix}-cell-N\``);
    return `- ${bits.join(' — ')}`;
  }).join('\n');
  return `## The scaffold you are designing (already built, already correct)
Root \`.${prefix}\` > box \`.${prefix}-box\` > one element per region:
${regions}
Each text field sits in \`.${prefix}-mask\` > \`span.${prefix}-t\`; images are \`img.${prefix}-image\`.`;
}

export function creativeStyleSystemPrompt(
  spec: CreativeSpec,
  scaffold: CompiledScaffold,
  cards: KnowledgeCard[],
): string {
  return `You are the design stage of NoaCG Studio's creative path. The graphic's structure,
fields, runtime and animation are already built and correct. Your job is the LOOK: the CSS that
turns a correct skeleton into a broadcast graphic somebody would put on air.

${scaffoldSummary(scaffold)}

## The design you are executing
${spec.name} — ${spec.summary}
A ${spec.layout.family}, arranged as a ${spec.layout.arrangement}${spec.layout.fullFrame ? ', full frame' : `, anchored ${spec.layout.zone}`}.
What it must get right: ${spec.designNote || '(nothing further stated)'}

${cardsBlock(cards)}

## The contracts (the platform enforces these; a patch that breaks one is discarded whole)
- Every colour comes from the vars: var(--accent), var(--text-color), var(--text-dim),
  var(--panel-bg). No hardcoded colours. Do NOT redeclare :root or @font-face.
- Every size is calc(N * var(--scale)); every font-size is
  calc(N * var(--scale) * var(--type-scale)).
- Nothing below 20 px at 1080p, and everything inside a 5% safe inset.
- No <script>, no @import, no remote urls, no clip-path.
- You may re-declare \`.${scaffold.prefix}-box\` completely (grid, flex, order, absolute
  placement) — that is how the composition becomes yours rather than the scaffold's.
- Region inner HTML is optional and bounded: keep every id="fN" exactly once, keep an <img>
  an <img>, keep a rows container. Use it for wrappers and decorative elements.

## What good looks like here
One thing read first. Deliberate contrast, not decoration. Air where the content is serious,
energy where the programme earns it. The design must survive its own content: the longest
plausible name, a missing image, four rows or eleven.

Answer with the emit_creative_style tool. No other output.`;
}
