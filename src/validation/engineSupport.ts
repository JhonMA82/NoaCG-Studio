// WHICH BROWSER ENGINE A GRAPHIC ACTUALLY NEEDS — and therefore which playout systems can
// render it.
//
// THE PROBLEM THIS EXISTS FOR. CasparCG 2.3.x — the common LTS and teaching install, and the
// one the maintainer runs — carries a CEF from the Chromium 6x era. A modern CSS declaration
// there does not warn and does not degrade: the browser drops the whole declaration and paints
// the element with no background at all. The 2026-08-06 acceptance pass found exactly that on
// the Arena Quiz board — "just the blue line and the numbers", because every answer chip's
// background is a `color-mix()` (Chromium 111) and 2.3.x has never heard of it. Modern JS is
// worse: one `?.` is a SyntaxError that kills the whole file, so the layer goes on air showing
// nothing (docs/PLAYOUT_INTEGRATION.md §3).
//
// So this module MEASURES what a template uses, rather than anyone maintaining a list of which
// designs are known to be broken. A list would be wrong the day after it was written; the scan
// is right by construction because it reads the emitted code.
//
// WHAT IT IS NOT. It is not a validator and it never blocks an export: a graphic that needs
// Chromium 111 is completely correct in SPX's own renderer and CasparCG 2.4+. It is NOT correct
// in OBS or vMix — measured 2026-08-07, OBS 30 and vMix 27 embed a Chromium 103 CEF, so the
// same 179 designs lose their `color-mix()` fills there that lose them on CasparCG 2.3. An
// embedded engine is frozen at the host app's build; only SPX is exempt, because it renders in
// the operator's own auto-updating browser. The output is a VERDICT PER TARGET ENGINE, so the
// user is told before they take it to air rather than finding out on a dark layer.
//
// HONEST LIMITS, stated because a compatibility report that overclaims is worse than none:
//  - It is a lexical scan. It reads the emitted CSS and JS with comments and string literals
//    removed; it does not build a CSSOM or parse JS. A feature spelled unusually can be missed.
//  - `gap` is reported at the FLEXBOX bar (Chromium 84) because the scan cannot see whether the
//    element is a flex or a grid container, and grid gap has been supported since 66. That is
//    the conservative direction: it may say "needs 84" where 66 would do, never the reverse.
//  - The versions come from the features' own shipping records. The CasparCG engine mapping
//    comes from the CasparCG changelog (docs/PLAYOUT_INTEGRATION.md §3) — only 2.3.2 has been
//    run on real hardware here.

import type { SpxTemplate } from '../model/types';

/** One thing a template can use that an older engine does not have. */
export interface EngineFeature {
  id: string;
  /** How it reads in a report — the declaration or syntax itself, in the user's words. */
  label: string;
  /** The first Chromium version that shipped it. */
  since: number;
  /** Where the scan looks. */
  where: 'css' | 'js';
  /**
   * What actually happens on an engine that lacks it — the part that decides how loud to be.
   *
   * `cosmetic` is not a softer `drops-the-declaration`; it is a different fact. The engine drops
   * the declaration either way, but for these the result is a typographic nicety nobody would
   * notice was missing (text-wrap: balance rebalances a wrap; text-decoration-thickness changes
   * an underline by a pixel). They are still LISTED, because the scan should never hide what it
   * saw, but they do not raise the graphic's required engine — otherwise one shared base rule
   * would stamp "needs Chromium 114" on all 430 designs and the report would be noise.
   */
  effect: 'drops-the-declaration' | 'kills-the-file' | 'cosmetic';
  test: RegExp;
}

/**
 * The feature table. Ordered by Chromium version so a report reads worst-first.
 *
 * Only features that can plausibly appear in generated or hand-edited template code are listed;
 * this is a template-compatibility scanner, not a general browser-support database. Adding one
 * is a single row — nothing else in the module knows the list.
 */
export const ENGINE_FEATURES: EngineFeature[] = [
  // ── CSS ────────────────────────────────────────────────────────────────────────────────
  { id: 'css-light-dark', label: 'light-dark()', since: 123, where: 'css', effect: 'drops-the-declaration', test: /\blight-dark\s*\(/ },
  { id: 'css-mask', label: 'the unprefixed mask shorthand', since: 120, where: 'css', effect: 'drops-the-declaration', test: /(^|[;{\s])mask(-image|-composite|-mode)?\s*:/m },
  { id: 'css-relative-color', label: 'relative colour syntax (rgb(from …))', since: 119, where: 'css', effect: 'drops-the-declaration', test: /\b(rgb|hsl|oklch|lab)\s*\(\s*from\b/ },
  { id: 'css-text-wrap-balance', label: 'text-wrap: balance', since: 114, where: 'css', effect: 'cosmetic', test: /text-wrap\s*:\s*(balance|pretty)/ },
  { id: 'css-nesting', label: 'CSS nesting', since: 112, where: 'css', effect: 'drops-the-declaration', test: /(?:^|[;{}])\s*&[\s.:[>+~]/m },
  { id: 'css-color-mix', label: 'color-mix()', since: 111, where: 'css', effect: 'drops-the-declaration', test: /\bcolor-mix\s*\(/ },
  { id: 'css-dvh', label: 'the dvh / svh / lvh viewport units', since: 108, where: 'css', effect: 'drops-the-declaration', test: /\d(dvh|svh|lvh|dvw|svw|lvw)\b/ },
  { id: 'css-individual-transforms', label: 'the individual transform properties (translate / rotate / scale)', since: 104, where: 'css', effect: 'drops-the-declaration', test: /(?:^|[;{])\s*(translate|rotate|scale)\s*:\s*[^;}]*(px|deg|rad|turn|%|\d)/m },
  { id: 'css-has', label: ':has()', since: 105, where: 'css', effect: 'drops-the-declaration', test: /:has\s*\(/ },
  { id: 'css-container', label: '@container queries', since: 105, where: 'css', effect: 'drops-the-declaration', test: /@container\b/ },
  { id: 'css-layer', label: '@layer', since: 99, where: 'css', effect: 'drops-the-declaration', test: /@layer\b/ },
  { id: 'css-accent-color', label: 'accent-color', since: 93, where: 'css', effect: 'drops-the-declaration', test: /accent-color\s*:/ },
  { id: 'css-overflow-clip', label: 'overflow: clip', since: 90, where: 'css', effect: 'drops-the-declaration', test: /overflow(-x|-y)?\s*:\s*clip\b/ },
  { id: 'css-aspect-ratio', label: 'aspect-ratio', since: 88, where: 'css', effect: 'drops-the-declaration', test: /(?:^|[;{])\s*aspect-ratio\s*:/m },
  { id: 'css-is-where', label: ':is() / :where()', since: 88, where: 'css', effect: 'drops-the-declaration', test: /:(is|where)\s*\(/ },
  { id: 'css-inset', label: 'the inset shorthand', since: 87, where: 'css', effect: 'drops-the-declaration', test: /(?:^|[;{])\s*inset\s*:/m },
  { id: 'css-text-decoration-thickness', label: 'text-decoration-thickness', since: 87, where: 'css', effect: 'cosmetic', test: /text-decoration-(thickness|skip-ink)\s*:/ },
  { id: 'css-property', label: '@property', since: 85, where: 'css', effect: 'drops-the-declaration', test: /@property\b/ },
  { id: 'css-content-visibility', label: 'content-visibility', since: 85, where: 'css', effect: 'drops-the-declaration', test: /content-visibility\s*:/ },
  { id: 'css-gap', label: 'gap in a flex container', since: 84, where: 'css', effect: 'drops-the-declaration', test: /(?:^|[;{])\s*(gap|row-gap|column-gap)\s*:/m },
  { id: 'css-clamp', label: 'clamp() / min() / max()', since: 79, where: 'css', effect: 'drops-the-declaration', test: /\b(clamp|min|max)\s*\(/ },
  { id: 'css-backdrop-filter', label: 'backdrop-filter', since: 76, where: 'css', effect: 'drops-the-declaration', test: /(?:^|[;{])\s*backdrop-filter\s*:/m },
  { id: 'css-conic-gradient', label: 'conic-gradient()', since: 69, where: 'css', effect: 'drops-the-declaration', test: /\bconic-gradient\s*\(/ },

  // ── JS. Every syntax entry KILLS THE FILE on an engine that lacks it, which is why an old
  // CasparCG shows a blank layer rather than a partly-broken graphic. ────────────────────
  { id: 'js-to-sorted', label: 'Array toSorted / toReversed / with', since: 110, where: 'js', effect: 'kills-the-file', test: /\.(toSorted|toReversed|toSpliced)\s*\(/ },
  { id: 'js-abortsignal-timeout', label: 'AbortSignal.timeout', since: 103, where: 'js', effect: 'drops-the-declaration', test: /AbortSignal\s*\.\s*timeout\b/ },
  { id: 'js-structured-clone', label: 'structuredClone', since: 98, where: 'js', effect: 'drops-the-declaration', test: /\bstructuredClone\s*\(/ },
  { id: 'js-find-last', label: 'Array findLast', since: 97, where: 'js', effect: 'drops-the-declaration', test: /\.(findLast|findLastIndex)\s*\(/ },
  { id: 'js-has-own', label: 'Object.hasOwn', since: 93, where: 'js', effect: 'drops-the-declaration', test: /Object\s*\.\s*hasOwn\b/ },
  { id: 'js-at', label: 'Array / String .at()', since: 92, where: 'js', effect: 'drops-the-declaration', test: /\.at\s*\(\s*-?\d/ },
  { id: 'js-top-level-await', label: 'top-level await', since: 89, where: 'js', effect: 'kills-the-file', test: /^\s*await\s/m },
  { id: 'js-replace-all', label: 'String.replaceAll', since: 85, where: 'js', effect: 'drops-the-declaration', test: /\.replaceAll\s*\(/ },
  { id: 'js-logical-assignment', label: 'logical assignment (&&= ||= ??=)', since: 85, where: 'js', effect: 'kills-the-file', test: /(\|\||&&|\?\?)=/ },
  { id: 'js-replace-children', label: 'replaceChildren', since: 86, where: 'js', effect: 'drops-the-declaration', test: /\.replaceChildren\s*\(/ },
  { id: 'js-optional-chaining', label: 'optional chaining (?.)', since: 80, where: 'js', effect: 'kills-the-file', test: /\?\.[\s\w[(]/ },
  { id: 'js-nullish', label: 'the nullish coalescing operator (??)', since: 80, where: 'js', effect: 'kills-the-file', test: /\?\?[^=]/ },
  { id: 'js-numeric-separators', label: 'numeric separators (1_000)', since: 75, where: 'js', effect: 'kills-the-file', test: /\b\d+_\d/ },
  { id: 'js-private-fields', label: 'private class fields (#name)', since: 74, where: 'js', effect: 'kills-the-file', test: /(^|[\s{;])#[A-Za-z_]\w*\s*[=(;]/m },
  { id: 'js-globalthis', label: 'globalThis', since: 71, where: 'js', effect: 'drops-the-declaration', test: /\bglobalThis\b/ },
  { id: 'js-resize-observer', label: 'ResizeObserver', since: 64, where: 'js', effect: 'drops-the-declaration', test: /\bResizeObserver\b/ },
];

/** A playout engine a user might take the graphic to, and the Chromium it renders with. */
export interface PlayoutEngine {
  id: string;
  label: string;
  /** null = it uses whatever browser the operator has, so nothing here can be predicted. */
  chromium: number | null;
  note?: string;
}

/**
 * The engines worth a verdict. The CasparCG rows come from its changelog
 * (docs/PLAYOUT_INTEGRATION.md §3); only 2.3.2 has been run on hardware here.
 *
 * **2.3.x is two rows, not one, and that is a measurement rather than caution.** The CEF changed
 * inside the 2.3 line, and this repo holds two observations from real servers that cannot both
 * describe one engine:
 *  - vite.config.ts lowers the whole app's build target to es2017 because a 2.3.2 server could
 *    not PARSE optional chaining — that engine is older than Chromium 80.
 *  - The 2026-08-06 acceptance pass found the Arena Quiz board missing only its `color-mix()`
 *    answer chips while every panel positioned with `inset` (87) and spaced with flex `gap`
 *    (84) rendered correctly — that engine is at least 88.
 * Both are true of "CasparCG 2.3.x"; neither is true of a single number. So the table names the
 * early line (~75) and the late line (88) separately and the report shows both, because guessing
 * one would either cry wolf over the whole catalogue or promise a design will render when it
 * will not.
 */
export const PLAYOUT_ENGINES: PlayoutEngine[] = [
  { id: 'casparcg-230', label: 'CasparCG 2.3.0–2.3.2', chromium: 75, note: 'the older LTS build' },
  { id: 'casparcg-233', label: 'CasparCG 2.3.3+', chromium: 88, note: 'the later 2.3 LTS build' },
  { id: 'casparcg-24', label: 'CasparCG 2.4.x', chromium: 117 },
  { id: 'casparcg-25', label: 'CasparCG 2.5.x', chromium: 142 },
  { id: 'obs', label: 'OBS Studio 30+', chromium: 103 },
  { id: 'vmix', label: 'vMix 27+', chromium: 103 },
  { id: 'browser', label: 'A current browser', chromium: null, note: 'SPX’s own renderer, and the studio preview' },
];

/** One measured use of a feature, with the line it was found on. */
export interface EngineFinding {
  feature: EngineFeature;
  /** 1-based line number within the tab the feature was found in. */
  line: number;
  /** The line itself, trimmed — so a report can show what it actually saw. */
  source: string;
}

export interface EngineSupport {
  /** The lowest Chromium that renders this template as designed. 0 = nothing modern found. */
  minChromium: number;
  findings: EngineFinding[];
}

/**
 * Blank out CSS comments and string literals, keeping the character COUNT and every newline, so
 * line numbers survive. Blanking rather than deleting is what makes the line arithmetic free.
 */
function maskCss(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * The same for JS, plus `//` comments and quoted strings. Template literals are deliberately
 * NOT masked: catalog runtimes build markup in them, and a modern feature used inside one is
 * still shipped to the engine.
 */
function maskJs(js: string): string {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/'(?:\\.|[^'\\\n])*'/g, (m) => `'${' '.repeat(Math.max(0, m.length - 2))}'`)
    .replace(/"(?:\\.|[^"\\\n])*"/g, (m) => `"${' '.repeat(Math.max(0, m.length - 2))}"`);
}

/**
 * The property a CSS line declares, or null if the line is not a declaration.
 *
 * A vendor prefix is stripped, because to the cascade's fallback idiom `-webkit-mask-image` and
 * `mask-image` are the SAME property: the prefixed spelling written first is kept by an engine
 * that cannot parse the standard one below it, which is exactly the fix. Without this the
 * scanner reports the fixed designs as broken and the report argues with itself.
 */
function declaredProperty(line: string): string | null {
  const m = /^\s*([-\w]+)\s*:/.exec(line);
  return m ? m[1].toLowerCase().replace(/^-(?:webkit|moz|ms|o)-/, '') : null;
}

/**
 * IS THIS DECLARATION ALREADY COVERED BY A FALLBACK?
 *
 * The CSS cascade's oldest compatibility idiom: write the old value first, the modern one second.
 * An engine that cannot parse the second keeps the first, so nothing is missing — it just does
 * not get the better version. A scanner that reported those as failures would be reporting the
 * FIX as the problem, and once the shared assemblers start emitting fallbacks that is most of
 * the catalogue.
 *
 * "Covered" is deliberately narrow: the immediately preceding declaration in the same block must
 * name the SAME property and must not itself use anything modern. That is the only pattern the
 * cascade actually guarantees, and a looser rule would start excusing real gaps.
 */
function hasFallback(lines: string[], at: number): boolean {
  const prop = declaredProperty(lines[at]);
  if (!prop) return false;
  for (let i = at - 1; i >= 0; i -= 1) {
    const prev = lines[i];
    if (!prev.trim()) continue; // blank (or a blanked-out comment) is not a declaration
    if (/[{}]/.test(prev)) return false; // left the rule block without finding one
    const prevProp = declaredProperty(prev);
    if (prevProp !== prop) return false; // the line before it is a different property
    return !ENGINE_FEATURES.some((f) => f.where === 'css' && f.test.test(prev));
  }
  return false;
}

function scanText(text: string, where: 'css' | 'js'): EngineFinding[] {
  const masked = where === 'css' ? maskCss(text) : maskJs(text);
  const lines = masked.split('\n');
  const found: EngineFinding[] = [];
  for (const feature of ENGINE_FEATURES) {
    if (feature.where !== where) continue;
    for (let i = 0; i < lines.length; i += 1) {
      // Per-line matching, so a report can point at the declaration rather than at the file.
      // The multiline patterns anchor on `^` or a preceding `;`/`{`, both of which survive the
      // split because a declaration never straddles a newline in emitted code.
      const line = lines[i];
      if (!feature.test.test(line)) continue;
      if (where === 'css' && hasFallback(lines, i)) continue;
      found.push({ feature, line: i + 1, source: line.trim().slice(0, 160) });
      break; // one finding per feature per tab: a report names the feature, not every use
    }
  }
  return found;
}

/**
 * Measure the engine a template needs. Scans the CSS, the JS, and any inline `<style>`/`<script>`
 * in the HTML — an imported or hand-edited graphic puts its code there rather than in the tabs.
 */
export function scanEngineSupport(template: SpxTemplate): EngineSupport {
  const inlineStyle = [...template.html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const inlineScript = [...template.html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');
  const findings = [
    ...scanText(`${template.css}\n${inlineStyle}`, 'css'),
    ...scanText(`${template.js}\n${inlineScript}`, 'js'),
  ];
  // De-duplicate: a feature found in both the tab and an inline block is one fact.
  const byFeature = new Map<string, EngineFinding>();
  for (const f of findings) if (!byFeature.has(f.feature.id)) byFeature.set(f.feature.id, f);
  const unique = [...byFeature.values()].sort((a, b) => b.feature.since - a.feature.since);
  return {
    // Cosmetic findings are listed but never raise the bar — see EngineFeature.effect.
    minChromium: unique.reduce((max, f) => (f.feature.effect === 'cosmetic' ? max : Math.max(max, f.feature.since)), 0),
    findings: unique,
  };
}

export type EngineVerdict = 'fine' | 'degraded' | 'blank';

export interface EngineReport {
  engine: PlayoutEngine;
  verdict: EngineVerdict;
  /** The findings this engine specifically cannot render. */
  missing: EngineFinding[];
}

/**
 * What each engine will actually do with this template.
 *
 * The three verdicts are deliberately not a severity scale — they are three different pictures
 * on air. `blank` (a JS syntax feature the engine cannot parse) means the layer shows NOTHING,
 * which is why it outranks any number of dropped declarations.
 */
export function engineReports(support: EngineSupport): EngineReport[] {
  return PLAYOUT_ENGINES.map((engine) => {
    if (engine.chromium === null) return { engine, verdict: 'fine' as const, missing: [] };
    const missing = support.findings.filter(
      (f) => f.feature.since > engine.chromium! && f.feature.effect !== 'cosmetic',
    );
    const verdict: EngineVerdict = missing.length === 0
      ? 'fine'
      : missing.some((f) => f.feature.effect === 'kills-the-file')
        ? 'blank'
        : 'degraded';
    return { engine, verdict, missing };
  });
}

/** The shortest honest headline for a template: "Renders everywhere" or what it needs. */
export function engineHeadline(support: EngineSupport): string {
  if (support.minChromium === 0) return 'Renders on every supported playout engine.';
  const blocked = engineReports(support).filter((r) => r.verdict !== 'fine');
  if (blocked.length === 0) return 'Renders on every supported playout engine.';
  return `Needs a browser engine of Chromium ${support.minChromium} or newer — ${blocked
    .map((r) => r.engine.label)
    .join(', ')} will not render it as designed.`;
}
