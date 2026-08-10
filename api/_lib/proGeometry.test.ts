// The NoaCG Pro sharp-placement gate (src/ai/pro/contract.ts).
//
// Concept framing no longer determines on-air size. The interpretation chooses a canvas
// placement separately, and this dependency-light test pins the deterministic rule that
// applies it without ever upscaling source pixels.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRO_DEFAULT_CANVAS_PLACEMENT,
  resolveProCanvasPlacement,
} from '../../src/ai/pro/contract.js';

test('a tightly framed concept reaches a useful lower-third size by downscaling', () => {
  const placed = resolveProCanvasPlacement(
    { width: 1376, height: 300 },
    { widthNorm: 0.6, xNorm: 0.0625, yNorm: 0.7 },
  );
  assert.ok(placed);
  assert.ok(Math.abs(placed.scale - 1152 / 1376) < 0.0001);
  assert.equal(placed.widthNorm, 0.6);
  assert.equal(placed.sizeFulfilled, true);
  assert.equal(placed.zone, 'bottom-left');
});

test('source pixels are never visibly upscaled to satisfy a requested size', () => {
  const placed = resolveProCanvasPlacement(
    { width: 640, height: 180 },
    { widthNorm: 0.6, xNorm: 0.06, yNorm: 0.72 },
  );
  assert.ok(placed);
  assert.equal(placed.requestedScale, 1.8);
  assert.equal(placed.scale, 1);
  assert.equal(placed.widthNorm, 640 / 1920);
  assert.equal(placed.sizeFulfilled, false);
});

test('an unusually tall concept is downscaled to the lower-third height cap', () => {
  const placed = resolveProCanvasPlacement(
    { width: 1400, height: 900 },
    { widthNorm: 0.7, xNorm: 0.1, yNorm: 0.6 },
  );
  assert.ok(placed);
  assert.equal(placed.scale, 0.42);
  assert.equal(placed.heightNorm, 0.35);
  assert.equal(placed.sizeFulfilled, true);
});

test('placement is clamped into the lower canvas and broadcast-safe edges', () => {
  const placed = resolveProCanvasPlacement(
    { width: 1200, height: 240 },
    { widthNorm: 0.5, xNorm: -4, yNorm: -2 },
  );
  assert.ok(placed);
  assert.ok(Math.abs(placed.xNorm - 0.03) < Number.EPSILON);
  assert.equal(placed.yNorm, 0.5);
  assert.equal(placed.zone, 'bottom-left');
});

test('malicious size claims clamp, while non-finite placement uses deterministic defaults', () => {
  const huge = resolveProCanvasPlacement(
    { width: 1800, height: 300 },
    { widthNorm: 20, xNorm: 20, yNorm: 20 },
  );
  assert.ok(huge);
  assert.ok(huge.widthNorm <= 0.75);
  assert.ok(huge.xNorm + huge.widthNorm <= 0.97 + Number.EPSILON);
  assert.ok(huge.yNorm + huge.heightNorm <= 0.95 + Number.EPSILON);

  const fallback = resolveProCanvasPlacement(
    { width: 1600, height: 320 },
    { widthNorm: Number.NaN, xNorm: Number.NaN, yNorm: Number.NaN },
  );
  const expected = resolveProCanvasPlacement(
    { width: 1600, height: 320 },
    PRO_DEFAULT_CANVAS_PLACEMENT,
  );
  assert.deepEqual(fallback, expected);
});

test('missing legacy placement receives the same deterministic default', () => {
  assert.deepEqual(
    resolveProCanvasPlacement({ width: 1600, height: 320 }, undefined),
    resolveProCanvasPlacement({ width: 1600, height: 320 }, PRO_DEFAULT_CANVAS_PLACEMENT),
  );
});

test('an unusable source or canvas is unknown, never treated as sharp', () => {
  assert.equal(resolveProCanvasPlacement({ width: 0, height: 300 }, undefined), null);
  assert.equal(resolveProCanvasPlacement({ width: 1376, height: Number.NaN }, undefined), null);
  assert.equal(resolveProCanvasPlacement({ width: 1376, height: 300 }, undefined, { width: 0, height: 1080 }), null);
});
