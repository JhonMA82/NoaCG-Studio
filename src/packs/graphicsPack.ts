// A downloadable GRAPHICS PACK — several finished templates that install as one production.
//
// The file format (`<name>.noacgpack.json`) is the look file's pattern scaled up
// (model/packets.ts `importLook`): one JSON document, everything inlined (assets are data
// URLs inside each template), downloadable from anywhere and importable offline. It exists so
// a complete news/show package can be shipped READY — imported into a production with its
// cue rundown and playout layers already set, operated from the production page with zero
// editing — without touching the wizard catalog or the template generators.
//
// This module owns the format: parsing/normalizing a pack file, validating every graphic
// through the ONE export gate (validation/validateTemplate.ts), and installing the set
// through the ONE multi-template save path (model/templateSet.ts). It lives outside
// src/model because the validation gate imports template machinery the model layer must not
// reach (docs/ARCHITECTURE.md).

import {
  DEFAULT_GRAPHICS_FORMAT,
  DEFAULT_GRAPHICS_RESOLUTION,
} from '../model/projectFormat';
import { commitDurableWrites } from '../model/durableStore';
import { parseDefinition } from '../model/spxDefinition';
import {
  addShowCue,
  loadShows,
  setShowGraphicLayer,
  updateShowCue,
  type Show,
} from '../model/shows';
import { saveTemplateSetToProduction, type ProductionDest } from '../model/templateSet';
import {
  DEFAULT_SETTINGS,
  TEMPLATE_TYPE_LABELS,
  type AssetFile,
  type SpxTemplate,
  type TemplateType,
} from '../model/types';
import { validateTemplate } from '../validation/validateTemplate';

/** A prepared cue shipped with a pack graphic — label + field values, ready to Take. */
export interface PackCue {
  label: string;
  values: Record<string, string>;
  note?: string;
}

/** One graphic of a pack, normalized: the full template plus its playout intent. */
export interface PackGraphic {
  template: SpxTemplate;
  /** The playout layer the graphic installs on (1–100; back = low). */
  layer?: number;
  /** Prepared cues. The first REPLACES the auto-seeded default cue; the rest append. */
  cues: PackCue[];
}

/** A parsed, normalized pack — what `installPack` consumes. */
export interface GraphicsPack {
  name: string;
  description: string;
  graphics: PackGraphic[];
}

/** The format marker every pack file carries — a fast, honest "this is not a pack" answer
 *  for a template, a look, or an unrelated JSON dropped on the pack door. */
const PACK_FORMAT = 'noacg-pack';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

/** A pack's `type` must be a real TemplateType — the label table is total over the union,
 *  so its keys ARE the runtime list of legal values. */
const isTemplateType = (v: unknown): v is TemplateType =>
  typeof v === 'string' && v in TEMPLATE_TYPE_LABELS;

/** Field values ride the wire as strings (the SPX update() contract) — keep only those. */
function stringValues(v: unknown): Record<string, string> {
  if (!isRecord(v)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(v)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/** Assets are `{ path, data }` with data-URL (or text) payloads, exactly `AssetFile`. */
function packAssets(v: unknown): AssetFile[] {
  if (!Array.isArray(v)) return [];
  const out: AssetFile[] = [];
  for (const entry of v) {
    if (!isRecord(entry)) continue;
    const path = asString(entry.path);
    const data = asString(entry.data);
    if (path && data) out.push({ path, data });
  }
  return out;
}

/**
 * Parse a pack file's text into a normalized `GraphicsPack`.
 *
 * Refuses with a reason rather than coercing (the csv.ts doctrine): a malformed pack that
 * "mostly imports" would land a production with graphics missing and nothing saying so.
 * Template-level correctness (definition present, runtime entry points, machine shape) is
 * the validation gate's job — `installPack` runs it per graphic.
 */
export function parsePack(json: string): { pack: GraphicsPack | null; error: string | null } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { pack: null, error: 'That file is not readable JSON.' };
  }
  if (!isRecord(raw) || raw.format !== PACK_FORMAT) {
    return { pack: null, error: 'That file is not a NoaCG graphics pack.' };
  }
  if (raw.version !== 1) {
    return {
      pack: null,
      error: 'This pack was made with a newer version of NoaCG Studio — update to import it.',
    };
  }
  const name = asString(raw.name).trim();
  if (!name) return { pack: null, error: 'The pack has no name.' };
  if (!Array.isArray(raw.graphics) || raw.graphics.length === 0) {
    return { pack: null, error: 'The pack holds no graphics.' };
  }

  const graphics: PackGraphic[] = [];
  const seenNames = new Set<string>();
  for (const [i, entry] of raw.graphics.entries()) {
    const label = `Graphic ${i + 1}`;
    if (!isRecord(entry)) return { pack: null, error: `${label} is not an object.` };
    const graphicName = asString(entry.name).trim();
    if (!graphicName) return { pack: null, error: `${label} has no name.` };
    // The production pool replaces by NAME, so duplicate names would silently collapse two
    // pack graphics into one pool entry with the second one's code.
    if (seenNames.has(graphicName)) {
      return { pack: null, error: `Two graphics are both named “${graphicName}”.` };
    }
    seenNames.add(graphicName);
    if (!isTemplateType(entry.type)) {
      return { pack: null, error: `“${graphicName}” has an unknown graphic type.` };
    }
    const html = asString(entry.html);
    const css = asString(entry.css);
    const js = asString(entry.js);
    if (!html || !js) {
      return { pack: null, error: `“${graphicName}” is missing its HTML or JS.` };
    }

    // fields/settings are the parsed view of the definition inside the HTML — the code is
    // the source of truth, so the pack file never carries them separately.
    const parsed = parseDefinition(html);
    if (!parsed) {
      return {
        pack: null,
        error: `“${graphicName}” has no readable SPXGCTemplateDefinition in its HTML.`,
      };
    }

    let resolution = DEFAULT_GRAPHICS_RESOLUTION;
    if (isRecord(entry.resolution)) {
      const width = Number(entry.resolution.width) || DEFAULT_GRAPHICS_RESOLUTION.width;
      const height = Number(entry.resolution.height) || DEFAULT_GRAPHICS_RESOLUTION.height;
      resolution = { width, height, label: `${width}×${height}` };
    }

    const template: SpxTemplate = {
      name: graphicName,
      type: entry.type,
      resolution,
      fps: Number(entry.fps) || DEFAULT_GRAPHICS_FORMAT.fps,
      html,
      css,
      js,
      fields: parsed.fields,
      settings: parsed.settings ?? { ...DEFAULT_SETTINGS },
      assets: packAssets(entry.assets),
      layers: [],
    };

    const layerNum = Number(entry.layer);
    const cuesRaw = Array.isArray(entry.cues) ? entry.cues : [];
    const cues: PackCue[] = [];
    for (const cue of cuesRaw) {
      if (!isRecord(cue)) continue;
      const cueLabel = asString(cue.label).trim();
      if (!cueLabel) continue;
      cues.push({
        label: cueLabel,
        values: stringValues(cue.values),
        ...(asString(cue.note) ? { note: asString(cue.note) } : {}),
      });
    }

    graphics.push({
      template,
      ...(Number.isFinite(layerNum) && layerNum >= 1 && layerNum <= 100
        ? { layer: Math.round(layerNum) }
        : {}),
      cues,
    });
  }

  return {
    pack: { name, description: asString(raw.description).trim(), graphics },
    error: null,
  };
}

/**
 * Validate every graphic of a pack through the export gate. Returns the first failure as a
 * user-readable message naming the graphic, or null when the whole pack passes.
 */
export function validatePack(pack: GraphicsPack): string | null {
  for (const g of pack.graphics) {
    const result = validateTemplate(g.template);
    if (!result.ok) {
      const first = result.errors[0];
      return `“${g.template.name}” failed validation: ${first?.message ?? 'unknown error'}`;
    }
  }
  return null;
}

/**
 * Install a validated pack: every graphic to the library, pooled into one production
 * (model/templateSet.ts — the same claimed-write path the wizard's kit uses), then the
 * pack's playout intent applied on top: explicit layers, and the prepared cue rundown.
 *
 * Returns the production, THROWS with a user-readable message on any failure. Callers show
 * the message and navigate on the returned show — nothing here touches the editor.
 */
export async function installPack(pack: GraphicsPack, dest?: ProductionDest): Promise<Show> {
  const failure = validatePack(pack);
  if (failure) throw new Error(failure);

  const templates = pack.graphics.map((g) => g.template);
  const show = await saveTemplateSetToProduction(
    templates,
    pack.name,
    dest ?? { kind: 'new', name: pack.name },
  );

  // The pack's playout intent, applied over the defaults the pool assign gave. Pool entries
  // are found by NAME — `addGraphicToShow` keys the pool on it, and the parser refused
  // duplicates, so the lookup is exact.
  const installed = loadShows().find((s) => s.id === show.id);
  if (!installed) throw new Error('The production could not be read back after saving.');

  for (const g of pack.graphics) {
    const pooled = installed.graphics.find((p) => p.name === g.template.name);
    if (!pooled) continue;
    if (g.layer !== undefined) setShowGraphicLayer(show.id, pooled.id, g.layer);
    if (g.cues.length) {
      // Every new pool graphic arrives with one auto-seeded cue (docs/CLOUD_PLAYOUT.md §2).
      // The pack's FIRST cue takes that slot over rather than leaving a default beside it;
      // the rest append in order.
      const [first, ...rest] = g.cues;
      const seeded = loadShows()
        .find((s) => s.id === show.id)
        ?.cues?.find((c) => c.sourceId === pooled.id);
      if (seeded) {
        updateShowCue(show.id, seeded.id, {
          label: first.label,
          values: first.values,
          ...(first.note ? { note: first.note } : {}),
        });
      } else {
        addShowCue(show.id, pooled.id, first);
      }
      for (const cue of rest) addShowCue(show.id, pooled.id, cue);
    }
  }

  // One claim for the whole layer/cue pass — reporting success on the synchronous answer
  // would navigate to a production whose rundown never landed.
  const writeError = await commitDurableWrites();
  if (writeError) throw new Error(writeError);

  const final = loadShows().find((s) => s.id === show.id);
  return final ?? show;
}
