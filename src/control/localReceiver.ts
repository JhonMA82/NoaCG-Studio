// The LOCAL RELAY receiver: a marked, commented, DELETABLE block appended to an exported
// overlay graphic so a control panel can drive it THROUGH the bundled localhost relay
// (export/local-relay/). BroadcastChannel cannot cross into OBS/vMix's separate browser
// engine and never works over file:// — the relay's ordered log is the local counterpart of
// the hosted control log, same command vocabulary, polled over same-origin fetch.
//
// Inert everywhere the relay is not: over file://, or when the files are served by a plain
// static server (/relay/ping missing), the block probes once and goes quiet.

const OPEN = '/* == LOCAL RELAY (NoaCG) — edit or delete this whole block == */';
const CLOSE = '/* == END LOCAL RELAY == */';

export function hasLocalReceiver(js: string): boolean {
  return js.includes(OPEN);
}

/** The raw JS block — what the single-file composer appends as an extra body script. */
export function localReceiverJs(graphicName: string): string {
  return `${OPEN}
// Drive this graphic through the package's LOCAL RELAY (start it with the bundled launcher;
// see GETTING-ON-AIR.md). The relay keeps an ordered command log; this block polls it and
// applies rows addressed to this graphic — the same update/play/stop/next/event/snap
// vocabulary every NoaCG control surface speaks. Delete the whole block to opt out.
(function () {
  var GRAPHIC = ${JSON.stringify(graphicName)};
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return; // file:// — no relay
  // Which stream this instance follows: /graphic.html?stream=preview renders the PREVIEW
  // feed; the default is the program feed that goes to air.
  var STREAM = 'program';
  try {
    var q = new URLSearchParams(location.search).get('stream');
    if (q) STREAM = q;
  } catch (e) { /* very old engine — program feed */ }

  function apply(m) {
    if (!m) return;
    if (m.t === 'play' && typeof play === 'function') play();
    else if (m.t === 'stop' && typeof stop === 'function') stop();
    else if (m.t === 'next' && typeof next === 'function') next();
    else if (m.t === 'update' && typeof update === 'function') update(JSON.stringify(m.data || {}));
    else if (m.t === 'event' && typeof noacgDispatch === 'function') noacgDispatch(m.event, m.payload);
    else if (m.t === 'snap' && typeof noacgSnap === 'function') noacgSnap(m.snap || null);
  }

  var cursor = null;
  var polling = false;
  function poll() {
    if (polling || cursor === null) return;
    polling = true;
    fetch('/relay/log?after=' + cursor)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        polling = false;
        if (!data || !data.rows) return;
        for (var i = 0; i < data.rows.length; i++) {
          var row = data.rows[i];
          cursor = row.id; // advance past every row — foreign rows must not be refetched
          if (row.graphic === GRAPHIC && (row.stream || 'program') === STREAM) apply(row.msg);
        }
      })
      .catch(function () { polling = false; });
  }

  // Boot at the log HEAD: a reloaded browser source starts clean and follows live commands
  // (full replay recovery is the shared controller's job, not a blind re-run of the show).
  fetch('/relay/ping')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.ok) return; // plain static hosting — stay quiet
      cursor = d.head || 0;
      setInterval(poll, 400);
    })
    .catch(function () { /* no relay here */ });
})();
${CLOSE}`;
}

/** The same block wrapped as a <script> tag, for callers injecting into finished HTML. */
export function localReceiverScript(graphicName: string): string {
  return `<script>\n${localReceiverJs(graphicName)}\n</script>`;
}
