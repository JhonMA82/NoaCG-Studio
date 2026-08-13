// PHASE 1 BRAND ROUND - the synthetic brand condition, and THE LOGO CONTRACT for a
// GENERATED design (docs/NOACG_PRO_PLAN.md §14 items 0 and 1, docs/PRO_PHASE1_HANDOFF.md).
//
// BENCH-ONLY (see exemplars.ts for the deletion condition). Its only caller is
// scripts/pro-spike.mjs, through run.ts.
//
// Phase 0 proved the checkpoint can design a GENERIC lower third and the owner's verdict was
// that generic output is free-gallery material - Pro's premise is originality conditioned on a
// customer's own brand, which Phase 0 never measured. This file is that condition: an invented
// organisation's name, palette, typeface and REAL mark file (benchmarks/pro/v1/spike/brands.json),
// with the mark's shape, backing and ink MEASURED by `assets/assetInfo.ts` `probeMark` - the same
// content-free descriptor Lite sends (`LiteMarkDescriptor`), so the two tiers describe a mark in
// one vocabulary.
//
// THE LOGO CONTRACT, in one sentence: **the design declares the slot and the platform fills it;
// the model never places the mark.** That is Lite's proven shape (`LiteCatalogEntry.logoSlot`,
// gated by scripts/ai-lite-brand-audit.mjs against a rendered measurement) moved to a world with
// no catalog slot to declare:
//
//   - the DECLARATION is part of the emitted design itself - one `filelist` field bound to an
//     empty `<img id="fN">`, whose geometry and surface are the model's design decisions;
//   - the FILL is deterministic (`fillBrandMark`): bake the file's path into the img, set the
//     field's default, bundle the asset - the fillProLogoSlot recipe, running inside the ground
//     step so every repair round re-emits against a FILLED template;
//   - the GATE is a rendered measurement (`measureRenderedMark`), with the Lite brand audit's
//     own thresholds - because the one defect every deterministic Phase 0 gate passed was a
//     broken-image icon with its alt text showing, and a gate that reads markup instead of the
//     painted frame would pass it again.
//
// The MOTION half has no precedent anywhere (the owner asked for marks that "animate in a
// meaningful and smooth way"): the contract makes the slot part of the entrance/exit like any
// other element, `markMotionState` samples it through the virtual clock, and whether the motion
// is MEANINGFUL stays a human read of the strips - a measurement can only say whether it moved.

import { markShapeFromAspect } from '../liteTypes';
import { fontById, fontFaceCss, fontStack } from '../../model/fonts';
import { replaceDefinitionInHtml } from '../../model/spxDefinition';
import { uniqueAssetPath } from '../../assets/assetUtils';
import type { MarkProbe } from '../../assets/assetInfo';
import type { SpxTemplate } from '../../model/types';

export interface SpikeBrandColor {
  name: string;
  hex: string;
  note: string;
}

/** One synthetic brand, as the fixture declares it and the runner measures it. */
export interface SpikeBrand {
  id: string;
  name: string;
  world: string;
  /** A src/model/fonts.ts id - resolved through the real registry, so a stale fixture throws. */
  typeface: string;
  palette: SpikeBrandColor[];
  mark: {
    /** The bundled asset path the fill writes (images/<file>). */
    path: string;
    /** The mark file as a data URL - what the asset carries and the preview shim resolves. */
    dataUrl: string;
    /** Measured by probeMark at run time, never hand-written (the supportingLineChars rule). */
    probe: MarkProbe;
  };
}

/** The same ink-word cuts the Lite client applies to the identical probe (liteClient.ts). */
export function inkWord(probe: MarkProbe): 'light' | 'dark' | 'mid' {
  return probe.inkLuminance >= 0.65 ? 'light' : probe.inkLuminance <= 0.35 ? 'dark' : 'mid';
}

/** The mark, described to the model in measured facts - shape bucket, backing, ink - in the
 *  vocabulary Lite already uses. Content-free: the pixels never enter the prompt. */
export function markFacts(probe: MarkProbe): string {
  const shape = markShapeFromAspect(probe.aspect);
  const aspect = probe.aspect >= 1
    ? `about ${probe.aspect.toFixed(1)}:1`
    : `about 1:${(1 / probe.aspect).toFixed(1)}`;
  const backing = probe.backing === 'own-field'
    ? 'it brings its own background field, so it reads on any surface'
    : 'its backing is transparent, so its ink composites onto whatever surface you design under it';
  const ink = probe.backing === 'own-field'
    ? ''
    : inkWord(probe) === 'light'
      ? ' Its ink is light (a knockout) - it needs a dark surface to read.'
      : inkWord(probe) === 'dark'
        ? ' Its ink is dark - it needs a light surface to read.'
        : ' Its ink is mid-tone - check the surface you give it keeps it legible.';
  return `a ${shape} (${aspect}); ${backing}.${ink}`;
}

/**
 * The brand section of the user message - identical in both arms, exactly as the exemplar
 * block is the only thing the arms may differ in.
 *
 * The typeface's @font-face is given VERBATIM: the coder prompt teaches no font mechanics
 * beyond the example (measured - src/ai/claudeProvider.ts teaches the :root vars and nothing
 * about @font-face), so the file name is a fact the model cannot guess and should not try.
 */
export function brandBlock(brand: SpikeBrand): string {
  const font = fontById(brand.typeface);
  if (!font) throw new Error(`spike brand "${brand.id}": typeface ${brand.typeface} is not in the font registry`);
  const palette = brand.palette
    .map((c) => `- ${c.name} ${c.hex} - ${c.note}`)
    .join('\n');
  return `## The customer's brand

This graphic is for ONE specific customer, and their identity must DRIVE the design - the
palette is the design's colour system, not a tint over someone else's. An answer that would
look the same for any other organisation has not answered this brief.

- Organisation: ${brand.name} - ${brand.world}.
- Palette (build the graphic's colour system from these; derive shades where you need them):
${palette}
- Typeface: ${font.family}. Set \`--font-heading\` to the stack below and include the @font-face
  verbatim in template.css - the file ships with the graphic:

\`\`\`css
${fontFaceCss(font)}
\`\`\`

  (the stack: \`--font-heading: ${fontStack(font)};\`)
- Brand mark: ${markFacts(brand.mark.probe)}

## The brand mark's slot (the platform fills it)

The customer's mark is a REAL file and the platform places it - you never draw the mark, never
guess its artwork, and never write its src. You declare WHERE it lives, and that declaration is
a design decision like any other:

- Add ONE image field to the SPX definition - \`"ftype": "filelist"\`, title "Logo" - after the
  text fields, bound to \`<img id="fN" class="…-logo" alt="">\` in the markup with NO src
  attribute. The platform bakes the file in before validation; the shared runtime hides the img
  whenever its field is empty.
- Size the slot for the mark measured above: a fixed height with \`width: auto\` and
  \`object-fit: contain\`, so the mark keeps its own proportions - never crop it, round its
  corners, filter it, or scale it unevenly. The mark is the customer's; it arrives as-is.
- Give it clear space (about a quarter of its height on every side) and a surface its ink
  actually reads on. THE SURFACE IS A COMPOSITIONAL ELEMENT, never part of the mark: read your
  design back and ask what the slot's surface IS - a segment of the panel system, an end cap,
  a full-height field. If deleting the mark would leave a small floating plate that belongs to
  nothing, the mark has been given a bounding box rather than a place in the design, which is
  the single most common way a real mark ends up looking pasted onto a finished graphic.
- The mark is part of the composition, so it is part of the motion: bring it in and out inside
  the ANIMATION region with the same intent as the text - it should arrive meaningfully and
  smoothly, never pop in unannounced and never just sit there while the rest of the graphic
  moves.`;
}

// ── The deterministic FILL ─────────────────────────────────────────────────────────────

export interface BrandFillReport {
  /** The filelist field the mark landed in, or null when the design declared no usable slot. */
  slotFieldId: string | null;
  /** The bundled asset path written into the img and the field. */
  path: string | null;
  /** The model wrote its own src despite the contract - repaired (replaced), and recorded,
   *  because a repair that hides the violation would un-measure the contract. */
  hadOwnSrc: boolean;
}

/**
 * Fill the declared slot with the brand's real mark - the fillProLogoSlot recipe (bake the
 * src, set the field's default, bundle the asset), minus the parts that need a compile report.
 *
 * Runs inside the spike's ground step, so a repair round re-emits against a filled template
 * and the validator (armed with the mark's path) screens the template the human will see.
 * Returns the template UNCHANGED (report only) when no filelist field binds to an <img> -
 * absence is the gate's finding, not the fill's.
 */
export function fillBrandMark(
  template: SpxTemplate,
  brand: SpikeBrand,
): { template: SpxTemplate; fill: BrandFillReport } {
  const slot = template.fields.find(
    (f) => f.ftype === 'filelist' && new RegExp(`<img\\b[^>]*\\bid="${f.field}"`).test(template.html),
  );
  if (!slot) return { template, fill: { slotFieldId: null, path: null, hadOwnSrc: false } };

  const wanted = brand.mark.path.split('/').pop() || 'mark.svg';
  const taken = template.assets.some((a) => a.path === `images/${wanted}`);
  const path = taken ? uniqueAssetPath(wanted, template.assets) : `images/${wanted}`;

  const fields = template.fields.map((f) => (f.field === slot.field ? { ...f, value: path } : f));
  let html = replaceDefinitionInHtml(template.html, template.settings, fields);

  let hadOwnSrc = false;
  html = html.replace(new RegExp(`<img\\b[^>]*\\bid="${slot.field}"[^>]*>`), (tag) => {
    if (/\bsrc\s*=/.test(tag)) {
      hadOwnSrc = true;
      tag = tag.replace(/\s*\bsrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/, '');
    }
    return tag.replace(/^<img\b/, `<img src="${path}"`);
  });

  return {
    template: {
      ...template,
      html,
      fields,
      assets: [...template.assets, { path, data: brand.mark.dataUrl }],
    },
    fill: { slotFieldId: slot.field, path, hadOwnSrc },
  };
}

// ── The rendered GATE ──────────────────────────────────────────────────────────────────
//
// The thresholds are the Lite brand audit's (scripts/ai-lite-brand-audit.mjs), so the two
// tiers hold a mark to one standard: minimum legible size, clear space as a ratio of the
// mark's own height, a 2% aspect tolerance, WCAG's 3:1 non-text floor for transparent ink
// (1.5:1 field separation for an own-field mark), and the 1080p title-safe box.

export const MARK_MIN_HEIGHT_PX = 32;
export const MARK_MIN_LOCKUP_WIDTH_PX = 96;
export const MARK_LOCKUP_ASPECT = 3;
export const MARK_CLEAR_RATIO = 0.25;
export const MARK_ASPECT_TOLERANCE = 0.02;
export const MARK_INK_CONTRAST_FLOOR = 3;
export const MARK_FIELD_SEPARATION_FLOOR = 1.5;
export const TITLE_SAFE = { left: 96, right: 1824, top: 54, bottom: 1026 } as const;

// ── The BOUNDING-BOX WELL (the 2026-08-13 round's named defect) ────────────────────────
//
// The owner's blind read, seven times over: a transparent mark sitting on a surface that
// hugs it "looks like a JPEG pasted on top - not acceptable" - while the SAME tone drawn as
// a real compositional element (a banner segment, an end cap) was praised twice. The
// distinction is measurable: a surface that tracks the mark's box on every side is a
// bounding box; one that extends into the composition is a design.
//
// CALIBRATED against that round's own labels (scripts/spike-well-calibrate.mjs, free - the
// code was saved): 7/7 owner-flagged items caught, 4/6 praised items clean. The two
// disagreements are the honest limit and the reason this REPORTS and never gates: the
// identical construction - a ~12px-margin gradient plate on a dark panel - was praised on
// `long-name` and `gradient-accent` and flagged on `news-public`. Same geometry, same tones,
// opposite verdicts; what changed is the brief's WORLD, which is a judgement no rect
// measures. The unambiguous end of the class (margins ~0: the well IS the mark's box, the
// B-08 case) is always a defect.
//
// A well may hug the mark by up to this margin relative to the mark's painted height on
// EVERY side before it reads as a bounding box; extending past it on ANY side (joining a
// panel, running to an edge) is integration.
export const WELL_HUG_RATIO = 0.6;

export interface RenderedMarkReport {
  /** Every failed check, in the audit's code vocabulary (not-painted, aspect-distorted,
   *  cropped, below-min-size, collision, clear-space, outside-box, outside-safe-area,
   *  ink-contrast, field-separation, no-slot). Empty = the mark passed the rendered gate. */
  findings: string[];
  /** The drawn mark size (after object-fit), when painted. */
  paintedW?: number;
  paintedH?: number;
  /** Clear space measured / required, and what sat nearest. */
  clearPx?: number;
  needClearPx?: number;
  nearest?: string;
  /** Ink contrast ratio against the surface the slot actually sits on, when derivable. */
  inkRatio?: number;
  surface?: string;
  notes: string[];
}

function relativeLuminance(rgb: [number, number, number]): number {
  const channel = (value: number): number => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function parseColor(value: string): { rgb: [number, number, number]; alpha: number } | null {
  const m = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (!m) return null;
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: m[4] === undefined ? 1 : Number(m[4]) };
}

/** Whether an element paints anything of its own - text, a background, a border, an image.
 *  Tag names rather than instanceof throughout: iframe-realm elements fail instanceof against
 *  the host page's classes. Shared with the alignment-axis instrument (axisCheck.ts), because
 *  two definitions of "visible element" is how two measurements come to disagree. */
export function paints(el: Element, style: CSSStyleDeclaration): boolean {
  if (['IMG', 'VIDEO', 'CANVAS'].includes(el.tagName)) return true;
  if (el.namespaceURI === 'http://www.w3.org/2000/svg') return true;
  const bg = parseColor(style.backgroundColor);
  if (bg && bg.alpha > 0.05) return true;
  if (style.backgroundImage && style.backgroundImage !== 'none') return true;
  if ((parseFloat(style.borderTopWidth) || 0) > 0 && style.borderTopStyle !== 'none') return true;
  if (style.boxShadow && style.boxShadow !== 'none') return true;
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim()) return true;
  }
  return false;
}

/**
 * Measure the FILLED slot in the settled rendered frame. Pure DOM reads - the caller mounts
 * the document (the runner's hold capture) and passes its iframe document in.
 */
export function measureRenderedMark(doc: Document, fieldId: string, probe: MarkProbe): RenderedMarkReport {
  const report: RenderedMarkReport = { findings: [], notes: [] };
  const el = doc.getElementById(fieldId);
  const win = doc.defaultView;
  // tagName, not instanceof - the element lives in the iframe's realm, whose classes are
  // different objects from the host page's.
  if (!win || !el || el.tagName !== 'IMG') {
    report.findings.push('no-slot');
    return report;
  }
  const img = el as HTMLImageElement;
  const style = win.getComputedStyle(img);
  const rect = img.getBoundingClientRect();

  const hidden = style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.05;
  if (!img.naturalWidth || rect.width < 1 || rect.height < 1 || hidden) {
    report.findings.push('not-painted');
    return report;
  }

  // The drawn image inside the layout box, per object-fit - the audit's computation. The
  // default ('fill') stretches, which is exactly the distortion the as-is contract refuses.
  const natural = img.naturalWidth / Math.max(1, img.naturalHeight);
  const box = rect.width / Math.max(1, rect.height);
  const fit = style.objectFit || 'fill';
  let paintedW = rect.width;
  let paintedH = rect.height;
  if (fit === 'contain' || fit === 'scale-down') {
    if (box > natural) paintedW = rect.height * natural;
    else paintedH = rect.width / natural;
  } else if (fit === 'cover') {
    if (Math.abs(box - natural) / natural > MARK_ASPECT_TOLERANCE) report.findings.push('cropped');
  } else if (fit === 'none') {
    if (img.naturalWidth > rect.width || img.naturalHeight > rect.height) report.findings.push('cropped');
    paintedW = Math.min(rect.width, img.naturalWidth);
    paintedH = Math.min(rect.height, img.naturalHeight);
  } else if (Math.abs(box - natural) / natural > MARK_ASPECT_TOLERANCE) {
    report.findings.push('aspect-distorted');
  }
  report.paintedW = Math.round(paintedW);
  report.paintedH = Math.round(paintedH);

  if (probe.aspect > MARK_LOCKUP_ASPECT ? paintedW < MARK_MIN_LOCKUP_WIDTH_PX : paintedH < MARK_MIN_HEIGHT_PX) {
    report.findings.push('below-min-size');
  }

  // Clear space: the nearest painting element that is not an ancestor (a containing surface
  // is what the mark SITS on) and not the mark itself. Overlap is its own finding.
  const needClear = paintedH * MARK_CLEAR_RATIO;
  let clear = Infinity;
  let nearest = '';
  const all = doc.body.querySelectorAll('*');
  for (const other of all) {
    if (other === img || other.contains(img)) continue;
    if (img.contains(other)) continue;
    const os = (win as Window).getComputedStyle(other);
    if (os.display === 'none' || os.visibility === 'hidden' || parseFloat(os.opacity) < 0.05) continue;
    if (!paints(other, os)) continue;
    const r = other.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    // An element whose box fully contains the mark is a surface, not a neighbour.
    if (r.left <= rect.left && r.right >= rect.right && r.top <= rect.top && r.bottom >= rect.bottom) continue;
    // Skip wrappers of painting CHILDREN only (their children are measured directly).
    const dx = Math.max(r.left - rect.right, rect.left - r.right, 0);
    const dy = Math.max(r.top - rect.bottom, rect.top - r.bottom, 0);
    const gap = Math.hypot(dx, dy);
    if (dx === 0 && dy === 0) {
      report.findings.push('collision');
      nearest = `${other.tagName.toLowerCase()}${other.id ? `#${other.id}` : ''}.${[...other.classList].join('.')}`;
      clear = 0;
      break;
    }
    if (gap < clear) {
      clear = gap;
      nearest = `${other.tagName.toLowerCase()}${other.id ? `#${other.id}` : ''}.${[...other.classList].join('.')}`;
    }
  }
  report.clearPx = Number.isFinite(clear) ? Math.round(clear * 10) / 10 : undefined;
  report.needClearPx = Math.round(needClear * 10) / 10;
  report.nearest = nearest || undefined;
  if (!report.findings.includes('collision') && Number.isFinite(clear) && clear < needClear) {
    report.findings.push('clear-space');
  }

  // Containment: inside the design's own -box (the structure spine names it) and title-safe.
  const boxEl = [...doc.querySelectorAll('[class]')].find((e) =>
    [...e.classList].some((c) => c.endsWith('-box'))) ?? null;
  if (boxEl && !boxEl.contains(img)) {
    report.notes.push('the slot sits outside the design box - placed deliberately or escaped; read the frame');
  } else if (boxEl) {
    const b = boxEl.getBoundingClientRect();
    if (rect.left < b.left - 1 || rect.right > b.right + 1 || rect.top < b.top - 1 || rect.bottom > b.bottom + 1) {
      report.findings.push('outside-box');
    }
  }
  if (rect.left < TITLE_SAFE.left || rect.right > TITLE_SAFE.right
    || rect.top < TITLE_SAFE.top || rect.bottom > TITLE_SAFE.bottom) {
    report.findings.push('outside-safe-area');
  }

  // THE BOUNDING-BOX SCREEN comes before the contrast read, because it decides what the
  // "surface" even is. Two shapes of the same defect on a transparent-backed mark:
  //
  //   - `mark-own-background`: the img ELEMENT paints its own background - the mark's
  //     transparency is defeated at the source, margin zero. Always a box, never a design.
  //   - `bounding-box-well`: the nearest painted ancestor hugs the mark on every side
  //     (within WELL_HUG_RATIO of the painted height). The same surface EXTENDED past that
  //     on any side - joining a panel, running out to an edge - is integration, which the
  //     owner praised on the same tone in the same round.
  if (probe.backing === 'transparent') {
    const ownBg = parseColor(style.backgroundColor);
    if (ownBg && ownBg.alpha >= 0.2) report.findings.push('mark-own-background');
  }

  // Ink contrast, from the DOM rather than the pixels: the first ancestor painting an opaque
  // enough background is the surface the ink composites onto. Honest limit: a gradient or
  // image surface, or bare footage, is reported rather than guessed.
  let surfaceLum: number | null = null;
  let surfaceDesc = '';
  let surfaceEl: Element | null = null;
  for (let p = img.parentElement; p && p !== doc.body; p = p.parentElement) {
    const ps = (win as Window).getComputedStyle(p);
    if (ps.backgroundImage && ps.backgroundImage !== 'none') {
      surfaceDesc = 'gradient-or-image';
      surfaceEl = p;
      break;
    }
    const bg = parseColor(ps.backgroundColor);
    if (bg && bg.alpha >= 0.5) {
      surfaceLum = relativeLuminance(bg.rgb);
      surfaceDesc = ps.backgroundColor;
      surfaceEl = p;
      break;
    }
  }
  if (probe.backing === 'transparent' && surfaceEl
    && !report.findings.includes('mark-own-background')) {
    const s = surfaceEl.getBoundingClientRect();
    const hug = WELL_HUG_RATIO * paintedH;
    const margins = [rect.left - s.left, s.right - rect.right, rect.top - s.top, s.bottom - rect.bottom];
    if (margins.every((m) => m <= hug)) {
      report.findings.push('bounding-box-well');
      report.notes.push(`well hugs the mark (margins ${margins.map((m) => Math.round(m)).join('/')}px`
        + ` vs ${Math.round(hug)}px allowed) - a surface should be a compositional element`);
    }
  }
  const floor = probe.backing === 'own-field' ? MARK_FIELD_SEPARATION_FLOOR : MARK_INK_CONTRAST_FLOOR;
  if (surfaceLum === null) {
    report.surface = surfaceDesc || 'none-found (over footage)';
    report.notes.push(probe.backing === 'own-field'
      ? 'own-field mark - reads on any surface'
      : 'no solid surface behind the mark - ink contrast is footage-dependent; read the frame');
  } else {
    // For an own-field mark the probe's "ink" already includes its own background, which is
    // exactly the tone that has to separate from the surface (the audit's field-separation).
    const ink = probe.inkLuminance;
    const ratio = (Math.max(ink, surfaceLum) + 0.05) / (Math.min(ink, surfaceLum) + 0.05);
    report.inkRatio = Math.round(ratio * 100) / 100;
    report.surface = surfaceDesc;
    if (ratio < floor) {
      report.findings.push(probe.backing === 'own-field' ? 'field-separation' : 'ink-contrast');
    }
  }

  return report;
}

/** The slot's animatable state at one virtual-clock sample - the runner reads it per entrance
 *  frame; "did it move at all" is derived, "was it meaningful" stays the human's question. */
export function markMotionState(doc: Document, fieldId: string): { opacity: number; transform: string } | null {
  const el = doc.getElementById(fieldId);
  if (!el) return null;
  const win = doc.defaultView;
  if (!win) return null;
  const style = win.getComputedStyle(el);
  // The slot may animate through a masked WRAPPER rather than on the img itself - fold the
  // ancestors' opacity/transform in, up to the design root, so wrapper motion still counts.
  let opacity = parseFloat(style.opacity);
  const transforms: string[] = [style.transform !== 'none' ? style.transform : ''];
  for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) {
    const ps = win.getComputedStyle(p);
    opacity *= parseFloat(ps.opacity) || 1;
    if (ps.transform && ps.transform !== 'none') transforms.push(ps.transform);
  }
  return { opacity: Math.round(opacity * 1000) / 1000, transform: transforms.filter(Boolean).join('|') };
}
