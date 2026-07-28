// The SAMENESS math - pure array arithmetic, no browser, no filesystem, so the build
// gate can test it directly (scripts/ai-lite-bench.test.mjs). The vectors come from
// scripts/ai-lite-sameness.mjs, which rasterizes each hold capture to a small RGB grid.
//
// The doctrine names "same layout, different colours" a failure (src/ai/AGENTS.md), and
// this module is its tripwire made measurable: the MINIMUM pairwise distance inside a
// run is the two most-similar results - the number to watch, because a healthy mean can
// hide one pair of near-identical answers to different briefs.
//
// Distances are mean absolute RGB differences in [0, 1]. The captures share one synthetic
// stage background, so a distance is only meaningful RELATIVE to others from the same
// capture setup - never quote one as an absolute similarity percentage.

/** Mean absolute component difference between two equal-length vectors, in [0, 1]. */
export function vectorDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) {
    throw new Error('vectorDistance needs two equal-length non-empty vectors');
  }
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/**
 * Summarize every pair in `items` ([{ id, vector }]). Returns null for fewer than two
 * items (one result has no sameness to measure - never fake a zero).
 */
export function pairwiseSummary(items) {
  if (!Array.isArray(items) || items.length < 2) return null;
  let sum = 0;
  let count = 0;
  let min = Infinity;
  let minPair = null;
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const d = vectorDistance(items[i].vector, items[j].vector);
      sum += d;
      count += 1;
      if (d < min) {
        min = d;
        minPair = [items[i].id, items[j].id];
      }
    }
  }
  return { pairs: count, mean: sum / count, min, minPair };
}

/** The nearest reference look for one item - {id, distance} of the closest house capture. */
export function nearestReference(vector, references) {
  if (!Array.isArray(references) || !references.length) return null;
  let best = null;
  for (const ref of references) {
    const d = vectorDistance(vector, ref.vector);
    if (!best || d < best.distance) best = { id: ref.id, distance: d };
  }
  return best;
}
