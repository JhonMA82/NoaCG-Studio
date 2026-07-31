// Stage 6 - COMPILE (docs/CREATIVE_MODE_PLAN.md §3.2): the deterministic half of the leading
// hypothesis, "scaffold + style". The platform builds the whole ENGINEERING skeleton from a
// CreativeSpec - fields and SPX definition, runtime JS, the list-data rebuild, the marked
// ANIMATION region, the structure contract, the safe-area geometry - and the model then
// authors the DESIGN on top of it through the stage-7 gate (style.ts).
//
// Everything in §3.4's platform column is decided here and nowhere else, which is what makes
// a CREATE result correct by construction in every dimension a validator can check.
//
// THE KNOWN RISK, named in the plan (§3.3): a scaffold that pre-decides too much turns every
// CREATE result into a reskin of one skeleton. This compiler therefore fixes only what the
// PLATFORM must own and leaves composition genuinely open: the regions and their order come
// from the spec, the box's arrangement is a single overridable rule, each region is a marked
// slot the style stage may re-compose inside, and nothing here paints a look. The pilot's
// diversity and similarity criteria (§11.5, §11.6) are what test whether that is enough.

import type { SpxField, SpxTemplate } from '../../model/types';
import { definitionScriptBlock } from '../../model/spxDefinition';
import { DEFAULT_SETTINGS } from '../../model/types';
import { fontById, fontFaceCss, fontStack } from '../../model/fonts';
import type { StructuralIntent } from '../../model/structuralIntent';
import {
  DATA_SOURCE_CLASS,
  dataSourceCss,
  documentHtml,
  ESCAPE_HTML_JS,
  resetCanvasCss,
  runtimeJs,
  zoneCssText,
} from '../../templates/shared/base';
import { emitAnimRegion } from '../../templates/shared/animRuntime';
import type { AnimData, AnimStep } from '../../blocks/animData';
import type { GenerateContext } from '../provider';
import type { CreativeRegionSpec, CreativeSpec } from './contracts';

/** The structure contract's class prefix for every CREATE result. One prefix, so the editor,
 *  the canvas, the timeline and the Style panel find a creative graphic's parts exactly as
 *  they find a catalog design's (src/model/structure.ts). */
export const CREATIVE_PREFIX = 'creative';

/** A region as the style stage sees it: an id, its selector, and whether it repeats. */
export interface ScaffoldRegion {
  id: string;
  /** The region element's own class - `.creative-r-<id>`. */
  selector: string;
  repeating: boolean;
  emphasis: CreativeRegionSpec['emphasis'];
  /** The field ids rendered inside it, in order. */
  fieldIds: string[];
}

export interface CompiledScaffold {
  template: SpxTemplate;
  regions: ScaffoldRegion[];
  prefix: string;
}

// ── The type ladder ──────────────────────────────────────────────────────────
//
// Sizes are the PLATFORM's, not the emit's (§3.4): the spec asks for emphasis and the ladder
// answers in px, so the 20 px type floor (DESIGN_LANGUAGE §2) cannot be argued away by a
// model that wanted a delicate caption. A style patch may still resize - and the runtime
// bench's readability findings are what police that, exactly as they do for a catalog design.
const TYPE_LADDER: Record<CreativeRegionSpec['emphasis'], { px: number; lineHeight: number }> = {
  primary: { px: 52, lineHeight: 1.08 },
  secondary: { px: 28, lineHeight: 1.25 },
  support: { px: 22, lineHeight: 1.3 },
};

const WEIGHTS: Record<string, number> = { regular: 400, semibold: 600, bold: 700, black: 800 };
const TRACKING: Record<string, string> = { tight: '-0.01em', normal: '0', wide: '0.06em' };

const ARRANGEMENT_CSS: Record<CreativeSpec['layout']['arrangement'], string> = {
  stack: 'display: flex;\n  flex-direction: column;\n  align-items: flex-start;',
  row: 'display: flex;\n  flex-direction: row;\n  align-items: center;',
  grid: 'display: grid;\n  grid-auto-flow: row;\n  align-items: start;',
  split: 'display: grid;\n  grid-auto-flow: column;\n  align-items: center;\n  justify-items: center;',
};

const safeId = (id: string): string => id.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'region';

// ── Fields: the platform owns every id ───────────────────────────────────────

interface FieldPlan {
  /** intent field key -> the fN id it compiled to. */
  byKey: Map<string, { id: string; role: string; label: string; sample: string }>;
  fields: SpxField[];
  /** The list field's fN id, when the graphic has repeating content. */
  listFieldId: string | null;
}

function planFields(intent: StructuralIntent, spec: CreativeSpec): FieldPlan {
  const declared = intent.fields.slice(0, 12);
  const wantsList = spec.regions.some((r) => r.repeating) || intent.parts.some((p) => p.repeating);
  const hasList = declared.some((f) => f.role === 'list');

  // A repeating region with no declared list field still gets one: repeating content rides
  // ONE textarea by house convention, and a graphic the operator cannot type into is not a
  // result. The synthesized field is named after the repeating region it serves.
  const repeatingRegion = spec.regions.find((r) => r.repeating);
  const plan = [...declared];
  if (wantsList && !hasList) {
    plan.push({
      key: repeatingRegion?.id ?? 'rows',
      role: 'list',
      label: repeatingRegion ? `${repeatingRegion.role} rows` : 'Rows',
      sample: '',
    });
  }

  const byKey = new Map<string, { id: string; role: string; label: string; sample: string }>();
  const fields: SpxField[] = [];
  let listFieldId: string | null = null;

  plan.forEach((f, i) => {
    const id = `f${i}`;
    const label = f.label || f.key;
    const sample = sampleFor(f, repeatingRegion);
    byKey.set(f.key, { id, role: f.role, label, sample });
    if (f.role === 'list') listFieldId ??= id;
    fields.push({
      field: id,
      ftype: f.role === 'list' ? 'textarea'
        : f.role === 'number' ? 'number'
        : f.role === 'logo' || f.role === 'image' ? 'filelist'
        : 'textfield',
      title: label,
      value: sample,
      ...(f.role === 'logo' || f.role === 'image'
        ? { assetfolder: './images/', extension: 'png' }
        : {}),
    });
  });

  return { byKey, fields, listFieldId };
}

/** A realistic default value, so the graphic says something the moment it is opened - and so
 *  the runtime bench and the structural check measure a populated frame, never an empty one. */
function sampleFor(
  field: StructuralIntent['fields'][number],
  repeatingRegion?: CreativeRegionSpec,
): string {
  if (field.sample) return field.sample;
  if (field.role !== 'list') return field.label || '';
  // A list needs enough lines for the repeating structure to READ as one (the structural
  // check wants three), with the item's own columns filled in.
  const cols = repeatingRegion?.itemParts?.length ? repeatingRegion.itemParts : ['Item', 'Value'];
  return [1, 2, 3, 4]
    .map((n) => cols.map((c, i) => (i === 0 ? `${c} ${n}` : `${c}`)).join(' | '))
    .join('\n');
}

// ── Markup ───────────────────────────────────────────────────────────────────

const REGION_OPEN = (id: string) => `      <!-- region:${id} — the style stage may re-compose INSIDE this element. -->`;

function regionMarkup(
  region: CreativeRegionSpec,
  plan: FieldPlan,
  fieldIds: string[],
  prefix: string,
): string {
  const cls = `${prefix}-r-${safeId(region.id)}`;
  const inner: string[] = [];

  if (region.repeating) {
    // The repeating structure is built by the runtime from the list field, so the markup
    // carries only the container the rebuild writes into (one direct child per item).
    inner.push(`        <div class="${prefix}-rows" id="${prefix}-rows"><!-- rows are rebuilt from the list field --></div>`);
  }

  for (const id of fieldIds) {
    const entry = [...plan.byKey.values()].find((v) => v.id === id);
    if (!entry) continue;
    if (entry.role === 'list' || entry.role === 'hidden') continue; // holders are emitted once, below
    if (entry.role === 'logo' || entry.role === 'image') {
      inner.push(
        `        <!-- ${entry.label} (${entry.id}) — SPX writes the picked file's path here. -->\n` +
        `        <img id="${entry.id}" class="${prefix}-image" alt="" />`,
      );
      continue;
    }
    inner.push(
      `        <!-- ${entry.label} (${entry.id}) — SPX writes this field's value straight into the element. -->\n` +
      `        <div class="${prefix}-mask"><span id="${entry.id}" class="${prefix}-t">${entry.sample}</span></div>`,
    );
  }

  if (!inner.length) inner.push(`        <!-- ${region.role} -->`);
  return `${REGION_OPEN(region.id)}\n      <div class="${prefix}-region ${cls}" data-region="${safeId(region.id)}">\n${inner.join('\n')}\n      </div>`;
}

// ── The list-data runtime ────────────────────────────────────────────────────

/** The generic repeating-data rebuild: one hidden textarea, one item per line, `|` between an
 *  item's parts (the canonical house convention - src/templates/AGENTS.md). Operator text is
 *  escaped at the data boundary, and the initial paint runs behind a DOM-ready guard because
 *  template.js loads in <head> in an export. */
function listRuntimeJs(prefix: string, listFieldId: string, columns: string[]): string {
  const cols = columns.length ? columns : ['Item', 'Value'];
  return `${ESCAPE_HTML_JS}

// rebuildRows(): the repeating structure. The operator types one item per line into ${listFieldId};
// "|" separates an item's parts (${cols.join(' | ')}). Every item becomes ONE .${prefix}-row, so
// adding an item is typing a line — the template never grows more fields.
function rebuildRows() {
  var source = document.getElementById('${listFieldId}');
  var host = document.getElementById('${prefix}-rows');
  if (!source || !host) return;
  var lines = String(source.textContent || '').split('\\n');
  var html = '';
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;                       // a blank line is not an empty row
    var parts = line.split('|');
    var cells = '';
    for (var c = 0; c < parts.length; c++) {
      cells += '<span class="${prefix}-cell ${prefix}-cell-' + (c + 1) + '">' + escapeHtml(parts[c].trim()) + '</span>';
    }
    html += '<div class="${prefix}-row" data-index="' + (i + 1) + '">' + cells + '</div>';
  }
  host.innerHTML = html;
}

// The list arrives through update() like any other field, so rebuild after every write and
// once at load for the editor's first paint.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', rebuildRows);
} else {
  rebuildRows();
}`;
}

// ── Motion ───────────────────────────────────────────────────────────────────

const CHARACTER_TRACKS: Record<CreativeSpec['motion']['character'], (i: number) => Record<string, { time: number; value: number | string }[]>> = {
  rise: () => ({ opacity: [{ time: 0, value: 0 }, { time: 0.35, value: 1 }], y: [{ time: 0, value: 28 }, { time: 0.4, value: 0 }] }),
  glide: () => ({ opacity: [{ time: 0, value: 0 }, { time: 0.3, value: 1 }], x: [{ time: 0, value: -48 }, { time: 0.45, value: 0 }] }),
  fade: () => ({ opacity: [{ time: 0, value: 0 }, { time: 0.5, value: 1 }] }),
  snap: () => ({ opacity: [{ time: 0, value: 0 }, { time: 0.12, value: 1 }], scaleY: [{ time: 0, value: 0.86 }, { time: 0.3, value: 1 }] }),
  wipe: () => ({
    opacity: [{ time: 0, value: 0 }, { time: 0.1, value: 1 }],
    clipPath: [{ time: 0, value: 'inset(0 100% 0 0)' }, { time: 0.5, value: 'inset(0 0% 0 0)' }],
  }),
};

const EASE_IN: Record<CreativeSpec['motion']['character'], string> = {
  rise: 'power3.out', glide: 'power3.out', fade: 'power2.out', snap: 'back.out(1.6)', wipe: 'power4.out',
};

/**
 * The animation data: an entrance that follows the spec's entrance order, one middle step per
 * declared state, and an exit. Real keyframes, so the timeline dock, the canvas and the Style
 * panel edit a CREATE result exactly as they edit a wizard one.
 */
function buildAnimData(spec: CreativeSpec, regions: ScaffoldRegion[], prefix: string): AnimData {
  const order = spec.motion.entranceOrder.length ? spec.motion.entranceOrder : regions.map((r) => r.id);
  const ordered = order
    .map((id) => regions.find((r) => r.id === id))
    .filter((r): r is ScaffoldRegion => Boolean(r));
  const rest = regions.filter((r) => !ordered.includes(r));
  const entrance = [...ordered, ...rest];

  // Regions a state reveals do NOT arrive with the entrance - that is what makes the state a
  // real second beat rather than a re-run of something already on screen.
  const revealed = new Set((spec.states ?? []).flatMap((s) => s.revealRegions ?? []));
  const staggerStep = 0.09;

  const inLayers: Record<string, Record<string, { time: number; value: number | string }[]>> = {
    [`.${prefix}-box`]: { opacity: [{ time: 0, value: 0 }, { time: 0.25, value: 1 }] },
  };
  entrance.filter((r) => !revealed.has(r.id)).forEach((region, i) => {
    const tracks = CHARACTER_TRACKS[spec.motion.character](i);
    const at = 0.1 + i * staggerStep;
    inLayers[`.${region.selector}`] = Object.fromEntries(
      Object.entries(tracks).map(([prop, keys]) => [prop, keys.map((k) => ({ ...k, time: +(k.time + at).toFixed(2) }))]),
    );
  });

  const steps: AnimStep[] = [
    {
      name: 'In',
      duration: +(spec.motion.seconds + entrance.length * staggerStep).toFixed(2),
      ease: EASE_IN[spec.motion.character],
      layers: inLayers,
    },
  ];

  for (const state of spec.states ?? []) {
    const targets = (state.revealRegions ?? []).map((id) => regions.find((r) => r.id === id)).filter(Boolean) as ScaffoldRegion[];
    if (!targets.length) continue;
    steps.push({
      name: state.id,
      duration: 0.6,
      ease: 'power3.out',
      reveals: targets.map((t) => `.${t.selector}`),
      layers: Object.fromEntries(
        targets.map((t) => [`.${t.selector}`, { opacity: [{ time: 0, value: 0 }, { time: 0.4, value: 1 }], y: [{ time: 0, value: 18 }, { time: 0.45, value: 0 }] }]),
      ),
    });
  }

  steps.push({
    name: 'Out',
    duration: 0.5,
    ease: 'power2.in',
    layers: { [`.${prefix}`]: { opacity: [{ time: 0, value: 1 }, { time: 0.35, value: 0 }] } },
  });

  return { version: 2, root: `.${prefix}`, speed: 1, steps };
}

// ── The compile ──────────────────────────────────────────────────────────────

export function compileScaffold(
  spec: CreativeSpec,
  intent: StructuralIntent,
  ctx?: GenerateContext,
): CompiledScaffold {
  const prefix = CREATIVE_PREFIX;
  const resolution = ctx?.resolution ?? { width: 1920, height: 1080, label: '1080p' };
  const scale = +(spec.layout.sizeScale * Math.min(resolution.width / 1920, resolution.height / 1080)).toFixed(3);
  const font = fontById(spec.fontId);
  const plan = planFields(intent, spec);

  // Field -> region. A field no region claimed still renders: it lands in the first region,
  // because a declared datum with nowhere to go is exactly the brief-satisfaction failure the
  // verify stage exists to catch, and losing it silently at compile time would be worse.
  const claimed = new Set<string>();
  const regionFields = new Map<string, string[]>();
  for (const region of spec.regions) {
    const ids: string[] = [];
    for (const key of region.fieldKeys ?? []) {
      const entry = plan.byKey.get(key);
      if (entry && !claimed.has(entry.id)) {
        claimed.add(entry.id);
        ids.push(entry.id);
      }
    }
    regionFields.set(region.id, ids);
  }
  const unclaimed = [...plan.byKey.values()].filter((v) => !claimed.has(v.id) && v.role !== 'list' && v.role !== 'hidden');
  if (unclaimed.length && spec.regions.length) {
    const first = spec.regions[0].id;
    regionFields.set(first, [...(regionFields.get(first) ?? []), ...unclaimed.map((v) => v.id)]);
  }

  const regions: ScaffoldRegion[] = spec.regions.map((r) => ({
    id: r.id,
    selector: `${prefix}-r-${safeId(r.id)}`,
    repeating: Boolean(r.repeating),
    emphasis: r.emphasis,
    fieldIds: regionFields.get(r.id) ?? [],
  }));

  // The hidden holders: SPX writes into them, the runtime reads them, nothing draws them.
  const holders = [...plan.byKey.values()]
    .filter((v) => v.role === 'list' || v.role === 'hidden')
    .map((v) =>
      `      <!-- ${v.label} (${v.id}) — input only: SPX writes it, the runtime reads it. -->\n` +
      `      <div id="${v.id}" class="${DATA_SOURCE_CLASS}">${v.sample.replace(/\n/g, '&#10;')}</div>`,
    );

  const body = `  <!-- The graphic's root. Everything inside is one design; play() reveals it. -->
  <div class="${prefix}">
    <div class="${prefix}-box">
${spec.regions.map((r) => regionMarkup(r, plan, regionFields.get(r.id) ?? [], prefix)).join('\n')}
    </div>
${holders.join('\n')}
  </div>`;

  const settings = {
    ...DEFAULT_SETTINGS,
    description: spec.name,
    playlayer: '7',
    webplayout: '7',
    steps: String(1 + (spec.states?.length ?? 0)),
    uicolor: '3',
  };

  const html = documentHtml({
    title: spec.name,
    definitionBlock: definitionScriptBlock(settings, plan.fields),
    body,
  });

  const css = scaffoldCss(spec, regions, prefix, scale, font, resolution);

  const repeatingRegion = spec.regions.find((r) => r.repeating);
  const extraJs = plan.listFieldId
    ? `${listRuntimeJs(prefix, plan.listFieldId, repeatingRegion?.itemParts ?? [])}\n\n`
    : '';
  const animData = buildAnimData(spec, regions, prefix);
  // The list rebuild has to run after every update(), and update() is the shared runtime's -
  // so the hook is the same optional-global idiom the text-fit runtime uses.
  const js = runtimeJs(spec.name, `${extraJs}${emitAnimRegion(animData)}`)
    .replace(
      "  if (typeof fitPlacedText === 'function') fitPlacedText();",
      "  if (typeof rebuildRows === 'function') rebuildRows();\n" +
      "  if (typeof fitPlacedText === 'function') fitPlacedText();",
    );

  const template: SpxTemplate = {
    name: spec.name,
    type: spec.layout.fullFrame ? 'fullscreen' : 'lower-third',
    resolution,
    fps: ctx?.fps ?? 25,
    html,
    css,
    js,
    fields: plan.fields,
    settings,
    assets: [...(ctx?.images ?? []), ...(ctx?.customFont ? [ctx.customFont.asset] : [])],
    layers: plan.fields
      .filter((f) => f.ftype === 'textfield' || f.ftype === 'number')
      .map((f) => ({ id: f.field, type: 'text' as const, label: f.title, fieldId: f.field, text: f.value, styles: {} })),
  };

  return { template, regions, prefix };
}

// ── The stylesheet ───────────────────────────────────────────────────────────

function scaffoldCss(
  spec: CreativeSpec,
  regions: ScaffoldRegion[],
  prefix: string,
  scale: number,
  font: ReturnType<typeof fontById>,
  resolution: { width: number; height: number },
): string {
  const position = spec.layout.fullFrame
    ? `  inset: 0;                        /* a full-frame graphic owns the canvas */
  display: flex;
  align-items: center;
  justify-content: center;`
    : zoneCssText(spec.layout.zone, { x: 0, y: 0 }, resolution as never);

  const regionRules = regions.map((region) => {
    const spec_ = spec.regions.find((r) => r.id === region.id);
    const type = TYPE_LADDER[region.emphasis];
    const weight = WEIGHTS[spec_?.typography?.weight ?? 'semibold'] ?? 600;
    const tracking = TRACKING[spec_?.typography?.tracking ?? 'normal'] ?? '0';
    const upper = spec_?.typography?.caseStyle === 'upper';
    return `/* ── ${region.id} (${region.emphasis}) ── */
.${region.selector} .${prefix}-t {
  font-size: calc(${type.px}px * var(--scale) * var(--type-scale));
  font-weight: ${weight};
  line-height: ${type.lineHeight};
  letter-spacing: ${tracking};${upper ? '\n  text-transform: uppercase;' : ''}
  color: ${region.emphasis === 'primary' ? 'var(--text-color)' : 'var(--text-dim)'};
}`;
  }).join('\n\n');

  return `/* ${spec.name} — generated by NoaCG Studio. Edit freely: this file is yours. */

/* ── Style contract: change these variables to retint the whole graphic. ── */
:root {
  --accent: ${spec.palette.accent};
  --text-color: ${spec.palette.text};
  --text-dim: ${spec.palette.textDim};
  --panel-bg: ${spec.palette.panel};
  --font-heading: ${fontStack(font)};
  --scale: ${scale};
  --type-scale: 1;
}

${fontFaceCss(font)}

${resetCanvasCss(resolution as never)}

${dataSourceCss}

/* ── Root position ── */
.${prefix} {
  position: absolute;
${position}
  opacity: 0;                      /* hidden until play() runs the entrance */
}

/* ── The composition. One rule owns how the regions relate; the design layer below may
   replace it entirely — this is the starting arrangement, not a cage. ── */
.${prefix}-box {
  ${ARRANGEMENT_CSS[spec.layout.arrangement]}
  gap: calc(14px * var(--scale));
  max-width: ${spec.layout.fullFrame ? '100%' : 'min(calc(840px * var(--scale)), ' + Math.round(resolution.width * 0.875) + 'px)'};
  will-change: transform, opacity;
}

.${prefix}-mask {
  overflow: hidden;                /* lines animate in from behind this mask */
}
.${prefix}-mask > span {
  display: inline-block;
  overflow-wrap: break-word;
}
.${prefix}-region {
  min-width: 0;                    /* a grid/flex item refuses to shrink without this */
}
.${prefix}-image {
  max-height: calc(96px * var(--scale));
  width: auto;
}

/* ── Repeating rows: built by rebuildRows() from the list field. ── */
.${prefix}-rows {
  display: flex;
  flex-direction: column;
  gap: calc(8px * var(--scale));
}
.${prefix}-row {
  display: flex;
  align-items: baseline;
  gap: calc(16px * var(--scale));
}
.${prefix}-cell {
  font-size: calc(26px * var(--scale) * var(--type-scale));
  color: var(--text-color);
}
.${prefix}-cell-1 {
  color: var(--accent);            /* the item's leading part */
}

${regionRules}
`;
}
