// UUTISHUONE HEADLINE — the topic insert ("aiheplanssi").
//
// The bigger lower third that states what the story IS: a pill label docked on top of a
// dark gray-violet container carrying the headline. The pill's word is a field, so the
// same graphic reads UUTISET, SUORA or URHEILU without touching code.

import { SIMPLE_UPDATE_JS, definitionScript, pageHtml, stageCss } from './look.mjs';

const definition = definitionScript({
  description: 'Headline insert — pill label over a headline container',
  playlayer: '2',
  webplayout: '2',
  uicolor: '3',
  fields: [
    `{ "field": "f0", "ftype": "textfield", "title": "Headline", "value": "Hallitus neuvottelee budjetista – ratkaisua odotetaan illalla" }`,
    `{ "field": "f1", "ftype": "textfield", "title": "Label (pill)", "value": "UUTISET" }`,
  ],
});

const html = pageHtml({
  title: 'Uutishuone headline',
  definition,
  body: `  <!-- The stage starts hidden (opacity: 0); nothing paints until play(). -->
  <div id="headline-stage">
    <div class="headline">
      <!-- The pill label, docked onto the container's top edge. -->
      <div class="headline-pill"><span id="f1">UUTISET</span></div>
      <!-- The headline container. -->
      <div class="headline-mask">
        <div class="headline-box">
          <p class="headline-text" id="f0">Hallitus neuvottelee budjetista – ratkaisua odotetaan illalla</p>
        </div>
      </div>
    </div>
  </div>
`,
});

const css = `${stageCss()}

#headline-stage {
  position: absolute;
  inset: 0;
  opacity: 0;                                    /* hidden until play() */
}

/* Bottom-left, the classic insert slot; wrapped headlines grow upward. */
.headline {
  position: absolute;
  left: calc(120px * var(--scale));
  bottom: calc(96px * var(--scale));
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

/* The pill label — the identity's motif, docked over the container's top edge. */
.headline-pill {
  position: relative;
  z-index: 1;                                    /* rides on top of the container */
  margin-bottom: calc(-16px * var(--scale));     /* the dock: overlaps the box edge */
  margin-left: calc(26px * var(--scale));
  padding: calc(8px * var(--scale)) calc(22px * var(--scale));
  border-radius: 999px;                          /* the pill */
  background: var(--accent);
  will-change: transform, opacity;
}
.headline-pill span {
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-color);
}
/* An emptied label removes the pill (and its dock overlap) entirely. */
.headline-pill span:empty { display: none; }

.headline-mask { overflow: hidden; padding-top: calc(16px * var(--scale)); }

/* The headline container: dark gray-violet, generous padding, a soft corner. */
.headline-box {
  width: fit-content;
  min-width: calc(600px * var(--scale));         /* the broadcast strap floor */
  max-width: calc(1080px * var(--scale));        /* wrap instead of crossing the frame */
  padding: calc(22px * var(--scale)) calc(30px * var(--scale));
  background: var(--panel-bg);
  border-radius: calc(12px * var(--scale));
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.08),  /* keyline */
    0 18px 50px rgba(0, 0, 0, 0.35);            /* one soft lift, never a smear */
  will-change: transform, opacity;
}

/* The headline itself — news-strap size, decisive weight. */
.headline-text {
  font-size: calc(46px * var(--scale) * var(--type-scale));
  font-weight: 650;
  line-height: 1.12;
  letter-spacing: -0.005em;
  color: var(--text-color);
  overflow-wrap: break-word;
  text-wrap: balance;
}
`;

const js = `// Uutishuone headline — SPX calls update(), play(), stop(), next().

${SIMPLE_UPDATE_JS}

/* == ANIMATION (generated — the Animation panel rewrites this block) == */
var animSpeed = 1;  // 1 = normal · 0.75 = slower · 1.5 = faster

// The entrance: container wipes open, headline rises behind the mask, pill pops last.
function buildInTimeline() {
  var tl = gsap.timeline();
  tl.to('#headline-stage', { opacity: 1, duration: 0.2 / animSpeed, ease: 'power1.out' }, 0);
  tl.from('.headline-box', { clipPath: 'inset(0 100% 0 0)', duration: 0.65 / animSpeed, ease: 'power3.out' }, 0);
  tl.from('.headline-text', { y: 34, opacity: 0, duration: 0.6 / animSpeed, ease: 'power3.out' }, 0.2);
  tl.from('.headline-pill', { scale: 0.5, opacity: 0, duration: 0.55 / animSpeed, ease: 'back.out(1.6)' }, 0.35);
  return tl;
}

// The exit: the insert drops away, faster than it arrived.
function buildOutTimeline() {
  var tl = gsap.timeline();
  tl.to('.headline-pill', { y: 20, opacity: 0, duration: 0.3 / animSpeed, ease: 'power2.in' }, 0);
  tl.to('.headline-box', { y: 40, opacity: 0, duration: 0.4 / animSpeed, ease: 'power2.in' }, 0.05);
  tl.to('#headline-stage', { opacity: 0, duration: 0.3 / animSpeed, ease: 'power2.in' }, 0.18);
  return tl;
}
/* == END ANIMATION == */

// play(): reset any prior run, then the entrance.
function play() {
  gsap.killTweensOf('#headline-stage, .headline, .headline-pill, .headline-box, .headline-text');
  gsap.set('#headline-stage, .headline, .headline-pill, .headline-box, .headline-text', { clearProps: 'all' });
  buildInTimeline();
}

// stop(): take the insert out.
function stop() {
  buildOutTimeline();
}

// next(): a headline has one step.
function next() {}
`;

export const graphic = {
  name: 'Uutishuone headline',
  type: 'lower-third',
  layer: 31,
  html,
  css,
  js,
  cues: [
    {
      label: 'Budjettineuvottelut',
      values: {
        f0: 'Hallitus neuvottelee budjetista – ratkaisua odotetaan illalla',
        f1: 'UUTISET',
      },
    },
    {
      label: 'Sää viilenee',
      values: { f0: 'Sää viilenee loppuviikolla koko maassa', f1: 'SÄÄ' },
    },
    {
      label: 'Suora lähetys',
      values: { f0: 'Lehdistötilaisuus alkaa hetken kuluttua', f1: 'SUORA' },
    },
  ],
};
