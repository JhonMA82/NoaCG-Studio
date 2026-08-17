#!/usr/bin/env node
// WHAT THE NINE MARGINS IN `structure.ts` ACTUALLY MEASURE - rendered, not derived.
//
//   node scripts/spike-structure-margins.mjs              # the whole grid, FREE (~15 min)
//   node scripts/spike-structure-margins.mjs --quick      # one cell per graphic - wiring check
//   node scripts/spike-structure-margins.mjs --graphics=lower-third,sponsor-bug
//   node scripts/spike-structure-margins.mjs --skip-voice # grid only, no typography pass
//
// THE READING THIS EXISTS TO SETTLE. `structure.ts`'s header states a margin against each
// calibrated instrument threshold - "padding-tight floor 0.28, tightest here 0.34" and eight
// more - and that table is the whole argument for Phase A's doctrine that a threshold is cleared
// BY CONSTRUCTION. Exactly one of the nine had ever been rendered. The one that had
// (`mark-crowded`) came back 0.31 and 0.46 against a stated 0.4, wrong in both directions, which
// is what a derived number does: it reports the CSS the composer wrote rather than the box the
// browser painted, and those differ by line-height leading, by the mask idiom, by a fit-content
// panel that is sized by its own text, and by every size floor that fires above the anchor the
// ratio was derived from.
//
// EVERY NUMBER HERE COMES OFF THE LIVE INSTRUMENTS, never off a re-implementation. `measureSpacing`
// and `measureProportion` are called exactly as the spike calls them, with the graphic type's own
// thresholds (`PRO_GRAPHICS[id].instruments`), on a document `composeGraphic` +`composeDocument`
// built - the same two functions the product runs. A sweep that recomputed the ratios would be
// measuring this file's opinion of the composer instead of the composer.
//
// ── WHICH AXES THE GRID CARRIES, AND WHY THE OTHERS ARE NOT IN IT ──────────────────────────
//
// The header's own claims are parameterized on DENSITY and STEP ("at the WORST density/step
// combination this file can produce"), so those two are swept whole. Two more axes move the same
// numbers and are swept with them:
//
//   * ACCENT FORM decides whether a rule element exists inside the panel at all (claim 4), and
//     `block` raises the supporting line to BLOCK_LABEL_MIN_PX, which is the floor that already
//     broke the padding claim once (see the unit note in `resolveSpacing`);
//   * PANEL TREATMENT decides whether there IS a panel - `none` paints no surface, so padding,
//     fill and footprint have nothing to be relative to.
//
// PANEL is swept as `solid` and `none` only, and the reduction is EARNED rather than assumed:
// `translucent` and `blurred` differ from `solid` by alpha and a backdrop-filter, neither of which
// moves a box, and `--panels` re-measures all four at two cells per graphic and fails the run if
// any geometric number disagrees. CORNER is excluded on the same argument, checked the same way: a
// border-radius paints inside the border box it rounds.
//
// TYPOGRAPHIC VOICE - the face, the two cases and the tracking - is a SECOND pass rather than a
// grid axis. It changes glyph widths and line-box heights, so it moves the fit-content panel and
// therefore fill, footprint and horizontal balance; it cannot change a padding or gap the composer
// states in px. Swept over all 17 bundled faces and all 12 case/tracking combinations at the two
// extreme cells, which is where a face that breaks a claim would break it.
//
// MOTION IS PINNED to fade/fast, and that is a measurement decision: every claim is about the
// SETTLED frame, every preset settles to the same geometry, and the shortest entrance is the one
// that gets 500 renders done inside a coffee break.
//
// CONTENT IS MEASURED TWICE - the control's own words and the stress words the §0.2 human read
// gets beside them - because a fit-content panel is sized by its text and half these claims are
// about that panel. The stress pass is nearly free: it re-drives `update()` on a frame that is
// already mounted and settled.
//
// Requires the dev server on this checkout's port (node scripts/dev-port.mjs). FREE - no model
// call, no tokens.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';
import { LITE_BRAND_MARKS_BY_ID } from './ai-lite-brand-fixtures.mjs';

const args = process.argv.slice(2);
const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? null;
const QUICK = args.includes('--quick');
const SKIP_VOICE = args.includes('--skip-voice');
const SKIP_PANELS = args.includes('--skip-panels');
const OUT = path.resolve(arg('out') ?? 'benchmarks/pro/v1/spike/structure-margins.json');

const DENSITIES = ['compact', 'balanced', 'airy'];
const STEPS = ['subtle', 'clear', 'strong'];
const ACCENT_FORMS = ['edge-bar', 'top-rule', 'underline', 'block', 'none'];
/** The two that change geometry. `--panels` proves the other two do not. */
const GRID_PANELS = ['solid', 'none'];
const ALL_PANELS = ['solid', 'translucent', 'blurred', 'none'];
const ALL_CORNERS = ['sharp', 'soft', 'round', 'pill'];
const FACES = [
  'inter', 'space-grotesk', 'jetbrains-mono', 'manrope', 'archivo', 'oswald', 'bebas-neue',
  'playfair-display', 'source-serif-4', 'ibm-plex-sans', 'libre-franklin', 'sora', 'outfit',
  'anton', 'big-shoulders', 'saira', 'dm-sans',
];
const CASES = ['as-written', 'caps'];
const TRACKINGS = ['tight', 'normal', 'wide'];

/** Which graphics take a mark, and therefore how many arms each one is swept in. A markless
 *  sponsor bug is a composition the product never produces (`pro/language/control.ts`), and the
 *  countdown type declares `logo: 'none'`. */
const MARK_ARMS = {
  'lower-third': [false, true],
  'sponsor-bug': [true],
  countdown: [false],
};
const GRAPHICS = (arg('graphics') ?? 'lower-third,sponsor-bug,countdown')
  .split(',').map((s) => s.trim()).filter(Boolean);

const MARK_ID = arg('mark') ?? 'badge-square';
const mark = LITE_BRAND_MARKS_BY_ID.get(MARK_ID);
if (!mark) {
  console.error(`Unknown mark "${MARK_ID}". Known: ${[...LITE_BRAND_MARKS_BY_ID.keys()].join(', ')}`);
  process.exit(2);
}

/** The control's words, and the stress words beside them - `pro/language/control.ts`'s own, so a
 *  row here and a control row differ by the grid alone. */
const SHOW = { name: 'Priya Raghunathan', title: 'Senior Research Fellow', channel: 'Northgate Sport' };
const STRESS = {
  name: 'Priya Raghunathan-Vasquez',
  title: 'Senior Research Fellow, Centre for Comparative Media Policy',
  channel: 'Northgate Sport & Community Network',
};

/** A language built from the house one, varied on the axes under test. Normalized in the page by
 *  the real `normalizeDesignLanguage`, so a cell is always a language the product could receive. */
function languageFor(cell) {
  return {
    name: `grid-${cell.density}-${cell.step}-${cell.form}-${cell.panel}`,
    rationale: 'A grid cell of the structure-margin sweep.',
    palette: { accent: '#f6a623', panel: '#0a0c10', text: '#ffffff', textDim: '#aab2bd' },
    typography: {
      fontId: cell.fontId ?? 'space-grotesk',
      headingWeight: 'bold',
      supportingWeight: 'medium',
      step: cell.step,
      headingCase: cell.headingCase ?? 'as-written',
      supportingCase: cell.supportingCase ?? 'caps',
      tracking: cell.tracking ?? 'normal',
    },
    shape: { corner: cell.corner ?? 'sharp', panel: cell.panel },
    accent: { form: cell.form, weight: 'medium' },
    density: cell.density,
    motion: { character: 'fade', pace: 'fast' },
  };
}

const BASE = `http://localhost:${devPort()}`;
try {
  await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`Dev server not reachable at ${BASE} - start it first (npm run dev).`);
  process.exit(1);
}

const browser = await chromium.launch();

// ── THE PAGE IS RECYCLED, and that is a measurement decision rather than hygiene ───────────
//
// The first full run died at cell ~130 with "Target page, context or browser has been closed":
// every cell mounts a self-contained document (composeDocument inlines GSAP, the CSS and every
// asset as a data URL) into a fresh srcdoc iframe, and a few hundred of those exhaust the
// renderer whatever the driver does with `frame.remove()`. A sweep that dies two thirds of the
// way through reports a WORST reading taken over the cells it happened to reach, which is the
// most dangerous shape a measurement can have here - it looks complete.
//
// So the page is torn down and rebuilt every RESET_EVERY cells, and a cell that dies anyway is
// retried once on a fresh page rather than being silently dropped.
const RESET_EVERY = 40;
let page = null;
let markProbe = null;

async function freshPage() {
  if (page) await page.close().catch(() => undefined);
  page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (error) => console.log('  pageerror:', error.message));
  await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
  await page.locator('.topbar').waitFor();
  await page.locator('.wz-modal').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
  await page.keyboard.press('Escape');
  await page.locator('.wz-modal').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  // The modules, imported ONCE PER PAGE and cache-busted once. Every other spike script busts on
  // every evaluate because it renders tens of documents; this one renders hundreds, and
  // re-instantiating the composer's whole module graph each time costs more than the render does.
  // The bust still buys what it is for - a dev server that has been serving this checkout all day
  // cannot hand the run a stale composer - and NOTHING UNDER src/ MAY BE EDITED WHILE THIS RUNS,
  // which is the rule every sweep here already has (Vite would reload the page out from under the
  // measurement, and the next evaluate dies with "Execution context was destroyed").
  const probe = await page.evaluate(async (input) => {
    const bust = `?t=${Date.now()}`;
    const [contract, graphics, preview, spacing, proportion, assetInfo] = await Promise.all([
      import(`/src/ai/pro/language/contract.ts${bust}`),
      import(`/src/ai/pro/language/graphics.ts${bust}`),
      import(`/src/preview/composeDocument.ts${bust}`),
      import(`/src/ai/spike/spacingCheck.ts${bust}`),
      import(`/src/ai/spike/proportionCheck.ts${bust}`),
      import(`/src/assets/assetInfo.ts${bust}`),
    ]);
    window.__margins = { contract, graphics, preview, spacing, proportion };
    return assetInfo.probeMark({ path: input.path, data: input.data });
  }, { path: mark.path, data: mark.data });
  markProbe = markProbe ?? probe;
}

await freshPage();
if (!markProbe) {
  console.error('probeMark could not read the fixture mark - a mark arm cannot be measured.');
  await browser.close();
  process.exit(1);
}
console.log(`mark ${MARK_ID}: ${markProbe.backing} · ink luminance ${markProbe.inkLuminance?.toFixed?.(2)}`
  + ` · spread ${markProbe.inkSpread?.toFixed?.(4)}\n`);

/** One cell: compose, mount, settle, measure - at the control's words and again at the stress
 *  words. Every computed style is read while the frame is still attached, because a live
 *  CSSStyleDeclaration empties the moment its iframe leaves the DOM and every length then parses
 *  as 0 - a measurement of nothing, reported as a measurement. */
async function measureCell(cell) {
  return page.evaluate(async (input) => {
    const M = window.__margins;
    const language = M.contract.normalizeDesignLanguage(input.language);
    const spec = M.graphics.PRO_GRAPHICS[input.graphic];
    const lines = M.graphics.packageLines(input.graphic, input.show);
    const logo = input.logo ? {
      assetPath: input.logo.path,
      images: [{ path: input.logo.path, data: input.logo.data }],
      backing: input.logo.backing,
      inkLuminance: input.logo.inkLuminance,
      ...(typeof input.logo.inkSpread === 'number' ? { inkSpread: input.logo.inkSpread } : {}),
    } : null;

    let composed;
    try {
      composed = M.graphics.composeGraphic(input.graphic, language, { lines, ...(logo ? { logo } : {}) });
    } catch (e) {
      return { composeError: String(e?.message ?? e).slice(0, 300) };
    }
    const { template, spacing: resolved } = composed;

    /** The field payload an operator's text takes - text fields in order, the mark in its slot. */
    const drive = (show) => {
      const values = M.graphics.packageLines(input.graphic, show).map((l) => l.sample);
      const out = {};
      template.fields.filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea')
        .forEach((f, i) => { out[f.field] = values[i] ?? String(f.value ?? ''); });
      if (logo) {
        const slot = template.fields.find((f) => f.ftype === 'filelist');
        if (slot) out[slot.field] = logo.assetPath;
      }
      return out;
    };
    const markFieldId = logo
      ? (template.fields.find((f) => f.ftype === 'filelist')?.field ?? null)
      : null;

    document.getElementById('margin-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'margin-frame';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'z-index:99999;background:#333;color-scheme:dark;';
    document.body.appendChild(frame);
    frame.srcdoc = M.preview.composeDocument(template);
    await new Promise((resolve) => { frame.onload = resolve; });
    const win = frame.contentWindow;
    const doc = frame.contentDocument;

    let playError = null;
    try {
      win.update(JSON.stringify(drive(input.show)));
      win.play();
    } catch (e) {
      playError = String(e?.message ?? e).slice(0, 200);
    }
    await win.document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const base = { markFieldId };
    const read = () => {
      const spacing = M.spacing.measureSpacing(doc, { ...base, ...(spec.instruments.spacing ?? {}) });
      const proportion = M.proportion.measureProportion(doc, { ...base, ...(spec.instruments.proportion ?? {}) });
      // EVERY text-to-rule gap, harvested by asking the SAME instrument with a floor nothing can
      // reach. The report carries only findings, so a gap that clears the crowding band is
      // otherwise invisible - and "how near does the nearest rule come" is exactly the claim.
      // Ratios at or under RULE_CONTACT_RATIO are deliberate contact the instrument excludes by
      // design (the `block` form is drawn as contact), so they are absent here on purpose.
      const wide = M.spacing.measureSpacing(doc, {
        ...base, ...(spec.instruments.spacing ?? {}), ruleGapFloorRatio: 999,
      });
      const ruleGaps = wide.findings
        .filter((f) => f.code === 'text-crowds-rule')
        .map((f) => Number(/sits ([\d.]+) type sizes/.exec(f.detail)?.[1]))
        .filter((n) => Number.isFinite(n));
      return {
        panel: spacing.panel,
        typeSizePx: spacing.typeSizePx,
        padding: spacing.padding,
        lineGaps: spacing.lineGaps,
        markGap: spacing.markGap,
        escapes: spacing.escapes.filter((e) => e.isText).map((e) => `${e.desc} ${e.side} ${e.px}px`),
        ruleGaps,
        overRule: wide.findings.some((f) => f.code === 'text-over-rule'),
        typeRatio: proportion.typeRatio,
        typeSizes: proportion.typeSizes,
        markScale: proportion.markScale,
        panelFill: proportion.panelFill,
        footprint: proportion.footprint,
        codes: [...spacing.findings.map((f) => f.code), ...proportion.findings.map((f) => f.code)],
        details: [...spacing.findings, ...proportion.findings].map((f) => `${f.code}: ${f.detail}`),
      };
    };

    const normal = read();
    // The same mounted frame, re-driven. `update()` writes fields and never transitions, so the
    // settle here only has to outlast a reflow.
    try {
      win.update(JSON.stringify(drive(input.stress)));
    } catch { /* a lifecycle that already threw is recorded above */ }
    await new Promise((resolve) => setTimeout(resolve, 600));
    const stress = read();

    frame.remove();
    return {
      playError,
      resolved: {
        headingPx: resolved.headingPx,
        supportingPx: resolved.supportingPx,
        padVPx: resolved.padVPx,
        padHPx: resolved.padHPx,
        lineGapPx: resolved.lineGapPx,
        ruleGapPx: resolved.ruleGapPx,
        accentPx: resolved.accentPx,
        markHeightPx: resolved.markHeightPx,
        markGapPx: resolved.markGapPx,
      },
      normal,
      stress,
    };
  }, {
    graphic: cell.graphic,
    language: languageFor(cell),
    show: SHOW,
    stress: STRESS,
    logo: cell.mark
      ? {
        path: mark.path,
        data: mark.data,
        backing: markProbe.backing,
        inkLuminance: markProbe.inkLuminance,
        ...(typeof markProbe.inkSpread === 'number' ? { inkSpread: markProbe.inkSpread } : {}),
      }
      : null,
  });
}

// ── The cells ─────────────────────────────────────────────────────────────────────────────
const cells = [];
for (const graphic of GRAPHICS) {
  for (const withMark of MARK_ARMS[graphic] ?? [false]) {
    if (QUICK) {
      cells.push({ pass: 'grid', graphic, mark: withMark, density: 'compact', step: 'strong', form: 'underline', panel: 'solid' });
      continue;
    }
    for (const density of DENSITIES) {
      for (const step of STEPS) {
        for (const form of ACCENT_FORMS) {
          for (const panel of GRID_PANELS) {
            cells.push({ pass: 'grid', graphic, mark: withMark, density, step, form, panel });
          }
        }
      }
    }
  }
}

/** The two extreme cells every secondary pass is run at - the tightest composition this file can
 *  produce and the airiest. A face or a tracking that breaks a claim breaks it here. */
const EXTREMES = [
  { density: 'compact', step: 'strong', form: 'underline', panel: 'solid' },
  { density: 'airy', step: 'subtle', form: 'top-rule', panel: 'solid' },
];

if (!QUICK && !SKIP_PANELS) {
  for (const graphic of GRAPHICS) {
    const withMark = (MARK_ARMS[graphic] ?? [false])[0];
    for (const extreme of EXTREMES) {
      for (const panel of ALL_PANELS) {
        cells.push({ pass: 'panels', graphic, mark: withMark, ...extreme, panel });
      }
      for (const corner of ALL_CORNERS) {
        cells.push({ pass: 'corners', graphic, mark: withMark, ...extreme, corner });
      }
    }
  }
}

if (!QUICK && !SKIP_VOICE) {
  for (const graphic of GRAPHICS) {
    const withMark = (MARK_ARMS[graphic] ?? [false])[0];
    for (const extreme of EXTREMES) {
      for (const fontId of FACES) cells.push({ pass: 'faces', graphic, mark: withMark, ...extreme, fontId });
      for (const headingCase of CASES) {
        for (const supportingCase of CASES) {
          for (const tracking of TRACKINGS) {
            cells.push({ pass: 'voice', graphic, mark: withMark, ...extreme, headingCase, supportingCase, tracking });
          }
        }
      }
    }
  }
}

console.log(`${cells.length} cells across ${GRAPHICS.join(', ')}.\n`);

const rows = [];
let done = 0;
const started = Date.now();
for (const cell of cells) {
  if (done && done % RESET_EVERY === 0) await freshPage();
  let result;
  try {
    result = await measureCell(cell);
  } catch (error) {
    // A dead renderer is a lost CELL, never a lost run - and it is said out loud, because a
    // silently dropped cell is a worst-case reading taken over a set nobody knows the size of.
    console.log(`  page died on ${cellName(cell)} (${String(error.message).split('\n')[0]}) - remounting`);
    await freshPage();
    result = await measureCell(cell);
  }
  done += 1;
  if (result.composeError) {
    console.log(`  COMPOSE FAILED ${JSON.stringify(cell)}: ${result.composeError}`);
    rows.push({ ...cell, composeError: result.composeError });
    continue;
  }
  rows.push({ ...cell, ...result });
  if (result.playError) console.log(`  play() threw on ${cellName(cell)}: ${result.playError}`);
  if (done % 25 === 0 || done === cells.length) {
    const rate = (Date.now() - started) / done;
    console.log(`  ${done}/${cells.length} · ${Math.round((cells.length - done) * rate / 1000)}s left`);
  }
}
await browser.close();

function cellName(cell) {
  const extra = [cell.fontId, cell.headingCase && `h:${cell.headingCase}`,
    cell.supportingCase && `s:${cell.supportingCase}`, cell.tracking, cell.corner]
    .filter(Boolean).join('/');
  return `${cell.graphic}${cell.mark ? '+mark' : ''} ${cell.density}/${cell.step}/${cell.form}/${cell.panel}`
    + (extra ? ` ${extra}` : '');
}

// ── THE NINE CLAIMS, each reduced to the one number it states ─────────────────────────────
//
// Every claim is a WORST reading, so each reducer takes the extreme over every cell that produced
// a reading at all - and the cell that produced it is carried beside the number, because "0.31" is
// an assertion and "0.31 on a compact strong-step block bug" is a measurement somebody can re-run.

const ok = rows.filter((r) => !r.composeError);
const both = (r) => [{ ...r.normal, content: 'control' }, { ...r.stress, content: 'stress' }];

/** min or max over every (row, content) reading a selector produces a finite number for. */
function extreme(direction, pick, filter = () => true) {
  let best = null;
  for (const row of ok) {
    if (!filter(row)) continue;
    for (const reading of both(row)) {
      const value = pick(reading, row);
      if (!Number.isFinite(value)) continue;
      if (!best || (direction === 'min' ? value < best.value : value > best.value)) {
        best = { value, cell: cellName(row), content: reading.content };
      }
    }
  }
  return best;
}

const BLEED = 0.06;   // spacingCheck's own: a side under this is a deliberate bleed, not padding
const tightestSide = (reading) => {
  if (!reading.padding) return NaN;
  const sides = Object.values(reading.padding).filter((v) => v >= BLEED);
  return sides.length ? Math.min(...sides) : NaN;
};
const worstSkew = (reading) => {
  if (!reading.padding) return NaN;
  const p = reading.padding;
  const pairs = [['top', 'bottom']];
  if (p.left + p.right <= 4) pairs.push(['left', 'right']);   // HUG_TOTAL_RATIO
  let worst = NaN;
  for (const [a, b] of pairs) {
    if (p[a] < BLEED || p[b] < BLEED) continue;
    const [hi, lo] = p[a] >= p[b] ? [p[a], p[b]] : [p[b], p[a]];
    if (lo <= 0) continue;
    const ratio = Math.round((hi / lo) * 100) / 100;
    if (!Number.isFinite(worst) || ratio > worst) worst = ratio;
  }
  return worst;
};

const claims = {
  'padding-tight': {
    stated: 'floor 0.28 type sizes · tightest here 0.34',
    worst: 'min', measured: extreme('min', tightestSide),
  },
  'padding-lopsided': {
    stated: 'limit 2.6x · here exactly 1.0x',
    worst: 'max', measured: extreme('max', worstSkew),
  },
  'lines-adrift': {
    stated: 'ceiling 1.4 · widest here 0.83',
    worst: 'max', measured: extreme('max', (r) => (r.lineGaps.length ? Math.max(...r.lineGaps) : NaN)),
  },
  'lines-crowded': {
    stated: '(not in the table) floor 0 - only an overlap counts',
    worst: 'min', measured: extreme('min', (r) => (r.lineGaps.length ? Math.min(...r.lineGaps) : NaN)),
  },
  'text-crowds-rule': {
    stated: 'band 0.02-0.12 · nearest rule 0.45',
    worst: 'min', measured: extreme('min', (r) => (r.ruleGaps.length ? Math.min(...r.ruleGaps) : NaN)),
  },
  'type-ratio-thin': {
    stated: 'floor 0.28 · smallest step 0.36',
    worst: 'min', measured: extreme('min', (r) => r.typeRatio ?? NaN),
  },
  'type-ratio-flat': {
    stated: 'band 0.86-0.93 · largest step 0.62',
    worst: 'max', measured: extreme('max', (r) => r.typeRatio ?? NaN),
  },
  'panel-oversized': {
    stated: 'fill floor 0.18 · lowest here ~0.47',
    worst: 'min', measured: extreme('min', (r) => r.panelFill ?? NaN),
  },
  'footprint-large': {
    stated: 'ceiling 0.10 of frame · largest here ~0.071',
    worst: 'max', measured: extreme('max', (r) => r.footprint ?? NaN),
  },
  'mark-oversized': {
    stated: 'ceiling 3.2 type sizes · here 1.2',
    worst: 'max', measured: extreme('max', (r) => r.markScale ?? NaN),
  },
  'mark-crowded/adrift': {
    stated: 'band 0.35-2.1 · here 0.48 seated, 0.72 with a mark band',
    worst: 'min', measured: extreme('min', (r) => r.markGap ?? NaN),
  },
  'mark-adrift (the other end)': {
    stated: 'ceiling 2.1',
    worst: 'max', measured: extreme('max', (r) => r.markGap ?? NaN),
  },
};

console.log('\n── THE NINE MARGINS, MEASURED ──────────────────────────────────────────────');
for (const [code, claim] of Object.entries(claims)) {
  const m = claim.measured;
  console.log(`${code.padEnd(28)} stated: ${claim.stated}`);
  console.log(`${' '.repeat(28)} measured ${claim.worst}: ${m ? `${m.value}  (${m.cell}, ${m.content} words)` : 'NO READING'}`);
}

// ── Per graphic, because the table is one line per claim and the package is three types ────
console.log('\n── PER GRAPHIC ─────────────────────────────────────────────────────────────');
for (const graphic of GRAPHICS) {
  const only = (r) => r.graphic === graphic;
  const line = (label, dir, pick) => {
    const m = extreme(dir, pick, only);
    return `${label} ${m ? m.value : '-'}`;
  };
  console.log(`${graphic.padEnd(14)} ${line('padTightest', 'min', tightestSide)}`
    + `  ${line('skew', 'max', worstSkew)}`
    + `  ${line('lineGapMax', 'max', (r) => (r.lineGaps.length ? Math.max(...r.lineGaps) : NaN))}`
    + `  ${line('ruleMin', 'min', (r) => (r.ruleGaps.length ? Math.min(...r.ruleGaps) : NaN))}`
    + `  ${line('typeMin', 'min', (r) => r.typeRatio ?? NaN)}`
    + `  ${line('typeMax', 'max', (r) => r.typeRatio ?? NaN)}`
    + `  ${line('fillMin', 'min', (r) => r.panelFill ?? NaN)}`
    + `  ${line('footMax', 'max', (r) => r.footprint ?? NaN)}`
    + `  ${line('markScale', 'max', (r) => r.markScale ?? NaN)}`
    + `  ${line('markGapMin', 'min', (r) => r.markGap ?? NaN)}`);
}

// ── What the instruments actually FLAGGED ─────────────────────────────────────────────────
const flagged = new Map();
for (const row of ok) {
  for (const reading of both(row)) {
    for (const code of reading.codes) {
      const key = `${code} · ${row.graphic}`;
      if (!flagged.has(key)) flagged.set(key, []);
      flagged.get(key).push(`${cellName(row)} [${reading.content}]`);
    }
  }
}
console.log('\n── FINDINGS THE LIVE INSTRUMENTS RAISED ────────────────────────────────────');
if (!flagged.size) console.log('none - every cell measured clean on both content shapes.');
for (const [key, where] of [...flagged.entries()].sort()) {
  console.log(`${key.padEnd(34)} ${where.length} cell(s): ${where.slice(0, 4).join(' | ')}${where.length > 4 ? ' …' : ''}`);
}

// ── The two reductions, EARNED ────────────────────────────────────────────────────────────
//
// The grid sweeps two panel treatments and one corner. These blocks are what entitle it to: they
// re-measure all four of each at the extreme cells and report any geometric number that moved. A
// disagreement here means the reduction is wrong and the grid has a hole, so it is printed loudly
// rather than folded into a pass line.
function reductionCheck(pass, axis, values) {
  const subset = ok.filter((r) => r.pass === pass);
  if (!subset.length) return;
  const keyOf = (r) => `${r.graphic}/${r.density}/${r.step}/${r.form}`;
  const geometry = (r) => JSON.stringify([
    r.normal.padding, r.normal.lineGaps, r.normal.ruleGaps, r.normal.typeRatio,
    r.normal.panelFill, r.normal.footprint, r.normal.markScale, r.normal.markGap,
  ]);
  const groups = new Map();
  for (const r of subset) {
    const key = keyOf(r);
    if (!groups.has(key)) groups.set(key, new Map());
    groups.get(key).set(r[axis], { geo: geometry(r), row: r });
  }
  const moved = [];
  for (const [key, byValue] of groups) {
    // `none` genuinely removes the panel, so it is compared against nothing - the grid carries it.
    const compare = values.filter((v) => v !== 'none' && byValue.has(v));
    const seen = new Set(compare.map((v) => byValue.get(v).geo));
    if (seen.size > 1) moved.push(`${key}: ${compare.map((v) => `${v}=${byValue.get(v).geo}`).join(' vs ')}`);
  }
  console.log(`\n${axis} reduction: ${moved.length ? 'BROKEN - the grid has a hole' : 'holds'}`
    + ` (${groups.size} cell group(s) across ${values.join(', ')})`);
  for (const m of moved) console.log(`  ${m}`);
}
reductionCheck('panels', 'panel', ALL_PANELS);
reductionCheck('corners', 'corner', ALL_CORNERS);

// ── Did the typographic voice move a claim past the grid's answer? ────────────────────────
if (!SKIP_VOICE && !QUICK) {
  const gridOnly = (r) => r.pass === 'grid';
  const voiceOnly = (r) => r.pass === 'faces' || r.pass === 'voice';
  console.log('\n── THE TYPOGRAPHIC VOICE, against the grid ─────────────────────────────────');
  const pairs = [
    ['padding tightest', 'min', tightestSide],
    ['skew', 'max', worstSkew],
    ['line gap widest', 'max', (r) => (r.lineGaps.length ? Math.max(...r.lineGaps) : NaN)],
    ['nearest rule', 'min', (r) => (r.ruleGaps.length ? Math.min(...r.ruleGaps) : NaN)],
    ['panel fill lowest', 'min', (r) => r.panelFill ?? NaN],
    ['footprint largest', 'max', (r) => r.footprint ?? NaN],
  ];
  for (const [label, dir, pick] of pairs) {
    const g = extreme(dir, pick, gridOnly);
    const v = extreme(dir, pick, voiceOnly);
    const past = g && v && (dir === 'min' ? v.value < g.value : v.value > g.value);
    console.log(`${label.padEnd(20)} grid ${String(g?.value ?? '-').padEnd(7)} voice ${String(v?.value ?? '-').padEnd(7)}`
      + `${past ? `  <- THE VOICE IS WORSE: ${v.cell} (${v.content})` : ''}`);
  }
}

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify({
  sweptAt: null,
  mark: MARK_ID,
  markProbe,
  graphics: GRAPHICS,
  quick: QUICK,
  cells: rows.length,
  claims,
  rows,
}, null, 2)}\n`);
console.log(`\nWritten: ${OUT}`);
