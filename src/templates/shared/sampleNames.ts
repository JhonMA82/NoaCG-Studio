// THE SAMPLE-NAME ROSTER — the placeholder people who appear in the catalog's default field
// values.
//
// Why a module and not a string in each design: a sample name is the first thing a new user
// sees in the wizard preview, and it ends up in screenshots, teaching material and the docs. It
// is product copy, and product copy needs one place to change. Before this, every variant
// carried its own literal, which is how one name came to appear in twenty-two designs and
// another had to be retired from eight files at once.
//
// WHAT MAKES A GOOD ENTRY. A placeholder name is doing a typographic job as well as a social
// one, so the roster deliberately mixes lengths and scripts-of-origin: a strap that only ever
// previews "Maya Chen" never shows the author what a long name does to their layout.
//
// The roster is not enforced by the build. A placeholder slipping back in is a low-stakes
// mistake and does not justify a CI gate of its own; `sampleNames.test.mjs` covers the one name
// that was explicitly retired, and this module is where new ones get added.

/** Retired and not to be reintroduced. */
export const RETIRED_SAMPLE_NAMES = ['Noa Haline'] as const;

/**
 * The house roster. Ordered roughly short-to-long so a design can pick by the room it has:
 * `SAMPLE_NAMES[0]` is safe in a narrow strap, the later entries stress a wider one.
 */
export const SAMPLE_NAMES = [
  'Ida Novak',
  'Nora Nova',
  'Lina Berg',
  'Kenji Sato',
  'Maya Chen',
  'Sofia Rossi',
  'Samir Khan',
  'Hana Yilmaz',
  'Leo Martinez',
  'Amina Okafor',
] as const;

/**
 * A stable pick from the roster. Designs call this with their own id so two straps sitting side
 * by side in the wizard's grid do not both preview the same person — and so the choice never
 * moves when the roster grows, which a plain modulo over the array would not survive.
 */
export function sampleName(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return SAMPLE_NAMES[h % SAMPLE_NAMES.length];
}
