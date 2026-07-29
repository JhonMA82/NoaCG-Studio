-- The imported-graphic-analysis task joins the ai_generations reservation ledger
-- (docs/AI_PLATFORM_PLAN.md §6, task registry docs/AI_TASK_REGISTRY.md).
--
-- Two changes, both required together:
--  1. The `profile` CHECK widens to admit 'import-analysis' rows (the task registry maps
--     task id 'imported-graphic-analysis' onto that discriminator).
--  2. Usage counting and reservation become PROFILE-SCOPED: each task profile has its own
--     quotas, concurrency, and daily fleet spend budget, so one task's traffic must never
--     consume another's admission budget. The Lite-named functions become thin wrappers
--     over the profile-parameterized ones, so existing callers (and the judge RPC from
--     0013, which reads ai_lite_usage) keep exactly their current semantics - today every
--     row is 'lite', so filtered and unfiltered counts are identical at migration time.
--
-- Content-free as ever: the analysis image, instructions, and result never enter the
-- ledger - only accounting, routes, and outcome codes.

alter table public.ai_generations
  drop constraint if exists ai_generations_profile_check;
alter table public.ai_generations
  add constraint ai_generations_profile_check check (profile in ('lite', 'import-analysis'));

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
    count(*) filter (where generation.user_id = p_user_id and generation.created_at >= p_now - interval '1 day'),
    count(*) filter (where generation.user_id = p_user_id and generation.created_at >= p_now - interval '30 days'),
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
      where generation.status in ('reserved', 'model_running', 'spec_ready')
        and generation.expires_at > p_now
    ),
    coalesce(sum(generation.provider_cost_usd) filter (
      where generation.created_at >= p_now - interval '1 day'
    ), 0)
  from public.ai_generations as generation
  where generation.profile = p_profile;
$$;

-- The Lite reader keeps its name and shape; the judge RPC (0013) and the API's usage
-- endpoint call it unchanged.
create or replace function public.ai_lite_usage(
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
  select * from public.ai_task_usage('lite', p_user_id, p_now);
$$;

create or replace function public.reserve_ai_task_generation(
  p_profile text,
  p_user_id uuid,
  p_ip_hash text,
  p_idempotency_key text,
  p_prompt_version text,
  p_requested_category text,
  p_expires_at timestamptz,
  p_daily_starts integer,
  p_monthly_starts integer,
  p_daily_successes integer,
  p_monthly_successes integer,
  p_user_concurrency integer,
  p_fleet_concurrency integer,
  p_fleet_daily_spend_usd numeric,
  p_session_cost_ceiling_usd numeric
)
returns table (reservation_status text, generation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_existing uuid;
  v_daily_starts bigint;
  v_monthly_starts bigint;
  v_daily_successes bigint;
  v_monthly_successes bigint;
  v_active_for_user bigint;
  v_active_global bigint;
  v_daily_spend numeric;
  v_id uuid;
begin
  -- Fleet admission is per PROFILE now, so the fleet lock is profile-scoped: two tasks'
  -- admissions never serialize against each other, and each profile's spend ceiling is
  -- decided atomically within its own lane. The per-user lock stays user-wide (cross
  -- profile) - it only guards this user's counting, and one lock per user is simpler to
  -- reason about than one per (user, profile). Lock order: fleet, then user, everywhere.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ai-task-fleet:' || p_profile, 73190001));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 7319));

  select id into v_existing
  from public.ai_generations
  where ai_generations.user_id = p_user_id
    and ai_generations.idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return query select 'duplicate'::text, v_existing;
    return;
  end if;

  select *
  into v_daily_starts, v_monthly_starts, v_daily_successes, v_monthly_successes,
       v_active_for_user, v_active_global, v_daily_spend
  from public.ai_task_usage(p_profile, p_user_id, v_now);

  if v_daily_starts >= p_daily_starts then
    return query select 'daily-start-limit'::text, null::uuid; return;
  elsif v_monthly_starts >= p_monthly_starts then
    return query select 'monthly-start-limit'::text, null::uuid; return;
  elsif v_daily_successes >= p_daily_successes then
    return query select 'daily-success-limit'::text, null::uuid; return;
  elsif v_monthly_successes >= p_monthly_successes then
    return query select 'monthly-success-limit'::text, null::uuid; return;
  elsif v_active_for_user >= p_user_concurrency then
    return query select 'user-concurrency'::text, null::uuid; return;
  elsif v_active_global >= p_fleet_concurrency then
    return query select 'fleet-concurrency'::text, null::uuid; return;
  elsif v_daily_spend + p_session_cost_ceiling_usd > p_fleet_daily_spend_usd then
    return query select 'fleet-spend'::text, null::uuid; return;
  end if;

  insert into public.ai_generations (
    user_id, ip_hash, idempotency_key, profile, status, prompt_version,
    requested_category, provider_cost_usd, expires_at
  ) values (
    p_user_id, p_ip_hash, p_idempotency_key, p_profile, 'reserved',
    p_prompt_version, p_requested_category, p_session_cost_ceiling_usd, p_expires_at
  ) returning id into v_id;

  return query select 'created'::text, v_id;
end;
$$;

-- The Lite reserver keeps its name, signature, and (single-profile) semantics. NOTE the
-- lock change rides through the wrapper: Lite's fleet admission now serializes on the
-- 'ai-task-fleet:lite' key instead of the old constant 73190001. That is behavior-neutral
-- for correctness - every Lite caller still meets every other Lite caller on the same
-- lock - it only stops UNRELATED profiles from queueing behind Lite's admissions.
create or replace function public.reserve_ai_lite_generation(
  p_user_id uuid,
  p_ip_hash text,
  p_idempotency_key text,
  p_prompt_version text,
  p_requested_category text,
  p_expires_at timestamptz,
  p_daily_starts integer,
  p_monthly_starts integer,
  p_daily_successes integer,
  p_monthly_successes integer,
  p_user_concurrency integer,
  p_fleet_concurrency integer,
  p_fleet_daily_spend_usd numeric,
  p_session_cost_ceiling_usd numeric
)
returns table (reservation_status text, generation_id uuid)
language sql
security definer
set search_path = ''
as $$
  select * from public.reserve_ai_task_generation(
    'lite', p_user_id, p_ip_hash, p_idempotency_key, p_prompt_version,
    p_requested_category, p_expires_at, p_daily_starts, p_monthly_starts,
    p_daily_successes, p_monthly_successes, p_user_concurrency,
    p_fleet_concurrency, p_fleet_daily_spend_usd, p_session_cost_ceiling_usd
  );
$$;

-- The judge admission (0013) took "the same advisory locks reserve_ai_lite_generation
-- takes" and summed fleet spend over EVERY row. Both facts must move together with the
-- reserver, or judge admissions stop serializing against Lite generation admissions and
-- start counting other profiles' spend against Lite's ceiling. Same body otherwise.
create or replace function public.reserve_ai_lite_judge(
  p_generation_id uuid,
  p_user_id uuid,
  p_max_per_generation integer,
  p_fleet_daily_spend_usd numeric,
  p_judge_cost_ceiling_usd numeric
)
returns table (reservation_status text, judge_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_expires_at timestamptz;
  v_judge_count integer;
  v_daily_spend numeric;
begin
  -- Same locks, same order as reserve_ai_task_generation('lite', ...).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ai-task-fleet:lite', 73190001));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 7319));

  select generation.expires_at, generation.judge_count
    into v_expires_at, v_judge_count
  from public.ai_generations as generation
  where generation.id = p_generation_id
    and generation.user_id = p_user_id;

  -- A record that is missing and one owned by someone else answer identically.
  if v_expires_at is null then
    return query select 'not-found'::text, 0; return;
  elsif v_expires_at <= v_now then
    return query select 'expired'::text, v_judge_count; return;
  elsif v_judge_count >= p_max_per_generation then
    return query select 'judge-limit'::text, v_judge_count; return;
  end if;

  select coalesce(sum(generation.provider_cost_usd), 0) into v_daily_spend
  from public.ai_generations as generation
  where generation.created_at >= v_now - interval '1 day'
    and generation.profile = 'lite';

  if v_daily_spend + p_judge_cost_ceiling_usd > p_fleet_daily_spend_usd then
    return query select 'fleet-spend'::text, v_judge_count; return;
  end if;

  update public.ai_generations as generation
  set judge_count = generation.judge_count + 1,
      provider_cost_usd = generation.provider_cost_usd + p_judge_cost_ceiling_usd
  where generation.id = p_generation_id
  returning generation.judge_count into v_judge_count;

  return query select 'created'::text, v_judge_count;
end;
$$;

revoke all on function public.ai_task_usage(text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.reserve_ai_task_generation(
  text, uuid, text, text, text, text, timestamptz, integer, integer, integer,
  integer, integer, integer, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.ai_task_usage(text, uuid, timestamptz) to service_role;
grant execute on function public.reserve_ai_task_generation(
  text, uuid, text, text, text, text, timestamptz, integer, integer, integer,
  integer, integer, integer, numeric, numeric
) to service_role;
