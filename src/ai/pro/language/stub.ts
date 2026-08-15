// THE ZERO-TOKEN LANGUAGES - Phase A's control path, and the reason no round has to buy the
// first answer to "does the composer work".
//
// The Phase 0 lesson, arriving for the fourth time (docs/AI_ATTEMPTS.md): two paid rounds were
// read as model failure when the platform was at fault, a third lost its SPX definitions to a
// DOM move, and every gate stayed green through all of them. A control that does not run the
// code under test is not a control - so these hand-written languages go through `composeFromLanguage`,
// the identical function a model answer goes through, and the only thing missing is the call
// that would have written them.
//
// THEY ARE DELIBERATELY FAR APART. Four languages that differ in every axis the contract carries
// - surface, accent form, corner, case, step, density and motion - so the control run exercises
// every branch of the composer rather than the one the house happens to take. If a branch is
// broken, this is where it shows, for free.

import type { DesignLanguage } from './contract';
import { DESIGN_LANGUAGE_VERSION } from './contract';

export const STUB_LANGUAGES: readonly DesignLanguage[] = [
  {
    version: DESIGN_LANGUAGE_VERSION,
    name: 'Harbour Nightly',
    rationale: 'A public-service evening news package: a deep navy surface, one restrained gold '
      + 'accent held to the leading edge, and a clear typographic step so the role never competes '
      + 'with the name.',
    palette: { accent: '#c8a24a', panel: '#0b1522', text: '#ffffff', textDim: '#9fb0c4' },
    typography: {
      fontId: 'ibm-plex-sans',
      headingWeight: 'semibold',
      supportingWeight: 'medium',
      step: 'clear',
      headingCase: 'as-written',
      supportingCase: 'caps',
      tracking: 'normal',
    },
    shape: { corner: 'sharp', panel: 'solid' },
    accent: { form: 'edge-bar', weight: 'medium' },
    density: 'balanced',
    motion: { character: 'reveal', pace: 'measured' },
  },
  {
    version: DESIGN_LANGUAGE_VERSION,
    name: 'Volt Matchday',
    rationale: 'A matchday package: a heavy condensed voice, the club\'s volt on a carbon block '
      + 'under the role, and a compact density that keeps the strap out of the play.',
    palette: { accent: '#c8f531', panel: '#0b0e11', text: '#f4f6f2', textDim: '#0b0e11' },
    typography: {
      fontId: 'anton',
      headingWeight: 'black',
      supportingWeight: 'bold',
      step: 'strong',
      headingCase: 'caps',
      supportingCase: 'caps',
      tracking: 'tight',
    },
    shape: { corner: 'sharp', panel: 'solid' },
    accent: { form: 'block', weight: 'heavy' },
    density: 'compact',
    motion: { character: 'snap', pace: 'fast' },
  },
  {
    version: DESIGN_LANGUAGE_VERSION,
    name: 'Alder Quiet',
    rationale: 'A scholarly documentary super with no surface at all: the words sit on the '
      + 'picture under a hairline rule, airy, in a serif that carries the institution\'s age.',
    palette: { accent: '#b99a5b', panel: '#14264a', text: '#ffffff', textDim: '#d8d2c6' },
    typography: {
      fontId: 'source-serif-4',
      headingWeight: 'regular',
      supportingWeight: 'regular',
      step: 'subtle',
      headingCase: 'as-written',
      supportingCase: 'as-written',
      tracking: 'wide',
    },
    shape: { corner: 'sharp', panel: 'none' },
    accent: { form: 'underline', weight: 'hairline' },
    density: 'airy',
    motion: { character: 'fade', pace: 'slow' },
  },
  {
    version: DESIGN_LANGUAGE_VERSION,
    name: 'Sunbeam Daytime',
    rationale: 'A warm daytime consumer package: a bright roundel orange on a soft blurred plum '
      + 'surface, fully rounded, with a rule across the top and a glide that never startles.',
    palette: { accent: '#ff7a1a', panel: '#46203f', text: '#fff7ef', textDim: '#f0c9a8' },
    typography: {
      fontId: 'outfit',
      headingWeight: 'bold',
      supportingWeight: 'medium',
      step: 'clear',
      headingCase: 'as-written',
      supportingCase: 'as-written',
      tracking: 'normal',
    },
    shape: { corner: 'round', panel: 'blurred' },
    accent: { form: 'top-rule', weight: 'medium' },
    density: 'airy',
    motion: { character: 'glide', pace: 'measured' },
  },
];

/** The one a single-item control uses: the house arrangement, so a broken strip is unambiguous. */
export function controlLanguage(): DesignLanguage {
  return STUB_LANGUAGES[0];
}
