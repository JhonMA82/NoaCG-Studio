-- A hosted Pro reservation that never settled a call releases its booking - from the start
-- counts AND the fleet-spend sum - the moment it is terminal or expired.
--
-- THE DEFECT. 0044 books a Pro reservation's whole cost ceiling ($0.15 by default) into
-- `provider_cost_usd`, and only the FIRST settled call replaces that worst case with real
-- spend (0046's `record_ai_pro_call`). A run whose calls all failed before the provider
-- billed anything - a gateway 503, a timeout - never settles, so its row keeps the full
-- booking, and `ai_task_usage` summed `provider_cost_usd` over every row in the day window.
-- With the default $5 fleet budget, ~33 failed starts took hosted Pro down for the whole
-- fleet for the rest of the day, having spent $0. The same rows also consumed the caller's
-- scarce daily starts (3 by default): two provider blips ate two thirds of a student's day.
--
-- THE RULE. A start (and the fleet's money) is consumed if and only if provider spend
-- occurred - at least one settled call. `pro_call_count` is server truth: the gateway proxy
-- settles every billed call (api/_lib/pro/managedCall.ts), so a zero-call row provably paid
-- for nothing. Such a row is RELEASED once it can no longer spend: status 'failed' (the
-- outcome endpoint also zeroes its `provider_cost_usd` and expires it, api/_lib/pro/outcome.ts),
-- status 'expired', or its lease simply ran out unreported (the abandoned-tab case - this
-- predicate is why no sweep job is needed: an expired booking stops counting by itself).
-- A LIVE zero-call reservation still counts in full - it is about to spend, and admitting
-- against an unbooked ceiling is the unsafe direction.
--
-- Scoped to the 'pro' profile on purpose. Lite has the same defect in miniature (a pre-call
-- failure keeps its $0.007 booking - 0026 measured eleven such rows), but Lite's budget is
-- ~700 such failures deep and its quota semantics should move on their own evidence, not as
-- a rider on Pro's fix. The admin overview is untouched: 0026 already discriminates real
-- spend with `model is not null`.
--
-- `create or replace` keeps the function's ACL, but the revokes and grants are re-asserted
-- below anyway, exactly as 0038 did - assumed ACLs are how an overload ends up executable.

create or replace function public.ai_task_usage(
  p_profile text,
  p_user_id uuid,
  p_now timestamptz
)
returns table (
  daily_starts bigint,
  monthly_starts bigint,
  daily_successes bigint,
  monthly_successes bigint,
  active_for_user bigint,
  active_global bigint,
  daily_fleet_spend_usd numeric
)
language sql
security definer
set search_path = ''
as $$
  select
    count(*) filter (
      where generation.user_id = p_user_id
        and generation.created_at >= p_now - interval '1 day'
        and not (
          p_profile = 'pro' and generation.pro_call_count = 0
          and (generation.status in ('failed', 'expired') or generation.expires_at <= p_now)
        )
    ),
    count(*) filter (
      where generation.user_id = p_user_id
        and generation.created_at >= p_now - interval '30 days'
        and not (
          p_profile = 'pro' and generation.pro_call_count = 0
          and (generation.status in ('failed', 'expired') or generation.expires_at <= p_now)
        )
    ),
    count(*) filter (
      where generation.user_id = p_user_id
        and generation.created_at >= p_now - interval '1 day'
        and generation.status in ('usable', 'accepted')
    ),
    count(*) filter (
      where generation.user_id = p_user_id
        and generation.created_at >= p_now - interval '30 days'
        and generation.status in ('usable', 'accepted')
    ),
    count(*) filter (
      where generation.user_id = p_user_id
        and generation.status in ('reserved', 'model_running', 'spec_ready')
        and generation.expires_at > p_now
    ),
    count(*) filter (
      where generation.status in ('reserved', 'model_running')
        and generation.expires_at > p_now
    ),
    coalesce(sum(generation.provider_cost_usd) filter (
      where generation.created_at >= p_now - interval '1 day'
        and not (
          p_profile = 'pro' and generation.pro_call_count = 0
          and (generation.status in ('failed', 'expired') or generation.expires_at <= p_now)
        )
    ), 0)
  from public.ai_generations as generation
  where generation.profile = p_profile;
$$;

revoke all on function public.ai_task_usage(text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ai_task_usage(text, uuid, timestamptz) to service_role;

-- Self-check: the function is CALLED against recorded bad data, not merely created - and in
-- BOTH directions, because a guard that fires on nothing proves nothing (the 0046 lesson, and
-- the vacuous-self-check lesson before it).
do $$
declare
  v_owner uuid;
  v_failed uuid;
  v_abandoned uuid;
  v_live uuid;
  v_spent uuid;
  v_daily_starts bigint;
  v_spend numeric;
begin
  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice '0048 self-check: no auth.users row, skipping the usage walk';
    return;
  end if;

  -- (a) A FAILED run with zero settled calls: booking must be released from starts and spend.
  insert into public.ai_generations (
    user_id, ip_hash, idempotency_key, profile, status, prompt_version, provider_cost_usd, expires_at
  ) values (
    v_owner, '0048-check', '0048-a-' || gen_random_uuid()::text, 'pro', 'failed', '0048-check',
    0.15, pg_catalog.now()
  ) returning id into v_failed;

  -- (b) An ABANDONED run: still 'reserved', zero calls, lease ran out. Released the same way,
  --     with no sweep having touched it.
  insert into public.ai_generations (
    user_id, ip_hash, idempotency_key, profile, status, prompt_version, provider_cost_usd, expires_at
  ) values (
    v_owner, '0048-check', '0048-b-' || gen_random_uuid()::text, 'pro', 'reserved', '0048-check',
    0.15, pg_catalog.now() - interval '1 minute'
  ) returning id into v_abandoned;

  -- (c) A LIVE zero-call reservation: about to spend, must still count in full.
  insert into public.ai_generations (
    user_id, ip_hash, idempotency_key, profile, status, prompt_version, provider_cost_usd, expires_at
  ) values (
    v_owner, '0048-check', '0048-c-' || gen_random_uuid()::text, 'pro', 'reserved', '0048-check',
    0.15, pg_catalog.now() + interval '4 minutes'
  ) returning id into v_live;

  -- (d) A FAILED run WITH a settled call: real money moved, so it keeps its start and its cost.
  insert into public.ai_generations (
    user_id, ip_hash, idempotency_key, profile, status, prompt_version, provider_cost_usd,
    pro_call_count, expires_at
  ) values (
    v_owner, '0048-check', '0048-d-' || gen_random_uuid()::text, 'pro', 'failed', '0048-check',
    0.004, 1, pg_catalog.now()
  ) returning id into v_spent;

  select u.daily_starts, u.daily_fleet_spend_usd into v_daily_starts, v_spend
  from public.ai_task_usage('pro', v_owner, pg_catalog.now()) as u;

  -- Rows (c) and (d) count; (a) and (b) are released. Compare against the fixtures alone by
  -- subtracting a baseline taken with them removed - simpler: assert the deltas directly.
  delete from public.ai_generations where id in (v_failed, v_abandoned);
  declare
    v_starts_after bigint;
    v_spend_after numeric;
  begin
    select u.daily_starts, u.daily_fleet_spend_usd into v_starts_after, v_spend_after
    from public.ai_task_usage('pro', v_owner, pg_catalog.now()) as u;
    if v_daily_starts is distinct from v_starts_after then
      raise exception '0048 self-check FAILED: released rows still moved daily_starts (% -> %)',
        v_starts_after, v_daily_starts;
    end if;
    if v_spend is distinct from v_spend_after then
      raise exception '0048 self-check FAILED: released rows still moved the spend sum (% -> %)',
        v_spend_after, v_spend;
    end if;
    -- The counted direction: removing (c) and (d) MUST move both figures, or the predicate
    -- released everything and the check above was vacuous.
    delete from public.ai_generations where id in (v_live, v_spent);
    select u.daily_starts, u.daily_fleet_spend_usd into v_starts_after, v_spend_after
    from public.ai_task_usage('pro', v_owner, pg_catalog.now()) as u;
    if v_starts_after is not distinct from v_daily_starts then
      raise exception '0048 self-check FAILED: a live and a settled row did not count in daily_starts';
    end if;
    if v_spend_after is not distinct from v_spend then
      raise exception '0048 self-check FAILED: a live and a settled row did not count in the spend sum';
    end if;
  end;
end;
$$;
