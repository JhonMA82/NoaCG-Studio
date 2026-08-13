// The VOLUME BRAND MATRIX (docs/AI_LITE_BRAND_PLAN.md §4.4) - brief x mark x palette.
//
// WHY THIS EXISTS. The brand bank pins ONE mark and ONE palette per brief, which is right for a
// bank meant to be read by eye: five briefs, five real jobs, comparable across rounds. It cannot
// answer the question the plan actually asks - "which chassis fails which mark on which family of
// palette" - because every cell of that table has a sample size of at most one, and the failures
// measured so far (a knockout mark on a light package, a rail in a square well, a dark mark on a
// picture) are all pairings rather than briefs.
//
// So the matrix crosses the same three ingredients instead of adding a fourth: the JOBS below,
// the mark bank and the palette bank from `ai-lite-brand-fixtures.mjs`. Nothing here mints a new
// mark, a new palette or a new category - a second vocabulary is how a bank stops describing the
// product.
//
// ── THE ONE THING THAT MADE NEW BRIEFS NECESSARY ────────────────────────────────────────
//
// The brand bank's prompts NAME their own pairing: "Keep our blue as the accent", "on our light
// paper package", "We only have the white version of the mark". Crossed with a different palette
// or mark those sentences become false, and the round would then be measuring whether the model
// obeys a prompt that contradicts its own request data - a different experiment, and one whose
// failures would read as brand-fidelity failures.
//
// The jobs below therefore carry the WORK and the COPY and nothing else: no colour, no mark
// shape, no package lightness. Those three ride the request, where the platform owns them.

import {
  LITE_BRAND_MARKS,
  LITE_BRAND_PALETTES,
} from './ai-lite-brand-fixtures.mjs';

export const LITE_MATRIX_FIXTURE_VERSION = 1;

/**
 * The jobs. Five real lower-third briefs, each naming a person, their role and the programme
 * context - and each asking for the mark WITHOUT saying what the mark is.
 */
export const LITE_MATRIX_JOBS = [
  {
    id: 'news-anchor',
    prompt:
      'A restrained evening-news lower third for anchor name Martin Hale and role Evening News, '
      + 'carrying our logo. Authoritative, readable at a glance, nothing decorative.',
  },
  {
    id: 'matchday-player',
    prompt:
      'A match-day lower third for player name Mateo Silva and team Northbridge FC, carrying our '
      + 'logo. Condensed hierarchy, fast controlled entrance, built for a stadium cut.',
  },
  {
    id: 'lecture-speaker',
    prompt:
      'A university lecture lower third for speaker name Dr. Anika Ramanathan and role Professor '
      + 'of Environmental Engineering, carrying our logo. Calm, credible, generous spacing.',
  },
  {
    id: 'briefing-spokesperson',
    prompt:
      'A lower third for spokesperson name Marisol Vega and role Emergency Management Director '
      + 'during a public briefing, carrying our logo. Plain, serious, instantly legible.',
  },
  {
    id: 'creator-profile',
    prompt:
      'A warm creator lower third for name Tomas Aalto and role Fourth-Generation Baker, carrying '
      + 'our logo. Friendly but not generic, and the mark small rather than shouting.',
  },
];

/** Every mark in the bank, in bank order. */
export const LITE_MATRIX_MARKS = LITE_BRAND_MARKS.map((mark) => mark.id);

/**
 * Every palette that is a BRAND. `houseAmberProbe` is excluded on purpose: it is the detector
 * for the house-amber rule, not a package any channel would bring, and putting it in the matrix
 * would book real generations against a fixture whose only job is to make a check fire.
 */
export const LITE_MATRIX_PALETTES = Object.keys(LITE_BRAND_PALETTES)
  .filter((id) => id !== 'houseAmberProbe');

/**
 * The grid, ordered so that ANY PREFIX IS A BALANCED SAMPLE.
 *
 * The runner's per-round ceiling is 40 calls, and the full grid is larger than that, so the
 * order decides what a partial round measures. Enumerated mark-major x palette, the first 40
 * cells would be two marks against every palette and nothing about the other three - a batch
 * whose findings are a fact about wordmarks.
 *
 * So the outer loop is the (mark, palette) PAIR - the pairing is what the failures are about -
 * and the job rotates with it. The first `marks x palettes` cells (25 today) therefore cover
 * every pairing exactly once, with each job appearing five times; the next pass repeats the
 * pairings against a different job, and so on. A round stopped anywhere is still readable.
 */
export function liteMatrixCells({
  jobs = LITE_MATRIX_JOBS,
  marks = LITE_MATRIX_MARKS,
  palettes = LITE_MATRIX_PALETTES,
} = {}) {
  const cells = [];
  for (let pass = 0; pass < jobs.length; pass += 1) {
    marks.forEach((markId, markIndex) => {
      palettes.forEach((palette, paletteIndex) => {
        const job = jobs[(markIndex + paletteIndex + pass) % jobs.length];
        cells.push({
          id: `mx-${job.id}-${markId}-${palette}`,
          category: 'lower-third',
          servable: true,
          job: job.id,
          markId,
          palette,
          pass,
          prompt: job.prompt,
        });
      });
    });
  }
  return cells;
}

export const LITE_MATRIX_FIXTURES = liteMatrixCells();
