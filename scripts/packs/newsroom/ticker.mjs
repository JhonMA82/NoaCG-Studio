// UUTISHUONE TICKER — the always-on white bar at the foot of the frame.
//
// A ROTATOR, not a marquee: one headline stands at a time and the next replaces it with a
// vertical push every few seconds. Deliberate — a rotator survives a live edit (the list
// re-reads and the current index holds, no loop to desync), reads better at stream sizes
// than crawling text, and its timers are killable GSAP calls the render clock can drive.
//
// The headline list is ONE textarea field (one item per line) — the repeating-data rule:
// a longer list is typing more lines, never more fields. All writes are textContent, so
// operator text can never run as markup.

import { LOOK, definitionScript, pageHtml, stageCss } from './look.mjs';

const ITEMS = [
  'Hallitus neuvottelee budjetista – ratkaisua odotetaan illalla',
  'Sää viilenee loppuviikolla koko maassa',
  'HJK eteni jatkoaikavoitolla europeleihin',
  'Tutkimus: etätyö vakiintui kolmeen päivään viikossa',
  'Kirjastojen lainausmäärät kasvoivat ennätyslukemiin',
];

const definition = definitionScript({
  description: 'Bottom ticker — white bar, label block, rotating headlines, clock',
  playlayer: '1',
  webplayout: '1',
  uicolor: '4',
  fields: [
    `{ "field": "f0", "ftype": "textarea", "title": "Headlines (one per line)", "value": "${ITEMS.join('\\n')}" }`,
    `{ "field": "f1", "ftype": "textfield", "title": "Label block", "value": "UUTISET" }`,
  ],
});

const html = pageHtml({
  title: 'Uutishuone ticker',
  definition,
  body: `  <!-- The stage starts hidden (opacity: 0); nothing paints until play(). -->
  <div id="ticker-stage">
    <div class="ticker-bar">
      <!-- The violet label block, full bar height. -->
      <div class="ticker-label"><span id="f1">UUTISET</span></div>
      <!-- The rotating headline window. -->
      <div class="ticker-window">
        <p class="ticker-item" id="ticker-item"></p>
      </div>
      <!-- The live clock (Finnish HH.MM), tabular digits so it never twitches. -->
      <div class="ticker-clock"><span id="ticker-clock">00.00</span></div>
    </div>
    <!-- The headline list's data holder — hidden by CSS RULE (never an inline style;
         the editor's entrance reset clears inline props). One item per line. -->
    <div class="ticker-source" id="f0">${ITEMS.join('\n')}</div>
  </div>
`,
});

const css = `${stageCss()}

#ticker-stage {
  position: absolute;
  inset: 0;
  opacity: 0;                                    /* hidden until play() */
}

/* The data holder — a hidden source, never painted. */
.ticker-source { display: none; }

/* The bar: full frame width, flush at the very bottom — frame-anchored geometry, so it is
   sized against the frame, never against its text. */
.ticker-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(66px * var(--scale));
  display: flex;
  align-items: stretch;
  background: ${LOOK.tickerBar};
  box-shadow: 0 -10px 34px rgba(0, 0, 0, 0.28); /* lifts the white bar off the picture */
  will-change: transform;
}

/* The violet label block on the left. */
.ticker-label {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  padding: 0 calc(28px * var(--scale));
  background: var(--accent);
}
.ticker-label span {
  font-size: calc(22px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-color);
}

/* The headline window — one item at a time, pushed vertically. */
.ticker-window {
  flex: 1;
  display: flex;
  align-items: center;
  overflow: hidden;                              /* the push happens behind this mask */
  padding: 0 calc(30px * var(--scale));
  min-width: 0;
}
.ticker-item {
  font-size: calc(26px * var(--scale) * var(--type-scale));
  font-weight: 500;
  line-height: 1.2;
  color: ${LOOK.tickerInk};
  white-space: nowrap;                           /* a headline is one line on the bar */
  overflow: hidden;
  text-overflow: ellipsis;                       /* an extreme line trims, never collides */
  max-width: 100%;
  will-change: transform, opacity;
}

/* The clock — quiet, tabular, separated by a hairline. */
.ticker-clock {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  padding: 0 calc(28px * var(--scale));
  border-left: 1px solid rgba(23, 19, 31, 0.14); /* hairline separator */
}
.ticker-clock span {
  font-family: var(--font-numeric);              /* digits all one width… */
  font-variant-numeric: tabular-nums;            /* …and asked for explicitly */
  font-size: calc(24px * var(--scale) * var(--type-scale));
  font-weight: 600;
  color: ${LOOK.tickerInkDim};
}
`;

const js = `// Uutishuone ticker — SPX calls update(), play(), stop(), next().
//
// The rotation is driven by killable gsap.delayedCall timers (never setTimeout), so the
// editor's transport, a paused preview and the render clock all see the same motion.

var ROTATE_SECONDS = 6;    // how long each headline stands
var PUSH_SECONDS = 0.45;   // the vertical push between headlines

var tickerItems = [];      // the parsed headline list
var tickerIndex = 0;       // which headline is standing
var rotateTimer = null;    // the pending advance, killable
var clockTimer = null;     // the 1s clock repaint

// readItems(): the hidden #f0 source holds one headline per line.
function readItems() {
  var source = document.getElementById('f0');
  var lines = (source ? source.textContent : '').split('\\n');
  var items = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line !== '') items.push(line);
  }
  return items;
}

// showCurrent(): paint the standing headline with no motion — used at play, and after a
// live edit so the rotation keeps its place instead of restarting.
function showCurrent() {
  var el = document.getElementById('ticker-item');
  if (!el) return;
  if (tickerItems.length === 0) { el.textContent = ''; return; }
  if (tickerIndex >= tickerItems.length) tickerIndex = 0;
  el.textContent = tickerItems[tickerIndex];   // textContent: operator text stays text
}

// showNext(): push the standing headline up and out, bring the next up from below.
function showNext() {
  if (tickerItems.length < 2) { scheduleRotate(); return; }
  var el = document.getElementById('ticker-item');
  var out = gsap.to(el, { yPercent: -115, opacity: 0, duration: PUSH_SECONDS, ease: 'power2.in' });
  out.eventCallback('onComplete', function () {
    tickerIndex = (tickerIndex + 1) % tickerItems.length;
    showCurrent();
    gsap.fromTo(el, { yPercent: 115, opacity: 1 }, { yPercent: 0, duration: PUSH_SECONDS + 0.1, ease: 'power3.out' });
    scheduleRotate();
  });
}

// scheduleRotate(): arm the next advance (kills any pending one first).
function scheduleRotate() {
  if (rotateTimer) rotateTimer.kill();
  rotateTimer = gsap.delayedCall(ROTATE_SECONDS, showNext);
}

// paintClock(): Finnish wall-clock time, HH.MM — repainted every second.
function paintClock() {
  var el = document.getElementById('ticker-clock');
  if (!el) return;
  var now = new Date();
  var h = String(now.getHours());
  var m = String(now.getMinutes());
  if (h.length < 2) h = '0' + h;
  if (m.length < 2) m = '0' + m;
  el.textContent = h + '.' + m;
}

// update(data): write the label, refresh the list, keep the rotation's place. The standing
// headline repaints in place (index clamped), so editing mid-loop never restarts the loop.
function update(data) {
  var fields = (typeof data === 'string') ? JSON.parse(data) : data;
  var label = document.getElementById('f1');
  if (label && Object.prototype.hasOwnProperty.call(fields, 'f1')) label.textContent = fields.f1;
  var source = document.getElementById('f0');
  if (source && Object.prototype.hasOwnProperty.call(fields, 'f0')) source.textContent = fields.f0;
  tickerItems = readItems();
  showCurrent();
  paintClock();   // previews settle through update(), so the clock reads real time there too
}

/* == ANIMATION (generated — the Animation panel rewrites this block) == */
var animSpeed = 1;  // 1 = normal · 0.75 = slower · 1.5 = faster

// The entrance: the whole bar rises from below the frame.
function buildInTimeline() {
  var tl = gsap.timeline();
  tl.to('#ticker-stage', { opacity: 1, duration: 0.15 / animSpeed, ease: 'power1.out' }, 0);
  tl.from('.ticker-bar', { yPercent: 110, duration: 0.6 / animSpeed, ease: 'power3.out' }, 0);
  tl.from('.ticker-item', { opacity: 0, duration: 0.4 / animSpeed, ease: 'power2.out' }, 0.35);
  return tl;
}

// The exit: the bar drops out, faster.
function buildOutTimeline() {
  var tl = gsap.timeline();
  tl.to('.ticker-bar', { yPercent: 110, duration: 0.4 / animSpeed, ease: 'power2.in' }, 0);
  tl.to('#ticker-stage', { opacity: 0, duration: 0.25 / animSpeed, ease: 'power2.in' }, 0.2);
  return tl;
}
/* == END ANIMATION == */

// play(): fresh read, entrance, then the loop and the clock.
function play() {
  if (rotateTimer) { rotateTimer.kill(); rotateTimer = null; }
  if (clockTimer) { clockTimer.kill(); clockTimer = null; }
  gsap.killTweensOf('#ticker-stage, .ticker-bar, .ticker-item');
  gsap.set('#ticker-stage, .ticker-bar, .ticker-item', { clearProps: 'all' });
  tickerItems = readItems();
  tickerIndex = 0;
  showCurrent();
  paintClock();
  buildInTimeline();
  scheduleRotate();
  // The clock repaints once a second through GSAP's clock (pauseable, render-driveable).
  clockTimer = gsap.delayedCall(1, function tick() { paintClock(); clockTimer = gsap.delayedCall(1, tick); });
}

// stop(): kill the loop and take the bar out.
function stop() {
  if (rotateTimer) { rotateTimer.kill(); rotateTimer = null; }
  if (clockTimer) { clockTimer.kill(); clockTimer = null; }
  buildOutTimeline();
}

// next(): skip to the next headline now — the operator's manual advance.
function next() {
  if (rotateTimer) { rotateTimer.kill(); rotateTimer = null; }
  showNext();
}
`;

export const graphic = {
  name: 'Uutishuone ticker',
  type: 'ticker',
  layer: 10,
  html,
  css,
  js,
  cues: [
    {
      label: 'Uutisnauha',
      values: { f0: ITEMS.join('\n'), f1: 'UUTISET' },
    },
  ],
};
