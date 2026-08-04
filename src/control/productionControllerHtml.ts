// The PRODUCTION CONTROLLER — the shared operator surface an exported local-control package
// opens (the launcher's landing page). One interface for the whole production: the cue
// rundown with the take verbs, per-graphic capability modules (fields + state-machine event
// buttons, from the SAME control generator every surface uses), a PREVIEW/PROGRAM monitor
// pair, and the activity feed — all driven through the local relay's ordered log
// (export/local-relay/, protocol v1).
//
// PREVIEW/PROGRAM (the broadcast workflow): "→ Preview" takes the selected cue onto the
// PREVIEW stream — only the controller's PVW monitor follows it, so the operator checks the
// graphic without airing anything. "⟳ Take" sends the same cue to the PROGRAM stream: the
// OBS/vMix sources (loaded with ?stream=program) and the PGM monitor follow that one. Same
// rows, one `stream` field apart — the relay log carries both.
//
// Self-contained vanilla JS (no dependencies — it ships in a zip), same voice as
// controlPanelHtml.ts, whose emitGraphic it reuses so the two generated surfaces cannot
// disagree about a graphic's controls. The in-app production page stays the studio's
// cockpit; this page is the same verbs for the exported package.

import type { EmittedGraphic } from './controlPanelHtml';

/** One cue as the controller ships it: prepared data for one graphic of the pool. */
export interface EmittedCue {
  id: string;
  label: string;
  graphic: string;
  values: Record<string, string>;
  note: string;
}

export interface ControllerPayload {
  show: string;
  /** Pool order = paint order = layer order (index 0 furthest back). */
  graphics: (EmittedGraphic & { file: string; layer: number })[];
  cues: EmittedCue[];
  /** The design canvas the monitors letterbox into (the first graphic's, typically 1920×1080). */
  width: number;
  height: number;
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderProductionControllerHtml(payload: ControllerPayload): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(payload.show)} — production controller</title>
<style>
  :root { --bg:#10141b; --panel:#171d26; --line:#2a3444; --text:#e8ecf2; --dim:#8b95a5; --accent:#3aa0ff; --amber:#f6a623; --air:#ef4444; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.5 system-ui, sans-serif; }
  header { padding:12px 18px; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:12px; }
  header h1 { font-size:15px; margin:0; }
  header .status { margin-left:auto; font-size:12px; color:var(--dim); }
  main { display:grid; grid-template-columns: minmax(0, 1fr) 360px; gap:0; height: calc(100vh - 49px); }
  .left { min-width:0; display:flex; flex-direction:column; overflow:auto; padding:14px 18px; gap:12px; }
  .rundown { border-left:1px solid var(--line); overflow:auto; padding:14px 16px; }
  /* The monitor pair: PVW (amber frame) beside PGM (red frame) — the broadcast convention. */
  .monitors { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
  .monitor { position:relative; }
  .monitor h2 { font-size:11px; letter-spacing:.14em; margin:0 0 6px; display:flex; gap:8px; align-items:center; }
  .monitor .dot { width:8px; height:8px; border-radius:50%; display:inline-block; }
  .mon-pvw h2 { color:var(--amber); } .mon-pvw .dot { background:var(--amber); }
  .mon-pgm h2 { color:var(--air); } .mon-pgm .dot { background:var(--air); }
  .stage { position:relative; width:100%; aspect-ratio:${payload.width} / ${payload.height}; overflow:hidden; border-radius:6px;
    background-color:#20262e;
    background-image: linear-gradient(45deg,#2c333d 25%,transparent 25%), linear-gradient(-45deg,#2c333d 25%,transparent 25%),
      linear-gradient(45deg,transparent 75%,#2c333d 75%), linear-gradient(-45deg,transparent 75%,#2c333d 75%);
    background-size:20px 20px; background-position:0 0,0 10px,10px -10px,-10px 0; }
  .mon-pvw .stage { box-shadow: inset 0 0 0 2px rgba(246,166,35,.65); }
  .mon-pgm .stage { box-shadow: inset 0 0 0 2px rgba(239,68,68,.75); }
  .stage iframe { position:absolute; top:0; left:0; width:${payload.width}px; height:${payload.height}px; border:0;
    transform-origin: top left; pointer-events:none; background:transparent; }
  .verbs { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .verbs button { min-height:44px; padding:10px 16px; font:inherit; color:var(--text); background:#243044; border:1px solid var(--line); border-radius:6px; cursor:pointer; }
  .verbs button:hover { border-color:var(--accent); }
  .verbs button:disabled { opacity:.4; cursor:default; }
  .verbs .pvw { border-color:rgba(246,166,35,.6); }
  .verbs .take { background:var(--air); border-color:var(--air); color:#fff; font-weight:700; padding-inline:20px; }
  .live-line { font-size:12px; color:var(--dim); }
  .live-line .on { color:var(--air); font-weight:600; }
  .live-line .pv { color:var(--amber); font-weight:600; }
  .editor { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px 14px; }
  .editor h3 { margin:0 0 8px; font-size:13px; }
  .editor h3 .muted { color:var(--dim); font-weight:400; }
  .editor.live { border-color:var(--air); box-shadow: inset 0 0 0 1px var(--air); }
  .editor.pvw-live { border-color:rgba(246,166,35,.7); box-shadow: inset 0 0 0 1px rgba(246,166,35,.7); }
  .field { padding:8px 0; border-bottom:1px solid var(--line); }
  .field:last-child { border-bottom:none; }
  .field > label { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:var(--dim); margin-bottom:4px; }
  input, textarea, select { width:100%; font:inherit; color:var(--text); background:var(--bg); border:1px solid var(--line); border-radius:6px; padding:7px 9px; }
  textarea { min-height:84px; resize:vertical; }
  .events { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
  .events button { font:inherit; color:var(--text); background:#243044; border:1px solid var(--line); border-radius:6px; padding:7px 12px; cursor:pointer; }
  .events button:disabled { opacity:.4; cursor:default; }
  .cue { display:flex; align-items:center; gap:8px; padding:9px 10px; border:1px solid var(--line); border-radius:8px; margin-bottom:6px; background:var(--panel); cursor:pointer; }
  .cue .no { font-size:11px; color:var(--dim); min-width:18px; text-align:right; }
  .cue .name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cue .g { color:var(--dim); font-size:12px; }
  .cue.selected { border-color:var(--accent); }
  .cue.on-air { border-color:var(--air); box-shadow: inset 0 0 0 1px var(--air); background:rgba(239,68,68,.08); }
  .cue.on-pvw { border-color:rgba(246,166,35,.7); box-shadow: inset 0 0 0 1px rgba(246,166,35,.6); background:rgba(246,166,35,.06); }
  .rundown h2 { font-size:13px; margin:0 0 8px; }
  .rundown .hint { font-size:12px; color:var(--dim); }
  .feed { font-size:12px; color:var(--dim); max-height:180px; overflow:auto; margin-top:10px; border-top:1px solid var(--line); padding-top:8px; }
  .feed div { padding:1px 0; }
  a { color:var(--accent); }
  .nolisten { display:none; margin:0 18px; margin-top:10px; padding:10px 14px; border:1px solid #8a4a2a; border-radius:8px; background:#2d1c12; color:#f0c9a8; font-size:12px; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(payload.show)} <span style="color:var(--dim);font-weight:400">· production controller</span></h1>
  <a href="show_controlpanel.html" title="The per-graphic panel: every field and event button of every graphic">per-graphic panel →</a>
  <span class="status" id="status">connecting…</span>
</header>
<div class="nolisten" id="nolisten">
  <strong>The relay is not answering.</strong> Start this page through the bundled launcher
  ("Start controller.cmd" / "start-controller.command") — it serves the package and relays
  commands to the graphics. Opened from disk or a plain web server, the verbs have no wire.
</div>
<main>
  <section class="left">
    <div class="monitors">
      <div class="monitor mon-pvw">
        <h2><span class="dot"></span> PREVIEW <span id="pvw-label" style="color:var(--dim);font-weight:400"></span></h2>
        <div class="stage" id="stage-pvw"></div>
      </div>
      <div class="monitor mon-pgm">
        <h2><span class="dot"></span> PROGRAM — ON AIR <span id="pgm-label" style="color:var(--dim);font-weight:400"></span></h2>
        <div class="stage" id="stage-pgm"></div>
      </div>
    </div>
    <div class="verbs">
      <button class="pvw" id="v-preview" title="Take the selected cue onto the PREVIEW monitor only — nothing airs">→ Preview</button>
      <button class="take" id="v-take" title="Take the selected cue TO AIR (the program stream)">⟳ Take</button>
      <button id="v-update" title="Push the selected cue's edited values to air without re-animating">✎ Update</button>
      <button id="v-next" title="Advance the on-air graphic one step (SPX Continue)">» Next</button>
      <button id="v-out" title="Play the selected cue's layer off air">■ Out</button>
      <button id="v-allout" title="Clear every live layer">■■ All out</button>
      <span class="live-line" id="live-line"></span>
    </div>
    <div class="editor" id="editor" style="display:none">
      <h3 id="editor-title"></h3>
      <div id="editor-fields"></div>
      <div class="events" id="editor-events"></div>
    </div>
    <div class="feed" id="feed"></div>
  </section>
  <aside class="rundown">
    <h2>Cue rundown</h2>
    <p class="hint">Select a cue — it shows on PREVIEW via → Preview; ⟳ Take airs it. Several
    graphics can be on air at once, one per layer.</p>
    <div id="cues"></div>
  </aside>
</main>
<script>
var PAYLOAD = ${jsonForScript(payload)};
var W = ${payload.width}, H = ${payload.height};

// ── Relay wire (protocol v1). The controller is relay-only: no relay, no verbs. ──
var relayOk = false;
var cursor = 0;
function send(items) {
  if (!relayOk) return;
  fetch('/relay/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: items }) }).catch(function () {});
}

// ── Monitors: every pool graphic stacked in layer order, per stream. The iframes are
// ordinary package graphics addressed with ?stream=, so what PREVIEW shows is the real
// runtime, not a simulation. ──
function buildStage(hostId, stream) {
  var host = document.getElementById(hostId);
  PAYLOAD.graphics.forEach(function (g, i) {
    var f = document.createElement('iframe');
    f.src = g.file + '?stream=' + stream;
    f.style.zIndex = String(i + 1);
    host.appendChild(f);
  });
  function fit() {
    var scale = host.clientWidth / W;
    var frames = host.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) frames[i].style.transform = 'scale(' + scale + ')';
  }
  fit();
  window.addEventListener('resize', fit);
}
buildStage('stage-pvw', 'preview');
buildStage('stage-pgm', 'program');

// ── State: selection, drafts, and the per-stream tally (graphic -> cue id). ──
var selectedId = PAYLOAD.cues.length ? PAYLOAD.cues[0].id : null;
var drafts = {};   // cueId -> edited values overlay
var pvwLive = {};  // graphic -> cueId on the preview stream
var pgmLive = {};  // graphic -> cueId on the program stream
function cueById(id) { for (var i = 0; i < PAYLOAD.cues.length; i++) if (PAYLOAD.cues[i].id === id) return PAYLOAD.cues[i]; return null; }
function graphicByName(name) { for (var i = 0; i < PAYLOAD.graphics.length; i++) if (PAYLOAD.graphics[i].name === name) return PAYLOAD.graphics[i]; return null; }
function cueValues(cue) {
  var out = {};
  var g = graphicByName(cue.graphic);
  if (g) g.controls.forEach(function (c) { out[c.key] = String(c.value || ''); });
  for (var k in cue.values) out[k] = String(cue.values[k]);
  var d = drafts[cue.id] || {};
  for (var k2 in d) out[k2] = String(d[k2]);
  return out;
}

function feed(text) {
  var el = document.getElementById('feed');
  var row = document.createElement('div');
  row.textContent = new Date().toLocaleTimeString() + '  ' + text;
  el.insertBefore(row, el.firstChild);
  while (el.children.length > 80) el.removeChild(el.lastChild);
}

// ── The verbs: each is ONE batch of protocol rows; the 'cue' meta row is what carries the
// tally to every follower (receivers ignore it — same shape as the hosted log). ──
function takeTo(stream) {
  var cue = cueById(selectedId);
  if (!cue) return;
  send([
    { graphic: cue.graphic, stream: stream, msg: { t: 'update', data: cueValues(cue) } },
    { graphic: cue.graphic, stream: stream, msg: { t: 'play' } },
    { graphic: cue.graphic, stream: stream, msg: { t: 'cue', cue: cue.id } },
  ]);
  feed((stream === 'preview' ? '→ Preview: ' : '⟳ Take: ') + cue.label + ' · ' + cue.graphic);
}
function updateLive() {
  var cue = cueById(selectedId);
  if (!cue || pgmLive[cue.graphic] !== cue.id) return;
  send([{ graphic: cue.graphic, stream: 'program', msg: { t: 'update', data: cueValues(cue) } }]);
  feed('✎ Update: ' + cue.label);
}
function nextLive() {
  var cue = cueById(selectedId);
  if (!cue) return;
  send([{ graphic: cue.graphic, stream: 'program', msg: { t: 'next' } }]);
  feed('» Next: ' + cue.graphic);
}
function outCue(stream) {
  var cue = cueById(selectedId);
  if (!cue) return;
  send([
    { graphic: cue.graphic, stream: stream, msg: { t: 'stop' } },
    { graphic: cue.graphic, stream: stream, msg: { t: 'cue', cue: null } },
  ]);
  feed('■ Out: ' + cue.graphic);
}
function allOut() {
  var items = [];
  for (var g in pgmLive) {
    items.push({ graphic: g, stream: 'program', msg: { t: 'stop' } });
    items.push({ graphic: g, stream: 'program', msg: { t: 'cue', cue: null } });
  }
  if (items.length) send(items);
  feed('■■ All out');
}
document.getElementById('v-preview').onclick = function () { takeTo('preview'); };
document.getElementById('v-take').onclick = function () { takeTo('program'); };
document.getElementById('v-update').onclick = updateLive;
document.getElementById('v-next').onclick = nextLive;
document.getElementById('v-out').onclick = function () { outCue('program'); };
document.getElementById('v-allout').onclick = allOut;

// ── The log follow: the tally comes from the LOG (never assumed locally), so a second
// controller window agrees with this one. Boot at the head — recovery is a re-take. ──
function applyRow(row) {
  var m = row.msg || {};
  if (m.t !== 'cue') return;
  var map = row.stream === 'preview' ? pvwLive : pgmLive;
  if (m.cue) map[row.graphic] = m.cue;
  else delete map[row.graphic];
  paint();
}
function poll() {
  fetch('/relay/log?after=' + cursor)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.rows) return;
      for (var i = 0; i < data.rows.length; i++) { cursor = data.rows[i].id; applyRow(data.rows[i]); }
    })
    .catch(function () {});
}

// ── Painting: rundown, tallies, the editor for the selected cue. ──
function paint() {
  var host = document.getElementById('cues');
  host.innerHTML = '';
  PAYLOAD.cues.forEach(function (cue, i) {
    var el = document.createElement('div');
    var onAir = pgmLive[cue.graphic] === cue.id;
    var onPvw = pvwLive[cue.graphic] === cue.id;
    el.className = 'cue' + (cue.id === selectedId ? ' selected' : '') + (onAir ? ' on-air' : onPvw ? ' on-pvw' : '');
    el.innerHTML = '<span class="no">' + (onAir ? '●' : (i + 1) + '.') + '</span>' +
      '<span class="name">' + cue.label.replace(/</g, '&lt;') + ' <span class="g">· ' + cue.graphic.replace(/</g, '&lt;') + '</span></span>' +
      (onAir ? '<span style="color:var(--air);font-size:11px;font-weight:700">ON AIR</span>' :
        onPvw ? '<span style="color:var(--amber);font-size:11px;font-weight:700">PVW</span>' : '');
    el.onclick = function () { selectedId = cue.id; paint(); };
    host.appendChild(el);
  });

  var pvwNames = [], pgmNames = [];
  for (var a in pvwLive) { var c1 = cueById(pvwLive[a]); pvwNames.push(c1 ? c1.label : a); }
  for (var b in pgmLive) { var c2 = cueById(pgmLive[b]); pgmNames.push(c2 ? c2.label : b); }
  document.getElementById('pvw-label').textContent = pvwNames.length ? '· ' + pvwNames.join(' · ') : '';
  document.getElementById('pgm-label').textContent = pgmNames.length ? '· ' + pgmNames.join(' · ') : '';
  document.getElementById('live-line').innerHTML = pgmNames.length
    ? '<span class="on">● ' + pgmNames.join(' · ').replace(/</g, '&lt;') + '</span>'
    : '<span>○ nothing on air</span>';

  paintEditor();
}

function paintEditor() {
  var wrap = document.getElementById('editor');
  var cue = cueById(selectedId);
  if (!cue) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  var g = graphicByName(cue.graphic);
  var onAir = pgmLive[cue.graphic] === cue.id;
  var onPvw = pvwLive[cue.graphic] === cue.id;
  wrap.className = 'editor' + (onAir ? ' live' : onPvw ? ' pvw-live' : '');
  document.getElementById('editor-title').innerHTML =
    'Editing: ' + cue.label.replace(/</g, '&lt;') +
    ' <span class="muted">· ' + cue.graphic.replace(/</g, '&lt;') + ' · ' +
    (onAir ? '<span style="color:var(--air);font-weight:700">LIVE — ✎ Update pushes edits</span>'
      : onPvw ? '<span style="color:var(--amber);font-weight:700">ON PREVIEW — ⟳ Take airs it</span>'
      : 'draft — → Preview to check it, ⟳ Take to air it') + '</span>';

  var fields = document.getElementById('editor-fields');
  fields.innerHTML = '';
  var values = cueValues(cue);
  (g ? g.controls : []).forEach(function (c) {
    var box = document.createElement('div');
    box.className = 'field';
    var label = document.createElement('label');
    label.textContent = c.label;
    box.appendChild(label);
    var input;
    if (c.kind === 'lines') { input = document.createElement('textarea'); }
    else if (c.kind === 'select') {
      input = document.createElement('select');
      (c.options || []).forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o.value !== undefined ? o.value : o;
        opt.textContent = o.label !== undefined ? o.label : o;
        input.appendChild(opt);
      });
    } else {
      input = document.createElement('input');
      input.type = c.kind === 'number' ? 'number' : 'text';
    }
    input.value = values[c.key] !== undefined ? values[c.key] : '';
    input.oninput = function () {
      if (!drafts[cue.id]) drafts[cue.id] = {};
      drafts[cue.id][c.key] = input.value;
      if (pgmLive[cue.graphic] === cue.id) updateLive();
      else if (pvwLive[cue.graphic] === cue.id) {
        // Live-edit the PREVIEW: typing refreshes the PVW monitor without touching air.
        send([{ graphic: cue.graphic, stream: 'preview', msg: { t: 'update', data: cueValues(cue) } }]);
      }
    };
    box.appendChild(input);
    fields.appendChild(box);
  });

  // The graphic's OPERATOR EVENTS (its state machine's buttons) — the capability module the
  // machine declares; a graphic with none shows none.
  var events = document.getElementById('editor-events');
  events.innerHTML = '';
  (g ? g.events : []).forEach(function (e) {
    var btn = document.createElement('button');
    btn.textContent = '⚡ ' + e.label;
    btn.onclick = function () {
      var payload = null;
      (e.payload || []).forEach(function (key) {
        var v = cueValues(cue)[key];
        if (v !== undefined) { payload = payload || {}; payload[key] = v; }
      });
      send([{ graphic: cue.graphic, stream: 'program', msg: payload ? { t: 'event', event: e.event, payload: payload } : { t: 'event', event: e.event } }]);
      feed('⚡ ' + e.label + ': ' + cue.graphic);
    };
    events.appendChild(btn);
  });
}

// ── Boot: relay first (the controller is nothing without it), then follow the log. ──
fetch('/relay/ping')
  .then(function (r) { return r.ok ? r.json() : null; })
  .then(function (d) {
    if (!d || !d.ok) throw new Error('no relay');
    relayOk = true;
    cursor = d.head || 0;
    document.getElementById('status').textContent = 'local relay connected';
    setInterval(poll, 400);
  })
  .catch(function () {
    document.getElementById('status').textContent = 'relay not reachable';
    document.getElementById('nolisten').style.display = 'block';
  });
paint();
</script>
</body>
</html>`;
}
