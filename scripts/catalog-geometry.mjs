// The CATALOG GEOMETRY instrument: renders every variant of a category at 1920x1080, settles
// it, and reads back where the graphic actually SITS and what proportions it actually uses.
//
// Why this exists: the Create-with-AI pivot toward adapting proven designs needs to know what
// the catalog's designs agree about. "Lower thirds sit bottom-left" is a belief until something
// measures 89 of them; the answer decides whether placement and proportion are DERIVED by the
// platform (the type ladder's precedent) or left for a model to choose. Free — no model calls.
//
// It measures the SETTLED graphic at its defaults (`variant.create({})`), which is the same
// state overflow-sweep and l3-sweep read, so the three instruments describe one artifact.
//
// Per variant it reports:
//   bbox        — the union of every painted element, in frame coordinates
//   margins     — distance from each frame edge to that union
//   share       — bbox width/height as a fraction of the 1920x1080 frame
//   plate       — the largest element carrying an opaque-ish background (the reading surface),
//                 its rect, and the padding between it and the text it contains
//   type        — every visible text run's px size, weight, tracking and case, largest first
//   ratio       — primary:secondary type size, the hierarchy number DESIGN_LANGUAGE talks about
//   media       — <img>/<svg> boxes, so image-to-text relationships can be counted
//
// Usage (dev server must be running for this checkout — scripts/dev-port.mjs):
//   node scripts/catalog-geometry.mjs lower-third
//   node scripts/catalog-geometry.mjs lower-third --json out.json
//   node scripts/catalog-geometry.mjs --all --json all.json
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { devPort } from './dev-port.mjs';

const FRAME_W = 1920;
const FRAME_H = 1080;

const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const all = args.includes('--all');
const category = args.find((a, i) => !a.startsWith('--') && i !== jsonAt + 1) || (all ? null : 'lower-third');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`http://localhost:${devPort()}/app`, { waitUntil: 'domcontentloaded' });

await page.evaluate(async () => {
  window.__cat = await import('/src/templates/catalog.ts');
  window.__comp = await import('/src/preview/composeDocument.ts');
  window.__wiz = await import('/src/model/wizard.ts');
});

const targets = await page.evaluate(
  (only) =>
    window.__wiz.CATEGORIES.filter((c) => !only || c.id === only).flatMap((c) =>
      (window.__cat.CATALOG[c.id] || []).map((v) => ({
        id: v.id,
        cat: c.id,
        name: v.name,
        styleTag: v.styleTag,
        maxLines: v.maxLines,
        logo: v.logo,
        defaultZone: v.defaultZone,
      })),
    ),
  category,
);
if (!targets.length) {
  console.error(category ? `No variants for category "${category}".` : 'No variants found.');
  await browser.close();
  process.exit(2);
}

await page.evaluate(
  ({ FRAME_W, FRAME_H }) => {
    window.__geo = async (batch) => {
      document.body.innerHTML = '';
      const frames = batch.map(({ id }) => {
        const v = window.__cat.variantById(id);
        const f = document.createElement('iframe');
        // The iframe IS the frame: an element's rect relative to it maps onto frame coordinates.
        f.style.cssText = 'width:1920px;height:1080px;border:0;position:fixed;left:-5000px;top:0';
        try {
          f.srcdoc = window.__comp.composeDocument(v.create({}));
        } catch (e) {
          f.dataset.err = String((e && e.message) || e);
        }
        document.body.appendChild(f);
        return { id, f };
      });
      await new Promise((r) => setTimeout(r, 900));
      for (const { f } of frames) {
        try { f.contentWindow.play && f.contentWindow.play(); } catch { /* no play() is not a geometry fault */ }
      }
      await new Promise((r) => setTimeout(r, 2400));

      const opaque = (color) => {
        // rgba(...) with an alpha below this paints too little to be a reading surface.
        const m = /^rgba?\(([^)]+)\)$/.exec(color || '');
        if (!m) return 0;
        const parts = m[1].split(',').map((s) => parseFloat(s));
        return parts.length < 4 ? 1 : parts[3];
      };

      return frames.map(({ id, f }) => {
        const out = { id, err: f.dataset.err || null };
        try {
          const w = f.contentWindow;
          const doc = f.contentDocument;
          const els = [...doc.body.querySelectorAll('*')];
          const visible = [];
          for (const el of els) {
            const cs = w.getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            if (!(parseFloat(cs.opacity) > 0.03)) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) continue;
            visible.push({ el, cs, r });
          }
          if (!visible.length) { out.err = 'nothing painted'; return out; }

          // ── The graphic's own bounding box ────────────────────────────────
          // A box that covers the whole frame with no paint of its own (a positioning wrapper)
          // is not part of the graphic; it would swallow every margin measurement.
          const paints = ({ cs }) =>
            opaque(cs.backgroundColor) > 0.02 ||
            (cs.backgroundImage && cs.backgroundImage !== 'none') ||
            (cs.borderTopWidth !== '0px' || cs.borderLeftWidth !== '0px') ||
            (cs.boxShadow && cs.boxShadow !== 'none');
          const textish = ({ el }) =>
            [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) ||
            el.tagName === 'IMG' || el.tagName === 'SVG' || el.tagName === 'CANVAS';
          const contributing = visible.filter((v) => paints(v) || textish(v));
          const pool = contributing.length ? contributing : visible;

          const union = pool.reduce(
            (a, { r }) => ({
              left: Math.min(a.left, r.left), top: Math.min(a.top, r.top),
              right: Math.max(a.right, r.right), bottom: Math.max(a.bottom, r.bottom),
            }),
            { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
          );
          const bbox = {
            left: Math.round(union.left), top: Math.round(union.top),
            right: Math.round(union.right), bottom: Math.round(union.bottom),
            width: Math.round(union.right - union.left), height: Math.round(union.bottom - union.top),
          };
          out.bbox = bbox;
          out.margins = {
            left: bbox.left, top: bbox.top,
            right: FRAME_W - bbox.right, bottom: FRAME_H - bbox.bottom,
          };
          out.share = {
            w: +(bbox.width / FRAME_W).toFixed(3),
            h: +(bbox.height / FRAME_H).toFixed(3),
            area: +((bbox.width * bbox.height) / (FRAME_W * FRAME_H)).toFixed(3),
          };

          // ── The plate: the biggest background-carrying element that BACKS TEXT ──
          // "Largest painted box" is not enough: a 3x96 accent bar is the biggest painted thing
          // in every minimal design, and calling it the reading surface would report a plate on
          // designs that deliberately have none (the clean skin buys legibility with a halo).
          // A reading surface is an element that a text run sits inside.
          const textRuns = visible.filter(textish);
          const backs = (v) =>
            textRuns.some(
              (t) => t !== v && t.r.left >= v.r.left - 2 && t.r.right <= v.r.right + 2 &&
                t.r.top >= v.r.top - 2 && t.r.bottom <= v.r.bottom + 2,
            );
          const plates = visible
            .filter((v) => opaque(v.cs.backgroundColor) > 0.25 || (v.cs.backgroundImage && v.cs.backgroundImage !== 'none'))
            .filter((v) => v.r.width * v.r.height < FRAME_W * FRAME_H * 0.98)
            .filter(backs)
            .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
          const plate = plates[0];
          if (plate) {
            out.plate = {
              sel: plate.el.className && typeof plate.el.className === 'string'
                ? '.' + plate.el.className.trim().split(/\s+/)[0] : plate.el.tagName.toLowerCase(),
              rect: [Math.round(plate.r.left), Math.round(plate.r.top), Math.round(plate.r.width), Math.round(plate.r.height)],
              alpha: +opaque(plate.cs.backgroundColor).toFixed(2),
              radius: plate.cs.borderTopLeftRadius,
              aspect: +(plate.r.width / Math.max(1, plate.r.height)).toFixed(2),
              share: +((plate.r.width * plate.r.height) / (FRAME_W * FRAME_H)).toFixed(3),
            };
            // Padding: the text union inside the plate, versus the plate's own box.
            const inside = visible.filter(
              (v) => textish(v) && v.r.left >= plate.r.left - 2 && v.r.right <= plate.r.right + 2 &&
                v.r.top >= plate.r.top - 2 && v.r.bottom <= plate.r.bottom + 2,
            );
            if (inside.length) {
              const tu = inside.reduce(
                (a, { r }) => ({
                  left: Math.min(a.left, r.left), top: Math.min(a.top, r.top),
                  right: Math.max(a.right, r.right), bottom: Math.max(a.bottom, r.bottom),
                }),
                { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
              );
              out.plate.pad = {
                left: Math.round(tu.left - plate.r.left), right: Math.round(plate.r.right - tu.right),
                top: Math.round(tu.top - plate.r.top), bottom: Math.round(plate.r.bottom - tu.bottom),
              };
            }
          }

          // ── Type: every visible text run, largest first ───────────────────
          const runs = [];
          for (const { el, cs, r } of visible) {
            const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim())
              .map((n) => n.textContent.trim()).join(' ');
            if (!own) continue;
            runs.push({
              size: Math.round(parseFloat(cs.fontSize)),
              weight: cs.fontWeight,
              tracking: cs.letterSpacing === 'normal' ? 0 : +parseFloat(cs.letterSpacing).toFixed(2),
              upper: cs.textTransform === 'uppercase' || own === own.toUpperCase(),
              align: cs.textAlign,
              shadow: cs.textShadow && cs.textShadow !== 'none',
              w: Math.round(r.width),
              text: own.slice(0, 24),
            });
          }
          runs.sort((a, b) => b.size - a.size);
          out.type = runs;
          if (runs.length >= 2) {
            const distinct = [...new Set(runs.map((t) => t.size))].sort((a, b) => b - a);
            out.ratio = distinct.length >= 2 ? +(distinct[0] / distinct[1]).toFixed(2) : 1;
            out.typeSteps = distinct.length;
          }
          out.textLines = runs.length;

          // ── Media ────────────────────────────────────────────────────────
          out.media = visible
            .filter((v) => v.el.tagName === 'IMG' || v.el.tagName === 'SVG')
            .map((v) => ({ tag: v.el.tagName.toLowerCase(), w: Math.round(v.r.width), h: Math.round(v.r.height) }));
        } catch (e) {
          out.err = (out.err || '') + ' READ:' + String((e && e.message) || e);
        }
        return out;
      });
    };
  },
  { FRAME_W, FRAME_H },
);

const rows = [];
for (let i = 0; i < targets.length; i += 10) {
  const slice = targets.slice(i, i + 10);
  const res = await page.evaluate((b) => window.__geo(b), slice.map((t) => ({ id: t.id })));
  res.forEach((r, k) => rows.push({ ...slice[k], ...r }));
  process.stderr.write(`\r  measured ${rows.length}/${targets.length}`);
}
process.stderr.write('\n');
await browser.close();

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
  console.log(`Wrote ${rows.length} rows to ${jsonOut}`);
}

// ── Summary ────────────────────────────────────────────────────────────────
const ok = rows.filter((r) => !r.err && r.bbox);
const bad = rows.filter((r) => r.err);
const pct = (n) => `${Math.round((n / ok.length) * 100)}%`;
const stat = (vals) => {
  const s = [...vals].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { min: s[0], p25: q(0.25), median: q(0.5), p75: q(0.75), max: s[s.length - 1] };
};
const fmt = (s) => (s ? `min ${s.min} · p25 ${s.p25} · MEDIAN ${s.median} · p75 ${s.p75} · max ${s.max}` : '—');

console.log(`\n=== ${category || 'all categories'} — ${ok.length} measured, ${bad.length} failed ===\n`);
if (bad.length) console.log('failed:', bad.map((r) => `${r.id}(${r.err})`).join(', '), '\n');

// Vertical band: which third of the frame the graphic's CENTRE falls in.
const band = (r) => {
  const c = (r.bbox.top + r.bbox.bottom) / 2;
  return c < FRAME_H / 3 ? 'top' : c < (FRAME_H * 2) / 3 ? 'middle' : 'bottom';
};
const side = (r) => {
  const nearL = r.margins.left, nearR = r.margins.right;
  if (Math.abs(nearL - nearR) < 60) return 'centered';
  return nearL < nearR ? 'left' : 'right';
};
const tally = (fn) => {
  const m = new Map();
  for (const r of ok) m.set(fn(r), (m.get(fn(r)) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n} (${pct(n)})`).join(' · ');
};
console.log('vertical band  :', tally(band));
console.log('horizontal side:', tally(side));
console.log('declared zone  :', tally((r) => r.defaultZone));
console.log('');
console.log('bottom margin  :', fmt(stat(ok.map((r) => r.margins.bottom))));
console.log('left margin    :', fmt(stat(ok.map((r) => r.margins.left))));
console.log('right margin   :', fmt(stat(ok.map((r) => r.margins.right))));
console.log('top margin     :', fmt(stat(ok.map((r) => r.margins.top))));
console.log('');
console.log('width  (px)    :', fmt(stat(ok.map((r) => r.bbox.width))));
console.log('height (px)    :', fmt(stat(ok.map((r) => r.bbox.height))));
console.log('width share    :', fmt(stat(ok.map((r) => r.share.w))));
console.log('height share   :', fmt(stat(ok.map((r) => r.share.h))));
console.log('');
const withPlate = ok.filter((r) => r.plate);
const haloOnly = ok.filter((r) => !r.plate && (r.type || []).some((t) => t.shadow));
const neither = ok.filter((r) => !r.plate && !(r.type || []).some((t) => t.shadow));
console.log(`plate present  : ${withPlate.length} (${pct(withPlate.length)})`);
console.log(`halo, no plate : ${haloOnly.length} (${pct(haloOnly.length)})  [${haloOnly.map((r) => r.id).join(' ')}]`);
console.log(`neither        : ${neither.length} (${pct(neither.length)})  [${neither.map((r) => r.id).join(' ')}]`);
console.log('plate aspect   :', fmt(stat(withPlate.map((r) => r.plate.aspect))));
const pads = withPlate.filter((r) => r.plate.pad);
console.log('pad left       :', fmt(stat(pads.map((r) => r.plate.pad.left))));
console.log('pad top        :', fmt(stat(pads.map((r) => r.plate.pad.top))));
console.log('');
console.log('primary type px:', fmt(stat(ok.map((r) => r.type?.[0]?.size))));
console.log('type steps     :', fmt(stat(ok.map((r) => r.typeSteps))));
console.log('hierarchy ratio:', fmt(stat(ok.map((r) => r.ratio))));
console.log('text runs      :', fmt(stat(ok.map((r) => r.textLines))));
console.log('media elements :', fmt(stat(ok.map((r) => (r.media || []).length))));
