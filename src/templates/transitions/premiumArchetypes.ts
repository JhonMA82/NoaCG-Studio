// Premium transition archetypes. Each design owns one opaque, over-sized panel authored at
// the fully covered cut point. CSS and inline SVG supply the package detail; the shared motion
// presets and canonical transition state machine handle cover, hold, clear, replay, and snap.

import type { StyleTag } from '../../model/fonts';
import {
  paletteById,
  type AnimPresetId,
  type ResolvedOptions,
  type TemplateVariant,
} from '../../model/wizard';
import { attachMachine } from '../types/graphicType';
import { transitionType } from '../types/transitions';
import { defineTransitionVariant, type TransitionDesign } from './shared';

interface ArchetypeSpec {
  id: string;
  name: string;
  description: string;
  styleTag: StyleTag;
  paletteId: string;
  fontId: string;
  sample: string;
  presets: AnimPresetId[];
  design: (o: ResolvedOptions) => TransitionDesign;
}

function panelBase(background: string): string {
  return `/* Opaque over-cover: the extra two percent protects every corner during motion. */
.transition-panel {
  inset: 0;
  overflow: hidden;
  isolation: isolate;
  background: ${background};
}
.transition-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 4;
  opacity: 0.16;
  background-image:
    repeating-linear-gradient(0deg, transparent 0 3px, rgba(255, 255, 255, 0.035) 3px 4px);
}
.transition-label {
  font-family: var(--font-label);
  font-size: calc(72px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1;
  letter-spacing: var(--display-tracking);
  text-transform: uppercase;
  color: var(--text-color);
  text-shadow: 0 8px 34px rgba(0, 0, 0, 0.42);
}
.transition-mask {
  overflow: visible;                    /* premium presets animate the mark, not text inside it */
  padding-block: calc(12px * var(--scale));  /* full-size display glyphs stay inside the reveal */
  margin-block: calc(-12px * var(--scale));  /* preserve the lockup's authored centre */
}
.transition-label:empty { display: none; }`;
}

function archetype(spec: ArchetypeSpec): TemplateVariant {
  const base = defineTransitionVariant(
    {
      id: spec.id,
      typeId: 'transition',
      category: 'transition',
      name: spec.name,
      styleTag: spec.styleTag,
      description: spec.description,
      maxLines: 1,
      suggestedLines: [{ title: 'Label', sample: spec.sample }],
      logo: 'none',
      animationPresets: spec.presets,
      defaultPalette: paletteById(spec.paletteId),
      defaultFontId: spec.fontId,
      defaultZone: 'mid-center',
    },
    {
      name: spec.name,
      description: `${spec.description} It covers the cut, clears itself, and can replay immediately.`,
      uicolor: '4',
    },
    spec.design,
  );
  return {
    ...base,
    typeId: 'transition',
    create(options) {
      return attachMachine(transitionType, base.create(options));
    },
  };
}

const replay = archetype({
  id: 'tr05',
  name: 'Replay Signal',
  description: 'A replay bumper with a broadcast reticle, signal rails, and decisive lockup.',
  styleTag: 'noacg',
  paletteId: 'noacg',
  fontId: 'space-grotesk',
  sample: 'REPLAY',
  presets: ['transition-sweep', 'transition-slam', 'transition-wipe'],
  design: () => ({
    html: `    <div class="transition-box">
      <div class="transition-panel transition-premium-panel">
        <div class="replay-rail replay-rail-top"><span>RPL 01</span><span>NOACG SIGNAL</span></div>
        <div class="replay-rail replay-rail-bottom"><span>FRAME LOCK</span><span>00:00:00</span></div>
        <svg class="replay-reticle" viewBox="0 0 400 400" aria-hidden="true">
          <circle cx="200" cy="200" r="146"></circle><circle cx="200" cy="200" r="112"></circle>
          <path d="M200 16V98M200 302V384M16 200H98M302 200H384"></path>
          <path class="replay-accent" d="M200 54A146 146 0 0 1 337 150"></path>
        </svg>
      </div>
      <div class="transition-mark"><div class="transition-mask">
        <span id="f0" class="transition-label">REPLAY</span>
      </div></div>
    </div>`,
    css: `${panelBase('radial-gradient(circle, #18202a 0%, #0b0f15 48%, #05070a 100%)')}
.replay-reticle {
  position: absolute; left: 50%; top: 50%; width: min(52vw, 58vh); height: min(52vw, 58vh);
  transform: translate(-50%, -50%); fill: none; stroke: rgba(255,255,255,.18); stroke-width: 2;
}
.replay-accent {
  stroke: var(--accent); stroke-width: 8; stroke-linecap: round;
  filter: drop-shadow(0 0 14px color-mix(in srgb, var(--accent) 56%, transparent));
}
.replay-rail {
  position: absolute; left: 5%; right: 5%; z-index: 2; display: flex;
  justify-content: space-between; padding: calc(12px * var(--scale)) 0;
  border-color: color-mix(in srgb, var(--accent) 58%, transparent);
  font-family: var(--font-label); font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 700; letter-spacing: var(--label-tracking); color: var(--label-color);
}
.replay-rail-top { top: 8%; border-top: 1px solid; }
.replay-rail-bottom { bottom: 8%; border-bottom: 1px solid; }
.transition-label {
  padding: calc(16px * var(--scale)) calc(38px * var(--scale));
  background: var(--accent); color: var(--accent-ink); box-shadow: var(--accent-glow);
}`,
  }),
});

const sponsor = archetype({
  id: 'tr06',
  name: 'Sponsor Bumper',
  description: 'A restrained sponsor bumper with a framed wordmark and partner-safe spacing.',
  styleTag: 'minimal',
  paletteId: 'ivory',
  fontId: 'inter',
  sample: 'PRESENTED BY NORTHSTAR',
  presets: ['transition-sweep', 'transition-wipe', 'transition-slam'],
  design: () => ({
    html: `    <div class="transition-box">
      <div class="transition-panel transition-premium-panel">
        <div class="sponsor-line sponsor-line-top"></div><div class="sponsor-line sponsor-line-bottom"></div>
        <div class="sponsor-caption">OFFICIAL PARTNER</div>
      </div>
      <div class="transition-mark"><div class="sponsor-lockup"><div class="transition-mask">
        <span id="f0" class="transition-label">PRESENTED BY NORTHSTAR</span>
      </div></div></div>
    </div>`,
    css: `${panelBase('linear-gradient(135deg, #11151b, #080b10 52%, #15191f)')}
.sponsor-line {
  position: absolute; left: 8%; right: 8%; height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
}
.sponsor-line-top { top: 23%; } .sponsor-line-bottom { bottom: 23%; }
.sponsor-caption {
  position: absolute; left: 50%; top: 29%; transform: translateX(-50%);
  font-family: var(--font-label); font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 700; letter-spacing: .22em; color: var(--label-color);
}
.sponsor-lockup {
  max-width: 76%; padding: calc(34px * var(--scale)) calc(56px * var(--scale));
  border: 1px solid rgba(255,255,255,.18); border-radius: var(--panel-radius);
  background: rgba(255,255,255,.035);
}
.transition-label {
  font-size: calc(62px * var(--scale) * var(--type-scale));
  font-weight: 650; letter-spacing: -.025em;
}`,
  }),
});

const chapter = archetype({
  id: 'tr07',
  name: 'Chapter Change',
  description: 'A chapter transition with an editorial grid and clear programme hierarchy.',
  styleTag: 'editorial',
  paletteId: 'vermilion',
  fontId: 'inter',
  sample: 'CHAPTER 04 - THE TURNING POINT',
  presets: ['transition-wipe', 'transition-sweep', 'transition-slam'],
  design: () => ({
    html: `    <div class="transition-box">
      <div class="transition-panel transition-premium-panel">
        <div class="chapter-number">04</div><div class="chapter-rule"></div>
        <div class="chapter-kicker">NEXT CHAPTER</div>
      </div>
      <div class="transition-mark"><div class="transition-mask">
        <span id="f0" class="transition-label">CHAPTER 04 - THE TURNING POINT</span>
      </div></div>
    </div>`,
    css: `${panelBase('linear-gradient(90deg, #12110f 0 32%, #e7e0d5 32% 100%)')}
.transition-panel::before {
  content: ''; position: absolute; inset: 0; opacity: .28;
  background-image: linear-gradient(90deg, transparent 8%, rgba(17,16,14,.22) 8.05%, transparent 8.1%),
    linear-gradient(rgba(17,16,14,.14) 1px, transparent 1px); background-size: 100% 100%, 100% 12.5%;
}
.chapter-number {
  position: absolute; left: 7%; top: 50%; transform: translateY(-50%);
  font-family: var(--font-display); font-size: calc(244px * var(--scale));
  font-weight: 700; line-height: .8; letter-spacing: -.08em; color: var(--accent);
}
.chapter-rule { position: absolute; left: 32%; top: 12%; bottom: 12%; width: var(--accent-weight); background: var(--accent); }
.chapter-kicker {
  position: absolute; left: 38%; top: 28%; font-family: var(--font-label);
  font-size: calc(20px * var(--scale) * var(--type-scale)); font-weight: 700;
  letter-spacing: .18em; color: #5d554d;
}
.transition-mark { justify-content: flex-start; padding: 0 8% 0 38%; box-sizing: border-box; }
.transition-mask { max-width: 100%; }
.transition-label {
  max-width: 100%; font-size: calc(66px * var(--scale) * var(--type-scale));
  font-weight: 650; line-height: 1.02; letter-spacing: -.04em;
  text-align: left; color: #171512; text-shadow: none;
}`,
  }),
});

const sport = archetype({
  id: 'tr08',
  name: 'Sport Impact',
  description: 'A high-energy sport impact with velocity chevrons and a hard centre hit.',
  styleTag: 'sport',
  paletteId: 'volt',
  fontId: 'oswald',
  sample: 'FULL TIME',
  presets: ['transition-slam', 'transition-wipe', 'transition-sweep'],
  design: () => ({
    html: `    <div class="transition-box">
      <div class="transition-panel transition-premium-panel">
        <svg class="impact-lines" viewBox="0 0 1920 1080" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 970L680 110H980L180 970Z"></path><path d="M520 970L1320 110H1540L740 970Z"></path>
          <path class="impact-accent" d="M1180 970L1920 110"></path>
        </svg>
        <div class="impact-chevron impact-left"></div><div class="impact-chevron impact-right"></div>
        <div class="impact-meta">LIVE / RESULT / IMPACT</div>
      </div>
      <div class="transition-mark"><div class="transition-mask">
        <span id="f0" class="transition-label">FULL TIME</span>
      </div></div>
    </div>`,
    css: `${panelBase('radial-gradient(circle, #242d12, #0a0d0f 44%, #050607)')}
.impact-lines {
  position: absolute; inset: 0; width: 100%; height: 100%; fill: rgba(255,255,255,.045);
  stroke: rgba(255,255,255,.16); stroke-width: 2;
}
.impact-accent {
  fill: none; stroke: var(--accent); stroke-width: 18;
  filter: drop-shadow(0 0 18px color-mix(in srgb, var(--accent) 58%, transparent));
}
.impact-chevron {
  position: absolute; top: 50%; width: 28%; height: 32%; transform: translateY(-50%) skewX(-12deg);
  border: calc(10px * var(--scale)) solid var(--accent); opacity: .22;
}
.impact-left { left: 2%; border-right-width: calc(34px * var(--scale)); }
.impact-right { right: 2%; border-left-width: calc(34px * var(--scale)); }
.impact-meta {
  position: absolute; left: 50%; bottom: 13%; transform: translateX(-50%);
  font-family: var(--font-label); font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 700; letter-spacing: .24em; color: var(--label-color);
}
.transition-label {
  font-size: calc(116px * var(--scale) * var(--type-scale));
  font-weight: 700; letter-spacing: -.02em; color: var(--accent);
}`,
  }),
});

const editorial = archetype({
  id: 'tr09',
  name: 'Editorial Page Turn',
  description: 'An editorial page turn with layered paper, a fold shadow, and issue metadata.',
  styleTag: 'editorial',
  paletteId: 'vermilion',
  fontId: 'inter',
  sample: 'THE BRIEFING',
  presets: ['transition-wipe', 'transition-sweep', 'transition-slam'],
  design: () => ({
    html: `    <div class="transition-box">
      <div class="transition-panel transition-premium-panel">
        <div class="page-sheet page-back"></div><div class="page-sheet page-front"></div>
        <div class="page-fold"></div><div class="page-meta"><span>ISSUE 07</span><span>30 JUL 2026</span></div>
      </div>
      <div class="transition-mark"><div class="transition-mask">
        <span id="f0" class="transition-label">THE BRIEFING</span>
      </div></div>
    </div>`,
    css: `${panelBase('linear-gradient(100deg, #171513 0 12%, #d8d0c4 12% 100%)')}
.page-sheet { position: absolute; top: 7%; bottom: 7%; left: 10%; right: 6%; box-shadow: 0 26px 70px rgba(0,0,0,.34); }
.page-back { transform: translate(-2.2%, 1.8%) rotate(-1.2deg); background: #b9afa1; }
.page-front {
  background: linear-gradient(90deg, transparent 9%, rgba(20,18,15,.12) 9.1%, transparent 9.2%),
    repeating-linear-gradient(0deg, transparent 0 11.9%, rgba(20,18,15,.1) 12% 12.1%), #eee7dc;
}
.page-fold {
  position: absolute; right: 6%; top: 7%; width: 18%; height: 42%;
  clip-path: polygon(100% 0, 100% 100%, 0 0);
  background: linear-gradient(135deg, #cfc5b7 47%, #8c8175 49%, #f7f1e7 52%);
  filter: drop-shadow(-14px 18px 18px rgba(0,0,0,.22));
}
.page-meta {
  position: absolute; left: 17%; right: 12%; top: 16%; display: flex; justify-content: space-between;
  font-family: var(--font-label); font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 700; letter-spacing: .16em; color: #5b5249;
}
.transition-mark { align-items: flex-end; justify-content: flex-start; padding: 0 14% 18% 17%; box-sizing: border-box; }
.transition-mask { max-width: 100%; }
.transition-label {
  max-width: 100%; font-size: calc(92px * var(--scale) * var(--type-scale));
  font-weight: 700; line-height: .96; letter-spacing: -.055em; text-align: left;
  color: #1b1815; text-shadow: none;
}`,
  }),
});

const cinematic = archetype({
  id: 'tr10',
  name: 'Cinematic Iris',
  description: 'A cinematic matte and iris with aperture blades and restrained film rails.',
  styleTag: 'cinematic',
  paletteId: 'ember',
  fontId: 'manrope',
  sample: 'ACT II',
  presets: ['transition-sweep', 'transition-wipe', 'transition-slam'],
  design: () => ({
    html: `    <div class="transition-box">
      <div class="transition-panel transition-premium-panel">
        <svg class="iris" viewBox="0 0 600 600" aria-hidden="true">
          <circle class="iris-ring" cx="300" cy="300" r="230"></circle>
          <g class="iris-blades"><path d="M300 62L410 256L300 300L190 256Z"></path>
            <path d="M538 300L344 410L300 300L344 190Z"></path>
            <path d="M300 538L190 344L300 300L410 344Z"></path>
            <path d="M62 300L256 190L300 300L256 410Z"></path></g>
          <circle class="iris-core" cx="300" cy="300" r="76"></circle>
        </svg>
        <div class="cinema-rail cinema-top"><span>NOACG PICTURES</span><span>2.39 : 1</span></div>
        <div class="cinema-rail cinema-bottom"><span>SCENE 12</span><span>TAKE 01</span></div>
      </div>
      <div class="transition-mark"><div class="transition-mask">
        <span id="f0" class="transition-label">ACT II</span>
      </div></div>
    </div>`,
    css: `${panelBase('radial-gradient(circle, #241d16, #0b0908 42%, #020202)')}
.iris {
  position: absolute; left: 50%; top: 50%; width: min(72vw, 82vh); height: min(72vw, 82vh);
  transform: translate(-50%, -50%) rotate(8deg); fill: none;
}
.iris-ring { stroke: rgba(224,164,88,.32); stroke-width: 2; }
.iris-blades { fill: rgba(255,255,255,.035); stroke: rgba(224,164,88,.18); stroke-width: 2; }
.iris-core {
  fill: #020202; stroke: var(--accent); stroke-width: 4;
  filter: drop-shadow(0 0 20px color-mix(in srgb, var(--accent) 32%, transparent));
}
.cinema-rail {
  position: absolute; left: 6%; right: 6%; display: flex; justify-content: space-between;
  font-family: var(--font-label); font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 600; letter-spacing: .18em; color: var(--label-color);
}
.cinema-top { top: 7%; } .cinema-bottom { bottom: 7%; }
.transition-label {
  padding: calc(16px * var(--scale)) calc(28px * var(--scale));
  border-top: 1px solid color-mix(in srgb, var(--accent) 70%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 70%, transparent);
  font-size: calc(68px * var(--scale) * var(--type-scale)); font-weight: 500; letter-spacing: .16em;
}`,
  }),
});

export const premiumTransitionArchetypes: TemplateVariant[] = [
  replay,
  sponsor,
  chapter,
  sport,
  editorial,
  cinematic,
];
