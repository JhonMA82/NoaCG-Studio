// Small authoring helpers shared by the editorial and cinematic information-system cards.
// They keep the field-to-DOM contract and empty-line collapse identical while leaving each
// graphic's hierarchy and geometry in its own module.

import type { ResolvedOptions } from '../../../model/wizard';

/** One named field inside the standard info-card reveal mask. */
export function systemMask(
  o: ResolvedOptions,
  index: number,
  className: string,
  indent = '      ',
): string {
  const line = o.lines[index];
  if (!line) return '';
  return (
    `${indent}<!-- ${line.title} (f${index}) - SPX writes directly into this element. -->\n` +
    `${indent}<div class="info-card-mask"><span id="f${index}" class="${className}">${line.sample}</span></div>`
  );
}

/** Several masks in visual order, independent of field order. */
export function systemMasks(
  o: ResolvedOptions,
  lines: Array<[number, string]>,
  indent = '      ',
): string {
  return lines
    .map(([index, className]) => systemMask(o, index, className, indent))
    .filter(Boolean)
    .join('\n');
}

/** Empty operator fields take no layout space. */
export function emptySystemLines(selectors: string[]): string {
  return selectors.map((selector) => `${selector}:empty { display: none; }`).join('\n');
}

/**
 * Light, widely tracked type can paint a fraction beyond its line box. Give reveal masks two
 * scale-aware pixels of vertical breathing room, then cancel that space in flow so the authored
 * rhythm does not change.
 */
export const CINEMATIC_MASK_ROOM_CSS = `.info-card-mask {
  padding-block: calc(2px * var(--scale)); /* keeps light glyph edges inside the reveal mask */
  margin-block: calc(-2px * var(--scale)); /* preserves the authored vertical rhythm */
}`;
