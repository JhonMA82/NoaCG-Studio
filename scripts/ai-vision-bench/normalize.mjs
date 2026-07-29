// Turn one measured catalog region into a ground-truth region speaking the analysis
// contract's restricted vocabulary (src/ai/importAnalysis/contract.ts). Kept apart from the
// generator so the authored hostile cases can be normalized through the SAME function -
// two label shapes would make the two halves of the dataset incomparable.

import { fontFromFamily, roleFromTitle } from './groundTruth.mjs';

export function rgbToHex(value) {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value ?? '');
  if (!m) return null;
  const hex = [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('');
  return `#${hex}`;
}

export function normalized(region, toHex = rgbToHex) {
  const font = fontFromFamily(region.fontFamily);
  return {
    kind: 'text',
    bbox: region.bbox,
    // Null when the field title is too generic to map - scoring skips those rather than
    // guessing a role the catalog never declared.
    role: roleFromTitle(region.fieldTitle),
    roleSource: 'derived-from-title',
    /** Kept so an unmapped title can be audited and the map improved deliberately, rather
     *  than role coverage quietly staying low because nobody could see what was missed. */
    sourceTitle: region.fieldTitle,
    sampleText: region.sampleText,
    align: ['left', 'center', 'right'].includes(region.textAlign) ? region.textAlign : undefined,
    typography: {
      classification: font.classification,
      fontId: font.fontId,
      approxWeight: region.fontWeight,
      fontSizeNorm: region.fontSizeNorm,
      color: toHex(region.color),
    },
  };
}
