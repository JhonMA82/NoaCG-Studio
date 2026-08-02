// The private VISUAL EVAL SET (docs/SPX_EXAMPLES_CORPUS.md workstream 4): assemble the
// curated taste-calibration page from three local inputs -
//
//   - benchmarks/corpus-eval/v1/set.json - the CURATION, and the only part in the repo:
//     pairings and our own written observations, no pixels;
//   - the licence-restricted corpus, for the real ON-AIR frames;
//   - scripts/spx-corpus-gallery.mjs's output, for OUR RENDER of the same template.
//
// Pairing the two is the point. An on-air frame says what the graphic looked like on the
// channel, with real content, over real pictures; the rendered frame says what the same
// file produces here, with default data, over a neutral plate. Side by side they separate
// "this design is like that" from "our render of it is like that", which a gallery of
// either one alone cannot do.
//
//   node scripts/spx-eval-set.mjs [corpus-dir] [gallery-dir] [out-dir]
//
// Local-only, like the sweep and the gallery: exits 0 with a note when the corpus is
// absent. Needs no dev server and no network - it only copies and writes files. Run the
// gallery first, or the rendered halves are reported MISSING rather than quietly omitted.
//
// Everything it writes is licence-restricted reference material: local viewing only.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const corpusDir = resolve(process.argv[2] || join(repoRoot, 'spx_examples'));
const galleryDir = resolve(process.argv[3] || './spx-corpus-out/gallery');
const outDir = resolve(process.argv[4] || './spx-corpus-out/eval-set');
const setPath = join(repoRoot, 'benchmarks/corpus-eval/v1/set.json');

if (!existsSync(corpusDir)) {
  console.log(`spx-eval-set: corpus not present at ${corpusDir} - nothing to do.`);
  process.exit(0);
}

const set = JSON.parse(readFileSync(setPath, 'utf8'));
mkdirSync(outDir, { recursive: true });

/** The gallery names a frame after the template's path under templates/, slashes doubled. */
const galleryFrame = (template) => `${template.replaceAll('/', '__')}.png`;

const items = [];
for (const entry of set.entries) {
  const onAirSrc = join(corpusDir, set.sources.onAirRoot, entry.onAir);
  const renderSrc = join(galleryDir, galleryFrame(entry.template));
  const item = { ...entry, onAirFile: null, renderFile: null, missing: [] };

  if (existsSync(onAirSrc)) {
    item.onAirFile = `${entry.id}--on-air.png`;
    copyFileSync(onAirSrc, join(outDir, item.onAirFile));
  } else {
    item.missing.push(`on-air frame not in the corpus: ${entry.onAir}`);
  }

  if (existsSync(renderSrc)) {
    item.renderFile = `${entry.id}--render.png`;
    copyFileSync(renderSrc, join(outDir, item.renderFile));
  } else {
    // Never silently one-sided: a pair with a missing half is a pair that cannot be read.
    item.missing.push('our render is missing - run scripts/spx-corpus-gallery.mjs first');
  }

  items.push(item);
}

const picks = set.ownerPicks?.frames ?? [];
const pickItems = [];
for (const template of picks) {
  const src = join(galleryDir, galleryFrame(template));
  if (!existsSync(src)) {
    pickItems.push({ template, renderFile: null, missing: ['not in the gallery output'] });
    continue;
  }
  const file = `pick--${template.replaceAll('/', '__')}.png`;
  copyFileSync(src, join(outDir, file));
  pickItems.push({ template, renderFile: file, missing: [] });
}

// ---------- the review page ----------

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const shot = (file, label) => (file
  ? `<div class="shot"><img loading="lazy" src="${encodeURIComponent(file)}" alt=""><span>${label}</span></div>`
  : `<div class="shot missing"><div>missing</div><span>${label}</span></div>`);

const card = (item) => `
  <article>
    <h3>${esc(item.what)}</h3>
    <p class="src">on air <code>${esc(item.onAir)}</code> &middot; template <code>${esc(item.template)}</code></p>
    <div class="pair">${shot(item.onAirFile, 'on air')}${shot(item.renderFile, 'our render')}</div>
    <ul>${item.observations.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
    ${item.missing.length ? `<p class="warn">${item.missing.map(esc).join(' &middot; ')}</p>` : ''}
  </article>`;

writeFileSync(join(outDir, 'index.html'), `<!DOCTYPE html>
<meta charset="utf-8"><title>spx_examples visual eval set</title>
<style>
  body { background:#0f1115; color:#cfd3da; font:14px/1.5 system-ui; margin:24px; max-width:1500px; }
  h1 { color:#e6e9ee; } h2 { color:#f5a623; margin:36px 0 8px; }
  article { background:#171a21; border:1px solid #262b35; border-radius:10px; padding:16px; margin:16px 0; }
  article h3 { margin:0 0 4px; color:#e6e9ee; font-size:15px; }
  .src { margin:0 0 12px; color:#6b7280; font-size:12px; } code { color:#9aa1ac; }
  /* Side by side is the whole point, but two 16:9 frames squeezed into a narrow window are
     unreadable - below ~900px they stack instead. */
  .pair { display:grid; grid-template-columns:repeat(auto-fit,minmax(420px,1fr)); gap:12px; }
  .shot { position:relative; } .shot img { width:100%; display:block; border-radius:6px; }
  .shot span { position:absolute; left:8px; top:8px; background:rgba(10,12,16,.78); color:#cfd3da;
    font-size:11px; letter-spacing:.08em; text-transform:uppercase; padding:3px 7px; border-radius:4px; }
  .shot.missing { aspect-ratio:16/9; display:grid; place-items:center; background:#12141a;
    border:1px dashed #3a4150; border-radius:6px; color:#e5534b; }
  ul { margin:12px 0 0; padding-left:18px; } li { margin:4px 0; }
  .warn { color:#e5534b; margin:10px 0 0; }
  .banner { background:#2a1d10; border:1px solid #5a3d17; border-radius:8px; padding:10px 14px; color:#e8c48a; }
  .q { background:#171a21; border-left:3px solid #f5a623; padding:10px 14px; margin:10px 0; }
</style>
<h1>spx_examples - visual eval set</h1>
<p class="banner"><b>Licence-restricted reference material.</b> Local viewing only - never publish,
commit, or paste into a prompt. Curation: <code>benchmarks/corpus-eval/v1/set.json</code>.</p>
<p>Each pair is one real broadcast frame beside our render of the same template file
(default data, neutral plate, from <code>scripts/spx-corpus-gallery.mjs</code>).</p>

<h2>On-air pairs (${items.length})</h2>
${items.map(card).join('')}

<h2>Open questions for the owner</h2>
${(set.openQuestions ?? []).map((q) => `<div class="q">${esc(q)}</div>`).join('')}

<h2>Owner-picked rendered frames (${pickItems.length})</h2>
<p>${pickItems.length
  ? ''
  : 'None yet. Which rendered corpus frames belong in a taste set is a taste judgement, so the list is left empty rather than guessed - add template paths to <code>ownerPicks.frames</code>.'}</p>
${pickItems.map((p) => `
  <article>
    <p class="src"><code>${esc(p.template)}</code></p>
    ${shot(p.renderFile, 'our render')}
    ${p.missing.length ? `<p class="warn">${p.missing.map(esc).join(' &middot; ')}</p>` : ''}
  </article>`).join('')}
`);

// The machine-readable half: the same set without the styling, for a future vision-judge
// calibration run. It records file names inside outDir, never corpus paths, so a consumer
// cannot accidentally reach back into the licence-restricted tree.
writeFileSync(join(outDir, 'eval-set.json'), JSON.stringify({
  version: set.version,
  note: set.note,
  entries: items.map((i) => ({
    id: i.id,
    what: i.what,
    onAirFile: i.onAirFile,
    renderFile: i.renderFile,
    observations: i.observations,
    missing: i.missing,
  })),
  openQuestions: set.openQuestions ?? [],
  ownerPicks: pickItems,
}, null, 2));

const incomplete = items.filter((i) => i.missing.length);
console.log(`spx-eval-set: ${items.length} on-air pairs, ${pickItems.length} owner-picked frames`);
for (const i of incomplete) console.log(`  INCOMPLETE ${i.id}: ${i.missing.join(' | ')}`);
console.log(`page -> ${join(outDir, 'index.html')}`);
