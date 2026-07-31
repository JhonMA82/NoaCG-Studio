-- Admission control for the Lite skin vision judge.
--
-- The judge is a second paid call against an existing generation, so it needs the same
-- kind of gate the generation itself passed. Without one it was reachable for any record
-- the caller owned, any number of times, for as long as the row existed, and it never
-- consulted the daily fleet spend ceiling - the per-IP burst limiter was the only brake.
--
-- reserve_ai_lite_judge decides liveness, the per-generation cap, and fleet spend inside
-- the same advisory locks reserve_ai_lite_generation uses, then books the judge's
-- worst-case cost on the row. Booking before the call is what makes concurrent judgements
-- safe: the old read-modify-write of provider_cost_usd lost one call's cost whenever two
-- overlapped. settle_ai_lite_judge_cost reconciles the booking to the provider's number.

alter table public.ai_generations
  add column if not exists judge_count integer not null default 0 check (judge_count >= 0);

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
  -- Same locks, same order as reserve_ai_lite_generation: the global lock makes the fleet
  -- spend admission atomic, the per-user lock stops parallel requests from racing the cap.
  perform pg_catalog.pg_advisory_xact_lock(73190001);
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
  where generation.created_at >= v_now - interval '1 day';

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

-- Reconcile a booked worst case to what the provider actually charged. Never below zero,
-- and an over-count is the safe direction: the fleet ceiling trips early, never late.
create or replace function public.settle_ai_lite_judge_cost(
  p_generation_id uuid,
  p_delta_usd numeric
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_generations as generation
  set provider_cost_usd = greatest(0::numeric, generation.provider_cost_usd + p_delta_usd)
  where generation.id = p_generation_id;
$$;

revoke all on function public.reserve_ai_lite_judge(uuid, uuid, integer, numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.settle_ai_lite_judge_cost(uuid, numeric)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_lite_judge(uuid, uuid, integer, numeric, numeric) to service_role;
grant execute on function public.settle_ai_lite_judge_cost(uuid, numeric) to service_role;
