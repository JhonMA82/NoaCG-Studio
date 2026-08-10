import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { GatewayError } from './aiGateway.js';
import { liteProfile } from './aiLiteProfile.js';
import {
  LITE_MEASURED_MEAN_LATENCY_MS,
  liteCapacityRetryPlan,
} from './aiLiteRateLimit.js';
import { MemoryLiteGenerationStore } from './aiLiteStore.js';
import { gatewayResponse, reservationError, reserveLiteCapacity } from './lite/generations.js';

function capacityProfile() {
  process.env.AI_LITE_GATEWAY_PROVIDERS = 'audited/provider';
  process.env.AI_LITE_DAILY_STARTS = '100';
  process.env.AI_LITE_MONTHLY_STARTS = '100';
  process.env.AI_LITE_DAILY_SUCCESSES = '100';
  process.env.AI_LITE_MONTHLY_SUCCESSES = '100';
  process.env.AI_LITE_FLEET_CONCURRENCY = '20';
  return liteProfile();
}

test('a transient fleet spike admits the same request after an active slot is released', async () => {
  const store = new MemoryLiteGenerationStore();
  const profile = capacityProfile();
  const now = Date.now();
  const activeIds: string[] = [];

  for (let index = 0; index < profile.maxConcurrentFleet; index += 1) {
    const reservation = await store.reserve({
      userId: `user-${index}`,
      ipHash: 'classroom-network',
      idempotencyKey: `active-capacity-key-${index}`,
      requestedCategory: 'lower-third',
      now,
      profile,
    });
    assert.equal(reservation.status, 'created');
    if (reservation.status === 'created') activeIds.push(reservation.record.id);
  }

  const retryInput = {
    userId: 'ordinary-user',
    ipHash: 'classroom-network',
    idempotencyKey: 'ordinary-user-request-key',
    requestedCategory: 'lower-third',
    now,
    profile,
  };
  assert.equal((await store.reserve(retryInput)).status, 'fleet-concurrency');

  let sleeps = 0;
  const plan = liteCapacityRetryPlan(
    profile.maxConcurrentFleet,
    profile.maxAttempts,
    profile.timeoutMs,
  );
  const retried = await reserveLiteCapacity(store, retryInput, plan, {
    now: () => now + sleeps,
    random: () => 0.5,
    sleep: async () => {
      sleeps += 1;
      await store.update(activeIds[0], { status: 'failed' });
    },
  });
  assert.equal(retried.status, 'created');
  assert.equal(sleeps, 1);

  const usage = await store.usage('lite', retryInput.userId, now + 2);
  assert.equal(usage.dailyStarts, 1, 'failed admission attempts never consume a user start');
  assert.equal(usage.activeGlobal, profile.maxConcurrentFleet);
  assert.equal((await store.reserve({ ...retryInput, now: now + 2 })).status, 'duplicate');
  assert.equal((await store.usage('lite', retryInput.userId, now + 2)).dailyStarts, 1);
});

test('classroom retry headroom is calculated from measured turnover and request limits', () => {
  const profile = capacityProfile();
  const plan = liteCapacityRetryPlan(
    profile.maxConcurrentFleet,
    profile.maxAttempts,
    profile.timeoutMs,
  );
  assert.equal(plan.maxAttempts, 3, '60 classroom-NAT requests / 20 fleet slots');
  assert.equal(plan.retrySpacingMs, LITE_MEASURED_MEAN_LATENCY_MS / 2);
  assert.equal(
    plan.activeLeaseMs,
    profile.timeoutMs * profile.maxAttempts + LITE_MEASURED_MEAN_LATENCY_MS,
  );
});

test('failed, ready, and expired generations release only the capacity they still own', async () => {
  const store = new MemoryLiteGenerationStore();
  const profile = capacityProfile();
  const now = Date.now();
  const ids: string[] = [];
  for (const [index, status] of ['failed', 'spec_ready', 'model_running'].entries()) {
    const reservation = await store.reserve({
      userId: `release-user-${index}`,
      ipHash: 'release-network',
      idempotencyKey: `release-capacity-key-${index}`,
      requestedCategory: 'lower-third',
      now,
      profile,
    });
    assert.equal(reservation.status, 'created');
    if (reservation.status !== 'created') continue;
    ids.push(reservation.record.id);
    await store.update(reservation.record.id, { status: status as 'failed' | 'spec_ready' | 'model_running' });
  }

  const live = await store.usage('lite', 'release-user-1', now + 1);
  assert.equal(live.activeForUser, 1, 'ready work still protects the user one-at-a-time guard');
  assert.equal(live.activeGlobal, 1, 'only the provider-running row owns fleet capacity');

  await store.update(ids[2], { expiresAt: now });
  const expired = await store.usage('lite', 'release-user-2', now + 1);
  assert.equal(expired.activeForUser, 0);
  assert.equal(expired.activeGlobal, 0);
});

test('spend, concurrency, user overlap, and provider throttling have separate diagnostics', async () => {
  const concurrency = reservationError({ status: 'fleet-concurrency' });
  assert.equal(concurrency.status, 503);
  assert.deepEqual(await concurrency.json(), {
    error: {
      code: 'shared_capacity',
      message: 'NoaCG Lite is temporarily busy. Please try again in a moment.',
      retryable: true,
    },
  });

  const spend = reservationError({ status: 'fleet-spend' });
  assert.equal(spend.status, 503);
  assert.equal((await spend.json() as { error: { code: string; retryable: boolean } }).error.code, 'fleet_spend_ceiling');

  const user = reservationError({ status: 'user-concurrency' });
  assert.equal((await user.json() as { error: { code: string } }).error.code, 'already_running');

  const provider = gatewayResponse(new GatewayError('rate_limited', 'provider detail', 429, true));
  assert.equal((await provider.json() as { error: { code: string } }).error.code, 'provider_rate_limited');
});

test('the durable usage RPC releases ready and stale rows from fleet capacity', async () => {
  const source = await readFile('supabase/migrations/0038_release_lite_fleet_capacity.sql', 'utf8');
  assert.match(
    source,
    /where generation\.user_id = p_user_id[\s\S]+generation\.status in \('reserved', 'model_running', 'spec_ready'\)[\s\S]+generation\.expires_at > p_now/i,
  );
  assert.match(
    source,
    /count\(\*\) filter \(\s*where generation\.status in \('reserved', 'model_running'\)\s*and generation\.expires_at > p_now/i,
  );
  assert.match(source, /generation\.expires_at > p_now/i);
  assert.match(source, /revoke all on function public\.ai_task_usage[\s\S]+from public, anon, authenticated/i);
  assert.match(source, /grant execute on function public\.ai_lite_usage[\s\S]+to service_role/i);
});
