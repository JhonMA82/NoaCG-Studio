// guards: src/templates/pictureTarget.ts
//
// ADDING A PICTURE ON THE PRODUCTION PAGE KEEPS EVERY LIBRARY LINK (issue #762). The upload adds to
// the production's own picture graphic. One pooled from the library is left as it is: re-pooling it
// with the new picture used to drop its `graphicId`, and the picture still did not air, because a
// publish resolves that graphic out of the library. Pure, run here in Node.

import test from 'node:test';
import assert from 'node:assert/strict';

const { pictureUploadTarget } = await import('../src/templates/pictureTarget.ts');

const lowerThird = { id: 'p1', name: 'Lower third', type: 'lower-third', graphicId: 'lib-lt' };
const ownPictures = { id: 'p2', name: 'Pictures', type: 'picture' };
const libraryPictures = { id: 'p3', name: 'Pictures', type: 'picture', graphicId: 'lib-pics' };

test('the production adds to its own picture graphic', () => {
  assert.equal(pictureUploadTarget([lowerThird, ownPictures], ['Lower third'], 'Pictures').existing, ownPictures);
});

test('a picture graphic pooled from the library is never the target, so its link stays', () => {
  const target = pictureUploadTarget([lowerThird, libraryPictures], ['Lower third', 'Pictures'], 'Pictures');
  assert.equal(target.existing, null);
  assert.equal(target.name, 'Pictures 2');
  // Beside one of the production's own, that one is still the target.
  assert.equal(pictureUploadTarget([libraryPictures, { ...ownPictures, name: 'Pictures 2' }], ['Pictures'], 'Pictures').existing.name, 'Pictures 2');
});

test('a new picture graphic is named free of the library and of the pool', () => {
  // The library record was renamed, so only the pool still holds "Pictures": replacing by that name
  // would overwrite the linked graphic.
  assert.equal(pictureUploadTarget([libraryPictures], ['Holding slides'], 'Pictures').name, 'Pictures 2');
  assert.equal(pictureUploadTarget([lowerThird], ['Pictures', 'Pictures 2'], 'Pictures').name, 'Pictures 3');
  assert.equal(pictureUploadTarget([], [], 'Pictures').name, 'Pictures');
});
