import { parseProductionPack, type ProductionPackCue } from '../../model/productionPack';
import { createGraphic } from '../../model/library';
import { commitDurableWrites } from '../../model/durableStore';
import { uuid } from '../../model/id';
import {
  loadShows,
  seedValues,
  upsertShow,
  type Show,
  type ShowCue,
} from '../../model/shows';
import type { SavedGraphic } from '../../model/packets';
import { publishGate } from '../../community/gate';

/**
 * Import a production package (model/productionPack.ts) into local work: every graphic
 * validated at the boundary (non-negotiable 4 - the same gate community import runs), then
 * landed as an editable LIBRARY record, then ONE production with the pack's pool order,
 * layers and cue rundown. Library records are written first and every step awaits the
 * durable store, so a refused write can never leave half a production behind (the wizard
 * kit door's order - src/components/AGENTS.md "Save + Home").
 */
export async function importProductionPack(raw: string): Promise<{ show: Show | null; error: string | null }> {
  const { pack, error } = parseProductionPack(raw);
  if (!pack || error) return { show: null, error };

  // The validation gate, before anything is written.
  for (const g of pack.graphics) {
    const gate = publishGate(g.template);
    if (!gate.ok) {
      const first = gate.errors[0]?.message ?? 'validation error';
      return { show: null, error: `"${g.name}" failed validation: ${first}` };
    }
  }

  // Library records first - the graphics stay editable after import.
  const poolByName = new Map<string, SavedGraphic>();
  const pool: SavedGraphic[] = [];
  for (const g of pack.graphics) {
    const { doc, error: saveError } = createGraphic(g.template, { name: g.name, packageId: null });
    const failure = saveError ?? (await commitDurableWrites());
    if (failure) return { show: null, error: failure };
    const entry: SavedGraphic = {
      id: uuid(),
      name: doc.name,
      type: doc.template.type,
      savedAt: new Date().toISOString(),
      template: doc.template,
      graphicId: doc.id,
      ...(typeof g.layer === 'number' ? { layer: g.layer } : {}),
    };
    pool.push(entry);
    poolByName.set(g.name, entry);
  }

  // The cue rundown: the pack's cues verbatim, or one seeded cue per graphic so the
  // rundown is never empty-but-working (the addGraphicToShow convention).
  const packCues: ProductionPackCue[] =
    pack.cues ?? pack.graphics.map((g) => ({ graphic: g.name, label: g.name }));
  const cues: ShowCue[] = packCues.flatMap((cue) => {
    const source = poolByName.get(cue.graphic);
    if (!source) return []; // parse already refused unknown names; belt and braces
    return [
      {
        id: uuid(),
        sourceId: source.id,
        label: cue.label,
        values: { ...seedValues(source.template.fields), ...cue.values },
        ...(cue.note ? { note: cue.note } : {}),
      },
    ];
  });

  const taken = new Set(loadShows().map((s) => s.name));
  let name = pack.name;
  for (let n = 2; taken.has(name); n++) name = `${pack.name} ${n}`;

  const show: Show = {
    id: uuid(),
    name,
    version: 2,
    ...(pack.look ? { look: pack.look } : {}),
    graphics: pool,
    cues,
    updatedAt: new Date().toISOString(),
  };
  upsertShow(show);
  const failure = await commitDurableWrites();
  if (failure) return { show: null, error: failure };
  return { show, error: null };
}
