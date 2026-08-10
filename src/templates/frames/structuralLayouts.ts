// Premium structural camera layouts.
//
// Each layout declares source rectangles in a named design coordinate system. The generated
// SVG matte uses an even-odd path: the programme surface is opaque everywhere except those
// exact rectangles. CSS window edges use the same numbers as percentages, so the drawn chrome
// and the switcher's source geometry cannot drift apart.
//
// Landscape layouts use 1920 x 1080 design coordinates. The vertical programme switches to
// 1080 x 1920 coordinates when the authored output is portrait.

import type { SpxField } from '../../model/types';
import {
  paletteById,
  type ResolvedOptions,
  type TemplateVariant,
} from '../../model/wizard';
import type { StyleTag } from '../../model/fonts';
import { defineFrameVariant, type FrameDesign } from './shared';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface WindowSpec extends Rect {
  label: string;
}

interface PlateSpec {
  rect: Rect;
  nameTitle: string;
  nameSample: string;
  roleTitle?: string;
  roleSample?: string;
}

interface SponsorRail {
  rect: Rect;
  slots: number;
}

interface LayoutGeometry {
  canvas: { width: number; height: number };
  windows: WindowSpec[];
  plates: PlateSpec[];
  sponsorRail?: SponsorRail;
}

interface LayoutSpec {
  id: string;
  name: string;
  shortLabel: string;
  description: string;
  styleTag: StyleTag;
  paletteId: string;
  fontId: string;
  presets: Array<'frame-draw' | 'frame-fade' | 'frame-slide'>;
  geometry: (o: ResolvedOptions) => LayoutGeometry;
}

function cleanNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function percent(value: number, total: number): string {
  return `${(value / total * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}%`;
}

/** The opaque outer programme minus each declared source rectangle. */
function mattePath(g: LayoutGeometry): string {
  const outer = `M0 0H${cleanNumber(g.canvas.width)}V${cleanNumber(g.canvas.height)}H0Z`;
  const holes = g.windows.map((r) =>
    `M${cleanNumber(r.x)} ${cleanNumber(r.y)}H${cleanNumber(r.x + r.w)}` +
    `V${cleanNumber(r.y + r.h)}H${cleanNumber(r.x)}Z`,
  );
  return [outer, ...holes].join(' ');
}

function rectCss(selector: string, rect: Rect, canvas: LayoutGeometry['canvas']): string {
  return `${selector} {
  left: ${percent(rect.x, canvas.width)};       /* source/plate x in the declared geometry */
  top: ${percent(rect.y, canvas.height)};       /* source/plate y */
  width: ${percent(rect.w, canvas.width)};      /* source/plate width */
  min-height: ${percent(rect.h, canvas.height)}; /* source/plate height budget */
}`;
}

function lineValue(o: ResolvedOptions, index: number, fallback: string): string {
  return o.lines[index]?.sample || fallback;
}

function lineTitle(o: ResolvedOptions, index: number, fallback: string): string {
  return o.lines[index]?.title || fallback;
}

function buildDesign(spec: LayoutSpec, o: ResolvedOptions): FrameDesign {
  const g = spec.geometry(o);
  const textFields: SpxField[] = [];
  let nextField = 0;
  const plates = g.plates.map((plate, index) => {
    const nameIndex = nextField++;
    const name = lineValue(o, nameIndex, plate.nameSample);
    textFields.push({
      field: `f${nameIndex}`,
      ftype: 'textfield',
      title: lineTitle(o, nameIndex, plate.nameTitle),
      value: name,
    });
    let roleMarkup = '';
    if (plate.roleTitle && plate.roleSample) {
      const roleIndex = nextField++;
      const role = lineValue(o, roleIndex, plate.roleSample);
      textFields.push({
        field: `f${roleIndex}`,
        ftype: 'textfield',
        title: lineTitle(o, roleIndex, plate.roleTitle),
        value: role,
      });
      roleMarkup = `
          <div class="frame-mask"><span id="f${roleIndex}" class="frame-role">${role}</span></div>`;
    }
    return `      <div class="frame-plate frame-plate-${index + 1}">
        <div class="frame-plate-accent"></div>
        <div class="frame-plate-body">
          <div class="frame-mask"><span id="f${nameIndex}" class="frame-name">${name}</span></div>${roleMarkup}
        </div>
      </div>`;
  });

  const sponsorStart = textFields.length;
  const sponsorFields: SpxField[] = [];
  // The rail's heading is a FIELD and leads the block. "PARTNERS" is one house's word for it —
  // others say SPONSORS, SUPPORTED BY, IN ASSOCIATION WITH, or the same in another language —
  // and a heading nobody can change makes the rail single-use. The slot PLACEHOLDERS below
  // stay static on purpose: they are the empty state of an image field, replaced by the logo
  // the moment one is picked.
  const sponsorHeadingId = `f${sponsorStart}`;
  if (g.sponsorRail) {
    sponsorFields.push({ field: sponsorHeadingId, ftype: 'textfield', title: 'Sponsor rail heading', value: 'PARTNERS' });
  }
  const sponsorMarkup = g.sponsorRail
    ? `      <div class="frame-sponsor-rail">
        <div class="frame-sponsor-heading" id="${sponsorHeadingId}">PARTNERS</div>
${Array.from({ length: g.sponsorRail.slots }, (_, index) => {
    const field = `f${sponsorStart + 1 + index}`;
    sponsorFields.push({
      field,
      ftype: 'filelist',
      title: `Sponsor ${index + 1}`,
      value: '',
      assetfolder: './images/',
      extension: 'png',
    });
    return `        <div class="frame-sponsor-slot">
          <img id="${field}" class="frame-sponsor-logo" alt="" />
          <span class="frame-sponsor-placeholder">SPONSOR ${index + 1}</span>
        </div>`;
  }).join('\n')}
      </div>`
    : '';

  const windowMarkup = g.windows.map((window, index) =>
    `      <!-- ${window.label}: x ${cleanNumber(window.x)}, y ${cleanNumber(window.y)}, ` +
    `${cleanNumber(window.w)} x ${cleanNumber(window.h)} in ${g.canvas.width} x ${g.canvas.height}. -->\n` +
    `      <div class="frame-window frame-window-${index + 1}" ` +
    `data-source-label="${window.label}" aria-label="${window.label} source"></div>`,
  ).join('\n');

  const geometryCss = [
    ...g.windows.map((window, index) =>
      rectCss(`.frame-window-${index + 1}`, { ...window }, g.canvas)
        .replace('min-height:', 'height:'),
    ),
    ...g.plates.map((plate, index) =>
      rectCss(`.frame-plate-${index + 1}`, plate.rect, g.canvas),
    ),
    ...(g.sponsorRail
      ? [rectCss('.frame-sponsor-rail', g.sponsorRail.rect, g.canvas)]
      : []),
  ].join('\n\n');

  return {
    html: `    <div class="frame-box frame-layout frame-layout-${spec.id}" data-layout-label="${spec.shortLabel}">
      <!-- Opaque programme matte with transparent source holes cut from one offline SVG path. -->
      <svg class="frame-matte" viewBox="0 0 ${g.canvas.width} ${g.canvas.height}"
           preserveAspectRatio="none" aria-hidden="true">
        <path class="frame-matte-fill" fill-rule="evenodd" d="${mattePath(g)}"></path>
      </svg>
${windowMarkup}
${plates.join('\n')}
${sponsorMarkup}
    </div>`,

    css: `/* Programme matte. The even-odd SVG path leaves transparency only inside sources. */
.frame-matte {
  position: absolute;              /* fills the frame stage */
  inset: 0;                        /* edge to edge */
  width: 100%;                     /* match the authored output width */
  height: 100%;                    /* match the authored output height */
  overflow: visible;               /* do not clip the even-odd path */
  pointer-events: none;            /* structural chrome only */
}
.frame-matte-fill {
  fill: #080b10;                   /* opaque neutral outside camera and screen holes */
}

/* Shared source-edge treatment. The hole itself remains transparent. */
.frame-layout .frame-window {
  z-index: 1;                      /* edge above the matte */
  box-sizing: border-box;          /* stated geometry includes the drawn edge */
  border: var(--accent-weight) solid color-mix(in srgb, var(--accent) 82%, white 18%);
  border-radius: var(--panel-radius);  /* exact family corner language */
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16), var(--accent-glow);
  transform-origin: center;        /* frame-draw settles around the source centre */
}

.frame-layout .frame-window::before {
  content: attr(data-source-label);  /* visible source label without editable programme copy */
  position: absolute;              /* pinned to the source edge */
  left: calc(14px * var(--scale)); /* safe distance from the border */
  top: calc(12px * var(--scale));  /* safe distance from the border */
  padding: calc(5px * var(--scale)) calc(10px * var(--scale));  /* compact locator chip */
  background: var(--accent);       /* one clear source label */
  border-radius: var(--panel-radius);  /* family shape */
  font-family: var(--font-label);  /* family label voice */
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* broadcast type floor */
  font-weight: 700;                /* readable over moving picture */
  line-height: 1;                  /* compact chip */
  letter-spacing: var(--label-tracking);  /* family tracking */
  text-transform: uppercase;       /* source labels scan quickly */
  color: var(--accent-ink);        /* opaque ink on accent */
}

/* Layout identifier on the matte, outside source holes. */
.frame-layout::before {
  content: attr(data-layout-label); /* visible operational label, not a data field */
  position: absolute;              /* anchored to the programme top edge */
  left: 5%;                        /* title-safe inset */
  top: 1.5%;                       /* inside the matte header */
  z-index: 2;                      /* above the matte */
  font-family: var(--font-label);  /* family label voice */
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* broadcast floor */
  font-weight: 700;                /* clear at a glance */
  line-height: 1;                  /* one-line identifier */
  letter-spacing: var(--label-tracking);  /* technical programme voice */
  text-transform: uppercase;       /* layout labels are operational */
  color: var(--label-color);       /* restrained secondary voice */
}

/* Nameplates are opaque chrome, never mistaken for another source hole. */
.frame-layout .frame-plate {
  position: absolute;              /* honour the declared structural plate rectangle */
  z-index: 3;                      /* above matte and source edge */
  display: flex;                   /* accent rail fused to body */
  align-items: stretch;            /* rail follows the whole plate */
  will-change: transform, opacity; /* preset entrance target */
}
.frame-plate-accent {
  flex: 0 0 var(--accent-weight);  /* family accent weight */
  background: var(--accent);       /* the one accent surface */
  box-shadow: var(--accent-glow);  /* restrained family glow */
}
.frame-plate-body {
  flex: 1 1 auto;                  /* use the declared plate width */
  min-width: 0;                    /* allow long names to wrap */
  padding: calc(12px * var(--scale)) calc(22px * var(--scale));  /* broadcast spacing */
  background: var(--panel-bg);     /* readable ground over moving sources */
  backdrop-filter: var(--panel-blur);  /* exact family treatment */
  -webkit-backdrop-filter: var(--panel-blur);  /* Safari spelling */
  border-radius: 0 var(--panel-radius) var(--panel-radius) 0;  /* fused accent edge */
  box-shadow: var(--panel-shadow); /* one lifting shadow */
}
.frame-plate-body .frame-mask {
  padding-block: calc(3px * var(--scale));  /* protect ascenders and descenders in reveal masks */
  margin-block: calc(-3px * var(--scale));  /* keep the authored plate rhythm unchanged */
}
.frame-name {
  max-width: 100%;                 /* stay inside the structural plate */
  font-size: calc(34px * var(--scale) * var(--type-scale));  /* primary name/topic */
  font-weight: var(--display-weight);  /* family display weight */
  line-height: 1.08;               /* tight headline leading */
  letter-spacing: var(--display-tracking);  /* family display tracking */
  color: var(--text-color);        /* primary text */
}
.frame-role {
  max-width: 100%;                 /* share the plate cap */
  margin-top: calc(5px * var(--scale));  /* name and role read as one unit */
  font-family: var(--font-label);  /* family label voice */
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* broadcast floor */
  font-weight: 700;                /* survives compression */
  line-height: 1.2;                /* compact secondary row */
  letter-spacing: var(--label-tracking);  /* family label tracking */
  text-transform: uppercase;       /* structural role label */
  color: var(--label-color);       /* secondary hierarchy */
}

/* Sponsor rail - present only on the sponsor layout. */
.frame-sponsor-rail {
  position: absolute;              /* occupies the matte beside the programme source */
  z-index: 3;                      /* above the matte */
  box-sizing: border-box;          /* declared geometry includes padding */
  display: flex;                   /* heading and logo slots form one vertical rail */
  flex-direction: column;          /* stack partners */
  gap: calc(16px * var(--scale));  /* even spacing between slots */
  padding: calc(24px * var(--scale));  /* generous rail air */
  border-left: var(--accent-weight) solid var(--accent);  /* programme-to-sponsor divider */
}
.frame-sponsor-heading {
  font-family: var(--font-label);  /* family label voice */
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* broadcast floor */
  font-weight: 700;                /* clear rail heading */
  line-height: 1;                  /* one row */
  letter-spacing: var(--label-tracking);  /* technical caps */
  color: var(--label-color);       /* restrained hierarchy */
}
.frame-sponsor-slot {
  position: relative;              /* anchors logo and placeholder together */
  flex: 1 1 0;                    /* equal sponsor cells */
  min-height: calc(120px * var(--scale));  /* useful logo area */
  display: grid;                   /* centre either logo or placeholder */
  place-items: center;             /* both axes */
  padding: calc(18px * var(--scale));  /* logo breathing room */
  border: 1px solid rgba(255, 255, 255, 0.16);  /* quiet slot keyline */
  border-radius: var(--panel-radius);  /* family corners */
  background: color-mix(in srgb, var(--panel-bg) 86%, #080b10 14%);  /* opaque rail cell */
}
.frame-sponsor-logo {
  max-width: 100%;                 /* contain wide marks */
  max-height: 100%;                /* contain tall marks */
  object-fit: contain;             /* preserve logo proportions */
}
.frame-sponsor-placeholder {
  font-family: var(--font-label);  /* family label voice */
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* broadcast floor */
  font-weight: 700;                /* readable empty-state */
  letter-spacing: var(--label-tracking);  /* partner rail rhythm */
  color: var(--text-dim);          /* quiet until a logo is assigned */
}
.frame-sponsor-slot.has-image .frame-sponsor-placeholder {
  display: none;                   /* the real logo replaces the placeholder */
}
.frame-sponsor-logo:not([src]) {
  display: none;                   /* no broken-image glyph before update() */
}

/* Exact source and plate rectangles for this layout. */
${geometryCss}`,

    fields: [...textFields, ...sponsorFields],
  };
}

function variant(spec: LayoutSpec): TemplateVariant {
  const preview = spec.geometry({
    resolution: { width: 1920, height: 1080 },
  } as ResolvedOptions);
  const suggestedLines = preview.plates.flatMap((plate) => [
    { title: plate.nameTitle, sample: plate.nameSample },
    ...(plate.roleTitle && plate.roleSample
      ? [{ title: plate.roleTitle, sample: plate.roleSample }]
      : []),
  ]);

  return defineFrameVariant(
    {
      id: spec.id,
      category: 'frame',
      name: spec.name,
      styleTag: spec.styleTag,
      description: spec.description,
      maxLines: suggestedLines.length,
      suggestedLines,
      logo: spec.geometry({ resolution: { width: 1920, height: 1080 } } as ResolvedOptions).sponsorRail
        ? 'built-in'
        : 'none',
      animationPresets: spec.presets,
      defaultPalette: paletteById(spec.paletteId),
      defaultFontId: spec.fontId,
      defaultZone: 'mid-center',
    },
    {
      name: spec.name,
      description: spec.description,
      uicolor: '4',
    },
    (o) => buildDesign(spec, o),
  );
}

const PLATE_H = 118;

export const structuralFrames: TemplateVariant[] = [
  variant({
    id: 'fr05',
    name: 'Programme 16:9 Frame',
    shortLabel: '16:9 PROGRAMME',
    description: 'A full 16:9 programme source inside title-safe matte, with a production nameplate.',
    styleTag: 'noacg',
    paletteId: 'noacg',
    fontId: 'space-grotesk',
    presets: ['frame-draw', 'frame-fade', 'frame-slide'],
    geometry: () => ({
      canvas: { width: 1920, height: 1080 },
      windows: [{ x: 96, y: 54, w: 1728, h: 972, label: 'PROGRAMME' }],
      plates: [{
        rect: { x: 120, y: 850, w: 590, h: PLATE_H },
        nameTitle: 'Programme', nameSample: 'The Evening Show',
        roleTitle: 'Status', roleSample: 'LIVE',
      }],
    }),
  }),
  variant({
    id: 'fr06',
    name: 'Classic 4:3 Frame',
    shortLabel: '4:3 ARCHIVE',
    description: 'A centred 4:3 source with editorial side matte for archive, news, or legacy feeds.',
    styleTag: 'editorial',
    paletteId: 'vermilion',
    fontId: 'inter',
    presets: ['frame-fade', 'frame-draw', 'frame-slide'],
    geometry: () => ({
      canvas: { width: 1920, height: 1080 },
      windows: [{ x: 288, y: 54, w: 1344, h: 1008, label: '4:3 SOURCE' }],
      plates: [{
        rect: { x: 314, y: 870, w: 560, h: PLATE_H },
        nameTitle: 'Source', nameSample: 'Archive Film',
        roleTitle: 'Reference', roleSample: 'RESTORED 1978',
      }],
    }),
  }),
  variant({
    id: 'fr07',
    name: 'Portrait Guest Frame',
    shortLabel: 'PORTRAIT GUEST',
    description: 'A tall remote-guest source with a cinematic information field in the side matte.',
    styleTag: 'cinematic',
    paletteId: 'noir',
    fontId: 'manrope',
    presets: ['frame-fade', 'frame-draw', 'frame-slide'],
    geometry: () => ({
      canvas: { width: 1920, height: 1080 },
      windows: [{ x: 686, y: 54, w: 548, h: 974, label: 'GUEST' }],
      plates: [{
        rect: { x: 116, y: 730, w: 500, h: 142 },
        nameTitle: 'Guest', nameSample: 'Maya Chen',
        roleTitle: 'Location', roleSample: 'SINGAPORE',
      }],
    }),
  }),
  variant({
    id: 'fr08',
    name: 'Two-up Interview Frame',
    shortLabel: 'TWO-UP INTERVIEW',
    description: 'Two equal 16:9 remote sources with independent, safe-area nameplates.',
    styleTag: 'glass',
    paletteId: 'frost',
    fontId: 'manrope',
    presets: ['frame-fade', 'frame-draw', 'frame-slide'],
    geometry: () => ({
      canvas: { width: 1920, height: 1080 },
      windows: [
        { x: 72, y: 128, w: 840, h: 472.5, label: 'HOST' },
        { x: 1008, y: 128, w: 840, h: 472.5, label: 'GUEST' },
      ],
      plates: [
        {
          rect: { x: 72, y: 632, w: 620, h: PLATE_H },
          nameTitle: 'Host', nameSample: 'Nora Grant',
          roleTitle: 'Host role', roleSample: 'ANCHOR',
        },
        {
          rect: { x: 1008, y: 632, w: 620, h: PLATE_H },
          nameTitle: 'Guest', nameSample: 'David Okafor',
          roleTitle: 'Guest role', roleSample: 'ECONOMIST',
        },
      ],
    }),
  }),
  variant({
    id: 'fr09',
    name: 'Three-person Panel Frame',
    shortLabel: 'THREE-PERSON PANEL',
    description: 'Three equal panelist sources with consistent baselines and independent labels.',
    styleTag: 'noacg',
    paletteId: 'noacg',
    fontId: 'space-grotesk',
    presets: ['frame-draw', 'frame-fade', 'frame-slide'],
    geometry: () => ({
      canvas: { width: 1920, height: 1080 },
      windows: [
        { x: 72, y: 170, w: 560, h: 315, label: 'PANEL 1' },
        { x: 680, y: 170, w: 560, h: 315, label: 'PANEL 2' },
        { x: 1288, y: 170, w: 560, h: 315, label: 'PANEL 3' },
      ],
      plates: [
        {
          rect: { x: 72, y: 515, w: 560, h: PLATE_H },
          nameTitle: 'Panelist 1', nameSample: 'Amira Khan - Policy',
        },
        {
          rect: { x: 680, y: 515, w: 560, h: PLATE_H },
          nameTitle: 'Panelist 2', nameSample: 'Leo Martins - Science',
        },
        {
          rect: { x: 1288, y: 515, w: 560, h: PLATE_H },
          nameTitle: 'Panelist 3', nameSample: 'Sofia Reed - Culture',
        },
      ],
    }),
  }),
  variant({
    id: 'fr10',
    name: 'Share plus Presenter Frame',
    shortLabel: 'SCREEN SHARE',
    description: 'A large 16:9 screen share with a presenter camera inset and separate topic labels.',
    styleTag: 'minimal',
    paletteId: 'ivory',
    fontId: 'inter',
    presets: ['frame-fade', 'frame-draw', 'frame-slide'],
    geometry: () => ({
      canvas: { width: 1920, height: 1080 },
      windows: [
        { x: 54, y: 54, w: 1400, h: 787.5, label: 'SCREEN' },
        { x: 1490, y: 632, w: 376, h: 211.5, label: 'PRESENTER' },
      ],
      plates: [
        {
          rect: { x: 72, y: 872, w: 660, h: PLATE_H },
          nameTitle: 'Topic', nameSample: 'Quarterly Outlook',
          roleTitle: 'Source', roleSample: 'LIVE DESK',
        },
        {
          rect: { x: 1280, y: 872, w: 586, h: PLATE_H },
          nameTitle: 'Presenter', nameSample: 'Elena Park',
          roleTitle: 'Presenter role', roleSample: 'ANALYST',
        },
      ],
    }),
  }),
  variant({
    id: 'fr11',
    name: 'Gameplay plus Camera Frame',
    shortLabel: 'GAMEPLAY + CAM',
    description: 'A dominant gameplay source with a dedicated player camera and tournament labels.',
    styleTag: 'sport',
    paletteId: 'volt',
    fontId: 'oswald',
    presets: ['frame-slide', 'frame-draw', 'frame-fade'],
    geometry: () => ({
      canvas: { width: 1920, height: 1080 },
      windows: [
        { x: 54, y: 54, w: 1470, h: 826.88, label: 'GAMEPLAY' },
        { x: 1558, y: 54, w: 308, h: 173.25, label: 'PLAYER CAM' },
      ],
      plates: [
        {
          rect: { x: 72, y: 908, w: 680, h: PLATE_H },
          nameTitle: 'Match', nameSample: 'GRAND FINAL',
          roleTitle: 'Round', roleSample: 'MAP 5',
        },
        {
          rect: { x: 1500, y: 258, w: 366, h: PLATE_H },
          nameTitle: 'Player', nameSample: 'NOVA',
          roleTitle: 'Team', roleSample: 'ORBIT',
        },
      ],
    }),
  }),
  variant({
    id: 'fr12',
    name: 'Reaction Layout Frame',
    shortLabel: 'REACTION',
    description: 'A main programme source with a large reaction camera and a shared editorial label system.',
    styleTag: 'glass',
    paletteId: 'orchid',
    fontId: 'manrope',
    presets: ['frame-draw', 'frame-fade', 'frame-slide'],
    geometry: () => ({
      canvas: { width: 1920, height: 1080 },
      windows: [
        { x: 54, y: 54, w: 1296, h: 729, label: 'PROGRAMME' },
        { x: 1386, y: 54, w: 480, h: 270, label: 'REACTION' },
      ],
      plates: [
        {
          rect: { x: 72, y: 822, w: 720, h: PLATE_H },
          nameTitle: 'Programme', nameSample: 'Live Review',
          roleTitle: 'Segment', roleSample: 'WATCH ALONG',
        },
        {
          rect: { x: 1320, y: 352, w: 546, h: PLATE_H },
          nameTitle: 'Creator', nameSample: 'Rae Morgan',
          roleTitle: 'Channel', roleSample: '@RAEREACTS',
        },
      ],
    }),
  }),
  variant({
    id: 'fr13',
    name: 'Sponsor Rail Frame',
    shortLabel: 'SPONSOR RAIL',
    description: 'A 16:9 programme source with a permanent three-logo partner rail and presenter label.',
    styleTag: 'noacg',
    paletteId: 'noacg',
    fontId: 'space-grotesk',
    presets: ['frame-draw', 'frame-fade', 'frame-slide'],
    geometry: () => ({
      canvas: { width: 1920, height: 1080 },
      windows: [{ x: 54, y: 54, w: 1410, h: 793.13, label: 'PROGRAMME' }],
      plates: [{
        rect: { x: 72, y: 878, w: 720, h: PLATE_H },
        nameTitle: 'Programme', nameSample: 'Championship Live',
        roleTitle: 'Presenter', roleSample: 'JORDAN LEE',
      }],
      sponsorRail: { rect: { x: 1496, y: 54, w: 370, h: 972 }, slots: 3 },
    }),
  }),
  variant({
    id: 'fr14',
    name: 'Vertical Programme 9:16 Frame',
    shortLabel: '9:16 PROGRAMME',
    description: 'A true 9:16 programme layout that becomes full-height and title-safe on portrait outputs.',
    styleTag: 'cinematic',
    paletteId: 'ember',
    fontId: 'manrope',
    presets: ['frame-fade', 'frame-draw', 'frame-slide'],
    geometry: (o) => o.resolution.height > o.resolution.width
      ? {
          canvas: { width: 1080, height: 1920 },
          windows: [{ x: 54, y: 96, w: 972, h: 1728, label: 'VERTICAL PROGRAMME' }],
          plates: [{
            rect: { x: 78, y: 1648, w: 650, h: 150 },
            nameTitle: 'Programme', nameSample: 'Stories Live',
            roleTitle: 'Format', roleSample: 'VERTICAL 9:16',
          }],
        }
      : {
          canvas: { width: 1920, height: 1080 },
          windows: [{ x: 679, y: 40, w: 562, h: 1000, label: 'VERTICAL PROGRAMME' }],
          plates: [{
            rect: { x: 706, y: 862, w: 508, h: 132 },
            nameTitle: 'Programme', nameSample: 'Stories Live',
            roleTitle: 'Format', roleSample: 'VERTICAL 9:16',
          }],
        },
  }),
];
