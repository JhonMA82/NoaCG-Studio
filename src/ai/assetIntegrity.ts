// The AS-IS screen: refuse a generated design that alters a picture the user said must appear
// exactly as uploaded.
//
// Why this needs a check rather than a sentence in the prompt. "Use it as it is" is the one
// purpose (model/imagePurpose.ts) whose whole value is that NOTHING happens to the picture, and
// it is also the one a model breaks helpfully: a crest gets a soft drop-shadow filter, a sponsor
// mark gets rounded corners to "match the panel", a logo gets `object-fit: cover` and loses its
// edges to a crop. Each is a defensible design move and each destroys a brand mark. Told once in
// a prompt, it holds most of the time; measured, it holds.
//
// It reports ERRORS for the same reason safety.ts does: an error reaches the provider's repair
// loop, so the model gets a round to take the declaration back out, and the fix is a one-line
// deletion rather than a redesign. A result that still fails is surfaced with its validation
// attached rather than quietly applied.
//
// Honest limit, same as the safety screen's: this reads CSS text, not the resolved cascade. It
// catches a declaration aimed at the protected image or at `img`; it would not catch a rule that
// reaches the element through a selector naming neither. That is the obvious case, not the
// determined one, and it is the case that actually occurs.

import type { ValidationIssue, ValidationResult } from '../validation/validateTemplate';
import type { SpxTemplate } from '../model/types';

/**
 * Is this transform value uneven — a one-axis scale, or a two-argument scale whose arguments
 * differ? A regex cannot compare two numbers, and `scale(1.2, 1.2)` is perfectly fine, so the
 * comparison happens here rather than being faked with a pattern that flags both.
 */
function distorts(body: string): boolean {
  const value = body.match(/transform\s*:([^;}]*)/i)?.[1];
  if (!value) return false;
  if (/\bscale[XY]\s*\(/i.test(value)) return true;
  for (const m of value.matchAll(/\bscale\s*\(([^)]*)\)/gi)) {
    const args = m[1].split(',').map((a) => parseFloat(a.trim()));
    if (args.length === 2 && args.every((n) => !Number.isNaN(n)) && args[0] !== args[1]) return true;
  }
  return false;
}

/** What must never be applied to an as-is picture, and how to say so to the model. */
const FORBIDDEN: { rule: string; test: (body: string) => boolean; note: string }[] = [
  {
    rule: 'asset-integrity-filter',
    test: (b) => /(^|[\s;{])(-webkit-)?filter\s*:/i.test(b),
    note: 'a CSS filter (blur, drop-shadow, brightness, grayscale…)',
  },
  {
    rule: 'asset-integrity-radius',
    test: (b) => /(^|[\s;{])border-radius\s*:\s*(?!0[\s;}]|0$)/i.test(b),
    note: 'rounded corners',
  },
  {
    rule: 'asset-integrity-crop',
    test: (b) => /(^|[\s;{])(clip-path|mask|mask-image)\s*:/i.test(b),
    note: 'a clip-path or mask, which crops it',
  },
  {
    rule: 'asset-integrity-cover',
    test: (b) => /(^|[\s;{])object-fit\s*:\s*cover/i.test(b),
    note: 'object-fit: cover, which crops it to fill the box',
  },
  {
    rule: 'asset-integrity-distort',
    test: distorts,
    note: 'a one-axis or uneven scale, which stretches it out of shape',
  },
];

/** Split a stylesheet into { selector, body } rules. Good enough for flat generated CSS. */
function rules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  // Comments carry example code often enough to produce phantom findings.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}

/**
 * The id and class names of every element that renders one of `paths`, so a finding can point
 * at the rule that actually reached it. An `<img>` whose src is the protected asset is the
 * shape every generator emits for a mark.
 */
function targetsOf(html: string, paths: string[]): { ids: string[]; classes: string[] } {
  const ids: string[] = [];
  const classes: string[] = [];
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const src = tag.match(/\bsrc="([^"]*)"/i)?.[1];
    if (!src || !paths.some((p) => src === p || src === `./${p}` || src.endsWith(`/${p}`))) continue;
    const id = tag.match(/\bid="([^"]*)"/i)?.[1];
    if (id) ids.push(id);
    const cls = tag.match(/\bclass="([^"]*)"/i)?.[1];
    if (cls) classes.push(...cls.split(/\s+/).filter(Boolean));
  }
  return { ids, classes };
}

/**
 * Findings for every forbidden declaration aimed at an as-is picture.
 *
 * `paths` is the subset of the uploaded assets the user marked "Use it as it is". An empty list
 * means nothing is protected and the screen costs one comparison.
 */
export function assetIntegrityFindings(template: SpxTemplate, paths: string[]): ValidationIssue[] {
  if (!paths.length) return [];
  const { ids, classes } = targetsOf(template.html, paths);
  if (!ids.length && !classes.length) return [];

  // A rule can reach the picture by naming its id, one of its classes, or the img element.
  const reaches = (selector: string): boolean =>
    ids.some((id) => selector.includes(`#${id}`)) ||
    classes.some((c) => new RegExp(`\\.${c}\\b`).test(selector)) ||
    /(^|[\s>+~,])img\b/i.test(selector);

  const found = new Map<string, ValidationIssue>();
  for (const { selector, body } of rules(template.css)) {
    if (!reaches(selector)) continue;
    for (const f of FORBIDDEN) {
      if (found.has(f.rule) || !f.test(body)) continue;
      found.set(f.rule, {
        rule: f.rule,
        message:
          `\`${selector}\` applies ${f.note} to a picture the user marked "use it as it is". ` +
          `It must appear exactly as uploaded — remove that declaration. Position it and scale ` +
          `it proportionally as much as the design needs.`,
      });
    }
  }
  return [...found.values()];
}

/** Fold the screen into a validation result. Safe to apply twice — deduped by rule. */
export function mergeAssetIntegrity(
  base: ValidationResult,
  template: SpxTemplate,
  paths: string[],
): ValidationResult {
  const seen = new Set(base.errors.map((e) => e.rule));
  const added = assetIntegrityFindings(template, paths).filter((f) => !seen.has(f.rule));
  if (!added.length) return base;
  return { ok: false, errors: [...base.errors, ...added], warnings: base.warnings };
}
