// THE VALUE GATE (docs/AI_LITE_BRAND_PLAN.md §2) - the round that decides whether NoaCG Lite
// stays in the product at all.
//
// Everything shipped on Lite so far is MACHINE evidence: 121 of 125 machine-usable, every
// accent verbatim. None of it answers the only question that matters commercially - is a
// generated graphic worth more to a user than the free template beside it? So this script puts
// three arms of the SAME brief in front of one human, blind:
//
//   template  the best-matching catalog design a user finds in Browse, in its own house
//             colours, with the brief's words typed in. Free, no AI, no brand.
//   diy       that same design hand-branded the way the wizard lets anyone brand it: the brand
//             palette through the Style panel, the mark in the logo slot. Honest, not sabotaged
//             - including the taste mistakes a non-designer's own palette brings with it.
//   lite      one Lite generation from the same brief plus the same brand input.
//
// The template and diy arms cost NOTHING (no model call - `variant.create()` is the wizard's own
// assembler). Only the lite arm spends, and it is filmed by `scripts/ai-lite-eval.mjs` in the
// ordinary way; this script joins its rows by fixture id.
//
//   node scripts/ai-lite-value-gate.mjs <out-dir>                 render the free arms + sheet
//   node scripts/ai-lite-value-gate.mjs <out-dir> --sheet-only    rebuild the sheet only
//   node scripts/ai-lite-value-gate.mjs <out-dir> --verdict <f>   unblind and apply the rule
//
// THE VERDICT MODE IS NOT A REVIEW AID. Do not run it, and do not open value-gate-key.json,
// before the ballot is in: a previous round leaked machine verdicts per blind id into the
// session transcript and spoiled the read (docs/AI_LITE_BRAND_PLAN.md §2).

import { chromium } from '@playwright/test';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { devPort } from './dev-port.mjs';
import { outDir } from './out-dir.mjs';
import { UPDATE_COPY, captureLifecycle } from './ai-lite-capture.mjs';
import { seededRandom } from './ai-lite-bench/suites.mjs';
import { LITE_BRAND_MARKS_BY_ID, LITE_BRAND_PALETTES } from './ai-lite-brand-fixtures.mjs';
import { LITE_MATRIX_JOBS } from './ai-lite-matrix-fixtures.mjs';

const BASE = `http://localhost:${devPort()}`;
const OUT = path.resolve(outDir(process.argv[2], './lite-value-gate-out', 'Usage: node scripts/ai-lite-value-gate.mjs <out-dir> [--sheet-only|--verdict <judgements.jsonl>]'));
const SHEET_ONLY = process.argv.includes('--sheet-only');
const VERDICT_FILE = process.argv[process.argv.indexOf('--verdict') + 1];
const VERDICT = process.argv.includes('--verdict');
const FFMPEG = (process.env.FFMPEG_PATH ?? 'ffmpeg').trim() || 'ffmpeg';

export const VALUE_GATE_VERSION = 1;

/**
 * What the brief's words are, per job, and what a user would type into Browse to find a design
 * for it.
 *
 * The COPY is authored here rather than taken from the Lite result, because the two free arms
 * have no model to pick their lines: a wizard user types their own. Using the brief's own names
 * keeps the three arms comparable - if the template arm carried the design's shipped sample
 * names ("Jane Doe"), the reviewer would identify that arm instantly and the round would stop
 * being blind. That is a deliberate departure from §2's "sample content", and it makes the
 * template arm STRONGER, never weaker.
 *
 * `role` is what the mid-clip update swaps (UPDATE_COPY), so every arm gets the same longer-copy
 * legibility test.
 *
 * `style` is HOW the free arms find their design, and it is a facet rather than a text query
 * because that is what the storefront actually answers with. Measured here: every lower third
 * declares itself relevant to every programme, so a family/format chip returns all 82 with an
 * identical score and a text query is token-AND ("news anchor lower third" matches nothing).
 * Browse's own order is then the catalog's, and the honest model of a user is the one decision
 * the storefront really does let them make - the STYLE family that suits their show - taking the
 * first design in it. See the note on designRank for the second appearance of a job.
 */
const JOB_CONTENT = {
  'news-anchor': {
    style: 'editorial',
    lines: [
      { title: 'Name', sample: 'Martin Hale', role: 'person-name' },
      { title: 'Role', sample: 'Evening News', role: 'person-role' },
    ],
  },
  'matchday-player': {
    style: 'sport',
    lines: [
      { title: 'Player', sample: 'Mateo Silva', role: 'person-name' },
      { title: 'Team', sample: 'Northbridge FC', role: 'team-name' },
    ],
  },
  'lecture-speaker': {
    style: 'minimal',
    lines: [
      { title: 'Speaker', sample: 'Dr. Anika Ramanathan', role: 'person-name' },
      { title: 'Role', sample: 'Professor of Environmental Engineering', role: 'person-role' },
    ],
  },
  'briefing-spokesperson': {
    style: 'noacg',
    lines: [
      { title: 'Name', sample: 'Marisol Vega', role: 'person-name' },
      { title: 'Role', sample: 'Emergency Management Director', role: 'person-role' },
    ],
  },
  'creator-profile': {
    style: 'glass',
    lines: [
      { title: 'Name', sample: 'Tomas Aalto', role: 'person-name' },
      { title: 'Role', sample: 'Fourth-Generation Baker', role: 'person-role' },
    ],
  },
};

/**
 * The eight briefs, drawn from the volume matrix so the lite arm is a cell of a bank that has
 * already been measured at scale rather than a fixture invented for this round.
 *
 * The first five are a diagonal of the grid: five jobs x five marks x five palettes, each
 * exactly once. The last three add the pairings worth a human's eye - a knockout-only mark on a
 * light package (§3.4), a crest against a pale accent, a portrait mark on a dark maroon - and
 * repeat a job with a DIFFERENT design, because two briefs sharing a job would otherwise produce
 * two identical template renders and a duplicate image in a blind sheet names its own arm.
 *
 * `designRank` is which Browse hit the free arms use: rank 0 for a job's first appearance, rank
 * 1 for its second. A user with two shows does not brand the same design twice.
 */
const CELLS = [
  { id: 'mx-news-anchor-wordmark-dark-meridian', job: 'news-anchor', markId: 'wordmark-dark', palette: 'meridian', designRank: 0 },
  { id: 'mx-lecture-speaker-wordmark-light-northbridge', job: 'lecture-speaker', markId: 'wordmark-light', palette: 'northbridge', designRank: 0 },
  { id: 'mx-creator-profile-badge-square-clubBlue', job: 'creator-profile', markId: 'badge-square', palette: 'clubBlue', designRank: 0 },
  { id: 'mx-matchday-player-banner-wide-paper', job: 'matchday-player', markId: 'banner-wide', palette: 'paper', designRank: 0 },
  { id: 'mx-briefing-spokesperson-shield-tall-sand', job: 'briefing-spokesperson', markId: 'shield-tall', palette: 'sand', designRank: 0 },
  { id: 'mx-creator-profile-wordmark-light-paper', job: 'creator-profile', markId: 'wordmark-light', palette: 'paper', designRank: 1 },
  { id: 'mx-matchday-player-badge-square-sand', job: 'matchday-player', markId: 'badge-square', palette: 'sand', designRank: 1 },
  { id: 'mx-news-anchor-shield-tall-northbridge', job: 'news-anchor', markId: 'shield-tall', palette: 'northbridge', designRank: 1 },
];

/** The fixture ids the paid lite arm must cover - printed so the round can be fired exactly. */
export const VALUE_GATE_FIXTURE_IDS = CELLS.map((cell) => cell.id);

const JOB_PROMPT = new Map(LITE_MATRIX_JOBS.map((job) => [job.id, job.prompt]));

// ── The two free arms ─────────────────────────────────────────────────────────

/**
 * Build one wizard assembly in the page and mount it exactly as the eval mounts a Lite result.
 *
 * Both free arms run THIS function; they differ only in whether the brand palette and the mark
 * ride along. That is the point of the arm design: template -> diy isolates branding, and
 * diy -> lite isolates what the model decided.
 */
const buildArm = async ({ style, designRank, lines, palette, mark, updateCopy }) => {
  const { browseTemplates, NO_BROWSE_FILTERS } = await import('/src/templates/search.ts');
  const { parseAnimData } = await import('/src/blocks/animData.ts');
  const { composeDocument } = await import('/src/preview/composeDocument.ts');

  // WHAT A USER FINDS IN BROWSE - the real storefront engine, not a hand-picked chassis.
  //
  // Two filters, and neither is a thumb on the scale. `logo !== 'none'` because both free arms
  // must be the SAME design and a user who means to put their mark on a graphic does not choose
  // one with nowhere to put it. `imageSlot !== 'picture'` because a picture well is not a mark
  // well: ls25's slot is release artwork and correctly crops to a square, so branding it would
  // stage a defect the design does not have (src/model/wizard.ts documents the distinction).
  const outcome = browseTemplates({ ...NO_BROWSE_FILTERS, style, category: 'lower-third' });
  const ranked = outcome.best.filter((result) => (
    result.variant.logo !== 'none' && result.variant.imageSlot !== 'picture'
  ));
  if (!ranked.length) throw new Error(`Browse found no mark-capable ${style} lower third`);
  const variant = ranked[Math.min(designRank, ranked.length - 1)].variant;

  const template = variant.create({
    resolution: { width: 1920, height: 1080, label: '1080p' },
    fps: 50,
    lines: lines.map(({ title, sample }) => ({ title, sample })),
    // The DIY arm's colours are the brand's, UNREPAIRED. The Style panel writes what the user
    // picks; Lite's furniture ladder (`applyLiteBrandPalette`) is a Lite feature, and lending it
    // to this arm would measure Lite twice and call one of them manual work.
    ...(palette ? { palette: { id: 'brand', name: 'Brand', styleTags: [variant.styleTag], ...palette } } : {}),
    ...(mark
      ? { importedImages: [{ path: mark.path, data: mark.data }], logoEnabled: true, logoAssetPath: mark.path }
      : {}),
  });

  const animData = parseAnimData(template.js);
  const entranceDurationMs = animData ? (animData.steps[0].duration / animData.speed) * 1000 : 3000;
  const exitDurationMs = animData ? (animData.steps.at(-1).duration / animData.speed) * 1000 : 1500;

  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;width:1920px;height:1080px;overflow:hidden;background:radial-gradient(circle at 35% 20%,#334155,#111827 58%,#05070a)';
  const frame = document.createElement('iframe');
  frame.id = 'lite-eval-frame';
  frame.style.cssText = 'position:absolute;inset:0;width:1920px;height:1080px;border:0;background:transparent';
  await new Promise((resolve) => {
    frame.onload = resolve;
    frame.srcdoc = composeDocument(template);
    document.body.appendChild(frame);
  });

  // The text fields in declaration order - the same positional binding the assemblers use, so
  // the update swap lands on the line whose role asked for it.
  const textFields = template.fields.filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea');
  return {
    variantId: variant.id,
    variantName: variant.name,
    fieldCount: template.fields.length,
    entranceDurationMs,
    exitDurationMs,
    initialData: Object.fromEntries(textFields.map((field, index) => [field.field, lines[index]?.sample ?? field.value])),
    updateData: Object.fromEntries(textFields.map((field, index) => {
      const role = lines[index]?.role;
      return [field.field, (role && updateCopy[role]) || lines[index]?.sample || field.value];
    })),
  };
};

async function renderFreeArms() {
  await mkdir(OUT, { recursive: true });
  const rawVideoDir = path.join(OUT, '.raw-video');
  await mkdir(rawVideoDir, { recursive: true });
  const browser = await chromium.launch();
  const rows = [];
  try {
    for (const cell of CELLS) {
      const content = JOB_CONTENT[cell.job];
      const mark = LITE_BRAND_MARKS_BY_ID.get(cell.markId);
      const palette = LITE_BRAND_PALETTES[cell.palette];
      for (const arm of ['template', 'diy']) {
        process.stdout.write(`- ${cell.id} ${arm}: `);
        const captured = await captureLifecycle({
          browser,
          base: BASE,
          out: OUT,
          rawVideoDir,
          label: arm,
          itemId: cell.id,
          ffmpeg: FFMPEG,
          buildFn: buildArm,
          buildArg: {
            style: content.style,
            designRank: cell.designRank,
            lines: content.lines,
            updateCopy: UPDATE_COPY,
            palette: arm === 'diy' ? palette : null,
            mark: arm === 'diy' ? { path: mark.path, data: mark.data } : null,
          },
        });
        rows.push({ cellId: cell.id, arm, ...captured });
        console.log(`${captured.variantId} (${captured.variantName})`);
      }
    }
  } finally {
    await browser.close();
  }
  await writeFile(
    path.join(OUT, 'value-gate-arms.json'),
    JSON.stringify({ version: VALUE_GATE_VERSION, rows }, null, 2),
    'utf8',
  );
  return rows;
}

// ── The blind sheet ───────────────────────────────────────────────────────────

/** Every lite row in the out dir, keyed by fixture id. Only machine-usable rows can be shown:
 *  a result the platform itself refused was never a delivered graphic, and putting one in the
 *  gallery would ask the owner to judge something no user would ever have received. */
async function liteRows() {
  const byFixture = new Map();
  for (const file of (await readdir(OUT)).filter((name) => name.endsWith('-metrics.json'))) {
    const parsed = JSON.parse(await readFile(path.join(OUT, file), 'utf8'));
    for (const row of parsed.rows ?? []) {
      if (row.status === 'machine-usable' && row.phaseFiles?.hold) byFixture.set(row.fixtureId, row);
    }
  }
  return byFixture;
}

async function buildSheet() {
  const armRows = JSON.parse(await readFile(path.join(OUT, 'value-gate-arms.json'), 'utf8')).rows;
  const lite = await liteRows();
  const items = [];
  const missing = [];
  for (const cell of CELLS) {
    for (const arm of ['template', 'diy', 'lite']) {
      const row = arm === 'lite'
        ? lite.get(cell.id)
        : armRows.find((candidate) => candidate.cellId === cell.id && candidate.arm === arm);
      if (!row) { missing.push(`${cell.id}:${arm}`); continue; }
      items.push({
        key: `${cell.id}:${arm}`,
        cellId: cell.id,
        arm,
        variantId: row.variantId ?? null,
        still: row.phaseFiles.hold,
        phases: row.phaseFiles,
        motion: row.motionFile ?? null,
      });
    }
  }
  if (missing.length) console.warn(`Missing arms (not in the sheet): ${missing.join(', ')}`);

  // Shuffle EVERYTHING flat. Grouping the three arms of a brief, or keeping a stable arm order
  // inside a group, would let position answer the question the reviewer is being asked.
  let seed = 0;
  for (const item of items) for (const ch of item.key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = seededRandom(seed || 1);
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Neutral asset names, so nothing in a filename, a URL or a saved image says which arm it is.
  const assetsDir = path.join(OUT, 'gate-assets');
  await mkdir(assetsDir, { recursive: true });
  const gallery = [];
  for (const [index, item] of shuffled.entries()) {
    const code = `item-${String(index + 1).padStart(2, '0')}`;
    const stillName = `${code}-still.png`;
    await copyFile(path.join(OUT, item.still), path.join(assetsDir, stillName));
    const phases = {};
    for (const [phase, file] of Object.entries(item.phases)) {
      const name = `${code}-${phase}.png`;
      await copyFile(path.join(OUT, file), path.join(assetsDir, name));
      phases[phase] = `gate-assets/${name}`;
    }
    let motion = null;
    if (item.motion) {
      const motionName = `${code}-motion.webm`;
      await copyFile(path.join(OUT, item.motion), path.join(assetsDir, motionName));
      motion = `gate-assets/${motionName}`;
    }
    const cell = CELLS.find((candidate) => candidate.id === item.cellId);
    const mark = LITE_BRAND_MARKS_BY_ID.get(cell.markId);
    const markName = `brand-${cell.markId}.svg`;
    await writeFile(
      path.join(assetsDir, markName),
      Buffer.from(String(mark.data).split(',')[1], 'base64'),
    );
    gallery.push({
      code,
      brief: JOB_PROMPT.get(cell.job),
      brandMark: `gate-assets/${markName}`,
      brandPalette: LITE_BRAND_PALETTES[cell.palette],
      still: `gate-assets/${stillName}`,
      phases,
      motion,
    });
    // The key is written from the SHUFFLED list and nothing else records the mapping.
    item.code = code;
  }

  await writeFile(
    path.join(OUT, 'value-gate-key.json'),
    JSON.stringify(shuffled.map(({ code, key, cellId, arm, variantId }) => ({ code, key, cellId, arm, variantId })), null, 2),
    'utf8',
  );

  const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NoaCG value gate - blind review</title>
<style>
  :root{color-scheme:dark;font-family:system-ui,sans-serif;background:#090b0f;color:#e8edf2}
  body{margin:0 auto;max-width:1500px;padding:28px}
  h1{margin:0 0 6px}
  .sub{color:#aeb7c3;margin:0 0 20px;max-width:900px;line-height:1.55}
  .bar{display:flex;gap:12px;align-items:center;margin:0 0 18px;flex-wrap:wrap;position:sticky;top:0;background:#090b0f;padding:10px 0;z-index:5}
  input,button{font:inherit;background:#12161d;color:#e8edf2;border:1px solid #29313d;border-radius:8px;padding:8px 12px}
  button{cursor:pointer}button.primary{border-color:#ffb000;color:#ffb000}
  .card{background:#12161d;border:1px solid #29313d;border-radius:12px;padding:18px;margin:0 0 22px}
  .card img.still,.card video{display:block;width:100%;height:auto;background:#05070a;border-radius:8px;margin:0 0 12px}
  .brand{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin:0 0 12px;padding:12px;border:1px solid #29313d;border-radius:8px;background:#0c1015}
  /* The mark is shown TWICE, once on light and once on dark. A brand kit's mark may be dark ink
     or a knockout, and either one vanishes against a single-tone preview - which would hide from
     the reviewer the very thing they are being asked to look for in the graphic. */
  .marks{display:flex;gap:8px;align-items:center}
  .brand img{height:34px;width:auto;max-width:250px;padding:6px 10px;border-radius:6px;border:1px solid #3a4351}
  .brand img.on-light{background:#f2f3f5}
  .brand img.on-dark{background:#0b0e12}
  .swatches{display:flex;gap:10px}
  .sw{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10px;color:#8d97a5;letter-spacing:.04em}
  .sw i{display:block;width:34px;height:34px;border-radius:6px;border:1px solid #3a4351}
  .brief{color:#c6cfda;font-size:14px;line-height:1.5;margin:0 0 12px}
  .phases{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0 0 12px}
  .phases img{width:100%;height:auto;border-radius:6px;background:#05070a}
  .judge{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .judge .grp{display:flex;gap:6px;align-items:center}
  .judge button.sel{border-color:#ffb000;color:#ffb000}
  .label{color:#8d97a5;font-size:13px;text-transform:uppercase;letter-spacing:.06em}
  .done{opacity:.55}
  .defect.sel{border-color:#ff5a4d;color:#ff5a4d}
</style>
<body>
<h1>Blind value gate</h1>
<p class="sub">One question per graphic: <strong>would you put this on air for THIS brand?</strong> The brand is the block at the top of each card - the mark the customer sent and the colours they gave you. Then two 1-5 scores: <strong>brand fit</strong> (does it look like that brand's graphic) and <strong>quality</strong> (is it a good broadcast graphic at all), and a tick if you see a brand-fidelity <strong>defect</strong> - wrong colour, missing mark, unreadable mark. Judge the still at 100% and use the clip for the entrance, settle and exit. Items are shuffled and unlabelled; the copy changes once mid-clip on purpose (a longer-name legibility test), never read that as a fault. Progress saves in this browser. When finished, press Download and send the file back.</p>
<div class="bar">
  Reviewer <input id="reviewer" placeholder="initials" size="8">
  <span id="progress"></span>
  <button class="primary" id="download">Download ballot</button>
</div>
<div id="items"></div>
<script>
const ITEMS = ${JSON.stringify(gallery)};
const KEY = 'noacg-value-gate-v${VALUE_GATE_VERSION}';
const state = JSON.parse(localStorage.getItem(KEY) || '{}');
const save = () => { localStorage.setItem(KEY, JSON.stringify(state)); paint(); };
const complete = (code) => Boolean(state[code]?.decision)
  && Number.isFinite(state[code]?.brandFit) && Number.isFinite(state[code]?.quality);
function paint() {
  const judged = ITEMS.filter(i => complete(i.code)).length;
  document.getElementById('progress').textContent = judged + ' / ' + ITEMS.length + ' judged';
  for (const item of ITEMS) {
    const el = document.getElementById(item.code);
    if (!el) continue;
    el.classList.toggle('done', complete(item.code));
    for (const b of el.querySelectorAll('[data-dec]')) b.classList.toggle('sel', state[item.code]?.decision === b.dataset.dec);
    for (const b of el.querySelectorAll('[data-fit]')) b.classList.toggle('sel', String(state[item.code]?.brandFit) === b.dataset.fit);
    for (const b of el.querySelectorAll('[data-quality]')) b.classList.toggle('sel', String(state[item.code]?.quality) === b.dataset.quality);
    for (const b of el.querySelectorAll('[data-defect]')) b.classList.toggle('sel', state[item.code]?.defect === true);
  }
}
const container = document.getElementById('items');
for (const item of ITEMS) {
  const card = document.createElement('section');
  card.className = 'card'; card.id = item.code;
  const sw = (c, l) => '<span class="sw"><i style="background:' + c + '"></i>' + l + '</span>';
  card.innerHTML =
    '<p class="label">' + item.code + '</p>' +
    '<div class="brand"><span class="marks">' +
      '<img class="on-light" src="' + item.brandMark + '" alt="brand mark on light">' +
      '<img class="on-dark" src="' + item.brandMark + '" alt="brand mark on dark"></span>' +
      '<div class="swatches">' + sw(item.brandPalette.accent, 'accent') + sw(item.brandPalette.panel, 'panel') +
      sw(item.brandPalette.text, 'text') + sw(item.brandPalette.textDim, 'dim') + '</div></div>' +
    '<p class="brief">' + item.brief + '</p>' +
    // The still leads and the clip follows: the hold frame is what a reviewer judges typography
    // and spacing on, and a clip whose first frame is the CLEAR pre-cue state reads as an empty
    // card until it is played. The still is the poster for the same reason.
    '<a href="' + item.still + '" target="_blank"><img class="still" loading="lazy" src="' + item.still + '"></a>' +
    (item.motion ? '<video controls muted loop preload="metadata" poster="' + item.still + '" src="' + item.motion + '"></video>' : '') +
    '<div class="phases">' + ['entrance','hold','update','exit'].filter(p => item.phases[p])
      .map(p => '<a href="' + item.phases[p] + '" target="_blank"><img loading="lazy" src="' + item.phases[p] + '"></a>').join('') + '</div>' +
    '<div class="judge">' +
      '<span class="grp"><span class="label">On air for this brand?</span> ' +
      ['yes','minor','no'].map(d => '<button data-dec="' + d + '">' + ({yes:'Yes',minor:'Yes, after minor edits',no:'No'})[d] + '</button>').join('') + '</span>' +
      '<span class="grp"><span class="label">Brand fit</span> ' + [1,2,3,4,5].map(s => '<button data-fit="' + s + '">' + s + '</button>').join('') + '</span>' +
      '<span class="grp"><span class="label">Quality</span> ' + [1,2,3,4,5].map(s => '<button data-quality="' + s + '">' + s + '</button>').join('') + '</span>' +
      '<button class="defect" data-defect="1">Brand defect</button>' +
      '<input class="note" size="34" maxlength="240" placeholder="What is wrong (optional)">' +
    '</div>';
  card.addEventListener('click', (event) => {
    const d = event.target.dataset ?? {};
    if (!d.dec && !d.fit && !d.quality && !d.defect) return;
    const cur = state[item.code] ?? {};
    if (d.dec) cur.decision = d.dec;
    if (d.fit) cur.brandFit = Number(d.fit);
    if (d.quality) cur.quality = Number(d.quality);
    if (d.defect) cur.defect = !cur.defect;
    cur.reviewer = document.getElementById('reviewer').value || 'owner';
    cur.at = new Date().toISOString();
    state[item.code] = cur; save();
  });
  const note = card.querySelector('.note');
  note.value = state[item.code]?.note ?? '';
  note.addEventListener('change', () => {
    const cur = state[item.code] ?? {};
    cur.note = note.value.trim();
    state[item.code] = cur; save();
  });
  container.appendChild(card);
}
document.getElementById('download').addEventListener('click', () => {
  const lines = Object.entries(state)
    .filter(([, v]) => v.decision)
    .map(([code, v]) => JSON.stringify({ type: 'value-gate', code, ...v }))
    .join('\\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines + '\\n'], { type: 'application/jsonl' }));
  a.download = 'value-gate-ballot.jsonl';
  a.click();
});
paint();
</script>
</body>
</html>`;
  await writeFile(path.join(OUT, 'value-gate.html'), html, 'utf8');
  console.log(`Sheet: ${path.join(OUT, 'value-gate.html')} (${gallery.length} items, ${CELLS.length} briefs x 3 arms).`);
}

// ── The verdict ───────────────────────────────────────────────────────────────

/**
 * Apply the PREDECLARED rule (§2), stated here exactly as the plan states it:
 *
 *   the Lite arm clearly beats the template arm on brand fit, AND is judged at least equal to
 *   the DIY arm on overall quality, on a clear majority of briefs, with zero brand-fidelity
 *   defects among its accepted results.
 *
 * Operationalized before the ballot was taken, never after: "clearly beats" = a strictly higher
 * brand-fit score on that brief; "at least equal" = a quality score no lower than the DIY arm's;
 * "a clear majority" = more than half the briefs that were fully judged; "accepted" = an item the
 * reviewer would air as-is or after minor edits.
 */
async function applyVerdict() {
  const key = JSON.parse(await readFile(path.join(OUT, 'value-gate-key.json'), 'utf8'));
  const byCode = new Map(key.map((entry) => [entry.code, entry]));
  const ballot = new Map();
  for (const line of (await readFile(VERDICT_FILE, 'utf8')).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = JSON.parse(line);
    ballot.set(parsed.code, parsed);
  }
  const briefs = new Map();
  for (const [code, vote] of ballot) {
    const entry = byCode.get(code);
    if (!entry) continue;
    const brief = briefs.get(entry.cellId) ?? {};
    brief[entry.arm] = { ...vote, variantId: entry.variantId };
    briefs.set(entry.cellId, brief);
  }
  const judged = [...briefs.entries()].filter(([, arms]) => arms.template && arms.diy && arms.lite);
  const wins = judged.filter(([, arms]) =>
    arms.lite.brandFit > arms.template.brandFit && arms.lite.quality >= arms.diy.quality);
  const accepted = judged.filter(([, arms]) => ['yes', 'minor'].includes(arms.lite.decision));
  const defects = accepted.filter(([, arms]) => arms.lite.defect === true);
  const majority = wins.length * 2 > judged.length;
  const pass = majority && defects.length === 0 && judged.length > 0;

  console.log(`Briefs fully judged: ${judged.length} of ${CELLS.length}`);
  console.log(`Lite beat the template on brand fit AND held the DIY arm on quality: ${wins.length}/${judged.length}`);
  console.log(`Lite accepted (yes / minor): ${accepted.length}/${judged.length}; brand-fidelity defects among them: ${defects.length}`);
  console.log('');
  for (const [cellId, arms] of judged) {
    const line = ['template', 'diy', 'lite']
      .map((arm) => `${arm} ${arms[arm].decision}/fit ${arms[arm].brandFit}/q ${arms[arm].quality}${arms[arm].defect ? '/DEFECT' : ''}`)
      .join('  |  ');
    console.log(`${cellId}\n  ${line}`);
    for (const arm of ['template', 'diy', 'lite']) {
      if (arms[arm].note) console.log(`  ${arm}: ${arms[arm].note}`);
    }
  }
  console.log('');
  console.log(`VERDICT: ${pass ? 'PASS' : 'FAIL'} against the predeclared rule.`);
  console.log(pass
    ? 'Lite continues; §2 asks for 20+ joined items before any public claim.'
    : 'Fail consequence (predeclared): custom AI generation is retired from the roadmap for now;'
      + ' free templates + manual wizard branding stand. The banks, audit and ledger stay.');
}

if (VERDICT) {
  if (!VERDICT_FILE) {
    console.error('--verdict needs the ballot file: --verdict <value-gate-ballot.jsonl>');
    process.exit(1);
  }
  await applyVerdict();
} else {
  if (!SHEET_ONLY) await renderFreeArms();
  await buildSheet();
}
