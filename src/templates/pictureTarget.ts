// WHICH PICTURE GRAPHIC AN UPLOAD ON THE PRODUCTION PAGE ADDS TO (templates/picture.ts).
//
// The production's own: the pool's picture graphic with NO library link. A picture graphic pooled
// FROM the library (a graphics pack can carry one) is a document the production only references.
// Uploading into it used to re-pool it without its `graphicId`, which cut the link the hosted
// control page and the library's production filter follow, and the new pictures still did not air:
// a publish resolves that graphic's template out of the library, by name once the link is gone
// (issue #762). So such a graphic is left as it is and the upload makes the production a picture
// graphic of its own beside it.
//
// A new one is named so that neither lookup by name can capture it: free in the library (the
// publish's name fallback, `resolveSavedGraphicDoc`) and free in the pool (`addGraphicToShow`
// replaces by name).
//
// Pure, no value imports, so scripts/picture-target.test.mjs runs it in Node.

/** The production's own picture graphic to add to, or the name for a new one. */
export function pictureUploadTarget<G extends { name: string; type: string; graphicId?: string | null }>(
  pool: readonly G[],
  libraryNames: Iterable<string>,
  baseName: string,
): { existing: G; name?: undefined } | { existing: null; name: string } {
  const existing = pool.find((g) => g.type === 'picture' && !g.graphicId);
  if (existing) return { existing };
  const taken = new Set([...libraryNames, ...pool.map((g) => g.name)]);
  let name = baseName;
  for (let n = 2; taken.has(name); n += 1) name = `${baseName} ${n}`;
  return { existing: null, name };
}
