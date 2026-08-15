#!/usr/bin/env node
// WHAT THE SPACING INSTRUMENT SAYS ABOUT A DOCKED MARK - measured on both boxes at once.
//
//   node scripts/spike-mark-clearance-sweep.mjs             # every mark-capable lower third, FREE
//   node scripts/spike-mark-clearance-sweep.mjs --mark=shield-tall
//   node scripts/spike-mark-clearance-sweep.mjs --ids=lt07,lt41,ls10,ls25
//
// THE READING THIS EXISTS TO SETTLE. `spacingCheck`'s `mark-crowded` fired on lt07 (0.22), lt41
// (0.24) and ls10 (0.20) against a 0.25 floor, and those are three of the designs that carry a
// crest BEST: each draws the mark inside a well and expresses the brand manual's clear space as
// the image's own PADDING. `getBoundingClientRect` reports the BORDER box, so the clear space sat
// inside the thing being measured and the gap to the next element was nearly zero by
// construction. An instrument whose false positives are the good designs is one authors learn to
// ignore, so the number had to be measured rather than argued about.
//
// BOTH COLUMNS COME OFF THE SAME RENDER, which is the point. A before/after run would compare two
// renders of two builds, and this catalog moves; here `border` is computed inline from the same
// frame the instrument measured, so the two answers differ by the box alone. `border` deliberately
// re-implements the instrument's gap arithmetic in ten lines rather than importing it - it is the
// OLD instrument, kept alive as a control, and the moment it is wired to the new one the control
// stops controlling anything.
//
// A BARE RENDER, NEVER AN ABSOLUTE: `findPanel` resolves for only 10 of these 24 designs, so a
// sweep that asserted padding numbers would be asserting on a minority and calling it the
// catalog. Every design is therefore also rendered with the slot OFF, and what is reported is
// what the mark CHANGED.
//
// Requires the dev server on this checkout's port (node scripts/dev-port.mjs). Free - no model
// call, no tokens. ~2 minutes for 24 designs.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';
import { LITE_BRAND_MARKS_BY_ID } from './ai-lite-brand-fixtures.mjs';

const args = process.argv.slice(2);
const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? null;

/** A square crest by default: it is the shape that FILLS a well, which is the shape whose clear
 *  space a well-drawing design expresses as padding - the case the border box swallowed. */
const MARK_ID = arg('mark') ?? 'badge-square';
const ID_FILTER = (arg('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const CATEGORY = 'lower-third';
const OUT = path.resolve('benchmarks/pro/v1/spike/mark-clearance-sweep.json');

const mark = LITE_BRAND_MARKS_BY_ID.get(MARK_ID);
if (!mark) {
  console.error(`Unknown mark "${MARK_ID}". Known: ${[...LITE_BRAND_MARKS_BY_ID.keys()].join(', ')}`);
  process.exit(2);
}

const BASE = `http://localhost:${devPort()}`;
try {
  await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`Dev server not reachable at ${BASE} - start it first (npm run dev).`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (error) => console.log('  pageerror:', error.message));
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
await page.locator('.topbar').waitFor();
await page.locator('.wz-modal').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
await page.keyboard.press('Escape');
await page.locator('.wz-modal').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);

// The target set is the CATALOG's own capability, never a list kept here - the same rule
// ai-lite-brand-audit.mjs states.
//
// It includes the `picture` wells that the brand audit excludes, and NAMES them instead. That
// audit is grading a mark against mark rules, where cropping release artwork to a square is the
// design being right; this measures a CLEAR SPACE, which a picture well has as much as any other
// slot, and ls25's reading is one of the four this sweep exists to settle. A target set that
// shrinks without saying so reads as full coverage.
const targets = await page.evaluate(async ([category, only]) => {
  const cat = await import('/src/templates/catalog.ts?t=' + Date.now());
  const pool = (cat.CATALOG[category] ?? [])
    .filter((v) => v.logo !== 'none')
    .map((v) => ({ id: v.id, well: (v.imageSlot ?? 'mark') }));
  return only.length ? pool.filter((v) => only.includes(v.id)) : pool;
}, [CATEGORY, ID_FILTER]);
const ids = targets.map((t) => t.id);
const wells = new Map(targets.map((t) => [t.id, t.well]));
const pictures = targets.filter((t) => t.well === 'picture').map((t) => t.id);
if (pictures.length) console.log(`Picture wells included and marked (*): ${pictures.join(', ')}`);

if (!ids.length) {
  console.error('No mark-capable designs selected.');
  await browser.close();
  process.exit(2);
}
console.log(`Sweeping ${ids.length} mark-capable ${CATEGORY}s with "${MARK_ID}"…\n`);

const rows = [];
for (const id of ids) {
  const row = await page.evaluate(async ({ variantId, markSpec }) => {
    const bust = '?t=' + Date.now();
    const cat = await import('/src/templates/catalog.ts' + bust);
    const { composeDocument } = await import('/src/preview/composeDocument.ts' + bust);
    const { detectPrefix } = await import('/src/model/structure.ts' + bust);
    const { collectPainted, measureSpacing } = await import('/src/ai/spike/spacingCheck.ts' + bust);

    // THE GRAPHIC, not the frame. `document.body` is 1920x1080 in every render, marked or bare,
    // so a bare/marked comparison taken off it reports "nothing grew" for every design in the
    // catalog whatever the mark did - a column that always agrees is not a control. The strap is
    // the design's own `-box`, which is what the shared slot lays out and what "a strap spends
    // width, never height" is a claim about.
    const strapSize = (doc, prefix) => {
      const box = doc.querySelector(`.${prefix}-box`);
      if (!box) return null;
      const r = box.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    };

    const variant = cat.variantById(variantId);
    if (!variant) return { error: 'gone' };
    const lines = [
      { title: 'Name', sample: 'Alexandra Riva' },
      { title: 'Role', sample: 'Chief Political Correspondent' },
    ];

    const render = async (options) => {
      document.getElementById('mark-sweep-frame')?.remove();
      const template = variant.create({ lines, ...options });
      const frame = document.createElement('iframe');
      frame.id = 'mark-sweep-frame';
      frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
        + 'z-index:99999;background:#333;color-scheme:dark;';
      document.body.appendChild(frame);
      frame.srcdoc = composeDocument(template);
      await new Promise((resolve) => { frame.onload = resolve; });
      const win = frame.contentWindow;
      try {
        win.update(JSON.stringify({ f0: 'Alexandra Riva', f1: 'Chief Political Correspondent' }));
        win.play();
      } catch { /* a broken lifecycle still paints something - measure what is there */ }
      await win.document.fonts.ready;
      await new Promise((resolve) => setTimeout(resolve, 1800));
      return { frame, template };
    };

    // ── The bare render: what this design measures with no mark at all ────────────────
    const bare = await render({});
    const barePrefix = detectPrefix(bare.template.html);
    const bareSpacing = measureSpacing(bare.frame.contentDocument);
    const bareSize = strapSize(bare.frame.contentDocument, barePrefix);
    bare.frame.remove();

    // ── …and the same design carrying a real mark ─────────────────────────────────────
    const marked = await render({
      logoEnabled: true,
      logoAssetPath: markSpec.path,
      importedImages: [{ path: markSpec.path, data: markSpec.data }],
    });
    const doc = marked.frame.contentDocument;
    const win = marked.frame.contentWindow;

    // The slot's field id comes from the template's own definition, never from a guess about
    // how many fields a design carries: a design that hand-authors its slot numbers it itself.
    const definition = win.SPXGCTemplateDefinition?.DataFields ?? [];
    const markFieldId = definition.find((f) => f.ftype === 'filelist')?.field ?? null;
    const img = markFieldId ? doc.getElementById(markFieldId) : null;

    // ── THE CONTROL: the OLD instrument, kept alive ───────────────────────────────────
    //
    // The border-box gap the instrument used to report, computed here from the same frame so the
    // two columns differ BY THE BOX AND BY NOTHING ELSE. The gap arithmetic is a copy, because
    // importing the live one would make the control track the thing it is controlling - but the
    // painted-element set is NOT: it comes from `collectPainted`, exactly as the instrument's
    // does. A second opinion about which elements count would move the control's numbers for a
    // reason that has nothing to do with the change, which is a control measuring itself.
    let borderRatio = null;
    let inset = null;
    let markPx = null;
    if (img) {
      const painted = collectPainted(doc);
      const markItem = painted.find((p) => p.el === img);
      const style = win.getComputedStyle(img);
      const pad = (side) => (parseFloat(style.getPropertyValue(`padding-${side}`)) || 0)
        + (parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0);
      inset = { left: pad('left'), right: pad('right'), top: pad('top'), bottom: pad('bottom') };
      const texts = painted.filter((p) => p.isText);
      const rect = markItem?.rect ?? null;
      const height = rect ? rect.bottom - rect.top : 0;
      const gaps = rect ? texts.map((t) => {
        const dx = Math.max(rect.left - t.rect.right, t.rect.left - rect.right, 0);
        const dy = Math.max(rect.top - t.rect.bottom, t.rect.top - rect.bottom, 0);
        return Math.max(dx, dy) || Math.min(dx, dy);
      }) : [];
      if (gaps.length && height > 0) {
        borderRatio = Math.round((Math.min(...gaps) / height) * 100) / 100;
        // The two RAW numbers behind every ratio. A ratio alone cannot say whether a design was
        // flagged for a tight gap or for a tall mark, and those are opposite findings: the unit
        // is the mark's own height, so a design that gives its mark a lot of room is DIVIDING BY
        // its own generosity. ls25 stretches its cover artwork to the full height of the text
        // block beside it, which is the largest denominator in the catalog.
        markPx = { height: Math.round(height), gap: Math.round(Math.min(...gaps)) };
      }
    }

    const spacing = measureSpacing(doc, { markFieldId });
    const markedSize = strapSize(doc, detectPrefix(marked.template.html));
    marked.frame.remove();

    return {
      markFieldId,
      inset,
      markPx,
      borderRatio,
      inkRatio: spacing.markGap,
      panel: spacing.panel,
      barePanel: bareSpacing.panel,
      bareSize,
      markedSize,
      codes: spacing.findings.map((f) => f.code),
      bareCodes: bareSpacing.findings.map((f) => f.code),
    };
  }, { variantId: id, markSpec: { path: mark.path, data: mark.data } });

  if (row.error) continue;
  rows.push({ id, ...row });

  const pad = row.inset
    ? `${Math.round(row.inset.left)}/${Math.round(row.inset.right)}/${Math.round(row.inset.top)}/${Math.round(row.inset.bottom)}`
    : '-';
  const crowdedBefore = row.borderRatio !== null && row.borderRatio < 0.25;
  const crowdedAfter = row.codes.includes('mark-crowded');
  const verdict = crowdedBefore === crowdedAfter
    ? (crowdedAfter ? 'still flagged' : '')
    : (crowdedAfter ? 'NEWLY FLAGGED' : 'cleared');
  console.log(
    `${(id + (wells.get(id) === 'picture' ? '*' : '')).padEnd(6)}`
    + ` border ${String(row.borderRatio ?? '-').padEnd(6)} ink ${String(row.inkRatio ?? '-').padEnd(6)}`
    + ` (${row.markPx ? `${row.markPx.gap}px gap / ${row.markPx.height}px mark` : '-'})`.padEnd(26)
    + ` inset ${pad.padEnd(16)} panel ${(row.panel ? 'yes' : 'no').padEnd(4)}`
    + ` ${(row.codes.join(',') || 'clean').padEnd(24)} ${verdict}`,
  );
}
await browser.close();

// ── What moved, and what did not ──────────────────────────────────────────────────────
const measured = rows.filter((r) => r.borderRatio !== null && r.inkRatio !== null);
const before = measured.filter((r) => r.borderRatio < 0.25).map((r) => r.id);
const after = measured.filter((r) => r.codes.includes('mark-crowded')).map((r) => r.id);
const moved = measured.filter((r) => r.borderRatio !== r.inkRatio).map((r) => r.id);
const compared = rows.filter((r) => r.markedSize && r.bareSize);
const grew = compared.filter((r) => r.markedSize.height > r.bareSize.height + 1);
const unmeasurable = rows.filter((r) => !r.markedSize || !r.bareSize).map((r) => r.id);

console.log(`\n${measured.length}/${rows.length} designs produced a mark gap`
  + ` (a design with no painted text beside its mark cannot have one).`);
console.log(`mark-crowded BEFORE (border box): ${before.length ? before.join(', ') : 'none'}`);
console.log(`mark-crowded AFTER  (ink box):    ${after.length ? after.join(', ') : 'none'}`);
console.log(`readings that MOVED at all:       ${moved.length ? moved.join(', ') : 'none'}`);
// Named rather than folded into "none": a design whose strap could not be measured has not been
// shown to be unharmed, and a denominator that shrinks silently reads as full coverage.
console.log(`straps the mark made TALLER:      ${grew.length ? grew.map((r) => r.id).join(', ') : 'none'}`
  + ` (of ${compared.length} compared${unmeasurable.length ? `; no -box found on ${unmeasurable.join(', ')}` : ''})`);
console.log('\nA design still flagged is one to LOOK at: the ink box removes the artifact, so what');
console.log('survives is either a real crowding or a deliberate edge-to-edge composition.');

await writeFile(OUT, `${JSON.stringify({
  sweptAt: null,
  mark: MARK_ID,
  category: CATEGORY,
  designs: rows.length,
  crowdedBefore: before,
  crowdedAfter: after,
  moved,
  rows,
}, null, 2)}\n`);
console.log(`\nWritten: ${OUT}`);
