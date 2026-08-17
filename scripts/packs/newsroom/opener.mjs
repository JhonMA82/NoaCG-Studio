// UUTISHUONE OPENER — the show's title stinger.
//
// A full-frame violet field with the pack's floating rounded squares, the pill kicker, and
// the programme wordmark. It plays, holds a beat, and CLEARS ITSELF: the SPX `out` setting
// is honoured by SPX and the overlay export but not by the cloud browser output, so the
// auto-out lives in the template's own runtime (a killable gsap.delayedCall) and works the
// same everywhere.

import { LOOK, SIMPLE_UPDATE_JS, definitionScript, pageHtml, stageCss } from './look.mjs';

const definition = definitionScript({
  description: 'Show opener — violet field, pill kicker, programme wordmark; clears itself',
  playlayer: '4',
  webplayout: '4',
  uicolor: '5',
  fields: [
    `{ "field": "f0", "ftype": "textfield", "title": "Programme name", "value": "UUTISET" }`,
    `{ "field": "f1", "ftype": "textfield", "title": "Kicker (pill)", "value": "UUTISHUONE" }`,
    `{ "field": "f2", "ftype": "textfield", "title": "Subtitle line", "value": "Maanantaina 17. elokuuta" }`,
  ],
});

const html = pageHtml({
  title: 'Uutishuone opener',
  definition,
  body: `  <!-- The stage starts hidden (opacity: 0) like every SPX template: nothing paints
       until play() runs. -->
  <div id="opener-stage">
    <!-- The violet field the whole frame sits on. -->
    <div class="opener-field"></div>

    <!-- The pack's shape motif: rounded squares floating in a layered depth field.
         Decorative — no text, no fields. -->
    <div class="opener-square opener-square-1"></div>
    <div class="opener-square opener-square-2"></div>
    <div class="opener-square opener-square-3"></div>

    <!-- The centred lockup: pill kicker over the big wordmark over the subtitle. The
         accent dot is the wordmark's full stop, so it follows the title at any length. -->
    <div class="opener-lockup">
      <div class="opener-pill"><span id="f1">UUTISHUONE</span></div>
      <div class="opener-mask">
        <div class="opener-titlerow">
          <h1 class="opener-title" id="f0">UUTISET</h1>
          <span class="opener-dot"></span>
        </div>
      </div>
      <p class="opener-sub" id="f2">Maanantaina 17. elokuuta</p>
    </div>
  </div>
`,
});

const css = `${stageCss()}

/* The stage fades/wipes as one. Hidden until play() — the SPX contract. */
#opener-stage {
  position: absolute;
  inset: 0;
  opacity: 0;                                   /* hidden until play() */
}

/* Full-frame violet field: a soft diagonal gradient with a faint accent bloom. */
.opener-field {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(calc(900px * var(--scale)) calc(700px * var(--scale)) at 68% 30%,
      rgba(108, 76, 241, 0.35), transparent 70%),   /* the violet bloom */
    linear-gradient(160deg, ${LOOK.fieldTop}, ${LOOK.fieldBottom}); /* the field itself */
}

/* The floating rounded squares — the identity's shape, layered with different
   transparencies so the flat field reads as depth. */
.opener-square {
  position: absolute;
  border-radius: calc(56px * var(--scale));     /* the soft square corner of the identity */
  will-change: transform, opacity;
}
.opener-square-1 {
  width: calc(460px * var(--scale));
  height: calc(460px * var(--scale));
  left: calc(1250px * var(--scale));
  top: calc(120px * var(--scale));
  background: rgba(108, 76, 241, 0.32);         /* accent, translucent */
}
.opener-square-2 {
  width: calc(300px * var(--scale));
  height: calc(300px * var(--scale));
  left: calc(180px * var(--scale));
  top: calc(620px * var(--scale));
  background: rgba(255, 255, 255, 0.06);        /* faint white square behind the lockup */
}
.opener-square-3 {
  width: calc(190px * var(--scale));
  height: calc(190px * var(--scale));
  left: calc(430px * var(--scale));
  top: calc(150px * var(--scale));
  background: rgba(86, 54, 216, 0.45);          /* the deep violet sibling */
}

/* The wordmark row: title + its accent full stop, revealed together. */
.opener-titlerow {
  display: flex;
  align-items: flex-end;
  gap: calc(10px * var(--scale));
}

/* The companion dot — the wordmark's full stop, in the accent. */
.opener-dot {
  width: calc(30px * var(--scale));
  height: calc(30px * var(--scale));
  margin-bottom: calc(22px * var(--scale));      /* sits on the baseline, not the descender */
  border-radius: 50%;
  background: var(--accent);
  will-change: transform, opacity;
}

/* The centred lockup. */
.opener-lockup {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(18px * var(--scale));
  text-align: center;
}

/* Pill kicker — the identity's label motif: solid accent, white small caps. */
.opener-pill {
  padding: calc(10px * var(--scale)) calc(26px * var(--scale));
  border-radius: 999px;                          /* the pill */
  background: var(--accent);
  will-change: transform, opacity;
}
.opener-pill span {
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: 0.16em;                        /* small caps breathe */
  text-transform: uppercase;
  color: var(--text-color);
}

/* The wordmark, revealed from behind an overflow mask. */
.opener-mask { overflow: hidden; }
.opener-title {
  font-size: calc(132px * var(--scale) * var(--type-scale));
  font-weight: 800;
  letter-spacing: -0.01em;                       /* big text tightens */
  line-height: 1.05;
  color: var(--text-color);
  will-change: transform, opacity;
}

/* The subtitle line. */
.opener-sub {
  font-size: calc(28px * var(--scale) * var(--type-scale));
  font-weight: 500;
  color: var(--text-dim);
  will-change: transform, opacity;
}
`;

const js = `// Uutishuone opener — plays, holds a beat, clears itself. SPX calls update(), play(),
// stop(), next().

// How long the opener stands after its entrance settles, in seconds. The exit is scheduled
// in the template's own runtime (not the SPX "out" setting) because the cloud browser
// output honours only what the template itself does.
var HOLD_SECONDS = 2.4;
var outTimer = null;   // the scheduled self-clear, killable by stop()/play()
var ambient = null;    // the squares' idle drift, killed with the exit

${SIMPLE_UPDATE_JS}

/* == ANIMATION (generated — the Animation panel rewrites this block) == */
var animSpeed = 1;  // 1 = normal · 0.75 = slower · 1.5 = faster

// The entrance: field blooms, squares drift into place, pill pops, wordmark rises.
function buildInTimeline() {
  var tl = gsap.timeline();
  tl.to('#opener-stage', { opacity: 1, duration: 0.45 / animSpeed, ease: 'power2.out' }, 0);
  tl.from('.opener-field', { scale: 1.04, duration: 1.1 / animSpeed, ease: 'power3.out' }, 0);
  tl.from('.opener-square-1', { x: 160, y: -60, opacity: 0, duration: 0.9 / animSpeed, ease: 'power3.out' }, 0.05);
  tl.from('.opener-square-2', { x: -140, y: 80, opacity: 0, duration: 0.9 / animSpeed, ease: 'power3.out' }, 0.12);
  tl.from('.opener-square-3', { y: -120, opacity: 0, duration: 0.9 / animSpeed, ease: 'power3.out' }, 0.2);
  tl.from('.opener-pill', { scale: 0.6, opacity: 0, duration: 0.55 / animSpeed, ease: 'back.out(1.6)' }, 0.35);
  tl.from('.opener-titlerow', { yPercent: 110, duration: 0.8 / animSpeed, ease: 'power3.out' }, 0.45);
  tl.from('.opener-dot', { scale: 0, duration: 0.5 / animSpeed, ease: 'back.out(1.8)' }, 0.95);
  tl.from('.opener-sub', { y: 26, opacity: 0, duration: 0.6 / animSpeed, ease: 'power2.out' }, 0.7);
  return tl;
}

// The exit: the whole frame wipes upward, faster than it arrived (broadcast pacing).
function buildOutTimeline() {
  var tl = gsap.timeline();
  tl.to('.opener-lockup', { y: -60, opacity: 0, duration: 0.4 / animSpeed, ease: 'power2.in' }, 0);
  tl.to('.opener-square', { y: -140, opacity: 0, duration: 0.45 / animSpeed, ease: 'power2.in', stagger: 0.04 }, 0);
  tl.to('#opener-stage', { opacity: 0, duration: 0.45 / animSpeed, ease: 'power2.in' }, 0.15);
  return tl;
}
/* == END ANIMATION == */

// play(): reset, run the entrance, breathe, and schedule the self-clear.
function play() {
  if (outTimer) { outTimer.kill(); outTimer = null; }
  if (ambient) { ambient.kill(); ambient = null; }
  gsap.killTweensOf('#opener-stage, .opener-field, .opener-square, .opener-dot, .opener-pill, .opener-titlerow, .opener-sub, .opener-lockup');
  gsap.set('#opener-stage, .opener-square, .opener-dot, .opener-pill, .opener-titlerow, .opener-sub, .opener-lockup', { clearProps: 'all' });
  var entrance = buildInTimeline();
  // A slow idle drift on the squares while the opener stands — killed by the exit.
  ambient = gsap.to('.opener-square', { y: '-=14', duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  outTimer = gsap.delayedCall(entrance.duration() + HOLD_SECONDS / animSpeed, stop);
}

// stop(): clear now (also what the scheduled self-clear calls).
function stop() {
  if (outTimer) { outTimer.kill(); outTimer = null; }
  if (ambient) { ambient.kill(); ambient = null; }
  buildOutTimeline();
}

// next(): the opener has one step — nothing to advance to.
function next() {}
`;

export const graphic = {
  name: 'Uutishuone opener',
  type: 'transition',
  layer: 90,
  html,
  css,
  js,
  cues: [
    {
      label: 'Avaus — UUTISET',
      values: { f0: 'UUTISET', f1: 'UUTISHUONE', f2: 'Maanantaina 17. elokuuta' },
    },
  ],
};
