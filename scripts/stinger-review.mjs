#!/usr/bin/env node
// Compose every corpus stinger against every brand mark into a standalone review rig.
//
// WHY THIS EXISTS: the corpus stingers (src/ai/video/corpus/stingers) are the anchor arm of
// every later blind gallery, and the product promise they carry is that the SAME composition
// works in a client's own mark and colour world (docs/NOACG_VIDEO_PLAN.md §3.1). That claim
// is only worth anything if someone has looked at all of the combinations, so this builds
// them all: 3 stingers x 5 marks, plus a contact sheet with one shared scrubber.
//
// Zero tokens, no dev server, no browser automation - it writes files and stops. Open
// stinger-review-out/index.html in a browser.
//
// WHAT IT CANNOT TELL YOU: whether the head and tail frames are PIXEL empty and whether the
// cut window is PIXEL opaque. Those are machine gates measured on rendered frames and they
// are a separate work item (plan §4.2). This rig is for taste and for brand fit.
// And per the plan's own rule, a MOTION verdict comes from a rendered MP4, never from a
// scrubbed browser pane.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = path.join(ROOT, 'src/ai/video/corpus/stingers');
const OUT = path.join(ROOT, 'stinger-review-out');

/**
 * The five brand marks of the swap set (benchmarks/video/v1/marks/MARKS.md). Four are reused
 * from the Pro spike rather than duplicated.
 *
 * Each carries TWO tone answers, because a logo slot has a tone and not only a geometry:
 *   - `onDarkDesign`  - for a stinger whose covering surface is dark (replay-slab, push-veil):
 *                       `plate` is the surface UNDER THE MARK, `ink` is the type, which sits
 *                       on the dark field rather than on the plate.
 *   - `onLightDesign` - for a stinger whose payload sits on a light card (aperture-bands):
 *                       there the type is ON the plate, so `ink` must contrast with `plate`.
 * That split is the whole reason `brandPlate` is a declared variable.
 */
const MARKS = [
  {
    id: 'aldervale-institute',
    name: 'The Aldervale Institute',
    shape: 'compact monogram, 1:1, dark navy ink',
    file: 'benchmarks/pro/v1/spike/marks/aldervale-institute.svg',
    deep: '#16233F',
    accent: '#B08D57',
    onDarkDesign: { plate: '#F3F1EC', ink: '#F3F1EC' },
    onLightDesign: { plate: '#F3F1EC', ink: '#16233F' },
  },
  {
    id: 'kestrel-athletic',
    name: 'Kestrel Athletic',
    shape: 'wide wordmark, 4.17:1, volt ink',
    file: 'benchmarks/pro/v1/spike/marks/kestrel-athletic.svg',
    deep: '#12161A',
    accent: '#C8F531',
    onDarkDesign: { plate: '#12161A', ink: '#F5F7F2' },
    // Volt on white is weak, so this mark asks for a DARK card even on the light design.
    onLightDesign: { plate: '#12161A', ink: '#F5F7F2' },
  },
  {
    id: 'sunbeam',
    name: 'Sunbeam',
    shape: 'square emblem with fine spokes, 1:1',
    file: 'benchmarks/pro/v1/spike/marks/sunbeam.svg',
    deep: '#2A1608',
    accent: '#FF7A1A',
    onDarkDesign: { plate: '#2A1608', ink: '#FFF6EA' },
    onLightDesign: { plate: '#FFFDF6', ink: '#2A1608' },
  },
  {
    id: 'the-ledger',
    name: 'The Ledger',
    shape: 'tall, brings its own opaque field, 0.8:1',
    file: 'benchmarks/pro/v1/spike/marks/the-ledger.svg',
    deep: '#1A1A1A',
    accent: '#C4462F',
    onDarkDesign: { plate: '#FAFAF8', ink: '#FAFAF8' },
    onLightDesign: { plate: '#FAFAF8', ink: '#1A1A1A' },
  },
  {
    id: 'northbridge-community-broadcasting',
    name: 'Northbridge Community Broadcasting',
    shape: 'long-name lockup, 7.5:1, light ink',
    file: 'benchmarks/video/v1/marks/northbridge-community-broadcasting.svg',
    deep: '#0C2233',
    accent: '#4FA3D1',
    onDarkDesign: { plate: '#0C2233', ink: '#F2F5F8' },
    // Light ink cannot sit on a light card, so this mark darkens the card instead.
    onLightDesign: { plate: '#0C2233', ink: '#F2F5F8' },
  },
];

/**
 * Which tone answer each composition takes. It mirrors the plate default declared in the
 * file itself: 'light' means the payload sits on a light card and the type is on that card.
 */
const DESIGN_SURFACE = {
  'replay-slab': 'dark',
  'aperture-bands': 'light',
  'push-veil': 'dark',
};

/** The bundled video faces, read out of the ONE source that declares them. */
function videoFontFaceCss() {
  const src = fs.readFileSync(path.join(ROOT, 'src/video/videoFonts.ts'), 'utf8');
  const re = /family:\s*'([^']+)',[\s\S]*?file:\s*'([^']+)',[\s\S]*?weights:\s*\[(\d+),\s*(\d+)\]/g;
  const rules = [];
  for (const m of src.matchAll(re)) {
    const [, family, file, lo, hi] = m;
    const bytes = fs.readFileSync(path.join(ROOT, 'public/fonts', file));
    rules.push(
      `@font-face {\n` +
        `  font-family: "${family}";\n` +
        `  src: url("data:font/woff2;base64,${bytes.toString('base64')}") format("woff2");\n` +
        `  font-weight: ${lo} ${hi};\n` +
        `  font-display: block;\n` +
        `}`,
    );
  }
  if (rules.length === 0) throw new Error('no video fonts parsed out of src/video/videoFonts.ts');
  return rules.join('\n');
}

const dataUrl = (file) =>
  `data:image/svg+xml;base64,${fs.readFileSync(path.join(ROOT, file)).toString('base64')}`;

/**
 * The review chrome injected into each composed page. The fonts and GSAP are INLINED rather
 * than linked: a review page has to survive being opened straight off disk or handed to a
 * viewer that snapshots it, and both a relative <script src> and a file:// font request die
 * there - which reads as "the composition is broken" rather than "the rig is". Same reason
 * hyperframes/compose.ts inlines them for the real preview.
 */
function reviewHead(mark, tone, assets) {
  return `
<style>${assets.fontCss}</style>
<script>${assets.gsap}</script>
<style>
  /* The backdrop is on <html>, so <body> stays transparent and the composition's own alpha
     is what you are looking at. */
  html { height: 100%; }
  html.bg-checker {
    background: repeating-conic-gradient(#333a44 0 25%, #21262e 0 50%) 0 0 / 64px 64px;
  }
  html.bg-picture {
    background:
      radial-gradient(60% 80% at 22% 26%, #4d7fa8 0%, rgba(77,127,168,0) 60%),
      radial-gradient(70% 90% at 82% 72%, #a8703f 0%, rgba(168,112,63,0) 62%),
      linear-gradient(168deg, #6f8aa0 0%, #2c3a46 52%, #10161c 100%);
  }
  html.bg-white { background: #ffffff; }
  body { background: transparent; transform-origin: top left; }
  /* The composition root is authored at 1920x1080; the rig scales the whole page. */
</style>
<style id="brand-vars">
  #root {
    --brandDeep: ${mark.deep};
    --brandAccent: ${mark.accent};
    --brandInk: ${tone.ink};
    --brandPlate: ${tone.plate};
  }
</style>`;
}

const REVIEW_SCRIPT = `
<style>
  #geo-check { position: fixed; right: 14px; top: 14px; z-index: 99; width: 340px;
    font: 12px/1.45 "Segoe UI", system-ui, sans-serif; color: #e6edf3;
    background: rgba(13,17,23,0.94); border: 1px solid #30363d; border-radius: 8px; padding: 12px 14px; }
  #geo-check h3 { margin: 0 0 8px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #9aa7b4; }
  #geo-check button { background: #21262d; color: #e6edf3; border: 1px solid #30363d;
    border-radius: 6px; padding: 5px 10px; cursor: pointer; }
  #geo-check select { background: #21262d; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 4px 6px; }
  #geo-out { margin-top: 10px; white-space: pre-wrap; font-family: Consolas, monospace; font-size: 11px; }
  #geo-out .ok { color: #56d364; }
  #geo-out .bad { color: #ff7b72; }
  #geo-check.hidden { display: none; }
</style>
<div id="geo-check">
  <h3>Geometry check</h3>
  <button id="geo-run">run</button>
  <select id="geo-fps"><option>25</option><option>30</option><option selected>50</option><option>60</option></select>
  <button id="geo-hide">hide</button>
  <div id="geo-out">Sampled hit-test over the declared cut window, not the pixel gate.</div>
</div>
<script>
  // The rig drives the composition's own paused timeline, exactly as the driver and the
  // renderer do: seek, never run. Same t always gives the same pixels.
  (function () {
    var tl = (window.__timelines || {}).main;
    var de = document.documentElement;
    var root = document.getElementById('root');
    var dur = root ? Number(root.getAttribute('data-duration')) || 2 : 2;
    var cutStart = root ? Number(root.getAttribute('data-cut-start')) : NaN;
    var cutEnd = root ? Number(root.getAttribute('data-cut-end')) : NaN;
    function scale(s) { document.body.style.transform = 'scale(' + s + ')'; }
    function seek(t) { if (tl) tl.time(Math.max(0, Math.min(dur, t)), true); }
    function background(name) { de.className = 'bg-' + name; }
    window.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.kind === 'scrub') seek(d.t);
      else if (d.kind === 'bg') background(d.name);
      else if (d.kind === 'scale') scale(d.scale);
    });
    background('checker');
    var embedScale = new URLSearchParams(location.search).get('scale');
    scale(Number(embedScale) || 1);
    seek(0);
    // The contact sheet embeds this page at a quarter size; the check panel belongs to the
    // full-size view, where the viewport is big enough for it to mean anything.
    if (embedScale) document.getElementById('geo-check').classList.add('hidden');

    // ── The geometry check ──────────────────────────────────────────────────────
    // It answers two of the three §2.2 questions with the strongest instrument a plain
    // browser page has, and it is HONEST about which:
    //   - EMPTY HEAD/TAIL is proved exactly: an axis-aligned bounding box is a SUPERSET of
    //     the painted area, so "no box touches the frame" leaves nothing to argue with.
    //   - CUT-WINDOW COVERAGE is SAMPLED: elementsFromPoint honours every transform and clip
    //     exactly, but it is asked on a 16 px grid, so it cannot see a hairline seam. That is
    //     what the per-pixel gate on rendered frames is for (plan §4.2). This check is what
    //     catches the coarse failures - a window declared where the design is not covering.
    function eff(el) {
      var o = 1, n = el;
      while (n && n !== de) {
        var cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
        o *= Number(cs.opacity); n = n.parentElement;
      }
      return o;
    }
    function opaqueBg(el) {
      var m = /rgba?\\(([^)]+)\\)/.exec(getComputedStyle(el).backgroundColor);
      if (!m) return false;
      var p = m[1].split(',').map(Number);
      return (p.length < 4 || p[3] === 1) && eff(el) === 1;
    }
    function paints(el) {
      var cs = getComputedStyle(el);
      if (el.tagName === 'IMG') return true;
      if (cs.backgroundImage !== 'none') return true;
      var m = /rgba?\\(([^)]+)\\)/.exec(cs.backgroundColor);
      if (m) { var p = m[1].split(',').map(Number); if (p.length < 4 || p[3] > 0) return true; }
      if (cs.boxShadow && cs.boxShadow !== 'none') return true;
      for (var i = 0; i < el.childNodes.length; i++) {
        var ch = el.childNodes[i];
        if (ch.nodeType === 3 && ch.textContent.trim()) return true;
      }
      return false;
    }
    function run(fps) {
      // A pane with no layout reports a zero-sized viewport, and every loop below then
      // completes without testing anything - a false pass that looks exactly like a real one.
      if (de.clientWidth < 400 || de.clientHeight < 260) {
        return { error: 'viewport ' + de.clientWidth + 'x' + de.clientHeight +
          ' - open this page at a normal window size; a zero-layout pane would report a false pass' };
      }
      var prevO = de.style.overflow, prevT = document.body.style.transform;
      de.style.overflow = 'hidden';
      // elementsFromPoint only hit-tests inside the client area, so fit the whole frame in it.
      var S = Math.min(de.clientWidth / 1920, de.clientHeight / 1080) * 0.995;
      document.body.style.transform = 'scale(' + S + ')';
      var W = 1920 * S, H = 1080 * S, step = 16 * S;
      var frames = Math.round(dur * fps);
      var res = { fps: fps, frames: frames, points: 0, head: null, tail: null, span: [], worst: null };

      function paintedAt(t) {
        seek(t);
        var hits = [], all = root.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          if (!paints(el) || eff(el) < 0.004) continue;
          var r = el.getBoundingClientRect();
          if (r.width < 0.01 || r.height < 0.01) continue;
          if (r.right > 0.5 && r.left < W - 0.5 && r.bottom > 0.5 && r.top < H - 0.5) {
            var name = el.id || el.className || el.tagName;
            if (hits.indexOf(name) < 0) hits.push(name);
          }
        }
        return hits;
      }
      function gapsAt(t) {
        seek(t);
        var gaps = 0, first = null, pts = 0;
        for (var y = 0.6; y < H; y += step) for (var x = 0.6; x < W; x += step) {
          pts++;
          var ok = false, stack = document.elementsFromPoint(x, y);
          for (var i = 0; i < stack.length; i++) {
            if (stack[i].id === 'root') break;
            if (opaqueBg(stack[i])) { ok = true; break; }
          }
          if (!ok) { gaps++; if (!first) first = [Math.round(x / S), Math.round(y / S)]; }
        }
        res.points = pts;
        return { gaps: gaps, first: first };
      }

      res.head = paintedAt(0);
      res.tail = paintedAt((frames - 1) / fps);
      var f0 = Math.ceil(cutStart * fps), f1 = Math.floor(cutEnd * fps);
      for (var f = f0; f <= f1; f++) {
        var g = gapsAt(f / fps);
        res.span.push({ frame: f, gaps: g.gaps, first: g.first });
        if (!res.worst || g.gaps > res.worst.gaps) res.worst = { frame: f, gaps: g.gaps, first: g.first };
      }
      res.window = [f0, f1];
      seek(0);
      document.body.style.transform = prevT; de.style.overflow = prevO;
      return res;
    }

    var out = document.getElementById('geo-out');
    document.getElementById('geo-hide').addEventListener('click', function () {
      document.getElementById('geo-check').classList.add('hidden');
    });
    document.getElementById('geo-run').addEventListener('click', function () {
      out.textContent = 'running...';
      setTimeout(function () {
        var fps = Number(document.getElementById('geo-fps').value);
        var r = run(fps);
        if (r.error) { out.innerHTML = '<span class="bad">' + r.error + '</span>'; return; }
        var line = function (ok, text) { return '<span class="' + (ok ? 'ok' : 'bad') + '">' + (ok ? 'PASS' : 'FAIL') + '</span>  ' + text; };
        var lines = [
          fps + ' fps, ' + r.frames + ' frames, ' + r.points + ' sample points per frame',
          line(r.head.length === 0, 'frame 0 empty' + (r.head.length ? ' - painting: ' + r.head.join(', ') : '')),
          line(r.tail.length === 0, 'frame ' + (r.frames - 1) + ' empty' + (r.tail.length ? ' - painting: ' + r.tail.join(', ') : '')),
          line(r.worst && r.worst.gaps === 0,
            'cut window frames ' + r.window[0] + '-' + r.window[1] + ' fully covered' +
            (r.worst && r.worst.gaps ? ' - worst frame ' + r.worst.frame + ', ' + r.worst.gaps + ' uncovered samples, first at ' + r.worst.first : '')),
          line(tl.duration() <= (r.frames - 1) / fps, 'timeline ends at ' + tl.duration().toFixed(3) + ' s, last frame at ' + ((r.frames - 1) / fps).toFixed(3) + ' s'),
        ];
        out.innerHTML = lines.join('\\n');
      }, 30);
    });
  })();
</script>`;

/** Compose one composition + one mark into a standalone page. */
function composePage(source, mark, tone, assets) {
  let html = source.replace(/src="asset:logo"/g, `src="${dataUrl(mark.file)}"`);
  html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${reviewHead(mark, tone, assets)}`);
  html = html.replace(/<\/body>/i, `${REVIEW_SCRIPT}\n</body>`);
  return html;
}

function indexPage(entries, stingers) {
  const cell = (e) => `
      <figure class="cell">
        <iframe src="${e.href}?scale=0.25" width="480" height="270" title="${e.title}"
                loading="eager" scrolling="no"></iframe>
        <figcaption><a href="${e.href}" target="_blank">${e.markName}</a><span>${e.shape}</span></figcaption>
      </figure>`;
  const rows = stingers
    .map(
      (s) => `
    <section class="row">
      <h2>${s.id}<span>cut window ${s.cutStart}s to ${s.cutEnd}s &middot; exit complete 1.92s</span></h2>
      <div class="grid">${entries.filter((e) => e.stinger === s.id).map(cell).join('')}</div>
    </section>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Stinger corpus - brand swap review</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 28px 32px 64px; background: #0d1117; color: #e6edf3;
         font: 14px/1.5 "Segoe UI", system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  p.lead { margin: 0 0 22px; color: #9aa7b4; max-width: 78ch; }
  .controls { position: sticky; top: 0; z-index: 5; display: flex; align-items: center;
              gap: 18px; flex-wrap: wrap; padding: 14px 16px; margin-bottom: 26px;
              background: #161b22; border: 1px solid #262d36; border-radius: 8px; }
  .controls label { display: flex; align-items: center; gap: 8px; color: #9aa7b4; }
  #time { width: 420px; }
  output { font-variant-numeric: tabular-nums; color: #f6a623; min-width: 128px; }
  button { background: #21262d; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px;
           padding: 6px 12px; cursor: pointer; }
  button:hover { border-color: #f6a623; }
  .row { margin-bottom: 34px; }
  .row h2 { font-size: 15px; margin: 0 0 12px; display: flex; gap: 14px; align-items: baseline; }
  .row h2 span { font-weight: 400; color: #7d8794; font-size: 12px; }
  .grid { display: flex; gap: 14px; flex-wrap: wrap; }
  .cell { margin: 0; }
  iframe { border: 1px solid #262d36; border-radius: 4px; display: block; background: #0d1117; }
  figcaption { display: flex; flex-direction: column; margin-top: 6px; font-size: 12px; width: 480px; }
  figcaption a { color: #e6edf3; }
  figcaption span { color: #7d8794; }
</style>
</head>
<body>
<h1>Stinger corpus - brand swap review</h1>
<p class="lead">Every corpus stinger against every mark of the five-shape brand-swap set. The
slider seeks each composition's own paused timeline, so what you see at a given time is what
the renderer would produce at that frame. <strong>Motion verdicts still come from a rendered
MP4</strong> - a scrubbed pane is for structure, type and brand fit. Pixel-level head/tail
alpha and cut-window coverage are machine gates and are not measured here.</p>

<div class="controls">
  <label>t <input id="time" type="range" min="0" max="2" step="0.001" value="0" /></label>
  <output id="readout">0.000 s - frame 0/100</output>
  <label>fps
    <select id="fps"><option>25</option><option>30</option><option selected>50</option><option>60</option></select>
  </label>
  <button data-step="-1">&#8592; frame</button>
  <button data-step="1">frame &#8594;</button>
  <button data-jump="0">head</button>
  <button data-jump="0.46">cut in</button>
  <button data-jump="1.12">cut out</button>
  <button data-jump="1.92">tail</button>
  <label>backdrop
    <select id="bg"><option value="checker">checkerboard</option><option value="picture">live picture</option><option value="white">white</option></select>
  </label>
</div>
${rows}
<script>
  var time = document.getElementById('time');
  var readout = document.getElementById('readout');
  var fpsSel = document.getElementById('fps');
  var bgSel = document.getElementById('bg');

  function frames() { return Number(fpsSel.value); }
  function post(msg) {
    document.querySelectorAll('iframe').forEach(function (f) {
      if (f.contentWindow) f.contentWindow.postMessage(msg, '*');
    });
  }
  function render() {
    var t = Number(time.value);
    var fps = frames();
    var total = Math.round(2 * fps);
    readout.textContent = t.toFixed(3) + ' s - frame ' + Math.round(t * fps) + '/' + total;
    post({ kind: 'scrub', t: t });
  }
  time.addEventListener('input', render);
  fpsSel.addEventListener('change', render);
  bgSel.addEventListener('change', function () { post({ kind: 'bg', name: bgSel.value }); });
  document.querySelectorAll('[data-step]').forEach(function (b) {
    b.addEventListener('click', function () {
      time.value = String(Number(time.value) + Number(b.dataset.step) / frames());
      render();
    });
  });
  document.querySelectorAll('[data-jump]').forEach(function (b) {
    b.addEventListener('click', function () { time.value = b.dataset.jump; render(); });
  });
  // Iframes finish loading after this script runs; re-post once they are all up.
  window.addEventListener('load', function () { render(); post({ kind: 'bg', name: bgSel.value }); });
</script>
</body>
</html>
`;
}

function main() {
  const files = fs.readdirSync(CORPUS).filter((f) => f.endsWith('.html')).sort();
  if (files.length === 0) throw new Error(`no compositions in ${CORPUS}`);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const assets = {
    fontCss: videoFontFaceCss(),
    gsap: fs.readFileSync(path.join(ROOT, 'src/assets/gsap.min.js'), 'utf8'),
  };

  const stingers = [];
  const entries = [];
  for (const file of files) {
    const id = file.replace(/\.html$/, '');
    const source = fs.readFileSync(path.join(CORPUS, file), 'utf8');
    const cut = /data-cut-start="([\d.]+)"[\s\S]*?data-cut-end="([\d.]+)"/.exec(source);
    if (!cut) throw new Error(`${file} declares no data-cut-start/data-cut-end (plan §2.2)`);
    stingers.push({ id, cutStart: cut[1], cutEnd: cut[2] });

    const surface = DESIGN_SURFACE[id];
    if (!surface) throw new Error(`${file} has no entry in DESIGN_SURFACE - add its plate tone`);
    for (const mark of MARKS) {
      const tone = surface === 'light' ? mark.onLightDesign : mark.onDarkDesign;
      const href = `${id}--${mark.id}.html`;
      fs.writeFileSync(path.join(OUT, href), composePage(source, mark, tone, assets));
      entries.push({ stinger: id, href, markName: mark.name, shape: mark.shape, title: `${id} / ${mark.name}` });
    }
  }

  fs.writeFileSync(path.join(OUT, 'index.html'), indexPage(entries, stingers));
  console.log(`${entries.length} pages (${stingers.length} stingers x ${MARKS.length} marks)`);
  console.log(`open ${path.join(OUT, 'index.html')}`);
}

main();
