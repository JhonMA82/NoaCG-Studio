// The NoaCG Pro reconstruction compiler: a normalized ProPlan + the concept image become an
// ORDINARY imported-design SpxTemplate (docs/NOACG_PRO_PLAN.md §5). Deterministic - no model
// call, no randomness - and built entirely from the existing funnel: IMPORTED_DESIGN.create()
// for the base, applyPlacedFieldSpecs (addPlacedLine et al.) for every text field,
// addPlacedImageSlot for a requested logo, and small surgical HTML/CSS splices for the
// reconstructed panel shapes. The result opens, animates, validates and exports exactly like
// any other imported design; nothing downstream knows Pro exists.

import type { Resolution, SpxTemplate } from '../../model/types';
import { DEFAULT_GRAPHICS_RESOLUTION } from '../../model/projectFormat';
import type { Zone9 } from '../../model/wizard';
import { IMPORTED_DESIGN, PREFIX } from '../../templates/importedDesign/shared';
import { applyPlacedFieldSpecs } from '../../blocks/designFields';
import { addPlacedImageSlot, placeLine, setSlotSize } from '../../blocks/designLayout';
import { uniqueAssetPath } from '../../assets/assetUtils';
import { eraseRegionFlat, matteRingTransparent } from '../../assets/eraseRegion';
import { PRO_CANVAS, type ProBrief } from './contract';
import type { ProPlan, ProRegionOutcome } from './normalize';

export interface ProCompileReport {
  /** Per interpreted region: what it became. The review step renders this verbatim. */
  outcomes: ProRegionOutcome[];
  textFields: number;
  panelsRebuilt: number;
  flattened: number;
  /** Baked text regions the deterministic flat-fill erase removed from the artwork. */
  textErased: number;
  /** True when the crop's pad ring was flat backdrop and was written as transparency. */
  ringMatted: boolean;
  /** True when the reconstruction covered everything and the raster crop was dropped -
   *  the graphic is pure editable code. */
  artDropped: boolean;
  /** The replaceable logo slot this compile placed, when the brief asked for one AND the
   *  interpretation found a logo area to place it over. `outcomeIndex` addresses the region
   *  the slot belongs to, so a later pass reports against the right line instead of guessing
   *  which of several logo regions it was. Null when no slot was placed. */
  logoSlot: { fieldId: string; wrapperId: string; outcomeIndex: number } | null;
  /** Meaningful regions that ended editable / all meaningful regions (0..1; 1 with none). */
  editability: number;
  /** The independent final-canvas decision applied to the whole design unit. */
  placement: ProPlan['placement'];
  warnings: string[];
}

export interface ProCompileResult {
  template: SpxTemplate;
  report: ProCompileReport;
}

export class ProCompileError extends Error {
  /**
   * What the interpretation call cost before this failure, when it had already been paid for.
   *
   * A throw is where money goes missing: the call completes, the provider bills it, and the
   * exception carries only a sentence. A caller enforcing a spend ceiling has to be able to
   * count what a FAILED attempt cost, or the ceiling drifts upward every time something goes
   * wrong - which is exactly when it matters. Undefined means nothing had been spent yet.
   */
  readonly costUsd?: number;

  constructor(message: string, costUsd?: number) {
    super(message);
    this.costUsd = costUsd;
  }
}

/** The honest line about an EMPTY logo slot sitting over the concept's own placeholder mark.
 *  Exported so `fillProLogoSlot` can retire it BY IDENTITY once it picks a file for that slot -
 *  a copied literal in the second place is how the two come to disagree. */
export const PRO_EMPTY_LOGO_SLOT_WARNING =
  "The concept's own logo mark stays visible in the artwork until a file is picked for the Logo slot.";

/** Load a data URL into pixels. Isolated so the compiler stays testable: only this touches
 *  the DOM image decoder. */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new ProCompileError('The concept image could not be decoded.'));
    image.src = dataUrl;
  });
}

/** Crop the concept to the design unit. PNG on purpose: the crop is the graphic's own
 *  artwork now, and JPEG ringing around crisp vector edges would follow it everywhere. */
async function cropToUnit(dataUrl: string, unit: ProPlan['unit']): Promise<string> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(unit.w));
  canvas.height = Math.max(1, Math.round(unit.h));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ProCompileError('No 2d canvas is available to crop the concept.');
  ctx.drawImage(image, unit.x, unit.y, unit.w, unit.h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/** Express the exact placement through the ordinary editable zone + nudge contract. */
function canvasOptions(plan: ProPlan, resolution: Resolution): {
  zone: Zone9;
  nudge: { x: number; y: number };
  sizeScale: number;
} {
  const factor = Math.min(resolution.width / PRO_CANVAS.width, resolution.height / PRO_CANVAS.height);
  const width = plan.unit.w * plan.placement.scale * factor;
  const height = plan.unit.h * plan.placement.scale * factor;
  const x = plan.placement.xNorm * resolution.width;
  const y = plan.placement.yNorm * resolution.height;
  const hInset = Math.round(resolution.width * 0.0625);
  const bottomInset = Math.round(resolution.height * 0.11);
  let nudgeX = x - hInset;
  if (plan.placement.zone === 'bottom-center') {
    nudgeX = x + width / 2 - resolution.width / 2;
  } else if (plan.placement.zone === 'bottom-right') {
    nudgeX = hInset - (resolution.width - x - width);
  }
  const nudgeY = bottomInset - (resolution.height - y - height);
  return {
    zone: plan.placement.zone,
    nudge: { x: Math.round(nudgeX), y: Math.round(nudgeY) },
    sizeScale: plan.placement.scale,
  };
}

function coverage(outer: { x: number; y: number; w: number; h: number }, inner: { x: number; y: number; w: number; h: number }): number {
  const w = Math.min(outer.x + outer.w, inner.x + inner.w) - Math.max(outer.x, inner.x);
  const h = Math.min(outer.y + outer.h, inner.y + inner.h) - Math.max(outer.y, inner.y);
  const area = inner.w * inner.h;
  return area > 0 && w > 0 && h > 0 ? (w * h) / area : 0;
}

/** An opaque reconstructed panel hides whatever the concept baked underneath it - including
 *  its own placeholder text. That geometry is what makes a clean result possible with one
 *  image call (plan §5). */
function coveredByOpaquePanel(plan: ProPlan, rect: { x: number; y: number; w: number; h: number }): boolean {
  return plan.panels.some((panel) => panel.opacity >= 0.95 && coverage(panel, rect) >= 0.85);
}

/** Insert the reconstructed panel elements DIRECTLY after the artwork line, so they paint
 *  above the raster crop and below every placed text mask (absolutely-positioned siblings
 *  paint in DOM order). This must run AFTER the fields are placed: addPlacedLine inserts a
 *  mask after the last mask-or-art line, so panels already in the document would end up
 *  BEFORE the masks' insertion point - i.e. painted over the text. That shipped once: the
 *  runtime bench measures rects, not paint, so an opaque panel covering every line passed
 *  every check and the gallery screenshot was the first thing that saw it. */
function insertPanels(template: SpxTemplate, plan: ProPlan): SpxTemplate {
  if (plan.panels.length === 0) return template;
  const lines = template.html.split('\n');
  const artIndex = lines.findIndex((line) => line.includes(`class="${PREFIX}-art"`));
  if (artIndex < 0) return template;
  const markup = plan.panels.map((panel, index) =>
    `    <!-- Reconstructed ${panel.shape === 'accent-bar' ? 'accent bar' : 'panel'} - rebuilt from the concept as editable CSS. -->\n` +
    `    <div class="${PREFIX}-panel-${index + 1}"></div>`);
  const html = [...lines.slice(0, artIndex + 1), ...markup, ...lines.slice(artIndex + 1)].join('\n');

  const rules = plan.panels.map((panel, index) => {
    const x = Math.round(panel.x - plan.unit.x);
    const y = Math.round(panel.y - plan.unit.y);
    return `/* Reconstructed ${panel.shape === 'accent-bar' ? 'accent bar' : 'panel'} ${index + 1} - geometry read from the concept image. */
.${PREFIX}-panel-${index + 1} {
  position: absolute;
  left: calc(${x}px * var(--scale));
  top: calc(${y}px * var(--scale));
  width: calc(${Math.round(panel.w)}px * var(--scale));
  height: calc(${Math.round(panel.h)}px * var(--scale));
  background: ${panel.fillCss};${panel.radiusPx > 0 ? `\n  border-radius: calc(${panel.radiusPx}px * var(--scale));` : ''}${panel.opacity < 1 ? `\n  opacity: ${panel.opacity};` : ''}
}`;
  });
  const css = `${template.css}\n/* == Reconstructed shapes (NoaCG Pro) == */\n${rules.join('\n\n')}\n`;
  return { ...template, html, css };
}

/**
 * Compile the plan into a template. `concept` is the generated image as a data URL with its
 * measured pixel size (the same frame the interpretation analyzed).
 */
export async function compileProPlan(
  plan: ProPlan,
  concept: { dataUrl: string; width: number; height: number },
  brief: ProBrief,
  options: { resolution?: Resolution; fps?: number } = {},
): Promise<ProCompileResult> {
  if (plan.graphicType !== 'lower-third') {
    throw new ProCompileError('The concept was not interpreted as a lower third, so it was not compiled.');
  }

  const warnings = [...plan.warnings];
  const resolution = options.resolution ?? DEFAULT_GRAPHICS_RESOLUTION;
  const placement = canvasOptions(plan, resolution);

  // Full reconstruction: when opaque rebuilt shapes cover the whole unit, the raster crop
  // adds nothing - drop it and the graphic is pure code. Guarded on EVERY region being
  // rebuilt: a kept-raster logo, image, or flattened panel lives only in the crop, and
  // dropping the crop would silently delete it.
  const unitRect = { x: plan.unit.x, y: plan.unit.y, w: plan.unit.w, h: plan.unit.h };
  const artDropped = plan.panels.length > 0
    && plan.outcomes.every((outcome) => outcome.treatment === 'rebuild-text' || outcome.treatment === 'rebuild-shape')
    && plan.panels.some((panel) => panel.opacity >= 0.98 && panel.shape === 'panel' && coverage(panel, unitRect) >= 0.96);

  const assets: SpxTemplate['assets'] = [];
  let artPath = '';
  let textErased = 0;
  let ringMatted = false;
  if (!artDropped) {
    let art = await cropToUnit(concept.dataUrl, plan.unit);

    // Baked placeholder text the reconstruction does NOT hide: run the deterministic
    // flat-fill erase (the Import Graphic Prepare step's machinery) over each such region.
    // Only a clean verdict is kept - the Prepare step's fill-anyway button has a human
    // looking at a preview, while this runs unattended, so a non-flat background keeps the
    // original pixels and the honest warning instead of a guessed fill.
    for (const [index, rect] of plan.textRects.entries()) {
      if (coveredByOpaquePanel(plan, rect)) continue;
      const erased = await eraseRegionFlat(art, {
        x: rect.x - plan.unit.x,
        y: rect.y - plan.unit.y,
        width: rect.w,
        height: rect.h,
      });
      if (erased.sampling.uniform) {
        art = erased.dataUrl;
        textErased += 1;
      } else {
        const label = plan.fields[index]?.title ?? `text ${index + 1}`;
        warnings.push(
          `The concept's baked "${label}" text sits on a non-flat background, so it could not be erased cleanly - it stays visible in the artwork under the live field; restyle the panel to cover it or regenerate.`,
        );
      }
    }

    // The pad ring: the sides that still carry pad (their union edge is not a rebuilt opaque
    // panel's) hold a thin band of the concept's own backdrop, visible over real video.
    // Where the whole band is flat it is written as true transparency; a non-flat band is
    // reported, never guessed at (plan §10).
    const pad = plan.unitPad;
    if (pad.left > 0 || pad.top > 0 || pad.right > 0 || pad.bottom > 0) {
      const matte = await matteRingTransparent(art, pad);
      if (matte.uniform) {
        art = matte.dataUrl;
        ringMatted = true;
      } else {
        warnings.push(
          "A thin ring of the concept's backdrop remains around the design - it is not flat enough to remove automatically and can show over live video.",
        );
      }
    }

    artPath = uniqueAssetPath('pro-concept.png', []);
    assets.push({ path: artPath, data: art });
  }

  let template = IMPORTED_DESIGN.create({
    // resolveOptions supplies the graphics defaults (1080p / default fps) when omitted.
    resolution,
    ...(options.fps ? { fps: options.fps } : {}),
    lines: [],
    zone: placement.zone,
    nudge: placement.nudge,
    sizeScale: placement.sizeScale,
    designArt: { path: artPath, width: Math.round(plan.unit.w), height: Math.round(plan.unit.h) },
    importedImages: assets,
    animation: { presetId: plan.animation.presetId, speed: plan.animation.speed, easing: 'auto' },
  });

  if (artDropped) {
    // The bare-art placeholder block paints var(--panel-bg); with the panels carrying the
    // look it must stay invisible.
    template = {
      ...template,
      css: `${template.css}\n/* NoaCG Pro: the design is fully reconstructed - no raster artwork remains. */\n.${PREFIX}-art { background: transparent; }\n`,
    };
  }

  // Text: every field through the one shared funnel, shifted into the crop's space.
  // 'shrink' fit on purpose: a lower-third line is single-row, and a long operator value
  // condenses to its slot instead of wrapping into the line below it.
  const placed = plan.fields.map((field) => ({
    title: field.title,
    text: field.text,
    x: field.x - plan.unit.x,
    y: field.y - plan.unit.y,
    kind: field.kind,
    fit: 'shrink' as const,
    width: field.width,
    fontId: field.fontId,
    fontSize: field.fontSize,
    weight: field.weight,
    color: field.color,
    align: field.align,
    lineHeight: field.lineHeight,
    letterSpacing: field.letterSpacing,
  }));
  template = applyPlacedFieldSpecs(template, placed);

  // A requested logo becomes a real replaceable slot over the concept's logo area. A
  // request the interpretation found no logo area FOR is said out loud - silently
  // omitting the slot is how the first paid round's miss went unexplained.
  let logoSlot: ProCompileReport['logoSlot'] = null;
  if (brief.includeLogo && !plan.logo) {
    warnings.push('A logo slot was requested, but the interpretation found no logo area in the concept - add one from the Data tab, or regenerate.');
  }
  if (brief.includeLogo && plan.logo) {
    const added = addPlacedImageSlot(template, { title: 'Logo' });
    if (added) {
      const wrapperId = `fw${added.fieldId.slice(1)}`;
      template = placeLine(added.template, wrapperId, Math.round(plan.logo.x - plan.unit.x), Math.round(plan.logo.y - plan.unit.y), true);
      template = setSlotSize(template, wrapperId, Math.round(plan.logo.w), Math.round(plan.logo.h), true);
      logoSlot = { fieldId: added.fieldId, wrapperId, outcomeIndex: plan.logo.outcomeIndex };
      if (!artDropped && !coveredByOpaquePanel(plan, plan.logo)) {
        warnings.push(PRO_EMPTY_LOGO_SLOT_WARNING);
      }
    }
  }

  // The reconstructed shapes go in LAST, directly after the art line - between the raster
  // crop and every mask placed above (see insertPanels).
  template = insertPanels(template, plan);

  const textFields = plan.fields.length;
  const panelsRebuilt = plan.panels.length;
  const flattened = plan.outcomes.filter((outcome) => outcome.treatment === 'flattened').length;
  const meaningful = plan.outcomes.filter((outcome) => outcome.kind !== 'decorative');
  const editable = meaningful.filter((outcome) =>
    outcome.treatment === 'rebuild-text' || outcome.treatment === 'rebuild-shape'
    || (outcome.kind === 'logo' && logoSlot !== null));

  return {
    template: { ...template, name: 'Pro lower third' },
    report: {
      outcomes: plan.outcomes,
      textFields,
      panelsRebuilt,
      flattened,
      textErased,
      ringMatted,
      artDropped,
      logoSlot,
      editability: meaningful.length === 0 ? 1 : editable.length / meaningful.length,
      placement: plan.placement,
      warnings,
    },
  };
}
