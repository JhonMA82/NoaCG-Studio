// Put the user's OWN mark in the Pro logo slot.
//
// An as-is upload already asks the concept for a logo area (brief.ts `includeLogo`) and the
// compile already places a real `filelist` slot over it - but the mark itself was never
// bundled, so the graphic shipped with an empty slot and the user's file left behind. This is
// the missing step, and it is DETERMINISTIC: no model call, no measurement, no re-layout. The
// compile decided where the slot is; this only says which file goes in it.
//
// It runs INSIDE the pipeline (pipeline.ts `compileProConcept`, stub.ts `stubCompilePro`),
// between the compile and the injected validator - not on the result afterwards. That
// ordering is the whole point of the as-is contract below: a gate that runs before the fill
// screens a template with an empty slot, which is a different template from the one the user
// gets, and the readiness rows would describe it.
//
// Two contracts it deliberately keeps rather than reinvents:
//
// - **The as-is screen** (assetIntegrity.ts). Baking the `src` into the markup is what ARMS
//   that screen - it finds a protected picture by looking for an `<img>` whose src is one of
//   the protected paths, so before the fill there is nothing for it to find - and the slot's
//   own CSS is already clean by construction (`object-fit: contain`, no filter, no radius,
//   no clip-path, no uneven scale; the rules come from blocks/designLayout.ts
//   addPlacedImageSlot, not from a model). Nothing here writes CSS, so nothing here can
//   violate it; e2e/pro.spec.ts pins both halves - the clean verdict, and that the validator
//   is handed the FILLED template.
// - **The honest report.** A slot that got a file is a different fact from one waiting for
//   one, so the region's outcome line says the mark was placed and the "still waiting"
//   warning is retired by identity (PRO_EMPTY_LOGO_SLOT_WARNING).

import { uniqueAssetPath } from '../../assets/assetUtils';
import type { PurposedImage } from '../../model/imagePurpose';
import { replaceDefinitionInHtml } from '../../model/spxDefinition';
import { PRO_EMPTY_LOGO_SLOT_WARNING, type ProCompileResult } from './compile';

/** Add a class to the element carrying `id`, whatever order its attributes are written in. */
function addClass(html: string, id: string, className: string): string {
  return html.replace(new RegExp(`<div\\b([^>]*\\bid="${id}"[^>]*)>`), (_whole, attrs: string) =>
    /\bclass="/.test(attrs)
      ? `<div${attrs.replace(/\bclass="([^"]*)"/, `class="$1 ${className}"`)}>`
      : `<div${attrs} class="${className}">`);
}

/**
 * Fill the compiled logo slot with the first "use it as it is" upload.
 *
 * Returns the result UNCHANGED when there is no slot, no upload, or the upload is a
 * vision-only reference (`layout`/`mood`/`plate` are never bundled - model/imagePurpose.ts).
 * The mark keeps its uploaded path wherever that path is free, because the as-is screen was
 * armed with exactly those paths before the compile ran.
 */
export function fillProLogoSlot<T extends ProCompileResult>(result: T, mark: PurposedImage | null): T {
  const slot = result.report.logoSlot;
  if (!slot || !mark || mark.purpose !== 'asset') return result;

  const template = result.template;
  const taken = template.assets.some((asset) => asset.path === mark.asset.path);
  const path = taken
    ? uniqueAssetPath(mark.asset.path.split('/').pop() || 'logo.png', template.assets)
    : mark.asset.path;

  // The DEFINITION's DataField value: an SPX image field carries the picked file's relative
  // path, and the wizard derives the project's sample data from these defaults on create
  // (templateStore syncSampleData), so one write serves both.
  const fields = template.fields.map((field) =>
    field.field === slot.fieldId ? { ...field, value: path } : field);
  let html = replaceDefinitionInHtml(template.html, template.settings, fields);
  // …and the markup, so the mark is there before the first update() - the same recipe the
  // catalog's built-in logo slots use (templates/shared/logoSlot.ts). `has-image` is the
  // state the shared setFieldValue would toggle on: with a file in the slot, the empty-slot
  // dashed outline must not be the graphic's starting look.
  html = html.replace(
    new RegExp(`(<img\\b[^>]*\\bid="${slot.fieldId}")`),
    (_whole, open: string) => `${open} src="${path}"`,
  );
  html = addClass(html, slot.wrapperId, 'has-image');

  const outcomes = result.report.outcomes.map((outcome, index) =>
    index === slot.outcomeIndex
      ? { ...outcome, note: `Your uploaded mark was bundled as ${path} and set as the Logo slot's value.` }
      : outcome);
  const warnings = result.report.warnings.filter((warning) => warning !== PRO_EMPTY_LOGO_SLOT_WARNING);
  if (mark.binding === 'fixed') {
    // "Always this picture" cannot be honoured yet: v1's slot IS an operator field. Said out
    // loud rather than quietly ignored - the same rule as the missing-logo-area warning.
    warnings.push('You marked this picture "always this picture", but the Pro tier places it in an operator-swappable Logo field - remove the field from the Data tab if it must be permanent.');
  }

  return {
    ...result,
    template: { ...template, html, fields, assets: [...template.assets, { path, data: mark.asset.data }] },
    report: { ...result.report, outcomes, warnings },
  };
}
