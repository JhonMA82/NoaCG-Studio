// What a KIT actually contains, resolved once for everyone who needs to know.
//
// A pack names its contents two ways (`src/templates/packs.ts`): `types` are graphic TYPES,
// resolved against the (type x family) matrix, and `extras` are catalog variants OUTSIDE the
// type registry that belong in the kit anyway - end credits, the versus card. Both are the
// kit; a consumer that reads only `types` builds a kit missing its extras and, worse, can
// still show a count that includes them.
//
// This module exists because `packs.ts` deliberately does NOT import the catalog it is a view
// over, so the join has to happen somewhere else - once, rather than in each caller.

import { variantById } from './catalog';
import { resolvePack, type TemplatePack } from './packs';
import type { StyleTag } from '../model/fonts';
import type { TemplateVariant } from '../model/wizard';

export interface KitItem {
  /** The catalog design that will be built. */
  variant: TemplateVariant;
  /** The graphic type it is a design of, when it came from the matrix rather than `extras`. */
  typeId: string | null;
}

/**
 * Every graphic in the kit, in the pack's curated order: the resolved type cells first, then
 * the extras. Throws the way `resolvePack` does - a pack pointing at a design that does not
 * exist is a config error, and config errors fail loudly.
 */
export function kitItems(pack: TemplatePack, family: StyleTag): KitItem[] {
  const items: KitItem[] = resolvePack({ ...pack, family }).map((cell) => {
    const variant = variantById(cell.designId);
    if (!variant) {
      throw new Error(`Kit "${pack.id}": type "${cell.typeId}" resolves to missing design "${cell.designId}".`);
    }
    return { variant, typeId: cell.typeId };
  });

  for (const designId of pack.extras ?? []) {
    const variant = variantById(designId);
    if (!variant) throw new Error(`Kit "${pack.id}": extra "${designId}" is not in the catalog.`);
    items.push({ variant, typeId: null });
  }
  return items;
}

/** How many graphics a kit produces, for a surface that has not picked a look yet. Extras are
 *  family-independent, and every family offered by the picker resolves all of the types, so
 *  the total does not depend on which look is chosen. */
export function kitSize(pack: TemplatePack): number {
  return pack.types.length + (pack.extras?.length ?? 0);
}
