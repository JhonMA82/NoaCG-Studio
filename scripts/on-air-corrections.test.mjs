// gate: factory
// needs: browser
// guards: src/templates/**, src/preview/composeDocument.ts
//
// A CORRECTION ON AIR CHANGES THE WORDS AND NOTHING ELSE (issue #784).
//
// An operator fixes a typo and presses Update while the graphic is on air. That is the ordinary
// case, and two catalog families answered it with a broken frame:
//
//   - a countdown that had run out put its full length back on screen (still styled as time-up),
//     because the shared clock runtime re-derived the length on any update unless it was paused;
//   - a page-swap credits design drew every page at once, and a reel lost the copies that make
//     its seam, because the update replaced the blocks the running motion was animating.
//
// So this sweeps every catalog countdown and every credits design in every motion it offers
// through the real composer, on a clock this file drives (scripts/driven-clock.mjs), and holds a
// correction to the only right answer: every block keeps the pose a run without the correction
// has at the same moment, and the corrected words are the ones a run typed that way from the
// start shows. A correction that changes the list's SHAPE (a section added) cannot keep the
// blocks, so it is held to what an operator would accept instead: a page swap still shows one
// page at a time and still reaches its last page, and a reel keeps its copies and keeps moving.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';
import { parseOnly } from './catalog-scope.mjs';
import { DRIVEN_CLOCK } from './driven-clock.mjs';
import { measured } from './measured.mjs';

const SPECS = [
  { entry: fileURLToPath(new URL('../src/templates/catalog.ts', import.meta.url)), globalName: 'NOACG_CATALOG' },
  { entry: fileURLToPath(new URL('../src/preview/composeDocument.ts', import.meta.url)), globalName: 'NOACG_COMPOSE' },
];

/** When the correction is sent: early in the motion, and (for a page swap and a reel) long after. */
const EARLY_MS = 1500;
const LATE_MS = 40000;
/** When each run is read, counted from the correction. */
const SAMPLES_MS = [100, 1000, 4000, 30000];
/** The two motions that animate the rows' own blocks rather than the track. */
const BLOCK_MOTIONS = ['credits-pages', 'credits-loop'];

/** Runs in the browser: mount a composed design in an iframe that carries the driven clock. */
const PAGE_HELPERS = () => {
  window.__mountDesign = async (template) => {
    const html = window.NOACG_COMPOSE.composeDocument(template);
    const clock = window.__TEST_CLOCK;
    const srcdoc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + clock) : clock + html;
    document.getElementById('fx')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'fx';
    frame.style.cssText = `position:fixed;left:0;top:0;width:${template.resolution.width}px;height:${template.resolution.height}px;border:0;`;
    await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = srcdoc; document.body.appendChild(frame); });
    return frame.contentWindow;
  };
  window.__fieldData = (template) => {
    const data = {};
    for (const f of template.fields || []) if (f.field && f.value !== undefined) data[f.field] = String(f.value);
    return data;
  };
};

/** Runs in the browser: one credits design in one motion, played and corrected `plan.at` in. */
const CREDITS_RUN = async ({ id, presetId, plan }) => {
  const template = window.NOACG_CATALOG.variantById(id).create({ animation: { presetId } });
  const data = window.__fieldData(template);
  const base = data.f0;
  // A typo fixed: two letters of the first lower-case word swapped. Same rows, same sections.
  const fixed = base.replace(/([a-z])(?!\1)([a-z])/, '$2$1');
  // A section added at the foot of the list: the shape changes.
  const grown = `${base}\n\nWith thanks to Northwind Studios`;
  const texts = { none: base, fixed, grown };

  const w = await window.__mountDesign(template);
  const round = (n) => Math.round(Number(n) * 100) / 100;
  const pose = () => {
    const track = w.document.getElementById('credits-track');
    const blocks = [...track.querySelectorAll('.credits-page, .credits-end')];
    const s = w.getComputedStyle(track);
    return {
      track: s.transform.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n)))),
      blocks: blocks.map((el) => {
        const b = w.getComputedStyle(el);
        return [el.className, round(b.opacity), b.visibility, b.transform.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n))))].join('|');
      }),
      shown: blocks.filter((el) => w.getComputedStyle(el).visibility === 'visible' && Number(w.getComputedStyle(el).opacity) > 0.01).length,
      endShown: blocks.some((el) => el.classList.contains('credits-end') && Number(w.getComputedStyle(el).opacity) > 0.5),
      clones: track.querySelectorAll('.credits-loop-clone').length,
      text: track.textContent.replace(/\s+/g, ' ').trim(),
    };
  };

  w.update(JSON.stringify({ ...data, f0: plan.from === 'fixed' ? fixed : base }));
  w.play();
  w.__advance(plan.at);
  w.update(JSON.stringify({ ...data, f0: texts[plan.to] }));
  const samples = [];
  let last = 0;
  for (const ms of plan.samples) { w.__advance(ms - last); last = ms; samples.push(pose()); }
  document.getElementById('fx')?.remove();
  return { changed: fixed !== base, samples };
};

/** Runs in the browser: run a countdown out, then send an unrelated update and a new length. */
const CLOCK_RUN = async ({ id }) => {
  const template = window.NOACG_CATALOG.variantById(id).create({});
  const js = template.js;
  const minutes = /function clockFieldSignature\(\) \{\s*return clockFieldText\('(\w+)'\)/.exec(js)?.[1];
  const target = /clockFieldText\('\w+'\) \+ '\|' \+ clockFieldText\('(\w+)'\)/.exec(js)?.[1];
  const prefix = /root\.classList\.add\('([\w-]+)-done'\)/.exec(js)?.[1];
  if (!minutes || !prefix) return { id, error: 'the clock runtime could not be read from the emitted code' };
  const data = { ...window.__fieldData(template), [minutes]: '0.05' };   // three seconds
  if (target) data[target] = '';                                         // count the duration
  const other = (template.fields || []).find((f) => f.field && f.field !== minutes && f.field !== target
    && typeof f.value === 'string' && f.value.trim() && !/^\d/.test(f.value.trim()));

  const w = await window.__mountDesign(template);
  const read = () => ({
    left: w.clockSecondsLeft,
    text: w.document.querySelector(`.${prefix}-clock`)?.textContent ?? null,
    done: !!w.document.querySelector(`.${prefix}`)?.classList.contains(`${prefix}-done`),
  });
  w.update(JSON.stringify(data));
  w.play();
  w.__advance(8000);
  const finished = read();
  const corrected = other ? { ...data, [other.field]: `${other.value} (corrected)` } : data;
  w.update(JSON.stringify(corrected));
  w.__advance(1000);
  const afterUnrelated = read();
  w.update(JSON.stringify({ ...corrected, [minutes]: '0.1' }));        // six seconds
  const afterNewLength = read();
  document.getElementById('fx')?.remove();
  return { id, unrelated: other ? other.field : '(the same data again)', finished, afterUnrelated, afterNewLength };
};

const { ids: only } = parseOnly(process.argv.slice(2));

const started = Date.now();
const runs = await withBundledPage(SPECS, async (page) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate((clock) => { window.__TEST_CLOCK = clock; }, DRIVEN_CLOCK);
  await page.evaluate(PAGE_HELPERS);
  // Chosen by the runtime they emit, not by category, so a design in another category that uses
  // the clock or the credits runtime is swept too.
  const shipped = await page.evaluate(() => Object.values(window.NOACG_CATALOG.CATALOG).flatMap((variants) => (variants ?? []).map((v) => {
    const js = v.create({}).js;
    return {
      id: v.id,
      presets: v.animationPresets ?? [],
      credits: /function rebuildCredits\(/.test(js),
      clock: /function clockDataUpdated\(/.test(js),
    };
  })));
  const unknown = (only ?? []).filter((id) => !shipped.some((v) => v.id === id));
  if (unknown.length) throw new Error(`--only named id(s) the catalog does not ship: ${unknown.join(', ')}`);
  const inScope = only ? shipped.filter((v) => only.includes(v.id)) : shipped;

  const clocks = [];
  for (const v of inScope.filter((v) => v.clock)) clocks.push(await page.evaluate(CLOCK_RUN, { id: v.id }));

  const credits = [];
  for (const v of inScope.filter((v) => v.credits)) {
    for (const presetId of v.presets.length ? v.presets : [null]) {
      const run = (plan) => page.evaluate(CREDITS_RUN, { id: v.id, presetId, plan: { samples: SAMPLES_MS, ...plan } });
      const at = [EARLY_MS, ...(BLOCK_MOTIONS.includes(presetId) ? [LATE_MS] : [])];
      for (const ms of at) {
        credits.push({
          id: v.id, presetId, at: ms,
          untouched: await run({ at: ms, from: 'none', to: 'none' }),
          corrected: await run({ at: ms, from: 'none', to: 'fixed' }),
          typedSo: await run({ at: ms, from: 'fixed', to: 'fixed' }),
          grown: BLOCK_MOTIONS.includes(presetId) ? await run({ at: ms, from: 'none', to: 'grown' }) : null,
        });
      }
    }
  }
  return { clocks, credits };
});

measured(runs.clocks.length, 'catalog countdowns corrected after running out');
measured(runs.credits.length, 'credits designs and motions corrected on air');
console.error(`[on-air-corrections] ${runs.clocks.length} countdowns, ${runs.credits.length} credits runs, in ${((Date.now() - started) / 1000).toFixed(1)} s`);

const name = (r) => `${r.id} ${r.presetId ?? ''} corrected at ${r.at / 1000} s`;

test('every countdown really ran out before the correction (the checks below are not vacuous)', () => {
  const unread = runs.clocks.filter((r) => r.error).map((r) => `${r.id}: ${r.error}`);
  assert.deepEqual(unread, []);
  const running = runs.clocks.filter((r) => r.finished.left !== 0 || !r.finished.done).map((r) => `${r.id} (${JSON.stringify(r.finished)})`);
  assert.deepEqual(running, []);
});

test('a finished countdown holds 0:00 across an unrelated update', () => {
  const refilled = runs.clocks
    .filter((r) => r.afterUnrelated.left !== 0 || r.afterUnrelated.text !== r.finished.text || !r.afterUnrelated.done)
    .map((r) => `${r.id} (updated ${r.unrelated}): ${JSON.stringify(r.finished)} -> ${JSON.stringify(r.afterUnrelated)}`);
  assert.deepEqual(refilled, []);
});

test('a finished countdown given a new length is no longer finished', () => {
  const stuck = runs.clocks
    .filter((r) => r.afterNewLength.left !== 6 || r.afterNewLength.done)
    .map((r) => `${r.id}: ${JSON.stringify(r.afterNewLength)}`);
  assert.deepEqual(stuck, []);
});

test('the correction really changed the credit text (the comparison below is not vacuous)', () => {
  const same = runs.credits.filter((r) => !r.corrected.changed || r.corrected.samples[0].text === r.untouched.samples[0].text).map(name);
  assert.deepEqual(same, []);
});

test('a credits correction on air airs the corrected words', () => {
  const stale = [];
  for (const r of runs.credits) {
    r.corrected.samples.forEach((s, i) => {
      if (s.text !== r.typedSo.samples[i].text) stale.push(`${name(r)}, read at +${SAMPLES_MS[i]} ms`);
    });
  }
  assert.deepEqual(stale, []);
});

test('a credits correction on air leaves every block where the running motion has it', () => {
  const moved = [];
  for (const r of runs.credits) {
    r.corrected.samples.forEach((s, i) => {
      const u = r.untouched.samples[i];
      if (s.track !== u.track) moved.push(`${name(r)}, +${SAMPLES_MS[i]} ms: track ${u.track} became ${s.track}`);
      else if (s.blocks.join('\n') !== u.blocks.join('\n')) {
        const k = s.blocks.findIndex((b, j) => b !== u.blocks[j]);
        moved.push(`${name(r)}, +${SAMPLES_MS[i]} ms: ${s.blocks.length} blocks for ${u.blocks.length}, first difference ${u.blocks[k] ?? '(none)'} became ${s.blocks[k] ?? '(gone)'}`);
      }
    });
  }
  assert.deepEqual(moved, []);
});

test('a section added on air: a page swap still shows one page at a time and reaches its last page', () => {
  const broken = [];
  for (const r of runs.credits.filter((x) => x.presetId === 'credits-pages')) {
    const s = r.grown.samples;
    s.forEach((x, i) => { if (x.shown > 2) broken.push(`${name(r)}, +${SAMPLES_MS[i]} ms: ${x.shown} pages drawn at once`); });
    if (!s.at(-1).endShown) broken.push(`${name(r)}: the closing page never arrived`);
    if (!/northwind/i.test(s.at(-1).text)) broken.push(`${name(r)}: the added section is not in the list`);
  }
  assert.deepEqual(broken, []);
});

test('a section added on air: a reel keeps its copies and keeps moving', () => {
  const broken = [];
  for (const r of runs.credits.filter((x) => x.presetId === 'credits-loop')) {
    const s = r.grown.samples;
    if (s.some((x) => x.clones < 1)) broken.push(`${name(r)}: the reel lost its copies (${s.map((x) => x.clones).join(', ')})`);
    if (new Set(s.map((x) => x.track)).size < s.length) broken.push(`${name(r)}: the reel stopped (${s.map((x) => x.track).join(' / ')})`);
    if (!/northwind/i.test(s.at(-1).text)) broken.push(`${name(r)}: the added section is not in the list`);
  }
  assert.deepEqual(broken, []);
});
