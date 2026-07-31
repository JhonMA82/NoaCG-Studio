// Apply a list of placed-field SPECS to a placed-design template - the ONE composition of
// addPlacedLine + setLineTextStyle + setLineFit every producer of placed text goes through.
//
// It lives in blocks/ (a pure (template) => template transform) because THREE producers need
// the identical sequence and none may own it alone: the Import Graphic wizard's Text step
// (components/wizard/draft.ts), the import-analysis proposal panel (whose accepted
// suggestions become draft specs), and the NoaCG Pro reconstruction compiler (src/ai/pro/).
// A second copy is how "the position shown before create" and "the position in the editor"
// come to disagree.

import type { SpxTemplate } from '../model/types';
import { addPlacedLine, setLineFit, setLineTextStyle } from './designLayout';

/** ONE editable text field to place on a design, in DESIGN px (the artwork's own space -
 *  exactly what addPlacedLine speaks). Structurally the wizard's DesignFieldSpec minus its
 *  draft-local id. */
export interface PlacedFieldSpec {
  /** The operator-facing field name ("Name", "Title") - the control panel's label. */
  title: string;
  /** Representative preview text, seeded as the field default. */
  text: string;
  /** The text anchor in design px (which edge depends on `align`, addPlacedLine's idiom). */
  x: number;
  y: number;
  /** 'point' = free line; 'area' = a box whose width wraps the text. */
  kind: 'point' | 'area';
  /** The area box's slot width in design px (area only). */
  width?: number;
  /** How a long value meets the slot. 'wrap' (the wizard's dragged-box behaviour, the
   *  default) reflows within the width; 'shrink' keeps addPlacedLine's own single-line
   *  data-fit="shrink" - what a lower-third name wants, where a wrapped name is a failed
   *  graphic. */
  fit?: 'wrap' | 'shrink';
  fontId: string | null;
  fontSize: number;
  weight: number | null;
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number | null;
  /** Letter-spacing in design px; null = normal. */
  letterSpacing: number | null;
}

/**
 * Place every spec as a REAL field - addPlacedLine (mask + placement rule + type rule +
 * DataField) then the style/fit patches manual placement applies. A spec addPlacedLine
 * refuses (off-shape template, duplicate wrapper id) is skipped rather than guessed at,
 * matching the wizard's behaviour.
 */
export function applyPlacedFieldSpecs(
  template: SpxTemplate,
  specs: readonly PlacedFieldSpec[],
): SpxTemplate {
  let next = template;
  for (const spec of specs) {
    const added = addPlacedLine(next, {
      title: spec.title,
      ftype: 'textfield',
      text: spec.text,
      at: { x: Math.round(spec.x), y: Math.round(spec.y) },
      fontSize: Math.round(spec.fontSize),
      color: spec.color,
      align: spec.align,
      ...(spec.lineHeight !== null ? { lineHeight: spec.lineHeight } : {}),
      maxWidth: spec.kind === 'area' && spec.width ? Math.round(spec.width) : undefined,
    });
    if (!added) continue;
    next = added.template;
    const styled = setLineTextStyle(next, added.fieldId, {
      ...(spec.fontId !== null ? { fontId: spec.fontId } : {}),
      ...(spec.weight !== null ? { weight: spec.weight } : {}),
      ...(spec.letterSpacing !== null ? { letterSpacing: spec.letterSpacing } : {}),
    });
    if (styled) next = styled;
    if (spec.kind === 'area' && spec.width && spec.fit !== 'shrink') {
      const fitted = setLineFit(next, added.fieldId, { mode: 'wrap', maxWidth: Math.round(spec.width) });
      if (fitted) next = fitted;
    }
  }
  return next;
}
