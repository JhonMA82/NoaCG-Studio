// Blind review gallery for NoaCG Lite benchmark output. One reviewer, screening mode:
// per item a broadcast decision (yes / yes-after-minor-edits / no) plus one 1-5 score -
// nothing more (reviewer fatigue is the binding constraint, not tokens).
//
//   npm run bench:gallery [-- out-dir]
//
// Reads every *-metrics.json (paid eval runs) and calibration-summary.json under out-dir,
// assigns NEUTRAL blind codes (reviewer never sees candidate, arm, cost, or ordering),
// shuffles with a seeded PRNG, plants one unmarked REPEAT item per session to measure
// test-retest consistency, caps a session at ~20 items with resume (localStorage), and
// offers a judgements download (JSONL) for bench:report. The blind-code -> item mapping
// stays in blind-key.json beside the gallery (gitignored with the rest of the out dir);
// do not open it before reviewing.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { seededRandom } from './ai-lite-bench/suites.mjs';

const OUT = path.resolve(process.argv[2] || './lite-bench-out');

async function collectItems(dir, relative = '') {
  const items = [];
  let entries;
  try {
    entries = await readdir(path.join(dir, relative), { withFileTypes: true });
  } catch {
    return items;
  }
  for (const entry of entries) {
    const rel = relative ? path.join(relative, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (entry.name !== '.raw-video') items.push(...await collectItems(dir, rel));
      continue;
    }
    const toUrl = (p) => (relative ? `${relative.replaceAll('\\', '/')}/${p}` : p);
    if (entry.name.endsWith('-metrics.json')) {
      const parsed = JSON.parse(await readFile(path.join(dir, rel), 'utf8'));
      for (const row of parsed.rows ?? []) {
        if (row.screenshotFile) {
          items.push({
            key: `${parsed.candidate}:${row.fixtureId}`,
            brief: row.fixtureId,
            screenshot: toUrl(row.screenshotFile),
            motion: row.motionFile ? toUrl(row.motionFile) : null,
          });
        }
      }
    } else if (entry.name === 'calibration-summary.json') {
      const parsed = JSON.parse(await readFile(path.join(dir, rel), 'utf8'));
      for (const row of parsed.rows ?? []) {
        if (row.screenshotFile) {
          items.push({
            key: `${row.arm}:${row.id}`,
            brief: row.briefId,
            screenshot: toUrl(row.screenshotFile),
            motion: row.motionFile ? toUrl(row.motionFile) : null,
          });
        }
      }
    }
  }
  return items;
}

const collected = await collectItems(OUT);
if (!collected.length) {
  console.error(`No reviewable items under ${OUT} (run bench:calibrate or the paid eval first).`);
  process.exit(1);
}

// Deterministic blind assignment: seeded by the item list itself so re-generating over
// the same artifacts keeps codes (and saved judgements) stable.
let seed = 0;
for (const item of collected) for (const ch of item.key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
const rand = seededRandom(seed || 1);
const shuffled = [...collected];
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
const blind = shuffled.map((item, index) => ({
  code: `item-${String(index + 1).padStart(3, '0')}`,
  ...item,
}));
// One unmarked repeat per ~20-item session, drawn from the session's own items.
const withRepeats = [];
for (let i = 0; i < blind.length; i += 19) {
  const session = blind.slice(i, i + 19);
  withRepeats.push(...session);
  if (session.length > 3) {
    const repeatOf = session[Math.floor(rand() * session.length)];
    withRepeats.push({ ...repeatOf, code: `${repeatOf.code}r`, repeatOf: repeatOf.code });
  }
}

await writeFile(path.join(OUT, 'blind-key.json'), JSON.stringify(
  withRepeats.map(({ code, key, repeatOf }) => ({ code, key, ...(repeatOf ? { repeatOf } : {}) })),
  null, 2,
), 'utf8');

const gallery = withRepeats.map(({ code, brief, screenshot, motion }) => ({ code, brief, screenshot, motion }));
const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NoaCG Lite blind review</title>
<style>
  :root{color-scheme:dark;font-family:system-ui,sans-serif;background:#090b0f;color:#e8edf2}
  body{margin:0 auto;max-width:1500px;padding:28px}
  h1{margin:0 0 6px}.sub{color:#aeb7c3;margin:0 0 20px;max-width:900px;line-height:1.5}
  .bar{display:flex;gap:12px;align-items:center;margin:0 0 18px;flex-wrap:wrap}
  input,button,select{font:inherit;background:#12161d;color:#e8edf2;border:1px solid #29313d;border-radius:8px;padding:8px 12px}
  button{cursor:pointer}button.primary{border-color:#ffb000;color:#ffb000}
  .card{background:#12161d;border:1px solid #29313d;border-radius:12px;padding:18px;margin:0 0 22px}
  .card img,.card video{display:block;width:100%;height:auto;background:#05070a;border-radius:8px;margin:0 0 12px}
  .judge{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .judge button.sel{border-color:#ffb000;color:#ffb000}
  .done{opacity:.55}
  .brief{color:#aeb7c3;font-size:14px;margin:0 0 10px}
</style>
<body>
<h1>NoaCG Lite blind review</h1>
<p class="sub">Screening pass: for each item answer one broadcast question - would you put this on air - and one overall 1-5 score. Judge stills at 100% for typography, spacing, hierarchy and fit; use the clip for entrance, settle and exit. Items are blind and shuffled; about 20 per session, your progress saves locally. When done, download the judgements file into this folder and run <code>npm run bench:report</code>.</p>
<div class="bar">
  Reviewer <input id="reviewer" placeholder="initials" size="8">
  <span id="progress"></span>
  <button class="primary" id="download">Download judgements</button>
</div>
<div id="items"></div>
<script>
const ITEMS = ${JSON.stringify(gallery)};
const KEY = 'noacg-lite-review-v1';
const state = JSON.parse(localStorage.getItem(KEY) || '{}');
const save = () => { localStorage.setItem(KEY, JSON.stringify(state)); paint(); };
const container = document.getElementById('items');
const SESSION = 20;
function paint() {
  const judged = ITEMS.filter(i => state[i.code]?.decision).length;
  document.getElementById('progress').textContent =
    judged + ' / ' + ITEMS.length + ' judged' + (judged && judged % SESSION === 0 && judged < ITEMS.length ? ' - session done, take a break' : '');
  for (const item of ITEMS) {
    const el = document.getElementById(item.code);
    el.classList.toggle('done', Boolean(state[item.code]?.decision));
    for (const b of el.querySelectorAll('[data-dec]')) b.classList.toggle('sel', state[item.code]?.decision === b.dataset.dec);
    for (const b of el.querySelectorAll('[data-score]')) b.classList.toggle('sel', String(state[item.code]?.score) === b.dataset.score);
  }
}
// Resume model: render up to one session past the already-judged items; reload after a
// break to open the next session.
const judgedCount = ITEMS.filter(i => state[i.code]?.decision).length;
const cap = Math.min(ITEMS.length, (Math.floor(judgedCount / SESSION) + 1) * SESSION);
for (const item of ITEMS.slice(0, cap)) {
  const card = document.createElement('section');
  card.className = 'card'; card.id = item.code;
  card.innerHTML =
    '<p class="brief">' + item.code + ' - brief: ' + item.brief + '</p>' +
    (item.motion ? '<video controls muted loop preload="metadata" src="' + item.motion + '"></video>' : '') +
    '<a href="' + item.screenshot + '" target="_blank"><img loading="lazy" src="' + item.screenshot + '"></a>' +
    '<div class="judge">On air? ' +
    ['yes','minor','no'].map(d => '<button data-dec="' + d + '">' + ({yes:'Yes',minor:'Yes, after minor edits',no:'No'})[d] + '</button>').join('') +
    ' Score ' + [1,2,3,4,5].map(s => '<button data-score="' + s + '">' + s + '</button>').join('') +
    '</div>';
  card.addEventListener('click', (event) => {
    const dec = event.target.dataset?.dec, score = event.target.dataset?.score;
    if (!dec && !score) return;
    const cur = state[item.code] ?? {};
    if (dec) cur.decision = dec;
    if (score) cur.score = Number(score);
    cur.reviewer = document.getElementById('reviewer').value || 'anonymous';
    cur.at = new Date().toISOString();
    state[item.code] = cur; save();
  });
  container.appendChild(card);
}
document.getElementById('download').addEventListener('click', () => {
  const lines = Object.entries(state)
    .filter(([, v]) => v.decision)
    .map(([code, v]) => JSON.stringify({ type: 'judgement', code, ...v }))
    .join('\\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines + '\\n'], { type: 'application/jsonl' }));
  a.download = 'judgements.jsonl';
  a.click();
});
paint();
</script>
</body>
</html>`;

await writeFile(path.join(OUT, 'blind-review.html'), html, 'utf8');
console.log(`Blind gallery: ${path.join(OUT, 'blind-review.html')} (${gallery.length} items incl. planted repeats).`);
console.log('Open it via a local file or the dev server; save judgements.jsonl back into the same folder.');
