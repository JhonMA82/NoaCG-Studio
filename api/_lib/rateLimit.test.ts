import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hitRateLimit, type RateLimitCaps } from './rateLimit.js';

// The gates share ONE bucket map on globalThis, and their windows differ (5 s ingest, 60 s
// per-IP, 3600 s feedback). The sweep must therefore compare bucket AGES in milliseconds -
// window indices are incommensurable across gates, and an index-compared sweep wiped every
// other gate's live counters the moment a short-window gate crossed the map-size threshold.

const MINUTE: RateLimitCaps = { windowMs: 60_000, max: 5 };
const FIVE_SEC: RateLimitCaps = { windowMs: 5_000, max: 25 };

test('a short-window gate\'s sweep never wipes a long-window gate\'s live counter', () => {
  const now = 1_000_000_000_000;
  // A minute-gate client spends its whole budget - it must stay refused.
  for (let i = 0; i < MINUTE.max; i += 1) hitRateLimit('sweep-victim', MINUTE, now);
  assert.equal(hitRateLimit('sweep-victim', MINUTE, now).allowed, false);
  // Push the shared map past the sweep threshold from the 5 s gate (the flood case the
  // gates exist for), in the same instant.
  for (let i = 0; i < 5_100; i += 1) hitRateLimit(`sweep-noise-${i}`, FIVE_SEC, now);
  // The minute bucket is mid-window and must have survived the sweep: still refused.
  assert.equal(hitRateLimit('sweep-victim', MINUTE, now + 1_000).allowed, false);
});

test('a genuinely dead bucket is swept by its own gate\'s age, freeing the memory', () => {
  const now = 2_000_000_000_000;
  hitRateLimit('sweep-dead', FIVE_SEC, now);
  // Two of the 5 s gate's own windows later, a sweep triggered by fresh keys removes it;
  // the client then starts a clean window and is allowed again.
  const later = now + 3 * FIVE_SEC.windowMs;
  for (let i = 0; i < 5_100; i += 1) hitRateLimit(`sweep-noise2-${i}`, FIVE_SEC, later);
  assert.equal(hitRateLimit('sweep-dead', FIVE_SEC, later).allowed, true);
});
