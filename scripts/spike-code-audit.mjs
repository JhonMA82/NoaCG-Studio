#!/usr/bin/env node
// THE CODE-QUALITY AUDIT for NoaCG Pro spike generations (docs/NOACG_PRO_PLAN.md §14 item 0a).
//
// THE CODE IS THE DELIVERABLE, and code quality is an axis for picking winners, not a
// follow-up check (owner, 2026-08-12): a generation that renders beautifully and emits
// unreadable or uneditable code has failed the product. Phase 0 judged frames alone and threw
// the code away; this measures the half of the house contract (src/ai/AGENTS.md) that is
// countable, per generation:
//
//   - colours flow through the :root variable contract - a hex/rgb() literal outside :root is
//     a colour the Style panel cannot retint;
//   - pixel sizes flow through calc(N * var(--scale)) - a raw Npx is a dimension the size knob
//     cannot reach;
//   - the required :root tokens exist (the Style panel's whole surface);
//   - the structure spine holds (root div -> -box alone on its element -> -mask around each
//     #fN) - it is convertEmittedRegion's precondition;
//   - the marked ANIMATION region exists with both builders;
//   - the JS reads as simple ES5 (arrows/let/const/template literals/class counted as drift);
//   - comments exist at all (density, css + js).
//
// It REPORTS numbers; it does not gate. The judgement call - is this code a designer would
// EDIT - stays a human read beside the frames, and the catalog anchors run through the same
// audit so the numbers are read against the house's own baseline rather than against zero.
//
//   node scripts/spike-code-audit.mjs --out=pro-spike-out     # audit a round's saved code/
//
// scripts/pro-spike.mjs imports `auditTemplateCode` and records the same numbers per record
// at capture time, so the ledger carries them and key.html can show them.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** The :root tokens every template must expose (src/templates/AGENTS.md, the style contract). */
const REQUIRED_ROOT_VARS = [
  '--accent', '--text-color', '--text-dim', '--panel-bg', '--font-heading', '--scale', '--type-scale',
];

/** The one colour that means the palette did NOT drive: the neutral skeleton's own house
 *  amber, surviving into a branded answer (the Lite audit's house-accent-survives). */
const HOUSE_AMBER = /#f6a623/i;

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function stripJsComments(js) {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
}

/** The body of every :root{...} block, so colour literals inside the contract don't count. */
function rootBlocks(css) {
  const blocks = [];
  const re = /:root\s*\{[^}]*\}/g;
  let m;
  while ((m = re.exec(css))) blocks.push([m.index, m.index + m[0].length]);
  return blocks;
}

function outsideRoot(css, index, blocks) {
  return !blocks.some(([from, to]) => index >= from && index < to);
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/**
 * Audit one generation's three files. Pure and dependency-free, so the browser-side runner
 * evaluation could load it too if it ever needs to; today only the node runner calls it.
 */
export function auditTemplateCode({ html, css, js }) {
  const cssClean = stripCssComments(css);
  const roots = rootBlocks(cssClean);

  // Colour literals outside :root. @font-face and url(...) lines carry no colours, so no
  // exclusions are needed beyond comments and the :root blocks themselves.
  const colorRe = /#[0-9a-f]{3,8}\b|rgba?\(/gi;
  const hardcodedColors = [];
  let m;
  while ((m = colorRe.exec(cssClean))) {
    if (outsideRoot(cssClean, m.index, roots)) {
      hardcodedColors.push(`L${lineOf(cssClean, m.index)}: ${css.split('\n')[lineOf(cssClean, m.index) - 1]?.trim().slice(0, 80)}`);
    }
  }

  // Raw px: a declaration line using Npx with no var(--scale) on the line. 0px and the
  // resolution-reset lines (the canvas reset states 1920/1080 deliberately) are excluded.
  const rawPx = [];
  const cssLines = cssClean.split('\n');
  cssLines.forEach((line, i) => {
    if (!/\b[1-9]\d*(\.\d+)?px\b/.test(line)) return;
    if (line.includes('var(--scale)')) return;
    if (/^\s*(width|height):\s*(1920|1080)px/.test(line)) return; // the canvas reset
    rawPx.push(`L${i + 1}: ${css.split('\n')[i]?.trim().slice(0, 80)}`);
  });

  const missingRootVars = REQUIRED_ROOT_VARS.filter((v) => !new RegExp(`${v}\\s*:`).test(cssClean));

  // The structure spine, off the emitted HTML (convertEmittedRegion's precondition).
  const boxMatch = html.match(/<div\s+class="([a-z][\w-]*)-box"\s*>/i);
  const prefix = boxMatch?.[1] ?? null;
  const spine = {
    boxAloneOnElement: Boolean(boxMatch),
    prefix,
    rootDiv: prefix ? new RegExp(`<div\\s+class="${prefix}"[\\s>]`).test(html) : false,
    masks: prefix ? (html.match(new RegExp(`class="${prefix}-mask`, 'g')) ?? []).length : 0,
    accent: prefix ? html.includes(`${prefix}-accent`) : false,
  };
  spine.ok = spine.boxAloneOnElement && spine.rootDiv && spine.masks >= 1;

  const region = {
    markers: /\/\* == ANIMATION ==/.test(js) && /\/\* == END ANIMATION == \*\//.test(js),
    buildIn: /function\s+buildInTimeline\s*\(/.test(js) || /NOACG_ANIM/.test(js),
    buildOut: /function\s+buildOutTimeline\s*\(/.test(js) || /NOACG_ANIM/.test(js),
  };
  region.ok = region.markers && region.buildIn && region.buildOut;

  // ES5 drift, whole-file: the house grammar is simple commented ES5 (var + function).
  const jsClean = stripJsComments(js);
  const es5Drift = {
    arrows: (jsClean.match(/=>/g) ?? []).length,
    letConst: (jsClean.match(/\b(let|const)\s/g) ?? []).length,
    templateLiterals: (jsClean.match(/`/g) ?? []).length,
    classes: (jsClean.match(/\bclass\s+[A-Z]/g) ?? []).length,
  };
  es5Drift.total = es5Drift.arrows + es5Drift.letConst + es5Drift.templateLiterals + es5Drift.classes;

  const commentLines = (text, isJs) => text.split('\n')
    .filter((l) => (isJs ? /^\s*(\/\/|\/\*|\*)/ : /^\s*(\/\*|\*)/).test(l) || /\/\*.*\*\//.test(l)).length;
  const totalLines = css.split('\n').length + js.split('\n').length;
  const comments = commentLines(css, false) + commentLines(js, true);

  const fontFace = {
    present: /@font-face/.test(cssClean),
    bundledPath: /url\(["']?fonts\//.test(cssClean),
    external: /url\(["']?https?:\/\//.test(cssClean) || /@import/.test(cssClean),
  };

  return {
    hardcodedColors: hardcodedColors.length,
    hardcodedColorSamples: hardcodedColors.slice(0, 5),
    houseAmberSurvives: HOUSE_AMBER.test(css),
    rawPx: rawPx.length,
    rawPxSamples: rawPx.slice(0, 5),
    missingRootVars,
    spine,
    region,
    es5Drift,
    commentRatio: Math.round((comments / Math.max(1, totalLines)) * 100) / 100,
    fontFace,
    lines: { html: html.split('\n').length, css: css.split('\n').length, js: js.split('\n').length },
  };
}

/** One compact line for the key/gallery: the numbers a reviewer scans first. */
export function auditSummaryLine(audit) {
  const spine = audit.spine.ok ? 'ok' : 'BROKEN';
  const region = audit.region.ok ? 'ok' : 'MISSING';
  const vars = audit.missingRootVars.length ? `missing ${audit.missingRootVars.join(',')}` : 'ok';
  return `colors:${audit.hardcodedColors}${audit.houseAmberSurvives ? ' +HOUSE-AMBER' : ''}`
    + ` px:${audit.rawPx} vars:${vars} spine:${spine} region:${region}`
    + ` es5-drift:${audit.es5Drift.total} comments:${Math.round(audit.commentRatio * 100)}%`;
}

// ── CLI: audit a saved round ─────────────────────────────────────────────────────────────
const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const outArg = process.argv.find((a) => a.startsWith('--out='))?.slice('--out='.length) ?? 'pro-spike-out';
  const codeDir = path.join(path.resolve(outArg), 'code');
  const slugs = await readdir(codeDir).catch(() => null);
  if (!slugs) {
    console.error(`No saved code under ${codeDir} - run a round first (the runner saves code/<slug>/).`);
    process.exit(1);
  }
  const report = {};
  for (const slug of slugs.sort()) {
    const dir = path.join(codeDir, slug);
    const [html, css, js] = await Promise.all([
      readFile(path.join(dir, 'index.html'), 'utf8'),
      readFile(path.join(dir, 'template.css'), 'utf8'),
      readFile(path.join(dir, 'template.js'), 'utf8'),
    ]).catch(() => [null, null, null]);
    if (html === null) continue;
    report[slug] = auditTemplateCode({ html, css, js });
    console.log(`${slug.padEnd(34)} ${auditSummaryLine(report[slug])}`);
  }
  const file = path.join(path.resolve(outArg), 'code-report.json');
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nWritten: ${file}`);
}
