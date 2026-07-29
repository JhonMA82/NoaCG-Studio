// Tests for the template-visibility rules (api/_lib/templateVisibility.ts).
//
// The property that matters most is the DEGRADATION one: with no backend, or a failed lookup,
// nothing is hidden. The catalog is free-forever core, so an outage must never empty it - and a
// hide-list is the shape that makes that the default rather than something to remember.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { hiddenTemplateKeys } from './templateVisibility.js';
import { resetAdminDb } from './adminAuth.js';
import { resolveEntitlement, type PlanShape } from '../../src/entitlements/contract.js';

const ENV = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
const original = new Map(ENV.map((name) => [name, process.env[name]]));

beforeEach(() => {
  for (const name of ENV) delete process.env[name];
  resetAdminDb();
});

afterEach(() => {
  for (const [name, value] of original) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetAdminDb();
});

const NOW = '2026-07-29T12:00:00.000Z';

function entitlementFor(plan: PlanShape | null, userId: string | null = 'user-1') {
  return resolveEntitlement({ userId, accountState: 'active', plan, grants: [], now: NOW });
}

test('with no backend configured, nothing is hidden', async () => {
  assert.deepEqual(await hiddenTemplateKeys(entitlementFor(null)), []);
  assert.deepEqual(await hiddenTemplateKeys(entitlementFor(null, null)), []);
});

test('a broken backend hides nothing rather than emptying the catalog', async () => {
  // Configured but unusable, so adminDb() throws while building the client. A malformed URL
  // rather than an unroutable host on purpose: this fails instantly, where a dead address
  // costs the build gate a seven-second connect timeout for the same assertion. The catch
  // must swallow it either way - a hide-list that fails OPEN is the point of this shape.
  process.env.SUPABASE_URL = 'not-a-url';
  process.env.SUPABASE_SECRET_KEY = 'not-a-real-key';
  assert.deepEqual(await hiddenTemplateKeys(entitlementFor(null)), []);
});

test('the entitlement decides who sees beta and internal', () => {
  // The rules themselves are the contract's, so assert them there rather than behind a
  // database: a plan granting templates.beta must resolve true, and the default must not.
  const beta: PlanShape = {
    key: 'insider',
    name: 'Insider',
    features: { 'templates.beta': true },
    limits: {},
    renderTier: 'free',
    renderFormats: null,
  };
  assert.equal(entitlementFor(beta).features['templates.beta'].value, true);
  assert.equal(entitlementFor(beta).features['templates.internal'].value, false);
  assert.equal(entitlementFor(null).features['templates.beta'].value, false);
  assert.equal(entitlementFor(null).features['templates.internal'].value, false);
  // Anonymous visitors never see either, whatever a plan says - plans do not apply to them.
  assert.equal(entitlementFor(beta, null).features['templates.beta'].value, false);
});
