// Tests for the pure entitlement contract (src/entitlements/contract.ts).
//
// The first test is the one that matters most: an instance with no plans, no assignments
// and no grants must resolve to EXACTLY the behaviour the product shipped with. Rolling
// out entitlements is not allowed to restrict anyone, and "every number inherits" is the
// mechanism - if that pin ever fails, someone has hard-coded a limit into a default.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ANONYMOUS_PLAN,
  DEFAULT_SIGNED_IN_PLAN,
  FEATURE_KEYS,
  FEATURE_LABELS,
  LIMIT_KEYS,
  LIMIT_LABELS,
  OBSERVE_ONLY_LIMITS,
  allows,
  enforceableLimit,
  isFeatureKey,
  isLimitKey,
  resolveEntitlement,
  type GrantShape,
  type PlanShape,
} from '../../src/entitlements/contract.js';

import { resolveTier } from '../../src/render/limits.js';
import { applyEntitlementToLiteProfile } from './entitlements.js';
import { liteProfile } from './aiLiteProfile.js';

const NOW = '2026-07-29T12:00:00.000Z';

function grant(overrides: Partial<GrantShape>): GrantShape {
  return {
    id: 'g1',
    kind: 'feature',
    key: 'ai.lite',
    value: true,
    startsAt: null,
    expiresAt: null,
    revokedAt: null,
    reason: '',
    ...overrides,
  };
}

function bare(userId: string | null) {
  return { userId, accountState: 'active' as const, plan: null, grants: [], now: NOW };
}

test('no plan, no grants: every limit inherits, so nothing is restricted', () => {
  for (const userId of [null, 'user-1']) {
    const resolved = resolveEntitlement(bare(userId));
    for (const key of LIMIT_KEYS) {
      assert.equal(resolved.limits[key].value, null, `${key} must inherit when nothing sets it`);
      assert.equal(resolved.limits[key].source, 'default');
    }
    assert.equal(resolved.renderFormats.value, null);
  }
});

test('the defaults reproduce the shipped tiers', () => {
  const anon = resolveEntitlement(bare(null));
  assert.equal(anon.renderTier.value, 'anonymous');
  assert.equal(anon.planKey, ANONYMOUS_PLAN.key);
  assert.equal(allows(anon, 'render.cloud'), true, 'anonymous cloud rendering has always worked');
  assert.equal(allows(anon, 'sync.cloud'), false);
  assert.equal(allows(anon, 'ai.lite'), false);

  const user = resolveEntitlement(bare('user-1'));
  assert.equal(user.renderTier.value, 'free');
  assert.equal(user.planKey, DEFAULT_SIGNED_IN_PLAN.key);
  for (const key of ['ai.lite', 'sync.cloud', 'community.publish', 'control.hosted'] as const) {
    assert.equal(allows(user, key), true, `${key} is on for a signed-in user today`);
  }
  assert.equal(allows(user, 'templates.internal'), false);
});

test('an assigned plan overrides the default and says so', () => {
  const plan: PlanShape = {
    key: 'studio',
    name: 'Studio',
    features: { 'templates.beta': true, 'community.publish': false },
    limits: { aiDailyStarts: 50 },
    renderTier: 'paid',
    renderFormats: ['mp4', 'prores4444'],
  };
  const resolved = resolveEntitlement({ ...bare('user-1'), plan });

  assert.equal(allows(resolved, 'templates.beta'), true);
  assert.equal(resolved.features['templates.beta'].source, 'plan');
  assert.equal(resolved.features['templates.beta'].sourceLabel, 'Plan: Studio');
  assert.equal(allows(resolved, 'community.publish'), false);
  assert.equal(resolved.limits.aiDailyStarts.value, 50);
  assert.equal(resolved.limits.aiDailyStarts.source, 'plan');
  assert.equal(resolved.renderTier.value, 'paid');
  assert.deepEqual(resolved.renderFormats.value, ['mp4', 'prores4444']);

  // A key the plan does not mention still falls through to the default.
  assert.equal(resolved.features['sync.cloud'].source, 'default');
  assert.equal(resolved.limits.aiMonthlyStarts.value, null);
});

test('a temporary grant outranks the plan and carries its expiry', () => {
  const plan: PlanShape = {
    key: 'basic',
    name: 'Basic',
    features: { 'ai.video': false },
    limits: {},
    renderTier: 'free',
    renderFormats: null,
  };
  const resolved = resolveEntitlement({
    ...bare('user-1'),
    plan,
    grants: [grant({ key: 'ai.video', expiresAt: '2026-08-05T00:00:00.000Z', reason: 'trial' })],
  });

  assert.equal(allows(resolved, 'ai.video'), true);
  assert.equal(resolved.features['ai.video'].source, 'grant');
  assert.equal(resolved.features['ai.video'].expiresAt, '2026-08-05T00:00:00.000Z');
  assert.match(resolved.features['ai.video'].sourceLabel, /trial/);
});

test('a permanent override outranks a temporary grant', () => {
  const resolved = resolveEntitlement({
    ...bare('user-1'),
    grants: [
      grant({ id: 'a', key: 'ai.lite', value: true, expiresAt: '2026-08-05T00:00:00.000Z' }),
      grant({ id: 'b', key: 'ai.lite', value: false, reason: 'abuse' }),
    ],
  });
  assert.equal(allows(resolved, 'ai.lite'), false);
  assert.equal(resolved.features['ai.lite'].source, 'override');
  assert.equal(resolved.features['ai.lite'].expiresAt, null);
});

test('expired, future, revoked and malformed grants do not apply', () => {
  const cases: Partial<GrantShape>[] = [
    { expiresAt: '2026-07-01T00:00:00.000Z' },
    { startsAt: '2026-12-01T00:00:00.000Z' },
    { revokedAt: '2026-07-02T00:00:00.000Z' },
    { expiresAt: 'not-a-date' },
    { startsAt: 'not-a-date' },
  ];
  for (const overrides of cases) {
    const resolved = resolveEntitlement({
      ...bare('user-1'),
      plan: { key: 'p', name: 'P', features: { 'ai.video': false }, limits: {}, renderTier: 'free', renderFormats: null },
      grants: [grant({ key: 'ai.video', value: true, ...overrides })],
    });
    assert.equal(allows(resolved, 'ai.video'), false, JSON.stringify(overrides));
  }
});

test('a quota grant replaces the plan number, including clearing it', () => {
  const plan: PlanShape = {
    key: 'p',
    name: 'P',
    features: {},
    limits: { aiDailyStarts: 5 },
    renderTier: 'free',
    renderFormats: null,
  };
  const raised = resolveEntitlement({
    ...bare('user-1'),
    plan,
    grants: [grant({ kind: 'quota', key: 'aiDailyStarts', value: 500, reason: 'launch week' })],
  });
  assert.equal(raised.limits.aiDailyStarts.value, 500);
  assert.equal(raised.limits.aiDailyStarts.source, 'override');

  const cleared = resolveEntitlement({
    ...bare('user-1'),
    plan,
    grants: [grant({ kind: 'quota', key: 'aiDailyStarts', value: null })],
  });
  assert.equal(cleared.limits.aiDailyStarts.value, null, 'null clears back to inherit');
});

test('a grant of the wrong shape for its kind is ignored', () => {
  const resolved = resolveEntitlement({
    ...bare('user-1'),
    grants: [
      grant({ kind: 'feature', key: 'ai.lite', value: 7 as unknown as boolean }),
      grant({ id: 'q', kind: 'quota', key: 'aiDailyStarts', value: true as unknown as number }),
    ],
  });
  assert.equal(resolved.features['ai.lite'].source, 'default');
  assert.equal(resolved.limits.aiDailyStarts.source, 'default');
});

test('suspension denies every feature but keeps the plan visible', () => {
  const plan: PlanShape = {
    key: 'studio',
    name: 'Studio',
    features: { 'templates.beta': true },
    limits: { aiDailyStarts: 50 },
    renderTier: 'paid',
    renderFormats: null,
  };
  const resolved = resolveEntitlement({ ...bare('user-1'), accountState: 'suspended', plan });

  for (const key of FEATURE_KEYS) {
    assert.equal(resolved.features[key].value, false, `${key} must be denied while suspended`);
    assert.equal(resolved.features[key].source, 'suspended');
  }
  assert.equal(resolved.planName, 'Studio', 'the plan stays visible for reactivation');
  assert.equal(resolved.limits.aiDailyStarts.value, 50);
  assert.equal(resolved.renderTier.value, 'anonymous');
});

test('a suspended account is not rescued by a grant', () => {
  const resolved = resolveEntitlement({
    ...bare('user-1'),
    accountState: 'suspended',
    grants: [grant({ key: 'ai.lite', value: true })],
  });
  assert.equal(allows(resolved, 'ai.lite'), false);
});

test('anonymous callers ignore plans and grants entirely', () => {
  const resolved = resolveEntitlement({
    ...bare(null),
    plan: { key: 'studio', name: 'Studio', features: { 'sync.cloud': true }, limits: {}, renderTier: 'paid', renderFormats: null },
    grants: [grant({ key: 'sync.cloud', value: true })],
  });
  assert.equal(allows(resolved, 'sync.cloud'), false);
  assert.equal(resolved.renderTier.value, 'anonymous');
});

test('the legacy env override widens AI access without taking anything away', () => {
  const widened = resolveEntitlement({ ...bare('user-1'), envOverride: true });
  assert.equal(widened.features['ai.lite'].source, 'default', 'already allowed, so no relabelling');

  const plan: PlanShape = {
    key: 'p',
    name: 'P',
    features: { 'ai.lite': false, 'community.publish': false },
    limits: {},
    renderTier: 'free',
    renderFormats: null,
  };
  const overridden = resolveEntitlement({ ...bare('user-1'), plan, envOverride: true });
  assert.equal(allows(overridden, 'ai.lite'), true);
  assert.equal(overridden.features['ai.lite'].source, 'env-override');
  assert.equal(allows(overridden, 'community.publish'), false, 'the env list is an AI escape hatch only');
});

test('observe-only limits never become enforceable', () => {
  const plan: PlanShape = {
    key: 'p',
    name: 'P',
    features: {},
    limits: { storageBytes: 1_000, projects: 1, aiDailyStarts: 9 },
    renderTier: 'free',
    renderFormats: null,
  };
  const resolved = resolveEntitlement({ ...bare('user-1'), plan });

  assert.equal(resolved.limits.storageBytes.value, 1_000, 'still displayed');
  assert.equal(enforceableLimit(resolved, 'storageBytes'), null);
  assert.equal(enforceableLimit(resolved, 'projects'), null);
  assert.equal(enforceableLimit(resolved, 'aiDailyStarts'), 9);
  for (const key of OBSERVE_ONLY_LIMITS) assert.ok(isLimitKey(key));
});

test('the render tier still resolves to today\'s answer when no plan names one', () => {
  assert.equal(resolveTier(false), 'anonymous');
  assert.equal(resolveTier(true), 'free');
  assert.equal(resolveTier(false, undefined), 'anonymous');
  assert.equal(resolveTier(true, undefined), 'free');
  // What the resolver returns with nothing configured, fed straight back in.
  assert.equal(resolveTier(true, resolveEntitlement(bare('user-1')).renderTier.value), 'free');
  assert.equal(resolveTier(false, resolveEntitlement(bare(null)).renderTier.value), 'anonymous');
});

test('a plan can move the render tier, but only to one that exists', () => {
  assert.equal(resolveTier(true, 'paid'), 'paid');
  assert.equal(resolveTier(true, 'anonymous'), 'anonymous');
  // A plan naming a tier the code does not have must not fail the request and must not be
  // read as the most generous one.
  for (const bogus of ['enterprise', 'PAID', '', 'free ']) {
    assert.equal(resolveTier(true, bogus), 'free', bogus);
  }
  // An anonymous caller has no plan to honour, whatever gets passed.
  assert.equal(resolveTier(false, 'paid'), 'anonymous');
});

test('a suspended account drops to the anonymous render tier', () => {
  const resolved = resolveEntitlement({
    ...bare('user-1'),
    accountState: 'suspended',
    plan: { key: 'p', name: 'P', features: {}, limits: {}, renderTier: 'paid', renderFormats: null },
  });
  assert.equal(resolveTier(true, resolved.renderTier.value), 'anonymous');
  assert.equal(allows(resolved, 'render.cloud'), false);
});

test('with no plan configured the Lite profile comes back untouched', () => {
  const base = liteProfile();
  const applied = applyEntitlementToLiteProfile(base, resolveEntitlement(bare('user-1')));
  assert.deepEqual(applied, base, 'inheriting must be a no-op, not a rewrite with equal values');
});

test('a plan moves only the five AI allowances, never the routing', () => {
  const base = liteProfile();
  const plan: PlanShape = {
    key: 'studio',
    name: 'Studio',
    features: {},
    limits: {
      aiDailyStarts: 40,
      aiMonthlyStarts: 400,
      aiDailySuccesses: 20,
      aiMonthlySuccesses: 200,
      aiUserConcurrency: 3,
    },
    renderTier: 'paid',
    renderFormats: null,
  };
  const applied = applyEntitlementToLiteProfile(base, resolveEntitlement({ ...bare('user-1'), plan }));

  assert.equal(applied.dailyStarts, 40);
  assert.equal(applied.monthlyStarts, 400);
  assert.equal(applied.dailySuccesses, 20);
  assert.equal(applied.monthlySuccesses, 200);
  assert.equal(applied.maxConcurrentPerUser, 3);

  // A plan is not a way around the audited model catalog or the deployment's cost ceilings.
  assert.deepEqual(applied.primary, base.primary);
  assert.deepEqual(applied.fallback, base.fallback);
  assert.equal(applied.promptVersion, base.promptVersion);
  assert.equal(applied.maxProviderCostUsd, base.maxProviderCostUsd);
  assert.equal(applied.dailyFleetSpendUsd, base.dailyFleetSpendUsd);
  assert.equal(applied.maxConcurrentFleet, base.maxConcurrentFleet);
  assert.equal(applied.outputTokens, base.outputTokens);
});

test('a plan cannot set per-user concurrency to zero and silently break every reservation', () => {
  const plan: PlanShape = {
    key: 'p',
    name: 'P',
    features: {},
    limits: { aiUserConcurrency: 0 },
    renderTier: 'free',
    renderFormats: null,
  };
  const applied = applyEntitlementToLiteProfile(liteProfile(), resolveEntitlement({ ...bare('user-1'), plan }));
  assert.equal(applied.maxConcurrentPerUser, 1);
});

test('a quota grant reaches the Lite profile with the plan overridden', () => {
  const plan: PlanShape = {
    key: 'p',
    name: 'P',
    features: {},
    limits: { aiDailySuccesses: 2 },
    renderTier: 'free',
    renderFormats: null,
  };
  const applied = applyEntitlementToLiteProfile(
    liteProfile(),
    resolveEntitlement({
      ...bare('user-1'),
      plan,
      grants: [grant({ kind: 'quota', key: 'aiDailySuccesses', value: 25, reason: 'support case' })],
    }),
  );
  assert.equal(applied.dailySuccesses, 25);
});

test('an instance-wide kill switch beats a plan, a grant AND a manual override', () => {
  const plan: PlanShape = {
    key: 'studio',
    name: 'Studio',
    features: { 'ai.lite': true },
    limits: {},
    renderTier: 'free',
    renderFormats: null,
  };
  const resolved = resolveEntitlement({
    ...bare('user-1'),
    plan,
    grants: [grant({ key: 'ai.lite', value: true, reason: 'vip' })],
    disabledFeatures: ['ai.lite'],
  });
  assert.equal(allows(resolved, 'ai.lite'), false, 'a switch a manual override defeats is not a switch');
  assert.equal(resolved.features['ai.lite'].source, 'disabled');
  // Only the named feature goes down.
  assert.equal(allows(resolved, 'sync.cloud'), true);
});

test('the kill switch reaches anonymous visitors too', () => {
  const resolved = resolveEntitlement({ ...bare(null), disabledFeatures: ['render.cloud'] });
  assert.equal(allows(resolved, 'render.cloud'), false);
  assert.equal(resolved.features['render.cloud'].source, 'disabled');
});

test('the key guards reject unknown strings', () => {
  assert.equal(isFeatureKey('ai.lite'), true);
  assert.equal(isFeatureKey('editor.open'), false, 'the free core has no gate key');
  assert.equal(isLimitKey('aiDailyStarts'), true);
  assert.equal(isLimitKey('nonsense'), false);
});

test('every key carries a label and a default in both built-in plans', () => {
  for (const key of FEATURE_KEYS) {
    assert.ok(FEATURE_LABELS[key], `${key} needs a label for the admin UI`);
    assert.ok(key in DEFAULT_SIGNED_IN_PLAN.features, `${key} needs a signed-in default`);
    assert.ok(key in ANONYMOUS_PLAN.features, `${key} needs an anonymous default`);
  }
  for (const key of LIMIT_KEYS) {
    assert.ok(LIMIT_LABELS[key], `${key} needs a label for the admin UI`);
    assert.ok(key in DEFAULT_SIGNED_IN_PLAN.limits, `${key} needs a signed-in default`);
  }
});
