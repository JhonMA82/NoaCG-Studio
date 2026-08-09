// The NoaCG Pro design-SCALE gate (src/ai/pro/contract.ts).
//
// Under api/_lib for the same reason as proCostCeiling.test.ts: this is the repo's one
// TypeScript test harness, and the module under test is the dependency-light Pro contract.
//
// The ratio is exact arithmetic over two numbers the compiler already holds, so a test can
// pin it for free. That matters here more than usual: the quantity was ALREADY being measured
// by scripts/pro-geometry-audit.mjs and the answer was thrown away, which is how ten fixtures
// came to score PASS at editability 1.00 while rendering at 0.72 of their design size.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRO_SCALE_TOLERANCE,
  proDesignScaleRatio,
  proScaleFaithful,
} from '../../src/ai/pro/contract.js';

test('a concept drawn at the frame size is faithful', () => {
  assert.equal(proDesignScaleRatio(1920, 1920), 1);
  assert.equal(proScaleFaithful(proDesignScaleRatio(1920, 1920)), true);
});

test('the measured defect - a 1376px concept in a 1920px frame - is 0.72 and NOT faithful', () => {
  const ratio = proDesignScaleRatio(1376, 1920);
  assert.ok(ratio !== null && Math.abs(ratio - 0.7167) < 0.001, `expected ~0.7167, got ${ratio}`);
  assert.equal(proScaleFaithful(ratio), false);
});

test('the 1408px concept in the bank is also caught', () => {
  // `corporate` came back 1408 wide rather than 1376, and the audit reported n/a for it
  // because its rendered-box read failed - the arithmetic answers anyway, which is the
  // point of computing this from the two widths instead of from a rendered frame.
  assert.equal(proScaleFaithful(proDesignScaleRatio(1408, 1920)), false);
});

test('the tolerance is tight enough to catch a quarter-size loss and loose enough for rounding', () => {
  assert.equal(proScaleFaithful(1 - PRO_SCALE_TOLERANCE), true);
  assert.equal(proScaleFaithful(1 + PRO_SCALE_TOLERANCE), true);
  assert.equal(proScaleFaithful(1 - PRO_SCALE_TOLERANCE - 0.001), false);
  assert.equal(proScaleFaithful(1 + PRO_SCALE_TOLERANCE + 0.001), false);
  // The defect is ~28% off. A tolerance that admitted it would be no gate at all.
  assert.ok(PRO_SCALE_TOLERANCE < 0.28, 'the tolerance must not admit the defect it exists to catch');
});

test('an oversized concept is a defect too, not just a shrunken one', () => {
  // Nothing guarantees the model answers SMALLER than the frame; a 4K concept in a 1920 frame
  // would render at 2x and overflow everything. The check is distance from 1, not "less than".
  assert.equal(proScaleFaithful(proDesignScaleRatio(3840, 1920)), false);
});

test('an unusable measurement is UNKNOWN, never faithful', () => {
  assert.equal(proDesignScaleRatio(0, 1920), null);
  assert.equal(proDesignScaleRatio(1376, 0), null);
  assert.equal(proDesignScaleRatio(Number.NaN, 1920), null);
  assert.equal(proScaleFaithful(null), false);
});
