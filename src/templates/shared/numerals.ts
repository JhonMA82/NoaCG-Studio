// THE NUMERALS CONTRACT — what a live number is set in.
//
// A clock, a countdown, a score, a vote tally and a count-up all repaint the same box several
// times a second. With proportional figures "11:11" is narrower than "00:00", so the box
// twitches on every tick and the graphic reads as amateur — DESIGN_LANGUAGE §1's numerals rule.
//
// Two declarations are needed, and BOTH matter:
//
//   font-variant-numeric: tabular-nums   asks the face for equal-width digits
//   font-family: var(--font-numeric)     guarantees a face that HAS them
//
// The second exists because the first silently does nothing on a typeface without the `tnum`
// feature. Five of the seventeen bundled faces are in that class (measured — Playfair Display,
// Libre Franklin, Anton, Big Shoulders, DM Sans; DM Sans's digits vary by 41% of the em), and a
// user may import any typeface at all. `--font-numeric` resolves to the graphic's own heading
// face where that face can hold a number's width and to a monospaced stack where it cannot
// (model/fonts.ts `numericFontStack`), so the design keeps its voice wherever it honestly can.
//
// Use `NUMERIC_FIGURES` for anything that CHANGES on air. A static figure typed once — a year
// in a credits block, a rank in a results row — does not need it, and `scripts/numerals.mjs`
// only measures the categories where numbers actually move.

/** The two declarations, ready to interpolate into a rule. Indented for a nested block. */
export const NUMERIC_FIGURES = `font-family: var(--font-numeric);  /* a face whose digits are all one width */
  font-variant-numeric: tabular-nums;  /* every digit the same width — no jitter on the tick */`;

/**
 * The same rule for a design that has already set its own `font-family` and only needs the
 * figures evened out. Rare and worth a second thought: it is only correct when the face is
 * KNOWN to carry tabular figures (the house label mono, say), because on any other one this
 * declaration is a no-op and the number will jiggle.
 */
export const TABULAR_ONLY = `font-variant-numeric: tabular-nums;  /* every digit the same width — no jitter on the tick */`;
