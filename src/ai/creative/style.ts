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
import type { CompiledScaffold, ScaffoldRegion } from './scaffold';
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

/**
 * Strip declarations that would hide scaffold STRUCTURE beyond the animation's reach.
 *
 * The compiled entrance reveals elements by writing INLINE opacity/transform (GSAP), which
 * beats any stylesheet opacity - so a patch may freely start things at `opacity: 0`. But
 * nothing ever writes inline `visibility` or `display`, so a stylesheet
 * `visibility: hidden` / `display: none` on a scaffold element hides it FOREVER: the
 * entrance plays, the element stays invisible, and the bench reports the
 * bench-entrance + bench-replay pair. The versus/lower-third smoke measured exactly this
 * as the dominant staged-arm failure - models re-implement the lifecycle as state classes
 * (`.visible`, `.reset`) nothing will ever toggle, then "fix" the resulting bench findings
 * with more of the same (benchmarks/creative/v1/SMOKE-2026-07-31-vs-lt.md item 6).
 *
 * A LATER CORRECTION worth reading before adding a third clamp here: the same signature
 * dominated the 2026-08-01 pass (31 of 76 staged runs) and this was NOT the cause. Probing the
 * failing frames found every element at opacity 1, visible and displayed - and every box 0x0.
 * They were not hidden, they were EMPTY, because their fields could not render (scaffold.ts's
 * renderability sweep) or the graphic had nothing to display at all. Recompiling all 76
 * archived specs against the fixed scaffold took the signature from 31 to 1. So when this pair
 * appears at scale, measure the boxes before assuming anything hid them.
 *
 * Clamp, don't reject (the round-h precedent), in two strengths:
 *
 * - `visibility: hidden|collapse` and `display: none` are stripped from any rule whose
 *   selector mentions a `.{prefix}*` class or a field id - NOTHING can override them.
 * - `opacity: 0` is stripped only where the rule's SUBJECT (the rightmost compound) is a
 *   scaffold element the animation never touches (cells, masks, text spans, rows, images):
 *   the smoke's patches started those at opacity 0 expecting a `.visible` class to arrive,
 *   and no one ever sends it. On the box and the region elements a stylesheet opacity 0 is
 *   legitimate - the entrance writes inline opacity over it - so there it stays.
 *
 * - `transition` is stripped from scaffold selectors outright. The compiled entrance sets
 *   inline opacity/transform through GSAP; a CSS transition on the same element makes every
 *   one of those writes animate again on the BROWSER's clock, which the timeline does not
 *   own, the control page cannot pause and the render clock cannot drive. Measured on the
 *   first candidate-pass brief (2026-07-31): an arm-D patch put
 *   `transition: opacity 0.3s ease, transform 0.3s ease` on the box and both regions and
 *   produced the same bench-entrance + bench-replay pair as the hides did - a second cause of
 *   one signature. Same house rule as the ticker's setTimeout: motion lives in the timeline.
 *
 * A rule on a patch-invented, un-prefixed class keeps everything: losing a decorative hide
 * is cosmetic while a hidden name strap is a broken graphic, so the clamp errs toward
 * visibility. Flat walk with @media/@supports recursion - model CSS is flat.
 */
export function stripHidingDeclarations(css: string, prefix: string, animated: string[]): string {
  const scaffoldSelector = new RegExp(`\\.${prefix}\\b|\\.${prefix}-|#f\\d+`, 'i');
  const transitionPoison = /(^|;)\s*transition(-property|-duration|-timing-function|-delay)?\s*:[^;]*(?=;|$)/gi;
  const hidePoison = /(^|;)\s*(visibility\s*:\s*(hidden|collapse)|display\s*:\s*none)\s*(?=;|$)/gi;
  const opacityPoison = /(^|;)\s*opacity\s*:\s*0(\.0+)?\s*(?=;|$)/gi;
  /** True when every comma-group's subject is an animated element (box/region/root).
   *  Exact class match - `.creative` must not claim `.creative-cell-1` by prefix. */
  const subjectsAnimated = (selector: string): boolean =>
    selector.split(',').every((group) => {
      const subject = group.trim().split(/[\s>+~]+/).pop() ?? '';
      return animated.some((cls) => new RegExp(`\\.${cls}(?![a-zA-Z0-9_-])`).test(subject));
    });
  let out = '';
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open === -1) { out += css.slice(i); break; }
    const selector = css.slice(i, open);
    // An at-rule with a block (@media, @supports) recurses; its body is rules again.
    if (/@\s*(media|supports)/i.test(selector)) {
      let depth = 1;
      let j = open + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth += 1;
        else if (css[j] === '}') depth -= 1;
        j += 1;
      }
      out += selector + '{' + stripHidingDeclarations(css.slice(open + 1, j - 1), prefix, animated) + '}';
      i = j;
      continue;
    }
    const close = css.indexOf('}', open);
    if (close === -1) { out += css.slice(i); break; }
    let body = css.slice(open + 1, close);
    if (scaffoldSelector.test(selector)) {
      body = body.replace(hidePoison, '$1').replace(transitionPoison, '$1');
      if (!subjectsAnimated(selector)) body = body.replace(opacityPoison, '$1');
    }
    out += selector + '{' + body + '}';
    i = close + 1;
  }
  return out;
}

/**
 * Strip FRAME-FILLING geometry from any rule that also paints an opaque background - on an
 * OVERLAY spec only (owner ruling, 2026-07-31; benchmarks/creative/v1/SMOKE-2026-07-31.md
 * item 5 and -vs-lt.md item 4).
 *
 * The defect both smoke rounds hit, and the staged arms' dominant visual blocker: the style
 * stage shadows the contract tokens on the root (`--panel-bg: #000000` on `.creative` - legal,
 * `:root` is untouched) and makes `.creative-box` a `100vw x 100vh` box painted with it. The
 * graphic floods the frame opaque black. Every gate passed it: a broadcast overlay that covers
 * the video is valid HTML, valid SPX, and nothing anywhere measured frame coverage. It is the
 * clip-path lesson again (src/ai/AGENTS.md) - a deterministic gate cannot catch a defect in a
 * dimension it does not measure, so either measure the dimension or forbid the construct.
 *
 * The ruling splits it by what the SPEC already declares:
 *
 * - `fullFrame: false` (a lower third, a corner card, a side panel) - covering the canvas is
 *   never what was asked for, so the construct is FORBIDDEN here and clamped away.
 * - `fullFrame: true` (a versus card, a results board) - covering is legitimate, so nothing is
 *   stripped and the bench MEASURES it instead: `scripts/creative-plate-visibility.mjs`
 *   reports how much of the known plate each hold frame leaves visible, calibrated against the
 *   catalog's own full-frame designs.
 *
 * Clamp, don't reject (the stripHidingDeclarations precedent), and clamp the GEOMETRY rather
 * than the paint - which half survives decides whether the design does. Dropping the paint
 * leaves an invisible full-frame box with the content sprayed across the canvas: the flood is
 * gone and so is the graphic. Dropping the fill leaves the panel painted at content size in
 * its zone, which is the design the model meant minus the flood. Only the COMBINATION is
 * touched: a full-bleed positioning helper that paints nothing, and an opaque panel that does
 * not fill the frame, are both ordinary design and stay exactly as written.
 *
 * Honest limit, the same one safety.ts and assetIntegrity.ts state: this reads CSS TEXT, not
 * the resolved cascade. It refuses the obvious construct, not a determined one assembled
 * across three rules.
 */
export function stripFrameFlood(css: string): string {
  // Fills the frame: viewport units, or an absolute/fixed box pinned to every edge.
  const fillDecl =
    /(^|;)\s*(width\s*:\s*100vw|height\s*:\s*100vh|min-height\s*:\s*100vh|min-width\s*:\s*100vw|inset\s*:\s*0(px|%)?(\s+0(px|%)?){0,3})\s*(?=;|$)/gi;
  const pinnedToEdges = (body: string): boolean =>
    ['top', 'right', 'bottom', 'left'].every((side) =>
      new RegExp(`(^|;)\\s*${side}\\s*:\\s*0(px|%)?\\s*(?=;|$)`, 'i').test(body));
  const edgeDecl = /(^|;)\s*(top|right|bottom|left)\s*:\s*0(px|%)?\s*(?=;|$)/gi;
  const sizeDecl = /(^|;)\s*(width|height)\s*:\s*100%\s*(?=;|$)/gi;

  /** An opaque paint: a background naming a colour with no alpha < 1 anywhere in it.
   *  `transparent`, `none`, rgba/hsla below 1, an 8- or 4-digit hex, and any gradient that
   *  fades to one of those are all legitimate scrims - broadcast design is full of them. */
  const opaquePaint = (body: string): boolean => {
    const decls = body.split(';').filter((d) => /^\s*background(-color|-image)?\s*:/i.test(d));
    return decls.some((d) => {
      const value = d.slice(d.indexOf(':') + 1).trim();
      if (!value || /^(none|transparent|inherit|initial|unset)$/i.test(value)) return false;
      if (/\btransparent\b/i.test(value)) return false;
      if (/\b(rgba|hsla)\s*\([^)]*?[,/]\s*(0?\.\d+|0)\s*\)/i.test(value)) return false;
      if (/#[0-9a-f]{8}\b|#[0-9a-f]{4}\b/i.test(value)) return false;
      // A colour, a var() holding one, or a gradient of them - all of it paints.
      return /#[0-9a-f]{3,6}\b|\brgb\s*\(|\bhsl\s*\(|\bvar\s*\(|gradient\s*\(|\b(black|white|red|blue|green|gray|grey|navy|maroon|silver|teal|olive|purple|fuchsia|lime|aqua|yellow|orange)\b/i.test(value);
    });
  };

  return eachRule(css, (selector, body) => {
    if (/@\s*(media|supports)/i.test(selector)) return body;   // handled by the walker
    if (!opaquePaint(body)) return body;
    const fills = fillDecl.test(body) || (/position\s*:\s*(absolute|fixed)/i.test(body) && pinnedToEdges(body))
      || (sizeDecl.test(body) && /position\s*:\s*(absolute|fixed)/i.test(body) && /(^|;)\s*(top|left)\s*:\s*0/i.test(body));
    fillDecl.lastIndex = 0;
    sizeDecl.lastIndex = 0;
    if (!fills) return body;
    let out = body.replace(fillDecl, '$1');
    if (pinnedToEdges(out)) out = out.replace(edgeDecl, '$1');
    return out.replace(sizeDecl, '$1');
  });
}

/** Properties whose value is legitimately a bare number, so a missing unit is not a defect.
 *  Everything else in a style patch takes a length, and CSS drops the declaration silently. */
const UNITLESS_OK = new Set([
  'line-height', 'opacity', 'z-index', 'flex', 'flex-grow', 'flex-shrink', 'order', 'zoom',
  'scale', 'aspect-ratio', 'font-weight', 'grid-row', 'grid-column', 'grid-row-start',
  'grid-row-end', 'grid-column-start', 'grid-column-end', 'column-count', 'orphans', 'widows',
  'stroke-width', 'fill-opacity', 'stroke-opacity', 'tab-size', 'animation-iteration-count',
]);

const HAS_UNIT = /\d\s*(px|r?em|%|v[wh]|vmin|vmax|ch|ex|cm|mm|in|pt|pc|q|fr|deg|rad|turn|s|ms)\b/i;

/** The scaffold's own sizing multipliers, and the only vars whose unitlessness this repair is
 *  allowed to assume. Any OTHER `var()` may carry the unit itself - `calc(var(--border) * 2)`
 *  is perfectly valid - so an expression mentioning one is left alone. Both false positives
 *  the archive replay found were exactly that shape. */
const UNITLESS_VARS = /var\(\s*--(scale|type-scale)\s*\)/gi;

/**
 * Give a length its unit back.
 *
 * The 2026-08-01 pass's cause 5: the scaffold writes
 * `font-size: calc(26px * var(--scale) * var(--type-scale))`, the style stage copies the shape
 * and drops the unit - `calc(48 * var(--scale) * var(--type-scale))`. That is not a
 * `<length>`, so the browser DISCARDS the declaration and the text falls back to the default
 * ~16px in a 1920x1080 frame. 469 such declarations across 59 of 155 archived stylesheets; the
 * coder arms, which write plain `font-size: 48px`, were clean - so the scaffold's own pattern
 * is what induces it.
 *
 * Clamp, don't reject (the round-h precedent), and REPAIR rather than strip: the design intent
 * is unambiguous, and dropping the declaration is exactly what the browser already does.
 *
 * The repair is deliberately narrow - a `calc()` built only from bare numbers and the
 * scaffold's two unitless multipliers. Such an expression evaluates to a NUMBER, which no
 * length-typed property accepts, so the rewrite can never change CSS that would have worked.
 * Replayed over all 155 archived stylesheets: 469 repaired, 0 residual, 0 other bytes moved.
 */
export function repairUnitlessLengths(css: string): string {
  // One calc() with at most one nesting level - enough for every shape a style patch writes,
  // and it keeps a value carrying SEVERAL of them (a box-shadow's three offsets) from being
  // swallowed as one match.
  const oneCalc = /calc\([^()]*(?:\([^()]*\)[^()]*)*\)/gi;
  return eachRule(css, (_selector, body) =>
    body.replace(/(^|;)(\s*)([-a-z]+)(\s*:\s*)([^;]+)/gi, (whole, lead, ws, prop, sep, value) => {
      const name = String(prop).toLowerCase();
      if (name.startsWith('--') || UNITLESS_OK.has(name)) return whole;
      const fixed = String(value).replace(oneCalc, (expr) => {
        if (HAS_UNIT.test(expr) || !/\d/.test(expr)) return expr;
        // Every var() must be one we know is a bare multiplier; anything else may carry the
        // unit itself, and `calc(var(--border) * 2)` is perfectly valid.
        if (/var\(/i.test(expr.replace(UNITLESS_VARS, ''))) return expr;
        return expr.replace(/(^|[(\s*/+-])(-?\d*\.?\d+)(?=$|[\s*/)+-])/, (t, pre, num) =>
          Number(num) === 0 ? t : `${pre}${num}px`);
      });
      return `${lead}${ws}${prop}${sep}${fixed}`;
    }),
  );
}

/**
 * Raise any region text set SMALLER than the platform's ladder back up to it.
 *
 * The type ladder in `scaffold.ts` answers emphasis in px so the broadcast type floor cannot be
 * argued away by a model that wanted a delicate caption - but it was only ever a default: the
 * style patch is appended after the scaffold CSS, so any `font-size` the model wrote won at the
 * cascade. The 2026-08-01 re-run shipped legible-but-weak straps for exactly this reason, and
 * the frames read as amateur before anything else about them registers.
 *
 * Clamp, don't reject, and clamp UP ONLY: a design that wants a bigger headline is making a
 * typographic decision, and this takes nothing away from it. It is the floor that is the
 * platform's (§3.4), not the size.
 *
 * Only the leading px term is raised, which is the shape both the scaffold and every observed
 * patch write (`calc(52px * var(--scale) * var(--type-scale))`, or a bare `52px`). A value in
 * some other unit is left alone rather than converted on a guess - `em` depends on a parent
 * this function cannot see.
 */
export function clampTypeFloors(css: string, regions: ScaffoldRegion[], prefix: string): string {
  // The smallest floor in the ladder, for a rule that styles text without naming a region.
  const generic = Math.min(...regions.map((r) => r.typeFloorPx), Infinity);
  const floorFor = (selector: string): number | null => {
    if (!new RegExp(`\\.${prefix}-t\\b|\\.${prefix}-cell`).test(selector)) return null;
    for (const region of regions) {
      if (new RegExp(`\\.${region.selector}(?![a-zA-Z0-9_-])`).test(selector)) return region.typeFloorPx;
    }
    return Number.isFinite(generic) ? generic : null;
  };
  return eachRule(css, (selector, body) => {
    const floor = floorFor(selector);
    if (floor === null) return body;
    return body.replace(/(font-size\s*:\s*)([^;]+)/gi, (whole, lead, value) => {
      const m = String(value).match(/(^|[(\s*/+-])(\d*\.?\d+)px\b/);
      if (!m) return whole;                        // no px term to reason about
      if (Number(m[2]) >= floor) return whole;
      return `${lead}${String(value).replace(m[0], `${m[1]}${floor}px`)}`;
    });
  });
}

/**
 * Keep the composition inside the frame.
 *
 * Emitted AFTER the patch, so it beats it at the cascade - the same mechanism
 * `designAdjust.ts` uses on the grounded path. It caps the box at the title-safe width rather
 * than hiding the overflow: `overflow: hidden` would clip the very text that is running off,
 * turning a visible fault into an invisible one, which is the failure mode this whole pilot
 * keeps rediscovering. A max-width makes long content WRAP inside the safe area instead.
 */
function safeAreaClamp(prefix: string, fullFrame: boolean): string {
  const inset = fullFrame ? '4%' : '5%';           // title-safe; a board may use a little more
  return `/* ── Platform clamp: the frame's edges are not the design's to cross. ── */
.${prefix}-box {
  max-width: calc(100% - ${inset} * 2);            /* long content wraps rather than running off */
  max-height: calc(100% - ${inset} * 2);
}`;
}

/** Walk top-level rules, letting `visit` rewrite each body; @media/@supports recurse.
 *  Shared by both clamps - model CSS is flat, and one walker is one place to be wrong. */
function eachRule(css: string, visit: (selector: string, body: string) => string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open === -1) { out += css.slice(i); break; }
    const selector = css.slice(i, open);
    if (/@\s*(media|supports)/i.test(selector)) {
      let depth = 1;
      let j = open + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth += 1;
        else if (css[j] === '}') depth -= 1;
        j += 1;
      }
      out += selector + '{' + eachRule(css.slice(open + 1, j - 1), visit) + '}';
      i = j;
      continue;
    }
    const close = css.indexOf('}', open);
    if (close === -1) { out += css.slice(i); break; }
    out += selector + '{' + visit(selector, css.slice(open + 1, close)) + '}';
    i = close + 1;
  }
  return out;
}

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
    // …and so must every rows container, or the repeating runtime writes into nothing.
    for (const hostId of region.rowsHostIds) {
      if (countMatches(entry.html, new RegExp(`\\bid="${hostId}"`, 'g')) !== 1) return null;
    }
    // An image field stays an <img>: setFieldValue writes a PATH, and a <div id="fN"> would
    // silently render the path as text.
    for (const id of new Set(ids)) {
      const wasImg = new RegExp(`<img[^>]*\\bid="${id}"`).test(original);
      if (wasImg && !new RegExp(`<img[^>]*\\bid="${id}"`).test(entry.html)) return null;
    }
    html = html.slice(0, range.start) + entry.html + html.slice(range.end);
  }

  // Document-wide, after every region has landed: a field id must exist exactly once. The
  // per-region check above only preserves ids the region ALREADY carried, so a patch could
  // re-add a field the scaffold had put in a hidden holder and ship the id twice - which is
  // what lt-three-line arm D did (PASS-2026-08-01.md cause 4). getElementById then answers
  // with whichever comes first, and update() writes to a coin flip.
  for (const field of template.fields) {
    if (countMatches(html, new RegExp(`\\bid="${field.field}"`, 'g')) !== 1) return null;
  }

  // The elements the compiled animation actually reveals (inline opacity/transform): the
  // root, the box, and the region elements. Everything else scaffold-classed is styling
  // surface only, and a stylesheet opacity 0 there can never be lifted.
  const animated = [prefix, `${prefix}-box`, ...scaffold.regions.map((r) => r.selector)];
  let css = stripHidingDeclarations(patch.css.trim(), prefix, animated);
  // A length with no unit is a declaration the browser throws away - most often the whole type
  // ladder. Repair before the geometry clamps, so they read the values that will really apply.
  css = repairUnitlessLengths(css);
  // The ladder is a floor, not a default: a patch may set bigger type, never smaller.
  css = clampTypeFloors(css, scaffold.regions, prefix);
  // An OVERLAY may not paint the whole frame opaque; a full-frame board may (and is measured
  // instead). The spec decided which this graphic is, at stage 5.
  if (!scaffold.fullFrame) css = stripFrameFlood(css);
  return {
    ...template,
    css: `${template.css}\n\n${CREATIVE_STYLE_MARKER}\n${css}\n\n${safeAreaClamp(prefix, scaffold.fullFrame)}\n`,
    html,
  };
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
    for (const hostId of r.rowsHostIds) {
      bits.push(`rows: \`#${hostId}\` > \`.${prefix}-row\` > \`.${prefix}-cell-N\``);
    }
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
${scaffold.fullFrame
    ? `- This graphic OWNS the frame: it may cover the video, and the reading surface behind the
  words is yours to design. Coverage is measured, not forbidden - a board that earns the whole
  canvas is the point, a wash that merely hides the picture is not.`
    : `- This graphic sits OVER live video, and the picture around it is half the composition.
  Paint the panel the words need - opaque, glassy, a gradient scrim, whatever the design wants -
  at the SIZE the content occupies. The canvas outside it belongs to the video. (A rule that
  both fills the frame and paints it opaque has its fill stripped; the paint is kept.)`}
- The LIFECYCLE is already built: the compiled animation reveals the box and the region
  elements with inline opacity/transform on play(), steps them on next(), and hides them
  on stop(). Style the resting look and let it run — stylesheet \`opacity: 0\` on the box
  or a region is fine (the entrance overrides it inline), but on anything deeper (cells,
  masks, text spans) it stays forever, \`visibility: hidden\` / \`display: none\` on any
  scaffold element stays forever, and state classes like \`.visible\` are never added by
  anything. Nor does the design need a \`transition\`: the timeline already owns the motion,
  and a CSS transition would re-animate every value it writes on a clock the timeline cannot
  drive. The platform strips such declarations rather than discard the patch.

## What good looks like here
One thing read first. Deliberate contrast, not decoration. Air where the content is serious,
energy where the programme earns it. The design must survive its own content: the longest
plausible name, a missing image, four rows or eleven.

Answer with the emit_creative_style tool. No other output.`;
}
