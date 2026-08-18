// UUTISHUONE ENDBOARD — the closing card.
//
// The opener's field and shapes at rest: a calm full-frame violet close with the mark, a
// thank-you line and the address line. Manual out — an endboard stands until the director
// takes it away.

import { LOOK, SIMPLE_UPDATE_JS, definitionScript, pageHtml, stageCss } from './look.mjs';

const definition = definitionScript({
  description: 'Endboard — full-frame close: mark, thank-you and address line',
  playlayer: '4',
  webplayout: '4',
  uicolor: '1',
  fields: [
    `{ "field": "f0", "ftype": "textfield", "title": "Closing line", "value": "Kiitos, että katsoitte" }`,
    `{ "field": "f1", "ftype": "textfield", "title": "Address line", "value": "uutiset.example.fi" }`,
    `{ "field": "f2", "ftype": "textfield", "title": "Mark initial", "value": "U" }`,
  ],
});

const html = pageHtml({
  title: 'Uutishuone endboard',
  definition,
  body: `  <!-- The stage starts hidden (opacity: 0); nothing paints until play(). -->
  <div id="endboard-stage">
    <div class="endboard-field"></div>

    <!-- The shape motif at rest — quieter than the opener's. -->
    <div class="endboard-square endboard-square-1"></div>
    <div class="endboard-square endboard-square-2"></div>
    <div class="endboard-dot"></div>

    <div class="endboard-lockup">
      <div class="endboard-mark"><span id="f2">U</span></div>
      <h1 class="endboard-title" id="f0">Kiitos, että katsoitte</h1>
      <p class="endboard-sub" id="f1">uutiset.example.fi</p>
    </div>
  </div>
`,
});

const css = `${stageCss()}

#endboard-stage {
  position: absolute;
  inset: 0;
  opacity: 0;                                    /* hidden until play() */
}

/* The same violet field the opener stands on — one show, one close. */
.endboard-field {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(calc(900px * var(--scale)) calc(700px * var(--scale)) at 32% 70%,
      rgba(108, 76, 241, 0.3), transparent 70%),
    linear-gradient(200deg, ${LOOK.fieldTop}, ${LOOK.fieldBottom});
}

.endboard-square {
  position: absolute;
  border-radius: calc(56px * var(--scale));
  will-change: transform, opacity;
}
.endboard-square-1 {
  width: calc(380px * var(--scale));
  height: calc(380px * var(--scale));
  left: calc(1420px * var(--scale));
  top: calc(560px * var(--scale));
  background: rgba(108, 76, 241, 0.28);
}
.endboard-square-2 {
  width: calc(240px * var(--scale));
  height: calc(240px * var(--scale));
  left: calc(150px * var(--scale));
  top: calc(140px * var(--scale));
  background: rgba(255, 255, 255, 0.05);
}
.endboard-dot {
  position: absolute;
  width: calc(52px * var(--scale));
  height: calc(52px * var(--scale));
  left: calc(1380px * var(--scale));
  top: calc(500px * var(--scale));
  border-radius: 50%;
  background: var(--accent);
  will-change: transform, opacity;
}

.endboard-lockup {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(22px * var(--scale));
  text-align: center;
}

/* The mark — the identity's rounded square, larger and at rest. */
.endboard-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(120px * var(--scale));
  height: calc(120px * var(--scale));
  border-radius: calc(30px * var(--scale));
  background: var(--accent);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  will-change: transform, opacity;
}
.endboard-mark span {
  font-size: calc(64px * var(--scale) * var(--type-scale));
  font-weight: 800;
  color: var(--text-color);
}

.endboard-title {
  font-size: calc(72px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.1;
  color: var(--text-color);
  will-change: transform, opacity;
}

.endboard-sub {
  font-size: calc(30px * var(--scale) * var(--type-scale));
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--text-dim);
  will-change: transform, opacity;
}
`;

const js = `// Uutishuone endboard — SPX calls update(), play(), stop(), next().

var ambient = null;   // the squares' idle drift, killed with the exit

${SIMPLE_UPDATE_JS}

/* == ANIMATION (generated — the Animation panel rewrites this block) == */
var animSpeed = 1;  // 1 = normal · 0.75 = slower · 1.5 = faster

// The entrance: a calm bloom — slower than the opener, this is the goodnight.
function buildInTimeline() {
  var tl = gsap.timeline();
  tl.to('#endboard-stage', { opacity: 1, duration: 0.6 / animSpeed, ease: 'power2.out' }, 0);
  tl.from('.endboard-square-1', { x: 120, opacity: 0, duration: 1.0 / animSpeed, ease: 'power3.out' }, 0.1);
  tl.from('.endboard-square-2', { x: -100, opacity: 0, duration: 1.0 / animSpeed, ease: 'power3.out' }, 0.18);
  tl.from('.endboard-dot', { scale: 0, duration: 0.7 / animSpeed, ease: 'back.out(1.5)' }, 0.5);
  tl.from('.endboard-mark', { scale: 0.7, opacity: 0, duration: 0.7 / animSpeed, ease: 'back.out(1.5)' }, 0.25);
  tl.from('.endboard-title', { y: 30, opacity: 0, duration: 0.7 / animSpeed, ease: 'power3.out' }, 0.45);
  tl.from('.endboard-sub', { y: 22, opacity: 0, duration: 0.6 / animSpeed, ease: 'power2.out' }, 0.65);
  return tl;
}

// The exit: one clean fade down.
function buildOutTimeline() {
  var tl = gsap.timeline();
  tl.to('.endboard-lockup', { y: -30, opacity: 0, duration: 0.45 / animSpeed, ease: 'power2.in' }, 0);
  tl.to('#endboard-stage', { opacity: 0, duration: 0.5 / animSpeed, ease: 'power2.in' }, 0.1);
  return tl;
}
/* == END ANIMATION == */

// play(): reset, bloom in, breathe.
function play() {
  if (ambient) { ambient.kill(); ambient = null; }
  gsap.killTweensOf('#endboard-stage, .endboard-square, .endboard-dot, .endboard-mark, .endboard-title, .endboard-sub, .endboard-lockup');
  gsap.set('#endboard-stage, .endboard-square, .endboard-dot, .endboard-mark, .endboard-title, .endboard-sub, .endboard-lockup', { clearProps: 'all' });
  buildInTimeline();
  ambient = gsap.to('.endboard-square', { y: '-=12', duration: 3, ease: 'sine.inOut', yoyo: true, repeat: -1 });
}

// stop(): the goodnight.
function stop() {
  if (ambient) { ambient.kill(); ambient = null; }
  buildOutTimeline();
}

// next(): an endboard has one step.
function next() {}
`;

export const graphic = {
  name: 'Uutishuone endboard',
  type: 'fullscreen',
  layer: 85,
  html,
  css,
  js,
  cues: [
    {
      label: 'Lopetus',
      values: { f0: 'Kiitos, että katsoitte', f1: 'uutiset.example.fi', f2: 'U' },
    },
  ],
};
