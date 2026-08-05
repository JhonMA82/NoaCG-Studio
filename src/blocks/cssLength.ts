// Editing the NUMBER inside a token value without disturbing the expression around it.
//
// Theme token values are complete CSS values, never bare numbers (src/model/themeTokens.ts):
// a radius is `calc(16px * var(--scale))`, a tracking is `0.2em`, a blur is `blur(18px)`, and
// a neutral is the keyword `none`. That is deliberate - one token then covers a scaled length,
// a percentage and a keyword without the consuming rule knowing which it got.
//
// It also means a slider cannot simply overwrite the value. Replacing
// `calc(16px * var(--scale))` with `24px` would drop the graphic's size multiplier from the
// radius, so it would stop scaling with everything else - a control that appears to adjust one
// thing and quietly breaks another. So these read the first number out and write a new one
// back INTO the same expression.

export interface CssLength {
  value: number;
  unit: string;
  /** Everything before the number, kept verbatim. */
  prefix: string;
  /** Everything after it, unit included. */
  suffix: string;
}

const NUMBER_RE = /-?\d*\.?\d+/;

/**
 * Read the first number (and its unit) out of a CSS value, keeping the text around it.
 *
 * Returns null for a value with no number in it - the keyword `none`, which is a real state a
 * length control has to leave alone rather than coerce to zero.
 *
 * The surrounding text is carried as a prefix/suffix PAIR rather than as a template with a
 * placeholder in it: `inset 0 0 0 1px rgba(0,0,0,.4)` has spaces before its first number, so
 * any placeholder that could occur naturally in a CSS value would be found in the wrong place
 * and rewrite the keyword instead of the number.
 */
export function parseCssLength(value: string): CssLength | null {
  const v = value.trim();
  const m = NUMBER_RE.exec(v);
  if (!m) return null;
  const suffix = v.slice(m.index + m[0].length);
  return {
    value: parseFloat(m[0]),
    unit: /^(px|em|rem|%|vh|vw|deg|s|ms)/.exec(suffix)?.[1] ?? '',
    prefix: v.slice(0, m.index),
    suffix,
  };
}

/** Put a new number back into the expression the value arrived in. */
export function formatCssLength(len: CssLength, next: number): string {
  // Trim the float noise a range input produces (0.30000000000000004em) without rounding away
  // a tracking value's real precision.
  const n = Math.abs(next) < 1 ? +next.toFixed(4) : +next.toFixed(2);
  return `${len.prefix}${n}${len.suffix}`;
}

/** Does this value carry an editable number at all? */
export function hasCssLength(value: string): boolean {
  return parseCssLength(value) !== null;
}
