// gate: factory
// needs: browser
// guards: src/templates/importedDesign/behaviourRuntime.ts, src/templates/behaviours/bingo.ts, e2e/fixtures/svg-shows/bingo-board.svg
//
// A CALLED BINGO NUMBER IS READABLE ON ITS AMBER PLATE (issue #784).
//
// The sample bingo board draws its numerals white for the dark board and lights an amber plate
// under a number when it is called. White on amber is the one pairing on that board below 3:1,
// on exactly the tile a player in the room is looking for. The behaviour runtime now gives a
// readout a dark or a light ink while a lit look of its own row sits under it and its drawn ink
// is unreadable there, and gives the drawn ink back when the look goes.
//
// The board runs through the real import, the real proposal and the real composer, in Chromium,
// on a clock this file drives: call 7, call 12, take 12 back, then a new game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';
import { DRIVEN_CLOCK } from './driven-clock.mjs';
import { measured } from './measured.mjs';

const entry = (rel) => fileURLToPath(new URL(`../src/${rel}`, import.meta.url));
const SPECS = [
  { entry: entry('assets/svgImport.ts'), globalName: 'NOACG_SVG' },
  { entry: entry('components/wizard/import/draft.ts'), globalName: 'NOACG_DRAFT' },
  { entry: entry('templates/importedDesign/svg.ts'), globalName: 'NOACG_IMPORTED' },
  { entry: entry('preview/composeDocument.ts'), globalName: 'NOACG_COMPOSE' },
];
const BOARD = readFileSync(new URL('../e2e/fixtures/svg-shows/bingo-board.svg', import.meta.url), 'utf8');

/** Runs in the browser: build the board as the wizard would, then call numbers and read inks. */
const CALLS = async ({ markup, calls }) => {
  const svg = window.NOACG_SVG.importSvgMarkup(markup);
  const behaviour = window.NOACG_DRAFT.proposeSvgBehaviour(svg);
  const draft = {
    designSvg: svg,
    svgFields: svg.candidates.map((c) => ({ candidateId: c.id, title: c.label, sample: c.sample, numeric: c.numeric, on: true })),
    svgImages: [], svgOutlines: [], svgBehaviour: behaviour, svgExtras: [],
    svgStretch: { on: false, shapeId: null }, svgFonts: [],
  };
  const template = window.NOACG_IMPORTED.IMPORTED_SVG.create({ designSvg: window.NOACG_DRAFT.svgDesignOptions(draft) });
  const called = template.fields.find((f) => f.title === 'Called numbers');
  if (!called) return { error: `no Called numbers field (behaviour ${JSON.stringify(behaviour?.recipe ?? behaviour?.kind)})` };

  const html = window.NOACG_COMPOSE.composeDocument(template);
  const srcdoc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + window.__TEST_CLOCK) : window.__TEST_CLOCK + html;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;';
  await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = srcdoc; document.body.appendChild(frame); });
  const w = frame.contentWindow;
  const numeral = (n) => w.document.querySelector(`[data-name="Number ${n}"], #Number_x20_${n}`);
  const plate = (n) => w.document.querySelector(`[data-name="Called ${n}"] rect, #Called_x20_${n} rect`);
  const rgb = (c) => (/rgba?\(([^)]+)\)/.exec(c)?.[1] ?? '').split(',').slice(0, 3).map(Number);
  const lum = (c) => {
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const [r, g, b] = rgb(c).map(lin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const read = (n) => {
    const ink = w.getComputedStyle(numeral(n)).fill;
    const p = plate(n);
    const lit = p && w.getComputedStyle(p).display !== 'none' && w.getComputedStyle(p.parentElement).display !== 'none';
    const under = lit ? w.getComputedStyle(p).fill : w.getComputedStyle(w.document.querySelector('#Board rect, [data-name="Board"] rect')).fill;
    const [a, b] = [lum(ink), lum(under)];
    return { n, lit: !!lit, ink, under, contrast: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10 };
  };
  w.update(JSON.stringify({}));
  w.play();
  w.__advance(3000);
  const drawn = read(7);
  const steps = [];
  for (const list of calls) {
    w.update(JSON.stringify({ [called.field]: list.join('\n') }));
    w.__advance(1000);
    steps.push({ list, tiles: [7, 12, 13].map(read) });
  }
  frame.remove();
  return { drawn, steps };
};

const run = await withBundledPage(SPECS, async (page) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate((clock) => { window.__TEST_CLOCK = clock; }, DRIVEN_CLOCK);
  return page.evaluate(CALLS, { markup: BOARD, calls: [['7'], ['7', '12'], ['7'], []] });
});

measured(run.steps?.length ?? 0, 'bingo calls read');

test('the board builds as a bingo caller', () => {
  assert.equal(run.error, undefined);
});

test('every called tile is lit and its numeral reads at 3:1 or better on the plate', () => {
  const bad = [];
  for (const step of run.steps) {
    for (const t of step.tiles) {
      const called = step.list.includes(String(t.n));
      if (called !== t.lit) bad.push(`after [${step.list}] tile ${t.n} is ${t.lit ? 'lit' : 'dark'}`);
      else if (t.contrast < 3) bad.push(`after [${step.list}] tile ${t.n}: ${t.ink} on ${t.under} is ${t.contrast}:1`);
    }
  }
  assert.deepEqual(bad, []);
});

test('a tile that is not called, or is taken back, keeps the ink it was drawn in', () => {
  const changed = [];
  for (const step of run.steps) {
    for (const t of step.tiles) if (!t.lit && t.ink !== run.drawn.ink) changed.push(`after [${step.list}] tile ${t.n}: ${t.ink}, drawn ${run.drawn.ink}`);
  }
  assert.deepEqual(changed, []);
});
