// THE READABILITY FLOOR - is painted text big enough and separated enough to read on a TV?
//
// BENCH-ONLY (the spike directory's standing rule; its callers are the spike runners). Built
// for the custom-lane type sweep (docs/NOACG_PRO_PLAN.md §21.2): "title readability floor
// (size + contrast 'for TV')" was one of the four escapes the owner's blind read named that no
// instrument measured. It measures the SETTLED frame - computed font size and text-to-surface
// contrast - and reports; whether a finding FEEDS the iterate loop or only rides the ledger is
// the runner's policy, decided by calibrating against shipped catalog designs first (an
// instrument whose false positives are good designs gets ignored - the mark-gap lesson).
//
// HONEST LIMITS, stated rather than papered over:
// - Contrast is measured against the nearest ancestor's solid background-color. A gradient, an
//   image or a fully transparent stack (text straight over footage) is UNKNOWABLE here, so no
//   contrast is reported for it - silence beats a number the method cannot support.
// - A text-shadow or stroke that rescues low contrast is invisible to this measurement; the
//   finding carries the raw numbers so a human can overrule it.

export interface ReadabilityReading {
  /** First characters of the text, for the finding and the calibration table. */
  snippet: string;
  fontPx: number;
  /** WCAG contrast ratio against the resolved backing, when one resolves. */
  contrast: number | null;
  el: string;
}

export interface ReadabilityOptions {
  /** Painted text smaller than this is flagged (px at 1080p). */
  sizeFloorPx?: number;
  /** Text/surface contrast under this is flagged (WCAG ratio). */
  contrastFloor?: number;
}

export interface ReadabilityReport {
  findings: { code: string; detail: string }[];
  readings: ReadabilityReading[];
}

const SIZE_FLOOR_PX = 22;
const CONTRAST_FLOOR = 3;

function parseColor(value: string): { r: number; g: number; b: number; a: number } | null {
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
  if (parts.length < 3 || parts.some((p) => Number.isNaN(p))) return null;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

function luminance(c: { r: number; g: number; b: number }): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The nearest ancestor (or self) painting a solid-enough background-color. A background
 *  IMAGE anywhere on the way up makes the backing unknowable - the image wins the paint. */
function resolveBacking(el: Element, win: Window): { r: number; g: number; b: number } | null {
  let node: Element | null = el;
  while (node && node !== el.ownerDocument.documentElement) {
    const cs = win.getComputedStyle(node);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
    const bg = parseColor(cs.backgroundColor);
    if (bg && bg.a >= 0.5) return bg;
    node = node.parentElement;
  }
  return null;
}

function describe(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classList.length ? `.${el.classList[0]}` : '';
  return `${el.tagName.toLowerCase()}${id}${cls}`;
}

/**
 * Measure every visible element that DIRECTLY contains text on the settled frame.
 */
export function measureReadability(doc: Document, options: ReadabilityOptions = {}): ReadabilityReport {
  const sizeFloor = options.sizeFloorPx ?? SIZE_FLOOR_PX;
  const contrastFloor = options.contrastFloor ?? CONTRAST_FLOOR;
  const win = doc.defaultView;
  const findings: ReadabilityReport['findings'] = [];
  const readings: ReadabilityReading[] = [];
  if (!win || !doc.body) return { findings, readings };

  const walk = (el: Element) => {
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const ownText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (ownText.length >= 2) {
      const rect = el.getBoundingClientRect();
      const opacity = parseFloat(cs.opacity);
      // A zero-size or fully faded element paints nothing to read - the entrance/paint
      // instruments own that question, not this one.
      if (rect.width > 0 && rect.height > 0 && (Number.isNaN(opacity) || opacity >= 0.1)) {
        const fontPx = parseFloat(cs.fontSize);
        const ink = parseColor(cs.color);
        const backing = ink && ink.a >= 0.1 ? resolveBacking(el, win) : null;
        let contrast: number | null = null;
        if (ink && backing) {
          // Composite a translucent ink over its backing before comparing.
          const blended = ink.a >= 1 ? ink : {
            r: ink.r * ink.a + backing.r * (1 - ink.a),
            g: ink.g * ink.a + backing.g * (1 - ink.a),
            b: ink.b * ink.a + backing.b * (1 - ink.a),
          };
          contrast = contrastRatio(blended, backing);
        }
        const snippet = ownText.slice(0, 40);
        readings.push({ snippet, fontPx: Math.round(fontPx * 10) / 10, contrast: contrast === null ? null : Math.round(contrast * 100) / 100, el: describe(el) });
        if (fontPx < sizeFloor) {
          findings.push({
            code: 'text-under-size-floor',
            detail: `"${snippet}" is painted at ${Math.round(fontPx)}px (${describe(el)}) - under the ${sizeFloor}px readability floor for supporting text at 1080p`,
          });
        }
        if (contrast !== null && contrast < contrastFloor) {
          findings.push({
            code: 'text-low-contrast',
            detail: `"${snippet}" reads at ${contrast.toFixed(2)}:1 against its surface (${describe(el)}) - under the ${contrastFloor}:1 floor for on-air text`,
          });
        }
      }
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(doc.body);
  return { findings: findings.slice(0, 8), readings };
}
