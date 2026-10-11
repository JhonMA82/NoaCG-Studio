import assert from 'node:assert/strict';
import { test } from 'node:test';

import { treeShapeProblems } from './check-tree-shape.mjs';

const refused = (file) => treeShapeProblems([file]).length > 0;

test('a picture under docs/ or benchmarks/ is refused, whatever its case or kind', () => {
  for (const file of [
    'docs/research/editor-review/after.png',
    'docs/work-specs/some-feature/evidence/desktop.JPG',
    'docs/images/a-new-shot.png',
    'benchmarks/pro/evidence/round/frame.webp',
    'benchmarks/video/run/clip.webm',
  ]) assert.ok(refused(file), file);
});

test('the pictures users or a script read stay allowed', () => {
  for (const file of [
    'docs/images/browse.png',
    'docs/images/playout.png',
    'docs/tutorials/svg-examples/Previews/title.png',
    'benchmarks/creative/v1/references/scoreboard.png',
  ]) assert.ok(!refused(file), file);
});

test('pictures elsewhere and text under docs/ are not this check\'s business', () => {
  for (const file of [
    'e2e/playout-baseline.spec.ts-snapshots/stage.png',
    'public/docs/obs.png',
    'docs/research/editor-review/notes.md',
    'docs/tutorials/svg-examples/lower-third.svg',
  ]) assert.ok(!refused(file), file);
});
