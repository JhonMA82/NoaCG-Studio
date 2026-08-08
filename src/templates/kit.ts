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
import { TYPES } from './types/registry';
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

/**
 * ONE row of the kit contents picker: a graphic the kit CAN contain, with a stable key the
 * checkbox state is held under.
 *
 * The key is the graphic TYPE id, or `extra:<designId>` for a catalog variant outside the type
 * registry. Deliberately not the resolved design id and not an index: the design changes when
 * the look does, and the offer list grows when the look opens another matrix cell - a checkbox
 * set keyed on either would silently re-tick itself the moment the user changed the look.
 */
export interface KitChoice {
  key: string;
  variant: TemplateVariant;
  /** The graphic type it is a design of; null for an `extras` entry. */
  typeId: string | null;
  /** True when the PACK declares it - the genre preset, ticked on arrival. */
  inPack: boolean;
}

/** The key a type / extra is offered and remembered under. */
export function kitChoiceKey(typeId: string | null, designId: string): string {
  return typeId ?? `extra:${designId}`;
}

/**
 * Does this ONE graphic type ship a design in this family? Asked through `resolvePack`, the
 * same resolver the create path runs and the same idiom `familiesFor` uses, rather than by
 * reaching into the registry a second time - a second copy is how the picker comes to offer a
 * cell that throws on Create.
 */
function typeResolves(family: StyleTag, typeId: string): boolean {
  try {
    resolvePack({ id: 'kit-probe', name: '', description: '', family, types: [typeId], formats: [] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Every graphic this kit COULD contain in this look: the pack's own contents first, in its
 * curated order, then every OTHER graphic type whose (type x family) cell resolves - the
 * "start from a genre preset, then edit the set" offer.
 *
 * Only resolvable cells are ever offered. The matrix is not full (src/templates/AGENTS.md:
 * four families of six, and no pack resolves in all of them), so an unfiltered "add any type"
 * list would be a list of guaranteed Create failures.
 */
export function kitChoices(pack: TemplatePack, family: StyleTag): KitChoice[] {
  const choices: KitChoice[] = kitItems(pack, family).map((item) => ({
    key: kitChoiceKey(item.typeId, item.variant.id),
    variant: item.variant,
    typeId: item.typeId,
    inPack: true,
  }));
  const taken = new Set(choices.map((c) => c.key));
  for (const type of TYPES) {
    if (taken.has(type.id) || !typeResolves(family, type.id)) continue;
    const designId = resolvePack({ ...pack, types: [type.id], extras: [], family })[0].designId;
    const variant = variantById(designId);
    if (!variant) continue;
    choices.push({ key: type.id, variant, typeId: type.id, inPack: false });
  }
  return choices;
}

/**
 * The graphics a picker SELECTION resolves to, in offer order. This is what gets built, so it
 * is also what the count on screen must come from: `kitSize` counts the pack, and the whole
 * point of the picker is that the user can change that number in either direction.
 *
 * An unknown key is dropped rather than throwing - the selection survives a look change, and a
 * look that closes a matrix cell legitimately retires the row it was ticked on.
 */
export function kitSelection(pack: TemplatePack, family: StyleTag, keys: readonly string[]): KitItem[] {
  const wanted = new Set(keys);
  return kitChoices(pack, family)
    .filter((choice) => wanted.has(choice.key))
    .map((choice) => ({ variant: choice.variant, typeId: choice.typeId }));
}
