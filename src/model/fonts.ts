// Bundled open-source fonts (SIL Open Font License). The files live in public/fonts/ (served at
// /fonts/<file> in dev) and are copied into exported packages under fonts/<file>, so templates are
// fully offline at playout. Generated CSS contains a visible @font-face rule referencing the
// relative path "fonts/<file>" — teachable and 1:1 with the export.

/**
 * The style families. 'noacg' is the house family — the product's own on-air look
 * (dark control-room panels, one amber accent, mono technical labels).
 *
 * 'editorial' and 'cinematic' are the two on-air voices the first four could not cover:
 * - **editorial** — the magazine/newsroom voice. Rules instead of panels, wide-tracked small-caps
 *   kickers, a printed-page hierarchy. Where minimal removes everything, editorial ORGANISES:
 *   a hairline rule and a kicker are structure, not decoration.
 * - **cinematic** — the documentary/title-card voice. No panel edge at all; text sits on a soft
 *   scrim and carries its own shadow, set in light, widely tracked caps. It is the one family
 *   whose display type OPENS UP (positive tracking) instead of tightening.
 *
 * Both are full families: they carry a FAMILY_TOKENS row (model/themeTokens.ts), palettes, font
 * affinities, and wizard filter chips, exactly like the original four.
 */
export type StyleTag = 'minimal' | 'sport' | 'glass' | 'noacg' | 'editorial' | 'cinematic';

export interface BundledFont {
  id: string;
  /** CSS font-family name used in generated code. */
  family: string;
  /** File name under public/fonts/ (dev) and fonts/ (export). */
  file: string;
  /** Variable-font weight range covered by the file, e.g. [400, 800]. */
  weights: [number, number];
  /** Which style tags this font suits (used to order the wizard's font picker). */
  styleTags: StyleTag[];
  /** Fallback stack appended after the family in generated CSS. */
  fallback: string;
  /** Short flavor line shown in the wizard. */
  blurb: string;
}

export const FONTS: BundledFont[] = [
  {
    id: 'inter',
    family: 'Inter',
    file: 'inter.woff2',
    weights: [400, 800],
    styleTags: ['minimal', 'glass', 'cinematic'],
    fallback: 'Arial, sans-serif',
    blurb: 'Neutral, crisp UI classic — never wrong.',
  },
  {
    id: 'space-grotesk',
    family: 'Space Grotesk',
    file: 'space-grotesk.woff2',
    weights: [400, 700],
    styleTags: ['noacg', 'minimal', 'glass'],
    fallback: 'Arial, sans-serif',
    blurb: 'Modern grotesque with a technical edge — the NoaCG house display face.',
  },
  {
    id: 'jetbrains-mono',
    family: 'JetBrains Mono',
    file: 'jetbrains-mono.woff2',
    weights: [400, 700],
    styleTags: ['noacg'],
    fallback: 'Consolas, "Courier New", monospace',
    blurb: 'Technical monospace — labels, data, timecode (the NoaCG house label face).',
  },
  {
    id: 'manrope',
    family: 'Manrope',
    file: 'manrope.woff2',
    weights: [400, 800],
    styleTags: ['glass', 'minimal', 'cinematic'],
    fallback: 'Arial, sans-serif',
    blurb: 'Soft, rounded, friendly — social/stream feel.',
  },
  {
    id: 'archivo',
    family: 'Archivo',
    file: 'archivo.woff2',
    weights: [400, 900],
    styleTags: ['sport', 'minimal', 'editorial'],
    fallback: 'Arial, sans-serif',
    blurb: 'Sturdy grotesque; heavy weights hit hard.',
  },
  {
    id: 'oswald',
    family: 'Oswald',
    file: 'oswald.woff2',
    weights: [400, 700],
    styleTags: ['sport', 'editorial'],
    fallback: '"Arial Narrow", Arial, sans-serif',
    blurb: 'Condensed broadcast workhorse — big names, tight space.',
  },
  {
    id: 'bebas-neue',
    family: 'Bebas Neue',
    file: 'bebas-neue.woff2',
    weights: [400, 400],
    styleTags: ['sport', 'cinematic'],
    fallback: '"Arial Narrow", Arial, sans-serif',
    blurb: 'All-caps display impact; pair with a quiet body font.',
  },
  // ── The 2026-08 growth set (docs/GOALS.md "Student release" step 5): every style family
  // gets at least three strong faces, and the catalog gains its first serifs. All variable
  // latin-subset woff2 from Google Fonts, OFL 1.1 - each copyright line is appended to
  // src/assets/OFL.txt (the licence follows the bytes, src/export/AGENTS.md).
  {
    id: 'playfair-display',
    family: 'Playfair Display',
    file: 'playfair-display.woff2',
    weights: [400, 900],
    styleTags: ['editorial', 'cinematic'],
    fallback: 'Georgia, "Times New Roman", serif',
    blurb: 'Editorial display serif — mastheads, culture, title cards.',
  },
  {
    id: 'source-serif-4',
    family: 'Source Serif 4',
    file: 'source-serif-4.woff2',
    weights: [400, 700],
    styleTags: ['editorial'],
    fallback: 'Georgia, "Times New Roman", serif',
    blurb: 'Readable text serif — printed-page warmth for longer lines.',
  },
  {
    id: 'ibm-plex-sans',
    family: 'IBM Plex Sans',
    file: 'ibm-plex-sans.woff2',
    weights: [100, 700],
    styleTags: ['minimal', 'editorial'],
    fallback: 'Arial, sans-serif',
    blurb: 'Engineered grotesque — corporate clarity without coldness.',
  },
  {
    id: 'libre-franklin',
    family: 'Libre Franklin',
    file: 'libre-franklin.woff2',
    weights: [400, 800],
    styleTags: ['editorial', 'minimal'],
    fallback: 'Arial, sans-serif',
    blurb: 'American newsroom grotesque — headlines with heritage.',
  },
  {
    id: 'sora',
    family: 'Sora',
    file: 'sora.woff2',
    weights: [400, 800],
    styleTags: ['noacg', 'glass'],
    fallback: 'Arial, sans-serif',
    blurb: 'Geometric with a tech pulse — esports and product.',
  },
  {
    id: 'outfit',
    family: 'Outfit',
    file: 'outfit.woff2',
    weights: [400, 900],
    styleTags: ['glass', 'minimal'],
    fallback: 'Arial, sans-serif',
    blurb: 'Clean geometric rounds — the modern stream look.',
  },
  {
    id: 'anton',
    family: 'Anton',
    file: 'anton.woff2',
    weights: [400, 400],
    styleTags: ['sport', 'cinematic'],
    fallback: '"Arial Narrow", Arial, sans-serif',
    blurb: 'One heavy condensed shout — scorelines and stings.',
  },
  {
    id: 'big-shoulders',
    family: 'Big Shoulders',
    file: 'big-shoulders.woff2',
    weights: [400, 900],
    styleTags: ['cinematic', 'sport'],
    fallback: '"Arial Narrow", Arial, sans-serif',
    blurb: 'Condensed display with attitude — posters and openers.',
  },
  {
    id: 'saira',
    family: 'Saira',
    file: 'saira.woff2',
    weights: [400, 900],
    styleTags: ['sport'],
    fallback: 'Arial, sans-serif',
    blurb: 'Semi-condensed technical family — sport data and names.',
  },
  {
    id: 'dm-sans',
    family: 'DM Sans',
    file: 'dm-sans.woff2',
    weights: [400, 900],
    styleTags: ['minimal', 'glass'],
    fallback: 'Arial, sans-serif',
    blurb: 'Friendly geometric — quiet, current, versatile.',
  },
];

export function fontById(id: string): BundledFont {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

/** The visible @font-face rule generated into template CSS (exports 1:1). */
export function fontFaceCss(font: BundledFont): string {
  return `/* Bundled open-source font (the file ships with the export — no internet at playout). */
@font-face {
  font-family: "${font.family}";
  src: url("fonts/${font.file}") format("woff2");
  font-weight: ${font.weights[0]} ${font.weights[1]};  /* variable font: covers this weight range */
  font-display: swap;          /* show fallback text until the font loads */
}`;
}

/** Full font-family value for CSS (family + fallback stack). */
export function fontStack(font: BundledFont): string {
  return `"${font.family}", ${font.fallback}`;
}

/**
 * A design-owned SECOND typeface (e.g. the NoaCG house label mono). Deliberately worded
 * differently from fontFaceCss: the Style panel / looks swap the FIRST "Bundled open-source
 * font" block (the heading face), and this comment keeps a label face out of that match.
 */
export function labelFontFaceCss(font: BundledFont): string {
  return `/* Design-owned label font (bundled OFL file — ships with the export, offline at playout).
   The Style panel's font picker swaps the heading face above; this one belongs to the design. */
@font-face {
  font-family: "${font.family}";
  src: url("fonts/${font.file}") format("woff2");
  font-weight: ${font.weights[0]} ${font.weights[1]};  /* variable font: covers this weight range */
  font-display: swap;          /* show fallback text until the font loads */
}`;
}

// The OFL itself, vendored at src/assets/OFL.txt and imported here so the licence TRAVELS with
// the fonts rather than being linked. OFL §2 requires each redistributed copy of the Font
// Software to CONTAIN the copyright notice and this licence — as a stand-alone text file, a
// human-readable header, or readable metadata. A URL pointing at the licence satisfies none of
// those, and §2 is triggered by redistribution, not by sale, so shipping the product free does
// not retire the obligation.
//
// It lives in src/assets/ and not beside the fonts in public/ because Vite refuses to let
// JavaScript import out of the public directory ("Assets in public directory cannot be imported
// from JavaScript") — it serves such an import today but warns on every request. src/assets is
// where the other bundled-and-inlined sources already live (gsap.min.js, lottie.min.js).
import oflLicenseText from '../assets/OFL.txt?raw';

/** The full OFL 1.1 text plus every bundled font's copyright line. */
export const OFL_TEXT = oflLicenseText;

/** License note written into exported packages that bundle a font, as a stand-alone file
 *  (OFL §2's first permitted form). */
export const FONT_LICENSE_NOTE = `# Font licenses

The fonts under fonts/ that came from this builder's bundled set are licensed under the
SIL Open Font License, Version 1.1. They may be bundled, embedded, redistributed and used
commercially, but not sold on their own. The complete licence and the copyright notice for
every bundled font follow.

Fonts you imported yourself are NOT covered by any of this and are governed by their own
licences — make sure you have the right to embed and distribute them before sharing a
package that contains one.

----------------------------------------------------------------------

${oflLicenseText}`;

/**
 * The same notice as a comment block, for the surfaces that have nowhere to put a separate
 * file: a single-file export is one .html by contract, and an inlined page cannot ship a
 * sibling. OFL §2 names exactly this form — "human-readable headers".
 *
 * `open`/`close` differ per host language: `/* … *\/` inside CSS, `<!-- … -->` in HTML.
 */
export function fontLicenseComment(syntax: 'html' | 'css'): string {
  const body = `Bundled fonts — SIL Open Font License 1.1\n\n${oflLicenseText}`;
  // A comment cannot contain its own terminator. The OFL text has neither sequence, but
  // guarding here means an edit to the licence file can never produce a broken document.
  const safe = body.replace(/--!?>/g, '-- >').replace(/\*\//g, '* /');
  return syntax === 'html' ? `<!--\n${safe}\n-->` : `/*\n${safe}\n*/`;
}

// ── User-imported fonts (embedded in the template + its export) ───────────────

import type { AssetFile } from './types';

export interface CustomFont {
  /** CSS font-family name (derived from the file name, user-editable). */
  family: string;
  /** @font-face format() string: woff2 | woff | truetype | opentype. */
  format: string;
  /** The font file as a data-URL asset at fonts/<file> — ships inside the export. */
  asset: AssetFile;
}

/** Map a font file extension to its @font-face format() string. */
export function fontFormatForExt(ext: string): string {
  return { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' }[ext.toLowerCase()] ?? 'woff2';
}

/**
 * THE safe relative asset path for an imported font file: `fonts/<sanitized>.<ext>`. The one
 * path builder every import surface uses (wizard Style step, FontPicker upload, Local Font
 * Access embed, the editor's Style panel) - a space or unicode in a filename used to ride
 * verbatim into the asset path and the emitted url(), which three hand-rolled builders
 * agreed on only by luck.
 */
export function fontAssetPath(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const base =
    (dot >= 0 ? fileName.slice(0, dot) : fileName).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'font';
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : 'woff2';
  return `fonts/${base}.${ext}`;
}

/** A readable family name from a font file name ("Neue-Machina_Bold.otf" -> "Neue Machina Bold"). */
export function familyFromFileName(name: string): string {
  const base = name.replace(/\.(woff2|woff|ttf|otf)$/i, '');
  return base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'My Font';
}

/** The visible @font-face rule for an imported font (the file ships with the export). */
export function customFontFaceCss(font: CustomFont): string {
  return `/* Imported font (your file — embedded in the template and its export). */
@font-face {
  font-family: "${font.family}";
  src: url("${font.asset.path}") format("${font.format}");
  font-display: swap;          /* show fallback text until the font loads */
  /* Single file: the browser synthesizes bold/italic. Add more @font-face rules
     with their own files for true weights. */
}`;
}

export function customFontStack(font: CustomFont): string {
  return `"${font.family}", Arial, sans-serif`;
}

/**
 * Make an imported font renderable in the builder UI itself (pickers, live preview host).
 * Best-effort; the template preview works regardless because it inlines the asset.
 */
export function registerAppFont(family: string, dataUrl: string): void {
  try {
    const face = new FontFace(family, `url(${dataUrl})`);
    void face.load().then((f) => (document as Document & { fonts: FontFaceSet }).fonts.add(f));
  } catch {
    /* non-fatal — UI falls back to the default font */
  }
}
