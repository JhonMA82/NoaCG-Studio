import type { AssetFile, SpxTemplate, TemplateType } from './types';
import { DEFAULT_SETTINGS } from './types';
import type { ProjectBrand } from './brand';
import type { Show } from './shows';
import type { GraphicDoc } from './library';
import { templateForSavedGraphic } from './library';
import { graphicLayer } from './shows';

/**
 * The PRODUCTION PACKAGE - a whole production as one shareable JSON file: every pool
 * graphic's complete template, the layer stack, and the cue rundown. Import recreates
 * library graphics plus one production; export serializes the live records back out, so the
 * format is a round trip rather than a one-way loader (docs/FIGHT_NIGHT_PACK_PLAN.md §3).
 *
 * Versioning follows non-negotiable 6: additive fields never bump `v`; a breaking change
 * bumps it and migrates here on read; an unknown NEWER version refuses with a readable
 * message, never a crash.
 */

export const PRODUCTION_PACK_FORMAT = 'noacg-production-pack';
export const PRODUCTION_PACK_VERSION = 1;

/** One pool graphic: its name (the pool/layer identity) + the complete template. */
export interface ProductionPackGraphic {
  name: string;
  /** Playout layer (shows.ts semantics); absent = assigned on import. */
  layer?: number;
  template: SpxTemplate;
}

/** One prepared cue. `graphic` is the POOL NAME - ids are minted at import. */
export interface ProductionPackCue {
  graphic: string;
  label: string;
  values?: Record<string, string>;
  note?: string;
}

export interface ProductionPack {
  format: typeof PRODUCTION_PACK_FORMAT;
  v: number;
  name: string;
  look?: ProjectBrand;
  /** Pool order = paint order, index 0 furthest back - exactly Show.graphics. */
  graphics: ProductionPackGraphic[];
  cues?: ProductionPackCue[];
}

export interface ParsedProductionPack {
  pack: ProductionPack | null;
  error: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asString = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

/** Rebuild a template from untrusted JSON: known fields only, honest refusals for the
 *  parts nothing downstream can survive without. Returns a message instead of a template
 *  when the entry is unusable. */
function normalizeTemplate(raw: unknown, name: string): { template: SpxTemplate | null; error: string | null } {
  if (!isRecord(raw)) return { template: null, error: `"${name}" carries no template.` };
  const html = raw.html;
  const css = raw.css;
  const js = raw.js;
  if (typeof html !== 'string' || typeof css !== 'string' || typeof js !== 'string') {
    return { template: null, error: `"${name}" is missing its code (html/css/js).` };
  }
  const res = raw.resolution;
  if (!isRecord(res) || typeof res.width !== 'number' || typeof res.height !== 'number') {
    return { template: null, error: `"${name}" is missing its resolution.` };
  }
  const fields = Array.isArray(raw.fields) ? (raw.fields as SpxTemplate['fields']) : [];
  const assets: AssetFile[] = Array.isArray(raw.assets)
    ? (raw.assets as unknown[]).flatMap((a) =>
        isRecord(a) && typeof a.path === 'string' && typeof a.data === 'string'
          ? [{ path: a.path, data: a.data }]
          : [],
      )
    : [];
  return {
    template: {
      name: asString(raw.name, name) || name,
      type: (asString(raw.type, 'blank') || 'blank') as TemplateType,
      resolution: { width: res.width, height: res.height, label: asString(res.label) },
      fps: typeof raw.fps === 'number' ? raw.fps : 50,
      html,
      css,
      js,
      fields,
      settings: { ...DEFAULT_SETTINGS, ...(isRecord(raw.settings) ? raw.settings : {}) } as SpxTemplate['settings'],
      assets,
      layers: [],
    },
    error: null,
  };
}

/** Parse + migrate-on-read. Never throws; the error is a sentence a user can act on. */
export function parseProductionPack(raw: string): ParsedProductionPack {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { pack: null, error: 'Not a readable file - a production package is a .noacgpack.json file.' };
  }
  if (!isRecord(data) || data.format !== PRODUCTION_PACK_FORMAT) {
    return { pack: null, error: 'Not a NoaCG production package.' };
  }
  const v = data.v;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return { pack: null, error: 'This production package carries no version.' };
  }
  if (v > PRODUCTION_PACK_VERSION) {
    return {
      pack: null,
      error: `This production package was made by a newer NoaCG (format v${v}) - update to import it.`,
    };
  }
  // v1 is the only shipped version; older-than-current would migrate HERE.
  const rawGraphics = Array.isArray(data.graphics) ? data.graphics : [];
  if (rawGraphics.length === 0) {
    return { pack: null, error: 'This production package contains no graphics.' };
  }
  const graphics: ProductionPackGraphic[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rawGraphics.length; i++) {
    const entry = rawGraphics[i];
    const name = isRecord(entry) ? asString(entry.name).trim() : '';
    if (!name) return { pack: null, error: `Graphic ${i + 1} has no name.` };
    if (seen.has(name)) {
      // The pool is name-keyed (one renderer instance per name), so a duplicate is a broken pack.
      return { pack: null, error: `Two graphics share the name "${name}" - pool names must be unique.` };
    }
    seen.add(name);
    const rec = entry as Record<string, unknown>;
    const { template, error } = normalizeTemplate(rec.template, name);
    if (!template || error) return { pack: null, error };
    graphics.push({
      name,
      ...(typeof rec.layer === 'number' ? { layer: rec.layer } : {}),
      template,
    });
  }
  const cues: ProductionPackCue[] = [];
  for (const entry of Array.isArray(data.cues) ? data.cues : []) {
    if (!isRecord(entry)) continue;
    const graphic = asString(entry.graphic).trim();
    if (!seen.has(graphic)) {
      return { pack: null, error: `A cue points at "${graphic || '?'}", which is not a graphic in this package.` };
    }
    cues.push({
      graphic,
      label: asString(entry.label) || graphic,
      ...(isRecord(entry.values)
        ? {
            values: Object.fromEntries(
              Object.entries(entry.values).flatMap(([k, val]) => (typeof val === 'string' ? [[k, val]] : [])),
            ),
          }
        : {}),
      ...(typeof entry.note === 'string' ? { note: entry.note } : {}),
    });
  }
  return {
    pack: {
      format: PRODUCTION_PACK_FORMAT,
      v: PRODUCTION_PACK_VERSION,
      name: asString(data.name).trim() || 'Imported production',
      // A look is cosmetic; carry it only when it has the ProjectBrand backbone.
      ...(isRecord(data.look) && typeof data.look.styleTag === 'string' && isRecord(data.look.palette)
        ? { look: data.look as unknown as ProjectBrand }
        : {}),
      graphics,
      ...(cues.length ? { cues } : {}),
    },
    error: null,
  };
}

/** An asset stored as a Blob has no JSON form - embed it, the way every export does. */
async function assetAsDataUrl(asset: AssetFile): Promise<AssetFile> {
  if (typeof asset.data === 'string') return asset;
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(asset.data as Blob);
  });
  return { path: asset.path, data };
}

/** Serialize a live production back into the pack shape - the export half of the round trip.
 *  Templates come from the LIBRARY (what actually ships), like every production export. */
export async function buildProductionPack(show: Show, library: GraphicDoc[]): Promise<ProductionPack> {
  const graphics: ProductionPackGraphic[] = [];
  for (const g of show.graphics) {
    const template = templateForSavedGraphic(g, library);
    graphics.push({
      name: g.name,
      layer: graphicLayer(g),
      template: { ...template, assets: await Promise.all(template.assets.map(assetAsDataUrl)) },
    });
  }
  const byId = new Map(show.graphics.map((g) => [g.id, g.name]));
  const cues: ProductionPackCue[] = (show.cues ?? []).flatMap((cue) => {
    const graphic = byId.get(cue.sourceId);
    if (!graphic) return []; // an orphaned cue has nothing to import into
    return [
      {
        graphic,
        label: cue.label,
        values: { ...cue.values },
        ...(cue.note ? { note: cue.note } : {}),
      },
    ];
  });
  return {
    format: PRODUCTION_PACK_FORMAT,
    v: PRODUCTION_PACK_VERSION,
    name: show.name,
    ...(show.look ? { look: show.look } : {}),
    graphics,
    ...(cues.length ? { cues } : {}),
  };
}

/** The download name: readable, extension-doubled so the file says what it is. */
export function productionPackFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'production'}.noacgpack.json`;
}
