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

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { seededRandom } from './ai-lite-bench/suites.mjs';
import { outDir } from './out-dir.mjs';

const OUT = path.resolve(outDir(process.argv[2], './lite-bench-out', 'Usage: node scripts/ai-lite-gallery.mjs [out-dir]'));

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
      // Nested runs (a spike's run1/run2/run3) repeat candidate+fixture, so the item key
      // carries the metrics file's directory - the SAME scoping bench:report derives, or
      // a judgement would join every run's row instead of the one that was reviewed.
      // Top-level metrics keep the historical key shape so old judgement files still join.
      const keyScope = relative ? `${relative.replaceAll('\\', '/')}:` : '';
      for (const row of parsed.rows ?? []) {
        // Paid eval rows carry lifecycle phaseFiles (no single screenshotFile) - the HOLD
        // frame is the review still, the same frame the vision judge scores.
        const screenshot = row.screenshotFile ?? row.phaseFiles?.hold;
        if (screenshot) {
          items.push({
            key: `${parsed.candidate}:${keyScope}${row.fixtureId}`,
            brief: row.fixtureId,
            screenshot: toUrl(screenshot),
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

// Every gallery numbers its items item-001 upward, so two DIFFERENT rounds reuse the same
// codes. With one localStorage bucket per origin that silently pre-fills a new round with
// the previous round's answers - verified: a 3-item test gallery's verdicts turned up in
// the 102-item spike gallery, attached to graphics the reviewer had never seen. The bucket
// is therefore keyed by WHAT IS IN the gallery: same items -> same key (a rebuild still
// resumes), different items -> a clean bucket, with no reliance on anyone pressing
// "Start new pass".
const galleryId = createHash('sha256')
  .update(withRepeats.map(({ code, key }) => `${code}:${key}`).join('\n'))
  .digest('hex').slice(0, 12);

// Opening a still at native resolution must not reveal its arm or candidate in the URL.
// Give every displayed asset a neutral filename, including planted repeats, and keep the
// identity mapping exclusively in blind-key.json.
const reviewAssetsDir = path.join(OUT, 'review-assets');
await mkdir(reviewAssetsDir, { recursive: true });
const gallery = await Promise.all(withRepeats.map(async ({ code, brief, screenshot, motion }) => {
  const screenshotName = `${code}-still${path.extname(screenshot) || '.png'}`;
  await copyFile(path.join(OUT, screenshot), path.join(reviewAssetsDir, screenshotName));

  let motionUrl = null;
  if (motion) {
    const motionName = `${code}-motion${path.extname(motion) || '.webm'}`;
    await copyFile(path.join(OUT, motion), path.join(reviewAssetsDir, motionName));
    motionUrl = `review-assets/${motionName}`;
  }

  return {
    code,
    brief,
    screenshot: `review-assets/${screenshotName}`,
    motion: motionUrl,
  };
}));
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
  .needs-score{border-color:#ffb000}
  .needs-score .score-label{color:#ffb000;font-weight:600}
  .needs-score .score-label::after{content:' still needed'}
  .brief{color:#aeb7c3;font-size:14px;margin:0 0 10px}
</style>
<body>
<h1>NoaCG Lite blind review</h1>
<p class="sub">Screening pass: for each item answer one broadcast question - would you put this on air - and one overall 1-5 score. A short note on what is wrong is optional but valuable - it is what turns a low score into a fixable finding. Judge stills at 100% for typography, spacing, hierarchy and fit; use the clip for entrance, settle and exit. Items are blind and shuffled; about 20 per session, your progress saves locally (per browser, so several reviewers can each do their own pass). When done, download your judgements file into this folder and run <code>npm run bench:report</code> - it merges every reviewer's file.</p>
<div class="bar">
  Reviewer <input id="reviewer" placeholder="initials" size="8">
  <span id="progress"></span>
  <button class="primary" id="download">Download judgements</button>
  <button id="fresh">Start new pass</button>
</div>
<div id="items"></div>
<script>
const ITEMS = ${JSON.stringify(gallery)};
const KEY = 'noacg-lite-review-v1-${galleryId}';
const state = JSON.parse(localStorage.getItem(KEY) || '{}');
const save = () => { localStorage.setItem(KEY, JSON.stringify(state)); paint(); };
const container = document.getElementById('items');
const SESSION = 20;
// An item is finished only with BOTH answers. Measured the hard way on 2026-07-29: 'done'
// counted the decision alone and .done dims the card, so the reviewer answered "on air?",
// watched the card fade, and moved on - 7 of 9 judgements came back with no score at all.
// Completeness now follows the doc's contract, and an unscored card stays lit and says so.
const complete = (code) => Boolean(state[code]?.decision) && Number.isFinite(state[code]?.score);
function paint() {
  const judged = ITEMS.filter(i => complete(i.code)).length;
  document.getElementById('progress').textContent =
    judged + ' / ' + ITEMS.length + ' judged' + (judged && judged % SESSION === 0 && judged < ITEMS.length ? ' - session done, take a break' : '');
  for (const item of ITEMS) {
    // Only the current session's items are rendered (see the resume cap below), so most of
    // ITEMS has no card. Without this guard paint() threw a TypeError on the first
    // unrendered item - silently, because it runs from an event listener - on EVERY click.
    // It looked harmless only because the missing items happen to sort after the rendered
    // ones, so the visible cards were painted before the throw; anything added after this
    // loop would simply never have run.
    const el = document.getElementById(item.code);
    if (!el) continue;
    el.classList.toggle('done', complete(item.code));
    el.classList.toggle('needs-score', Boolean(state[item.code]?.decision) && !complete(item.code));
    for (const b of el.querySelectorAll('[data-dec]')) b.classList.toggle('sel', state[item.code]?.decision === b.dataset.dec);
    for (const b of el.querySelectorAll('[data-score]')) b.classList.toggle('sel', String(state[item.code]?.score) === b.dataset.score);
  }
}
// Resume model: render up to one session past the already-judged items; reload after a
// break to open the next session.
const judgedCount = ITEMS.filter(i => complete(i.code)).length;
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
    ' <span class="score-label">Score</span> ' + [1,2,3,4,5].map(s => '<button data-score="' + s + '">' + s + '</button>').join('') +
    ' <input class="note" size="42" maxlength="240" placeholder="What is wrong / notes (optional)">' +
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
  const note = card.querySelector('.note');
  note.value = state[item.code]?.note ?? '';
  note.addEventListener('change', () => {
    const cur = state[item.code] ?? {};
    cur.note = note.value.trim();
    cur.reviewer = document.getElementById('reviewer').value || 'anonymous';
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
  // Per-reviewer filename so several reviewers' files can sit in the out dir together -
  // bench:report merges every judgements*.jsonl it finds.
  const who = (document.getElementById('reviewer').value || 'anonymous').replace(/[^a-z0-9_-]+/gi, '-');
  a.download = 'judgements-' + who + '.jsonl';
  a.click();
});
// A fresh pass clears the saved ratings so old answers never pre-fill a re-review.
// Download your judgements first - clearing does not export them.
document.getElementById('fresh').addEventListener('click', () => {
  if (!confirm('Start a new pass? This clears your saved ratings in this browser. Download your judgements first if you have not.')) return;
  localStorage.removeItem(KEY);
  location.reload();
});
paint();
</script>
</body>
</html>`;

await writeFile(path.join(OUT, 'blind-review.html'), html, 'utf8');
console.log(`Blind gallery: ${path.join(OUT, 'blind-review.html')} (${gallery.length} items incl. planted repeats).`);
console.log('Open it via a local file or the dev server; save judgements.jsonl back into the same folder.');
