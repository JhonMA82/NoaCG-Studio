// The BLIND PAIRWISE review gallery for Creative Mode pilot output - criterion 4, the ranking
// that actually decides the pilot (docs/CREATIVE_MODE_PLAN.md §11).
//
//   node scripts/creative-gallery.mjs <out-dir> [<out-dir> …] [--open]
//
// Pairwise, not screening, because the calibration rounds measured that absolute score deltas
// are noise while yes/no decisions are reliable. Each item is ONE brief's two arms side by
// side and one question - "which would you air?" - plus optional notes.
//
// What keeps it blind, all of it load-bearing:
//   - the reviewer never sees the arm, the candidate, the cost, or the brief id;
//   - LEFT/RIGHT is randomized per pair by a seeded PRNG, so a reviewer who starts favouring
//     one side cannot favour one ARM;
//   - pairs are shuffled, so the categories do not arrive in blocks;
//   - one unmarked REPEAT pair per session (sides swapped) measures test-retest consistency -
//     a reviewer who answers it differently is telling you the margin is inside their noise;
//   - the code -> (brief, arm) mapping is written to blind-key.json BESIDE the gallery, and the
//     gallery never fetches it. Do not open it before reviewing.
//
// Judgements download as JSONL, one row per decision, joinable back through blind-key.json.
//
// The frames are copied into the gallery directory rather than linked: an out-dir is
// gitignored bench output and a gallery that breaks when it moves is a gallery nobody reuses.

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { seededRandom } from './ai-lite-bench/suites.mjs';

const ARGS = process.argv.slice(2);
const DIRS = ARGS.filter((a) => !a.startsWith('--'));
const OPEN = ARGS.includes('--open');
if (!DIRS.length) {
  console.error('Usage: node scripts/creative-gallery.mjs <out-dir> [<out-dir> …] [--open]');
  process.exit(2);
}

/** The arm every staged result is judged AGAINST. Arm A is the frozen control - the whole
 *  point of criterion 4 is C-over-A, so a pair without it is not a comparison. */
const CONTROL = 'A';
const CHALLENGERS = ['C', 'D'];

const pairs = [];
for (const dir of DIRS) {
  const root = path.resolve(dir);
  let ledger;
  try {
    ledger = JSON.parse(await readFile(path.join(root, 'pilot.json'), 'utf8'));
  } catch {
    console.error(`No readable pilot.json in ${root} - skipping.`);
    continue;
  }
  const byBrief = new Map();
  for (const r of ledger.results ?? []) {
    if (!r.files?.hold) continue;               // a run that produced no frame cannot be ranked
    if (!byBrief.has(r.brief)) byBrief.set(r.brief, {});
    byBrief.get(r.brief)[r.arm] = r;
  }
  for (const [brief, arms] of byBrief) {
    const control = arms[CONTROL];
    if (!control) continue;                     // nothing to compare against
    for (const arm of CHALLENGERS) {
      if (!arms[arm]) continue;
      pairs.push({ root, brief, category: control.category, control, challenger: arms[arm], armName: arm });
    }
  }
}

if (!pairs.length) {
  console.error('No comparable pairs found (each needs the control arm and a challenger with a hold frame).');
  process.exit(1);
}

// A stable seed from the pair set, so re-running the script reproduces the same blind codes and
// the same order - a reviewer who resumes tomorrow sees the run they started.
const seed = pairs.reduce((h, p) => (h * 31 + p.brief.length + p.armName.charCodeAt(0)) >>> 0, 7);
const rand = seededRandom(seed);
const shuffled = pairs
  .map((p) => ({ p, k: rand() }))
  .sort((a, b) => a.k - b.k)
  .map(({ p }) => p);

const GALLERY = path.resolve('creative-gallery');
await mkdir(path.join(GALLERY, 'frames'), { recursive: true });

// Which side the control takes is BALANCED, not coin-flipped. A seeded flip over 37 pairs put
// the control on the left 25 times, and a reviewer with any left-side preference would then
// have been systematically favouring the control - the one bias this comparison cannot carry,
// since C-over-A is the entire question. Balancing per (category, challenger) group means each
// comparison the report will quote is itself balanced, not just the pooled total.
const sideCounter = new Map();
const takesLeft = (pair) => {
  const group = `${pair.category}:${pair.armName}`;
  const i = sideCounter.get(group) ?? 0;
  sideCounter.set(group, i + 1);
  return i % 2 === 0;
};

const items = [];
const key = [];
let n = 0;
for (const pair of shuffled) {
  const code = `P${String(++n).padStart(3, '0')}`;
  const controlLeft = takesLeft(pair);
  const copyFrame = async (r, side) => {
    const dest = `frames/${code}-${side}.png`;
    await copyFile(path.join(pair.root, r.files.hold), path.join(GALLERY, dest));
    return dest;
  };
  const leftResult = controlLeft ? pair.control : pair.challenger;
  const rightResult = controlLeft ? pair.challenger : pair.control;
  items.push({
    code,
    category: pair.category,
    left: await copyFrame(leftResult, 'left'),
    right: await copyFrame(rightResult, 'right'),
  });
  key.push({
    code,
    brief: pair.brief,
    category: pair.category,
    left: controlLeft ? CONTROL : pair.armName,
    right: controlLeft ? pair.armName : CONTROL,
    challenger: pair.armName,
  });
}

// The REPEAT: one pair shown a second time with the sides swapped, unmarked. Placed about
// three-quarters through, far enough from its twin that recognising it is unlikely.
if (items.length >= 4) {
  const source = items[Math.floor(items.length / 4)];
  const twin = { code: `R${source.code}`, category: source.category, left: source.right, right: source.left };
  items.splice(Math.floor(items.length * 0.75), 0, twin);
  key.push({ code: twin.code, repeatOf: source.code, note: 'unmarked repeat, sides swapped' });
}

await writeFile(path.join(GALLERY, 'blind-key.json'), JSON.stringify(key, null, 2));

const html = `<!doctype html>
<meta charset="utf-8" />
<title>Creative Mode - blind pairwise review</title>
<style>
  :root { color-scheme: dark; --bg:#0b0d10; --panel:#14181d; --line:#252b33; --text:#e7ecf2;
          --dim:#95a1b0; --accent:#ffb020; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
         font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  header { position:sticky; top:0; z-index:5; background:var(--panel);
           border-bottom:1px solid var(--line); padding:12px 20px;
           display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
  h1 { font-size:15px; margin:0; font-weight:650; letter-spacing:.01em; }
  .progress { color:var(--dim); font-variant-numeric:tabular-nums; }
  .grow { flex:1; }
  button { font:inherit; padding:8px 14px; border-radius:8px; border:1px solid var(--line);
           background:#1b212a; color:var(--text); cursor:pointer; }
  button:hover { border-color:#3a4552; }
  button.primary { background:var(--accent); color:#12161b; border-color:var(--accent);
                   font-weight:650; }
  main { padding:20px; max-width:1600px; margin:0 auto; }
  .pair { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  @media (max-width: 900px) { .pair { grid-template-columns:1fr; } }
  figure { margin:0; background:var(--panel); border:1px solid var(--line); border-radius:12px;
           overflow:hidden; }
  figure img { display:block; width:100%; height:auto; background:#000; }
  figcaption { padding:10px 14px; color:var(--dim); font-size:13px;
               display:flex; align-items:center; gap:10px; }
  .choices { display:flex; gap:10px; flex-wrap:wrap; margin:18px 0 10px; }
  .choices button { flex:1 1 200px; padding:14px; }
  textarea { width:100%; min-height:70px; background:var(--panel); color:var(--text);
             border:1px solid var(--line); border-radius:8px; padding:10px; font:inherit;
             resize:vertical; }
  .done { text-align:center; padding:60px 20px; }
  .hint { color:var(--dim); font-size:13px; margin:6px 0 0; }
  kbd { background:#1b212a; border:1px solid var(--line); border-bottom-width:2px;
        border-radius:5px; padding:1px 6px; font:12px ui-monospace,monospace; }
</style>
<header>
  <h1>Which would you air?</h1>
  <span class="progress" id="progress"></span>
  <span class="grow"></span>
  <button id="skip">Skip</button>
  <button id="download" class="primary">Download judgements</button>
</header>
<main id="main"></main>
<script>
const ITEMS = ${JSON.stringify(items)};
const STORE = 'creative-gallery-judgements';
let done = JSON.parse(localStorage.getItem(STORE) || '[]');
const main = document.getElementById('main');
const progress = document.getElementById('progress');

function remaining() {
  const seen = new Set(done.map((d) => d.code));
  return ITEMS.filter((i) => !seen.has(i.code));
}

function record(code, verdict, notes) {
  done.push({ code, verdict, notes: notes || '', at: new Date().toISOString() });
  localStorage.setItem(STORE, JSON.stringify(done));
  render();
}

function render() {
  const left = remaining();
  progress.textContent = done.length + ' / ' + ITEMS.length + ' judged';
  if (!left.length) {
    main.innerHTML = '<div class="done"><h2>All done.</h2>' +
      '<p class="hint">Download the judgements, then join them through blind-key.json.</p></div>';
    return;
  }
  const it = left[0];
  main.innerHTML =
    '<div class="pair">' +
      '<figure><img src="' + it.left + '" alt="option A"><figcaption>Option&nbsp;<b>A</b></figcaption></figure>' +
      '<figure><img src="' + it.right + '" alt="option B"><figcaption>Option&nbsp;<b>B</b></figcaption></figure>' +
    '</div>' +
    '<div class="choices">' +
      '<button data-v="left"><b>A</b> &mdash; I would air this one</button>' +
      '<button data-v="right"><b>B</b> &mdash; I would air this one</button>' +
      '<button data-v="neither">Neither is airable</button>' +
      '<button data-v="tie">Too close to call</button>' +
    '</div>' +
    '<textarea id="notes" placeholder="What is wrong with the one you rejected? (optional)"></textarea>' +
    '<p class="hint">Keys: <kbd>A</kbd> left &middot; <kbd>B</kbd> right &middot; <kbd>N</kbd> neither &middot; <kbd>T</kbd> tie</p>';
  for (const b of main.querySelectorAll('.choices button')) {
    b.onclick = () => record(it.code, b.dataset.v, document.getElementById('notes').value);
  }
}

document.getElementById('skip').onclick = () => {
  const left = remaining();
  if (left.length) record(left[0].code, 'skipped', '');
};

document.getElementById('download').onclick = () => {
  const blob = new Blob([done.map((d) => JSON.stringify(d)).join('\\n') + '\\n'],
    { type: 'application/x-ndjson' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'judgements.jsonl';
  a.click();
};

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'TEXTAREA') return;
  const map = { a: 'left', b: 'right', n: 'neither', t: 'tie' };
  const v = map[e.key.toLowerCase()];
  if (!v) return;
  const left = remaining();
  if (left.length) record(left[0].code, v, document.getElementById('notes').value);
});

render();
</script>
`;

await writeFile(path.join(GALLERY, 'index.html'), html);

const byCategory = key.filter((k) => !k.repeatOf)
  .reduce((m, k) => ({ ...m, [k.category]: (m[k.category] ?? 0) + 1 }), {});
console.log(`Gallery: ${path.join(GALLERY, 'index.html')}`);
console.log(`${items.length} item(s) - ${JSON.stringify(byCategory)} (+1 unmarked repeat)`);
console.log('Blind key written beside it. Do NOT open blind-key.json before reviewing.');
if (OPEN) console.log('Open the gallery through the dev server or a file:// URL.');
