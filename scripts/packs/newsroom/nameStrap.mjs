// UUTISHUONE NAME STRAP — the two-tier identifier ("nimiplanssi").
//
// The narrow insert that names a person: name tier over role tier, each its own dark
// gray-violet strip, with the identity's accent square leading the name. Bottom-left,
// classic news placement; wraps upward when a long name folds.

import { SIMPLE_UPDATE_JS, definitionScript, pageHtml, stageCss } from './look.mjs';

const definition = definitionScript({
  description: 'Name strap — two narrow tiers: name and role',
  playlayer: '2',
  webplayout: '2',
  uicolor: '2',
  fields: [
    `{ "field": "f0", "ftype": "textfield", "title": "Name", "value": "Anna Virtanen" }`,
    `{ "field": "f1", "ftype": "textfield", "title": "Title / role", "value": "toimittaja" }`,
  ],
});

const html = pageHtml({
  title: 'Uutishuone name strap',
  definition,
  body: `  <!-- The stage starts hidden (opacity: 0); nothing paints until play(). -->
  <div id="strap-stage">
    <div class="name-strap">
      <!-- Name tier: the accent square, then the name, in one strip. -->
      <div class="name-strap-mask">
        <div class="name-strap-tier name-strap-tier-name">
          <span class="name-strap-square"></span>
          <span class="name-strap-name" id="f0">Anna Virtanen</span>
        </div>
      </div>
      <!-- Role tier: a narrower, quieter strip. The strip's look lives on the span itself,
           so an emptied role collapses the whole tier with plain :empty (no :has —
           CasparCG's CEF predates it). -->
      <div class="name-strap-mask">
        <span class="name-strap-role" id="f1">toimittaja</span>
      </div>
    </div>
  </div>
`,
});

const css = `${stageCss()}

#strap-stage {
  position: absolute;
  inset: 0;
  opacity: 0;                                    /* hidden until play() */
}

/* Anchored bottom-left in the classic news slot; wrapped lines grow UPWARD. */
.name-strap {
  position: absolute;
  left: calc(120px * var(--scale));              /* classic left inset for lower thirds */
  bottom: calc(96px * var(--scale));
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: calc(6px * var(--scale));                 /* the two tiers read as one unit */
}

/* Each tier reveals from behind its own overflow mask. */
.name-strap-mask { overflow: hidden; }

/* A tier: a dark gray-violet strip with a soft corner and a hairline keyline. */
.name-strap-tier {
  display: flex;
  align-items: center;
  gap: calc(16px * var(--scale));
  width: fit-content;
  max-width: calc(800px * var(--scale));         /* never grow past this — wrap instead */
  background: var(--panel-bg);
  border-radius: calc(10px * var(--scale));      /* the identity's soft corner */
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08); /* keyline lift off video */
  will-change: transform, opacity;
}
.name-strap-tier-name {
  min-width: calc(520px * var(--scale));         /* a broadcast-width strap, not a chip */
  padding: calc(14px * var(--scale)) calc(26px * var(--scale));
}

/* The accent square — the identity's shape motif, leading the name. */
.name-strap-square {
  flex: 0 0 auto;
  width: calc(20px * var(--scale));
  height: calc(20px * var(--scale));
  border-radius: calc(6px * var(--scale));
  background: var(--accent);
  will-change: transform;
}

/* The name: the strap's one loud voice. */
.name-strap-name {
  font-size: calc(44px * var(--scale) * var(--type-scale));
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.005em;
  color: var(--text-color);
  overflow-wrap: break-word;                     /* break very long unbroken words */
  text-wrap: balance;                            /* wrapped lines get even lengths */
  min-width: 0;
}

/* The role tier: the strip IS the span — quieter weight and tone, a step inset. */
.name-strap-role {
  display: inline-block;
  padding: calc(9px * var(--scale)) calc(22px * var(--scale));
  margin-left: calc(4px * var(--scale));         /* the narrower second tier steps in */
  max-width: calc(760px * var(--scale));
  background: var(--panel-bg);
  border-radius: calc(10px * var(--scale));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  font-size: calc(24px * var(--scale) * var(--type-scale));
  font-weight: 500;
  line-height: 1.25;
  color: var(--text-dim);
  overflow-wrap: break-word;
  will-change: transform, opacity;
}

/* An emptied role collapses its whole tier — half-filled is a supported state. */
.name-strap-role:empty { display: none; }
`;

const js = `// Uutishuone name strap — SPX calls update(), play(), stop(), next().

${SIMPLE_UPDATE_JS}

/* == ANIMATION (generated — the Animation panel rewrites this block) == */
var animSpeed = 1;  // 1 = normal · 0.75 = slower · 1.5 = faster

// The entrance: name tier wipes open, text slides in behind its mask, role follows.
function buildInTimeline() {
  var tl = gsap.timeline();
  tl.to('#strap-stage', { opacity: 1, duration: 0.2 / animSpeed, ease: 'power1.out' }, 0);
  tl.from('.name-strap-tier-name', { clipPath: 'inset(0 100% 0 0)', duration: 0.6 / animSpeed, ease: 'power3.out' }, 0);
  tl.from('.name-strap-square', { scale: 0, duration: 0.5 / animSpeed, ease: 'back.out(1.7)' }, 0.25);
  tl.from('.name-strap-name', { x: -28, opacity: 0, duration: 0.55 / animSpeed, ease: 'power3.out' }, 0.15);
  tl.from('.name-strap-role', { yPercent: -105, duration: 0.5 / animSpeed, ease: 'power3.out' }, 0.3);
  return tl;
}

// The exit: one unit slides out left, ~40% faster than the entrance.
function buildOutTimeline() {
  var tl = gsap.timeline();
  tl.to('.name-strap', { x: -46, opacity: 0, duration: 0.38 / animSpeed, ease: 'power2.in' }, 0);
  tl.to('#strap-stage', { opacity: 0, duration: 0.3 / animSpeed, ease: 'power2.in' }, 0.12);
  return tl;
}
/* == END ANIMATION == */

// play(): reset any prior run, then the entrance.
function play() {
  gsap.killTweensOf('#strap-stage, .name-strap, .name-strap-tier, .name-strap-square, .name-strap-name, .name-strap-role');
  gsap.set('#strap-stage, .name-strap, .name-strap-tier, .name-strap-square, .name-strap-name, .name-strap-role', { clearProps: 'all' });
  buildInTimeline();
}

// stop(): take the strap out.
function stop() {
  buildOutTimeline();
}

// next(): a name strap has one step.
function next() {}
`;

export const graphic = {
  name: 'Uutishuone name strap',
  type: 'lower-third',
  layer: 30,
  html,
  css,
  js,
  cues: [
    { label: 'Anna Virtanen — toimittaja', values: { f0: 'Anna Virtanen', f1: 'toimittaja' } },
    {
      label: 'Mikko Rantanen — professori',
      values: { f0: 'Mikko Rantanen', f1: 'professori, Helsingin yliopisto' },
    },
    { label: 'Liisa Korhonen — uutisankkuri', values: { f0: 'Liisa Korhonen', f1: 'uutisankkuri' } },
  ],
};
