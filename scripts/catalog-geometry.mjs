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
//   media       — <img>/<svg> boxes; with --with-images, where the mark sits against the text,
//                 how big it is next to the type beside it, and whether the graphic GREW to hold
//                 it or the design had already reserved the room (measured against the paired
//                 bare build — an absolute reading calls a credit roll "off frame" when it always
//                 was one)
//
// Usage (dev server must be running for this checkout — scripts/dev-port.mjs):
//   node scripts/catalog-geometry.mjs lower-third
//   node scripts/catalog-geometry.mjs lower-third --json out.json
//   node scripts/catalog-geometry.mjs --all --json all.json
//   node scripts/catalog-geometry.mjs --all --with-images   # + a mark in every image field
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { devPort } from './dev-port.mjs';

const FRAME_W = 1920;
const FRAME_H = 1080;

const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const all = args.includes('--all');
// `--with-images` answers a question the default run structurally CANNOT (§6.4 of
// docs/ADAPT_FIRST_PLAN.md): a logo slot is empty at `create({})`, so every variant reports
// zero media and "image-to-text relationships are unmeasured" was the honest verdict. This
// mode builds every logo-capable design a SECOND time with a real mark in the slot and
// measures what the picture does to the words.
const withImages = args.includes('--with-images');
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
      const frames = batch.map(({ id, mark }) => {
        const v = window.__cat.variantById(id);
        const f = document.createElement('iframe');
        // The iframe IS the frame: an element's rect relative to it maps onto frame coordinates.
        f.style.cssText = 'width:1920px;height:1080px;border:0;position:fixed;left:-5000px;top:0';
        try {
          // A mark is passed the way the product passes one: a real asset plus the path the
          // slot binds to. composeDocument inlines `images/…` from template.assets, so this
          // is the same picture the wizard's logo upload produces, not a preview-only shim.
          const options = mark
            ? { logoEnabled: true, logoAssetPath: mark.path, importedImages: [mark] }
            : {};
          f.srcdoc = window.__comp.composeDocument(v.create(options));
        } catch (e) {
          f.dataset.err = String((e && e.message) || e);
        }
        document.body.appendChild(f);
        return { id, f, mark };
      });
      await new Promise((r) => setTimeout(r, 900));
      // Drive EVERY image field, not just the shared logo slot. A crest, a sponsor rail and an
      // avatar are ordinary `filelist` fields that `create()` leaves empty, so filling the slot
      // alone reported five designs as "painted nothing" that in fact carry two crests and three
      // sponsor slots. This is field-coverage.mjs's technique: drive the fields, re-read the
      // screen, and let the graphic say what it does with a picture.
      for (const { f, mark } of frames) {
        if (!mark) continue;
        try {
          const fields = (f.contentWindow.SPXGCTemplateDefinition || {}).DataFields || [];
          const data = {};
          for (const fd of fields) if (fd.ftype === 'filelist') data[fd.field] = mark.data;
          if (Object.keys(data).length) f.contentWindow.update(JSON.stringify(data));
        } catch { /* a template without update() cannot take a picture; the read below says so */ }
      }
      await new Promise((r) => setTimeout(r, 300));
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

          // ── Media, and what it does to the words ─────────────────────────
          // A box is not the answer on its own: the question §6.4 leaves open is the
          // RELATIONSHIP - where the mark sits against the text, how big it is next to the
          // type it stands beside, and whether it displaces the words or the design had
          // already reserved its room.
          const media = visible.filter((v) => v.el.tagName === 'IMG' || v.el.tagName === 'SVG');
          out.media = media.map((v) => ({
            tag: v.el.tagName.toLowerCase(),
            w: Math.round(v.r.width),
            h: Math.round(v.r.height),
            aspect: +(v.r.width / Math.max(1, v.r.height)).toFixed(2),
          }));
          if (media.length && runs.length) {
            const m = media.reduce((a, b) => (a.r.width * a.r.height >= b.r.width * b.r.height ? a : b));
            const textBoxes = visible.filter(textish).filter((v) => v.el.tagName !== 'IMG' && v.el.tagName !== 'SVG');
            if (textBoxes.length) {
              const tu = textBoxes.reduce(
                (a, { r }) => ({
                  left: Math.min(a.left, r.left), top: Math.min(a.top, r.top),
                  right: Math.max(a.right, r.right), bottom: Math.max(a.bottom, r.bottom),
                }),
                { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
              );
              // WHERE it sits. Overlap on an axis decides which reading applies: a mark to
              // the left of the words is 'leading' only while it shares their band; one above
              // them is 'above' however far left it starts.
              const sharesRow = m.r.bottom > tu.top + 4 && m.r.top < tu.bottom - 4;
              const sharesCol = m.r.right > tu.left + 4 && m.r.left < tu.right - 4;
              const place = sharesRow && m.r.right <= tu.left + 4 ? 'leading'
                : sharesRow && m.r.left >= tu.right - 4 ? 'trailing'
                : sharesCol && m.r.bottom <= tu.top + 4 ? 'above'
                : sharesCol && m.r.top >= tu.bottom - 4 ? 'below'
                : 'overlapping';
              out.markPlace = place;
              // Sized against the TYPE it stands beside, which is the transferable number: a
              // px box means nothing without the ladder it sits in.
              out.markVsType = +(m.r.height / Math.max(1, runs[0].size)).toFixed(2);
              out.markGap = place === 'leading' ? Math.round(tu.left - m.r.right)
                : place === 'trailing' ? Math.round(m.r.left - tu.right)
                : place === 'above' ? Math.round(tu.top - m.r.bottom)
                : place === 'below' ? Math.round(m.r.top - tu.bottom)
                : 0;
              out.markShare = +((m.r.width * m.r.height) / Math.max(1, bbox.width * bbox.height)).toFixed(3);
            }
          }
        } catch (e) {
          out.err = (out.err || '') + ' READ:' + String((e && e.message) || e);
        }
        return out;
      });
    };
  },
  { FRAME_W, FRAME_H },
);

/**
 * Two marks, drawn in the page rather than committed as fixtures. The pair matters: every
 * shared logo slot is a SQUARE box with `object-fit: contain`, so a wide wordmark cannot fill
 * it and leaves vertical air a square mark does not. Measuring only one shape would report
 * that as a property of the design instead of the picture.
 */
const MARKS = await page.evaluate(() => {
  const draw = (w, h, fill) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = fill; g.fillRect(0, 0, w, h);
    return c.toDataURL('image/png');
  };
  return {
    square: { path: 'images/mark-square.png', data: draw(256, 256, '#f6a623') },
    wordmark: { path: 'images/mark-wide.png', data: draw(512, 128, '#f6a623') },
  };
});

const rows = [];
// The plan: every variant bare, plus a SECOND build for every logo-capable one with a mark in
// its slot. Only `logo !== 'none'` can carry a picture, and asking the rest to would measure
// a design refusing an option it never offered.
const plan = [
  ...targets.map((t) => ({ t, mark: null, markKind: 'none' })),
  ...(withImages
    ? targets
        .filter((t) => t.logo !== 'none')
        .flatMap((t) => [
          { t, mark: MARKS.square, markKind: 'square' },
          { t, mark: MARKS.wordmark, markKind: 'wordmark' },
        ])
    : []),
];
for (let i = 0; i < plan.length; i += 10) {
  const slice = plan.slice(i, i + 10);
  const res = await page.evaluate((b) => window.__geo(b), slice.map((p) => ({ id: p.t.id, mark: p.mark })));
  res.forEach((r, k) => rows.push({ ...slice[k].t, markKind: slice[k].markKind, ...r }));
  process.stderr.write(`\r  measured ${rows.length}/${plan.length}`);
}
process.stderr.write('\n');
await browser.close();

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
  console.log(`Wrote ${rows.length} rows to ${jsonOut}`);
}

// ── Summary ────────────────────────────────────────────────────────────────
// The bare build is the catalog's own state, so every statistic below is over THAT. A
// mark-bearing row is an answer to a different question and is summarised separately.
const ok = rows.filter((r) => !r.err && r.bbox && r.markKind === 'none');
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

// ── Image-to-text, only when a mark was actually placed ────────────────────
if (withImages) {
  const capable = ok.filter((r) => r.logo !== 'none');
  const bare = new Map(ok.map((r) => [r.id, r]));
  for (const kind of ['square', 'wordmark']) {
    const shot = rows.filter((r) => r.markKind === kind && !r.err && r.bbox);
    const drew = shot.filter((r) => (r.media || []).length > 0);
    const silent = shot.filter((r) => !(r.media || []).length);
    console.log(`\n=== with a ${kind} mark: ${drew.length} of ${shot.length} logo-capable designs drew it ===`);
    // A design that took the option and painted nothing is the honest half of the answer:
    // the self-assembled categories build their own slots and ignore the shared one.
    if (silent.length) {
      console.log(`  no image painted (${silent.length}): ${[...new Set(silent.map((r) => r.cat))].join(', ')}`);
    }
    if (!drew.length) continue;
    const places = new Map();
    for (const r of drew) places.set(r.markPlace ?? 'unplaced', (places.get(r.markPlace ?? 'unplaced') ?? 0) + 1);
    console.log('  placement    :', [...places].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · '));
    console.log('  mark w x h   :', fmt(stat(drew.map((r) => r.media[0].w))), '/', fmt(stat(drew.map((r) => r.media[0].h))));
    console.log('  mark : type  :', fmt(stat(drew.map((r) => r.markVsType))));
    console.log('  gap to text  :', fmt(stat(drew.map((r) => r.markGap))));
    console.log('  share of box :', fmt(stat(drew.map((r) => r.markShare))));
    // Does the graphic GROW to hold the mark, or had the design already kept its room? The
    // paired bare build is the only way to tell, and it decides whether an operator adding a
    // logo can push a strap past its width budget.
    const grown = drew
      .map((r) => ({ id: r.id, bare: bare.get(r.id), now: r }))
      .filter((p) => p.bare)
      .map((p) => ({ id: p.id, dw: p.now.bbox.width - p.bare.bbox.width, dh: p.now.bbox.height - p.bare.bbox.height }));
    console.log('  width growth :', fmt(stat(grown.map((g) => g.dw))));
    console.log('  height growth:', fmt(stat(grown.map((g) => g.dh))));
    const unchanged = grown.filter((g) => Math.abs(g.dw) < 2 && Math.abs(g.dh) < 2).length;
    console.log(`  reserved room: ${unchanged} of ${grown.length} designs did not resize for the mark`);
    // Off-frame is only meaningful as a CHANGE. Credit rolls and full-frame cards are
    // off-frame BARE - a roll scrolls past the edge on purpose - so reporting whatever is
    // negative here named nine designs the picture had done nothing to.
    const pushed = drew.filter((r) => {
      const b = bare.get(r.id);
      if (!b?.margins || !r.margins) return false;
      return ['left', 'right', 'top', 'bottom'].some((s) => r.margins[s] < -2 && b.margins[s] >= -2);
    });
    console.log(`  pushed off frame: ${pushed.length}${pushed.length ? ' — ' + pushed.map((r) => r.id).join(' ') : ' (none: was inside bare and still is)'}`);
  }
  console.log(`\nlogo-capable   : ${capable.length} of ${ok.length} (${pct(capable.length)})`);
}
