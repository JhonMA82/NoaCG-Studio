// UUTISHUONE BUG & CLOCK — the persistent corner identity.
//
// The rounded-square mark plus channel word and a live Finnish clock (HH.MM), top right.
// Always-on: it takes once at the start of the show and stays. The clock repaints every
// second through GSAP's clock and holds its width (tabular digits).

import { SIMPLE_UPDATE_JS, definitionScript, pageHtml, stageCss } from './look.mjs';

const definition = definitionScript({
  description: 'Corner bug — mark, channel word and a live clock',
  playlayer: '3',
  webplayout: '3',
  uicolor: '6',
  fields: [
    `{ "field": "f0", "ftype": "textfield", "title": "Mark initial", "value": "U" }`,
    `{ "field": "f1", "ftype": "textfield", "title": "Channel word", "value": "UUTISET" }`,
  ],
});

const html = pageHtml({
  title: 'Uutishuone bug',
  definition,
  body: `  <!-- The stage starts hidden (opacity: 0); nothing paints until play(). -->
  <div id="bug-stage">
    <div class="corner-bug">
      <!-- The mark: the identity's rounded square carrying the initial. -->
      <div class="corner-bug-mark"><span id="f0">U</span></div>
      <!-- The word and the live clock, on a quiet dark chip. -->
      <div class="corner-bug-chip">
        <span class="corner-bug-word" id="f1">UUTISET</span>
        <span class="corner-bug-clock" id="bug-clock">00.00</span>
      </div>
    </div>
  </div>
`,
});

const css = `${stageCss()}

#bug-stage {
  position: absolute;
  inset: 0;
  opacity: 0;                                    /* hidden until play() */
}

/* Top-right, inside the safe area. A bug is small by construction — the one place the
   16px floor exception applies (DESIGN_LANGUAGE §1). */
.corner-bug {
  position: absolute;
  top: calc(54px * var(--scale));
  right: calc(96px * var(--scale));
  display: flex;
  align-items: stretch;
  gap: calc(10px * var(--scale));
  will-change: transform, opacity;
}

/* The rounded-square mark. */
.corner-bug-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(62px * var(--scale));
  height: calc(62px * var(--scale));
  border-radius: calc(16px * var(--scale));      /* the identity's soft square */
  background: var(--accent);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);   /* lifts the mark off any picture */
}
.corner-bug-mark span {
  font-size: calc(34px * var(--scale) * var(--type-scale));
  font-weight: 800;
  color: var(--text-color);
}

/* The chip: channel word over the clock, on a translucent dark plate so it reads over
   any video without blur (CasparCG's CEF predates backdrop-filter). */
.corner-bug-chip {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: calc(2px * var(--scale));
  padding: calc(6px * var(--scale)) calc(14px * var(--scale));
  border-radius: calc(12px * var(--scale));
  background: rgba(21, 17, 34, 0.66);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
}
.corner-bug-word {
  font-size: calc(16px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-color);
}
.corner-bug-clock {
  font-family: var(--font-numeric);              /* digits all one width… */
  font-variant-numeric: tabular-nums;            /* …and asked for explicitly */
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 600;
  color: var(--text-dim);
}
`;

const js = `// Uutishuone bug & clock — SPX calls update(), play(), stop(), next().

var clockTimer = null;   // the 1s repaint, killable

${SIMPLE_UPDATE_JS}

// paintClock(): Finnish wall-clock time, HH.MM.
function paintClock() {
  var el = document.getElementById('bug-clock');
  if (!el) return;
  var now = new Date();
  var h = String(now.getHours());
  var m = String(now.getMinutes());
  if (h.length < 2) h = '0' + h;
  if (m.length < 2) m = '0' + m;
  el.textContent = h + '.' + m;
}

/* == ANIMATION (generated — the Animation panel rewrites this block) == */
var animSpeed = 1;  // 1 = normal · 0.75 = slower · 1.5 = faster

// The entrance: one quiet pop — a persistent mark never makes an entrance of itself.
function buildInTimeline() {
  var tl = gsap.timeline();
  tl.to('#bug-stage', { opacity: 1, duration: 0.3 / animSpeed, ease: 'power2.out' }, 0);
  tl.from('.corner-bug', { scale: 0.9, opacity: 0, duration: 0.5 / animSpeed, ease: 'back.out(1.4)' }, 0);
  return tl;
}

// The exit: a fast fade.
function buildOutTimeline() {
  var tl = gsap.timeline();
  tl.to('.corner-bug', { scale: 0.94, opacity: 0, duration: 0.3 / animSpeed, ease: 'power2.in' }, 0);
  tl.to('#bug-stage', { opacity: 0, duration: 0.25 / animSpeed, ease: 'power2.in' }, 0.08);
  return tl;
}
/* == END ANIMATION == */

// play(): entrance, then keep the clock honest once a second.
function play() {
  if (clockTimer) { clockTimer.kill(); clockTimer = null; }
  gsap.killTweensOf('#bug-stage, .corner-bug');
  gsap.set('#bug-stage, .corner-bug', { clearProps: 'all' });
  paintClock();
  buildInTimeline();
  clockTimer = gsap.delayedCall(1, function tick() { paintClock(); clockTimer = gsap.delayedCall(1, tick); });
}

// stop(): kill the clock and fade out.
function stop() {
  if (clockTimer) { clockTimer.kill(); clockTimer = null; }
  buildOutTimeline();
}

// next(): a bug has one step.
function next() {}
`;

export const graphic = {
  name: 'Uutishuone bug',
  type: 'bug',
  layer: 20,
  html,
  css,
  js,
  cues: [{ label: 'Kanavabugi + kello', values: { f0: 'U', f1: 'UUTISET' } }],
};
