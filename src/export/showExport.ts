// Whole-show export (Phase 5): one zip with every graphic of the show as its own SPX
// Starter folder PLUS one aggregated show_controlpanel.html at the root — the show's
// control page, generated from every graphic's fields and state machine. Run each
// graphic's own .html as a browser source and open the show panel FROM THE SAME
// http(s) ORIGIN in the same browser: every card drives its graphic over that graphic's
// own BroadcastChannel (same-origin only — file:// pages cannot pair).
//
// Each graphic's saved control-panel ENTRIES live in the library, not in the show's embedded
// copy — they are resolved out of the library at export time (entriesForSavedGraphic, by
// graphicId with a unique-name fallback, the same resolver the hosted control page uses) and
// baked into both the aggregated panel and each graphic's own controlpanel.html.
//
//   <show>/show_controlpanel.html
//   <show>/GETTING-ON-AIR.md
//   <show>/<graphic>/<graphic>.html + css/ js/ images/ fonts/ + controlpanel.html
//
// TWO PLAYOUT RULES this exporter owns (student-release acceptance findings, 2026-08-05):
// 1. NO HOSTED RECEIVER. SPX/CasparCG are the controller for these files — a baked log
//    follower is a second controller fighting the host: its boot recovery snaps the graphic
//    to its last REPORTED state (usually off) one RPC round-trip after the host's play(),
//    which read as "the graphic flashes in and disappears" on a real CasparCG server.
//    Cloud-driven browser sources are the HTML-overlay flavor's job, opt-in, not this one's.
// 2. DISTINCT LAYERS. Every generated template used to declare playlayer/webplayout '7', so
//    two templates in one SPX rundown silently evicted each other. Here each pool graphic
//    gets its own layer from its pool position (paint order), like real SPX packs do.

import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { slug } from './common';
import { buildStarterInto } from './targets/spxStarter';
import { onAirGuideMd } from './onAirGuide';
import { renderShowControlPanelHtml } from '../control/controlPanelHtml';
import { stripHostedReceiver } from '../control/hostedReceiver';
import { replaceDefinitionInHtml } from '../model/spxDefinition';
import { loadGraphics, entriesForSavedGraphic, templateForSavedGraphic } from '../model/library';
import type { SpxTemplate } from '../model/types';
import type { Show } from '../model/shows';

/** Kept for API compatibility with callers/specs that passed backend coordinates; the
 *  production package no longer bakes any hosted receiver (rule 1 above), so the value is
 *  accepted and ignored. */
export interface ShowExportOptions {
  hostedBackend?: { ref: string; key: string } | null;
}

/** First layer assigned to a production package's templates. Pool order = paint order
 *  (index 0 furthest back), so ascending layers preserve the stack in SPX/CasparCG. Real
 *  SPX packs give each template its own layer for exactly this reason. */
const BASE_LAYER = 5;
/** SPX's web playout renderer offers layers 1-20; stay inside it. */
const MAX_LAYER = 20;

export function showGraphicLayer(index: number): number {
  return Math.min(BASE_LAYER + index, MAX_LAYER);
}

/** One template, re-declared onto its own playout layer (definition block + parsed settings). */
function withPlayoutLayer(template: SpxTemplate, layer: number): SpxTemplate {
  const settings = { ...template.settings, playlayer: String(layer), webplayout: String(layer) };
  return { ...template, settings, html: replaceDefinitionInHtml(template.html, settings, template.fields) };
}

export async function buildShowZip(show: Show, _opts?: ShowExportOptions): Promise<JSZip> {
  const zip = new JSZip();
  const root = zip.folder(slug(show.name))!;
  // Each graphic's saved control-panel entries live in the library, not in the show's embedded
  // copy — resolve them once here (by graphicId, unique-name fallback) so both the aggregated
  // show panel and each graphic's own controlpanel.html bake them in. Authoring stays in the
  // app; a change reaches the package on the next export (docs/SAVED_CONTENT_MODEL.md §4).
  const library = loadGraphics();
  const used = new Set<string>();
  let index = 0;
  for (const graphic of show.graphics) {
    // Two graphics can slug identically ("Ticker" / "ticker!") — suffix the collision.
    let name = slug(graphic.name);
    let n = 2;
    while (used.has(name)) name = `${slug(graphic.name)}_${n++}`;
    used.add(name);
    // The LIVE template from the library (templateForSavedGraphic), not the snapshot embedded
    // when the graphic was added — the graphic keeps being edited, and the export must ship
    // what it looks like now. Strip any hosted-receiver block a saved snapshot might carry
    // (rule 1 above) and give the template its own playout layer (rule 2).
    let template = templateForSavedGraphic(graphic, library);
    template = withPlayoutLayer({ ...template, js: stripHostedReceiver(template.js) }, showGraphicLayer(index));
    await buildStarterInto(root.folder(name)!, template, {
      entries: entriesForSavedGraphic(graphic, library),
      fileName: `${name}.html`,
    });
    index++;
  }
  root.file(
    'show_controlpanel.html',
    renderShowControlPanelHtml(
      show.name,
      show.graphics.map((g) => ({ template: templateForSavedGraphic(g, library), entries: entriesForSavedGraphic(g, library) })),
    ),
  );
  root.file('GETTING-ON-AIR.md', onAirGuideMd());
  root.file(
    'README.md',
    `# ${show.name} — show package\n\nGenerated by NoaCG Studio.\n\n` +
      `Each folder is one plug-and-play SPX template (rundown order, each on its own playout\n` +
      `layer so they never evict each other):\n\n` +
      [...used].map((name, i) => `- ${name}/${name}.html  (layer ${showGraphicLayer(i)})`).join('\n') +
      `\n\n## Operating the show (show_controlpanel.html)\n` +
      `Serve this folder over http (SPX's template server, or any local web server), run each\n` +
      `graphic's own .html as a browser source FROM THAT ADDRESS, and open show_controlpanel.html\n` +
      `from the same address in the same browser. One card per graphic: fields, the state\n` +
      `machine's buttons, and Play/Stop/Update/Next — each card drives its own graphic over a\n` +
      `same-origin BroadcastChannel.\n\n` +
      `Opening the files straight from disk (file://) does NOT connect the panel — browsers give\n` +
      `every local file its own private origin. In an SPX or CasparCG rundown you do not need the\n` +
      `panel: the host is the controller there. See GETTING-ON-AIR.md for the full setup guide.\n` +
      `\nExtract this folder into your SPX/CasparCG templates directory as-is.\n`,
  );
  return zip;
}

/** Download the production package under the one filename every surface agrees on — the two
 *  callers previously named the same zip `_rundown` and `_production`. */
export async function downloadShowZip(show: Show, opts?: ShowExportOptions): Promise<void> {
  const zip = await buildShowZip(show, opts);
  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${slug(show.name)}_production.zip`);
}
