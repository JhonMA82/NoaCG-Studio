// The TYPE FLOOR: the smallest a text line may render at, per graphic category.
//
// It lived as a const inside scripts/type-floor.mjs, which made it a CATALOG gate and nothing
// else - it renders every shipped variant AS AUTHORED and fails on anything under the floor.
// That is only half the question. `blocks`/`designAdjust` then rewrites the very font sizes the
// gate certified, on the AI path, after the gate has run: `designAdjust` clamped a supporting
// line at a hard 14px while this table holds a lower third to 20px, so a design could pass the
// catalog gate as authored and reach air six points under the floor with nothing measuring it.
//
// So the number moves here, where the adjuster, the live bench and the script can all read the
// SAME one. A second copy is how the gate and the thing it gates come to disagree - the
// unsafeJsConstructs precedent (one question, one answer, one place to update).

/**
 * Floors in CSS pixels at 1920x1080, keyed by `TemplateCategory`.
 *
 * `corner-bug` is lower on purpose and is not a relaxation: a corner bug is a persistent
 * station mark read over minutes rather than a line read in four seconds, and the catalog's own
 * bugs are authored at that size. Everything else answers to the default.
 */
export const TYPE_FLOOR_PX: Readonly<Record<string, number>> = {
  'corner-bug': 16,
  default: 20,
};

/** The floor for a category. An unknown category takes the default rather than opting out -
 *  a new category must be readable before it is special. */
export function typeFloorFor(category: string | null | undefined): number {
  return (category && TYPE_FLOOR_PX[category]) || TYPE_FLOOR_PX.default;
}
