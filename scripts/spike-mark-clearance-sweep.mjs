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
// ── A HEIGHT COLUMN CANNOT SAY WHY, AND THE FIRST READING GOT IT WRONG ────────────────────
//
// The 2026-08-15 run found four hand-authored designs growing taller with a mark, and the reason
// recorded for all four was "its own well sizes the strap's row". Measured per design, that was
// true of only two of them. On ls29 the well is SHORTER than the words: its box caps its own
// width, the mark's column came out of that cap, the reporter's name broke across two rows, and
// the strap grew by a line of 49px type. Opposite defect, opposite fix - and the two are
// indistinguishable in a height column, so this sweep now measures the box's TWO CHILDREN against
// each other (`boxParts`) and counts LINE BOXES beside it. A well that is the shorter of the two
// did not spend the strap's height; the words did, because the mark took their measure.
//
// AND IT PROBES TWO CONTENT SHAPES, because the first one probed only its own. Two lines (name +
// role) is the shape the spacing instrument is calibrated on, but eleven of these designs draw for
// three or four, and a well sized to a four-line composition costs zero height there while setting
// the row at two. Reporting only the two-line number reads a design's own proportions as a defect;
// reporting only its own lines misses what a user gets after deleting a row. Both are printed.
//
// ── --capture: THE FRAME, not only the number ─────────────────────────────────────────────
//
// Every reading above was accepted on numbers alone, and the four designs this sweep exists to
// settle changed what a mark LOOKS like. `--capture` writes each render this sweep already makes
// to a 1920x1080 PNG **with its alpha intact**, so the review page can composite it over anything
// - the graphic ships transparent and is judged over pictures, never over the grey card a bench
// happens to mount it on.
//
// The alpha is why the shot is taken on a SECOND page rather than off the mounted iframe: an
// element screenshot inside /app carries whatever the app painted behind it, and the app's own
// body background is not the "default background" `omitBackground` removes. The composed document
// is self-contained by contract (composeDocument inlines CSS, GSAP, JS and assets), so it is
// simply `setContent` into a page parked on this origin - relative `fonts/<file>` still resolves,
// and the graphic runs its own lifecycle exactly as an export does.
//
//   node scripts/spike-mark-clearance-sweep.mjs --capture
//   node scripts/spike-mark-clearance-sweep.mjs --mark=shield-tall --capture --ids=ls29,ls17,lt07,ls10
//
// Requires the dev server on this checkout's port (node scripts/dev-port.mjs). Free - no model
// call, no tokens. ~4 minutes for 24 designs.

import { mkdir, writeFile } from 'node:fs/promises';
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
const CAPTURE = args.includes('--capture');
// The measurement ledger keeps its committed path so a capture run and a plain one stay
// comparable; the frames land beside the review page that reads them, under the mark they were
// rendered with (a second mark must never overwrite the first one's pictures - the one-out-dir-
// per-checkpoint lesson from pro-spike.mjs, arriving here as one directory per mark).
const OUT = path.resolve(arg('out') ?? 'benchmarks/pro/v1/spike/mark-clearance-sweep.json');
const FRAMES = path.resolve(arg('frames') ?? 'benchmarks/pro/evidence/frames', MARK_ID);

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

// WHY the mark changed this strap's height - the reading the first run of this sweep got wrong for
// half the designs it flagged. Two causes, and the fix for one is the fix for nothing else:
//
//   · the WELL set the row - the mark's own furniture is taller than the words beside it, so the
//     fix is to bound the well (or to argue in the design's source that its composition can
//     afford the height, which is where lt49 and lt53 landed);
//   · the WORDS LOST THEIR MEASURE - the mark's column came out of a capped text measure and the
//     words needed more height, so the fix is to widen that cap by the mark's column, which is
//     what shared/logoSlot.ts does for the six designs on the shared slot.
//
// `boxParts` (inside the page) is what tells them apart; the line count says whether a squeezed
// measure cost a whole wrapped line or only a reflowed row.

/** True when the mark's own furniture is the taller of the box's two children. */
const wellSetTheRow = (parts) => Boolean(parts) && parts.mark >= parts.words;

const growthLine = (label, bare, marked, parts, bareLines, markedLines) => {
  const d = marked.height - bare.height;
  if (d <= 1) return `${label}: no growth`;
  const cause = wellSetTheRow(parts)
    ? `the WELL set the row (${parts.mark}px well vs ${parts.words}px of words)`
    : `the WORDS LOST THEIR MEASURE (${parts ? `${parts.words}px of words beside a ${parts.mark}px well` : 'reflowed'}`
      + `${markedLines > bareLines ? `, ${bareLines} -> ${markedLines} text lines` : ', same line count - a row reflowed'})`;
  return `${label}: ${bare.height} -> ${marked.height}px +${(d / bare.height * 100).toFixed(1)}%, ${cause}`;
};

const heightVerdict = (row) => {
  if (!row.bareSize || !row.markedSize) return 'height: NOT MEASURABLE (no -box found)';
  const said = [growthLine('2 lines', row.bareSize, row.markedSize, row.markedParts,
    row.bareLines, row.markedLines)];
  if (row.own?.bare?.size && row.own?.marked?.size) {
    said.push(growthLine(`${row.own.count} lines`, row.own.bare.size, row.own.marked.size,
      row.own.marked.parts, row.own.bare.lines, row.own.marked.lines));
  }
  return `height  ${said.join('   |   ')}`;
};

// ── The alpha shot ────────────────────────────────────────────────────────────────────────
//
// A page of its own, parked on this origin so the composed document's relative `fonts/<file>`
// resolves exactly as it does in the preview, then `setContent` - which keeps that base URL. The
// document runs its own lifecycle (update, play, settle) because a graphic screenshotted before
// its entrance is a picture of an empty frame, and `omitBackground` then leaves everything the
// design did not paint transparent, which is what "over live footage" means for a broadcast
// graphic.
let shotPage = null;
async function alphaShot(html, payload, file) {
  if (!shotPage) {
    shotPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await shotPage.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
  }
  await shotPage.setContent(html, { waitUntil: 'load' });
  const playError = await shotPage.evaluate(async (data) => {
    let error = null;
    try {
      window.update(JSON.stringify(data));
      window.play();
    } catch (e) {
      error = String(e?.message ?? e).slice(0, 200);
    }
    await document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 1800));
    return error;
  }, payload);
  await shotPage.screenshot({ path: file, omitBackground: true });
  return playError;
}

if (CAPTURE) await mkdir(FRAMES, { recursive: true });

const rows = [];
for (const id of ids) {
  const row = await page.evaluate(async ({ variantId, markSpec, capture }) => {
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

    // THE TWO CHILDREN OF THE BOX, measured against each other: the one holding the mark, and the
    // tallest of the rest. This is the discriminator between the two ways a mark makes a strap
    // taller, and it needs no per-design knowledge - every one of these straps lays the mark's
    // furniture beside the words as siblings, whether the slot is hand-authored or shared.
    //
    // The line count below is NOT sufficient for this, which is worth stating because it was the
    // first attempt: ls17's growth is its NAME ROW breaking in two under `flex-wrap` when the
    // mark's column took the credit's measure, and neither span drew a second line - so the count
    // held steady at 2 and read as "the well set the row" while the well was the shorter of the
    // two. What the words did is only visible by measuring the words.
    const boxParts = (doc, prefix, img) => {
      const box = doc.querySelector(`.${prefix}-box`);
      if (!box) return null;
      let mark = 0;
      let words = 0;
      for (const child of box.children) {
        const h = Math.round(child.getBoundingClientRect().height);
        if (img && child.contains(img)) mark = Math.max(mark, h);
        else words = Math.max(words, h);
      }
      return { mark, words };
    };

    // HOW MANY LINE BOXES the words occupy, summed over every visible text field - the second
    // half of the same reading: it says whether a squeezed measure cost a design a WRAPPED LINE
    // (ls29's reporter name) or only a reflowed row. Derived from each span's own line-height
    // rather than from `getClientRects().length`, which reports one rect for a block-level span
    // however many rows it draws.
    const textLines = (doc, win) => {
      let total = 0;
      for (const el of doc.querySelectorAll('[id^="f"]')) {
        if (!/^f\d+$/.test(el.id) || el.tagName === 'IMG') continue;
        const style = win.getComputedStyle(el);
        if (style.display === 'none' || !el.textContent.trim()) continue;
        const lh = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
        const h = el.getBoundingClientRect().height;
        if (lh > 0 && h > 0) total += Math.max(1, Math.round(h / lh));
      }
      return total;
    };

    const variant = cat.variantById(variantId);
    if (!variant) return { error: 'gone' };
    // The calibrated probe: the two lines every spacing reading in this catalog is measured on.
    const lines = [
      { title: 'Name', sample: 'Alexandra Riva' },
      { title: 'Role', sample: 'Chief Political Correspondent' },
    ];
    // …and the design's OWN content, which is the shape its well was drawn against.
    const ownLines = (variant.suggestedLines ?? []).map((l) => ({ title: l.title, sample: l.sample }));

    // Every composed document this row rendered, kept for the driver to shoot on a clean page.
    // Collected HERE rather than re-composed later because `variant.create` is the only thing
    // that knows the options each state was built with, and a second compose is a second graphic.
    const docs = [];

    const render = async (content, options, state) => {
      document.getElementById('mark-sweep-frame')?.remove();
      const template = variant.create({ lines: content, ...options });
      const frame = document.createElement('iframe');
      frame.id = 'mark-sweep-frame';
      frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
        + 'z-index:99999;background:#333;color-scheme:dark;';
      document.body.appendChild(frame);
      const html = composeDocument(template);
      frame.srcdoc = html;
      await new Promise((resolve) => { frame.onload = resolve; });
      const win = frame.contentWindow;
      // Through update(), because that is the path an operator's text takes - and it must be
      // THIS content: a payload hard-coded to two fields leaves a four-line design showing its
      // own samples for the rest, which is not the same graphic.
      const payload = {};
      content.forEach((line, i) => { payload[`f${i}`] = line.sample; });
      if (capture && state) docs.push({ state, html, payload });
      try {
        win.update(JSON.stringify(payload));
        win.play();
      } catch { /* a broken lifecycle still paints something - measure what is there */ }
      await win.document.fonts.ready;
      await new Promise((resolve) => setTimeout(resolve, 1800));
      return { frame, template };
    };

    /** The mark's own `<img>`, found through the template's DEFINITION rather than through a
     *  guess about how many fields a design carries: a design that hand-authors its slot numbers
     *  it itself. Null on a bare render, which is what makes `boxParts` report words only. */
    const markImg = (doc, win) => {
      const definition = win.SPXGCTemplateDefinition?.DataFields ?? [];
      const id = definition.find((f) => f.ftype === 'filelist')?.field ?? null;
      return id ? doc.getElementById(id) : null;
    };

    /** Strap size, line-box count and the two children's heights off one render. */
    const shape = async (content, options, state) => {
      const r = await render(content, options, state);
      const doc = r.frame.contentDocument;
      const win = r.frame.contentWindow;
      const prefix = detectPrefix(r.template.html);
      const out = {
        size: strapSize(doc, prefix),
        lines: textLines(doc, win),
        parts: boxParts(doc, prefix, markImg(doc, win)),
      };
      r.frame.remove();
      return out;
    };

    // ── The bare render: what this design measures with no mark at all ────────────────
    const bare = await render(lines, {}, 'bare');
    const barePrefix = detectPrefix(bare.template.html);
    const bareSpacing = measureSpacing(bare.frame.contentDocument);
    const bareSize = strapSize(bare.frame.contentDocument, barePrefix);
    const bareLines = textLines(bare.frame.contentDocument, bare.frame.contentWindow);
    bare.frame.remove();

    const markOptions = {
      logoEnabled: true,
      logoAssetPath: markSpec.path,
      importedImages: [{ path: markSpec.path, data: markSpec.data }],
    };

    // ── …and the same design carrying a real mark ─────────────────────────────────────
    const marked = await render(lines, markOptions, 'marked');
    const doc = marked.frame.contentDocument;
    const win = marked.frame.contentWindow;

    const img = markImg(doc, win);
    const markFieldId = img?.id ?? null;

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
    const markedPrefix = detectPrefix(marked.template.html);
    const markedSize = strapSize(doc, markedPrefix);
    const markedLines = textLines(doc, win);
    const markedParts = boxParts(doc, markedPrefix, img);
    marked.frame.remove();

    // ── The design's OWN content, bare and marked ──────────────────────────────────────
    //
    // Skipped when a design draws for exactly the two lines above: rendering the same graphic
    // twice more to print the same numbers is 40 seconds of the sweep for nothing.
    const own = ownLines.length && ownLines.length !== lines.length
      ? {
        bare: await shape(ownLines, {}, 'own-bare'),
        marked: await shape(ownLines, markOptions, 'own-marked'),
        count: ownLines.length,
      }
      : null;

    return {
      docs,
      // The words each render carried, so the review page can print the graphic's content beside
      // the picture instead of leaving a reader to guess which shape they are looking at.
      content: { probe: lines, own: ownLines },
      markFieldId,
      inset,
      markPx,
      borderRatio,
      inkRatio: spacing.markGap,
      panel: spacing.panel,
      barePanel: bareSpacing.panel,
      bareSize,
      markedSize,
      bareLines,
      markedLines,
      markedParts,
      own,
      codes: spacing.findings.map((f) => f.code),
      bareCodes: bareSpacing.findings.map((f) => f.code),
    };
  }, { variantId: id, markSpec: { path: mark.path, data: mark.data }, capture: CAPTURE });

  if (row.error) continue;
  // The composed documents never reach the ledger - they are ~100 KB each with GSAP inlined, and
  // the ledger is a file people read. What lands is the FILE each one became.
  const { docs = [], ...record } = row;
  const frames = [];
  for (const doc of docs) {
    const file = `${id}.${doc.state}.png`;
    const playError = await alphaShot(doc.html, doc.payload, path.join(FRAMES, file));
    frames.push({ state: doc.state, file, ...(playError ? { playError } : {}) });
    if (playError) console.log(`  ${id} ${doc.state}: play() threw - ${playError}`);
  }
  rows.push({ id, ...record, ...(frames.length ? { frames } : {}) });

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
  // The height finding, printed only for a design that HAS one - and with the cause, which is
  // what the two line counts are for.
  console.log(`      ${heightVerdict(row)}`);
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
// …split by CAUSE, because the two want opposite fixes (see `heightVerdict`).
const welled = grew.filter((r) => wellSetTheRow(r.markedParts)).map((r) => r.id);
const squeezed = grew.filter((r) => !wellSetTheRow(r.markedParts)).map((r) => r.id);
console.log(`  …because the WELL set the row:  ${welled.length ? welled.join(', ') : 'none'} (bound the well)`);
console.log(`  …because the WORDS were squeezed: ${squeezed.length ? squeezed.join(', ') : 'none'} (widen the text cap)`);
// The same question at the content each design was DRAWN for. A well sized against four lines
// costs zero height there and can still set the row at two, and only one of those is a defect.
const ownCompared = rows.filter((r) => r.own?.bare?.size && r.own?.marked?.size);
const ownGrew = ownCompared.filter((r) => r.own.marked.size.height > r.own.bare.size.height + 1);
console.log(`taller at the design's OWN lines: ${ownGrew.length ? ownGrew.map((r) => `${r.id} (${r.own.count})`).join(', ') : 'none'}`
  + ` (of ${ownCompared.length} that draw for more than two)`);
console.log('\nA design still flagged is one to LOOK at: the ink box removes the artifact, so what');
console.log('survives is either a real crowding or a deliberate edge-to-edge composition.');

await writeFile(OUT, `${JSON.stringify({
  sweptAt: null,
  mark: MARK_ID,
  // The mark's own shape, recorded beside its id: "ls10 with a portrait crest" is only a reading
  // if the file says what portrait meant. `natural` is the fixture's declared pixel size.
  markNatural: mark.natural ?? null,
  frameDir: CAPTURE ? path.relative(process.cwd(), FRAMES).split(path.sep).join('/') : null,
  category: CATEGORY,
  designs: rows.length,
  crowdedBefore: before,
  crowdedAfter: after,
  moved,
  tallerByWell: welled,
  tallerBySqueezedWords: squeezed,
  tallerAtOwnLines: ownGrew.map((r) => r.id),
  rows,
}, null, 2)}\n`);
console.log(`\nWritten: ${OUT}`);
