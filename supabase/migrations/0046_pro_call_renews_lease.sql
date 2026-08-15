-- A settled Pro call RENEWS its reservation's lease, so a fleet slot follows the work rather
-- than the clock.
--
-- THE DEFECT. 0044 booked a Pro reservation for the profile's whole `expiry_minutes` - fifteen
-- by default - because unlike Lite, Pro's model calls happen in the BROWSER and nothing
-- server-side marks the work finished. `ai_task_usage` counts a `reserved` row as occupying a
-- fleet slot until it expires, so ONE abandoned generation held a seat for fifteen minutes,
-- and the caller's own `user_concurrency` seat with it.
--
-- That is survivable for one user and not for a class: thirty students on a dozen slots, each
-- abandoned tab costing a quarter of an hour, is a room that stops working. The reservation is
-- now taken on a SHORT lease covering one call, and every settled call pushes it forward - so a
-- live generation keeps its seat for as long as it is actually generating, and a dead one frees
-- it within one lease. It is the same shape Lite's `activeLeaseMs` has had since 0010; Pro
-- needed a heartbeat to carry it, and `record_ai_pro_call` is the only server touch there is.
--
-- The parameter is added rather than defaulted because a signature change cannot be a
-- `create or replace` - Postgres would leave the three-argument version beside the new one, and
-- an overload nothing revokes is an overload `anon` may still hold EXECUTE on.

drop function if exists public.record_ai_pro_call(uuid, uuid, numeric);

create or replace function public.record_ai_pro_call(
  p_generation_id uuid,
  p_user_id uuid,
  p_cost_usd numeric,
  p_lease_ms integer
)
returns table (call_status text, calls integer, spent_usd numeric)
language plpgsql
set search_path = ''
as $$
declare
  v_calls integer;
  v_spent numeric;
  v_profile text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ai-task-fleet:pro', 73190001));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 7319));

  select generation.pro_call_count, generation.profile into v_calls, v_profile
  from public.ai_generations as generation
  where generation.id = p_generation_id
    and generation.user_id = p_user_id;

  if v_calls is null or v_profile is distinct from 'pro' then
    return query select 'not-found'::text, 0, 0::numeric; return;
  end if;

  update public.ai_generations as generation
  set pro_call_count = generation.pro_call_count + 1,
      -- The first settlement REPLACES the reservation's booked worst case; every later one adds.
      -- `greatest` is deliberately UNQUALIFIED: it is a SQL grammar construct, not a function
      -- resolved through search_path, so `pg_catalog.greatest(...)` does not exist.
      provider_cost_usd = case when generation.pro_call_count = 0 then 0 else generation.provider_cost_usd end
        + greatest(p_cost_usd, 0),
      -- The heartbeat. Only ever pushed FORWARD: a late settlement from a call that overran
      -- must not shorten a lease a later call already extended.
      --
      -- `greatest` UNQUALIFIED, for the third time in this pair of migrations: it is a SQL
      -- grammar construct, not a function resolved through search_path, so
      -- `pg_catalog.greatest(...)` does not exist at any argument type. 0044 hit it, wrote the
      -- note, and this file hit it again anyway - which is the argument for the self-check
      -- below rather than for the note.
      expires_at = greatest(
        generation.expires_at,
        pg_catalog.now() + pg_catalog.make_interval(secs => greatest(p_lease_ms, 0) / 1000.0)
      ),
      updated_at = pg_catalog.now()
  where generation.id = p_generation_id
  returning generation.pro_call_count, generation.provider_cost_usd into v_calls, v_spent;

  return query select 'recorded'::text, v_calls, v_spent;
end;
$$;

revoke all on function public.record_ai_pro_call(uuid, uuid, numeric, integer) from public, anon, authenticated;
grant execute on function public.record_ai_pro_call(uuid, uuid, numeric, integer) to service_role;

-- Self-check: the functions are CALLED, not merely created (the lesson 0044 paid for twice).
do $$
declare
  v_owner uuid;
  v_id uuid;
  v_before timestamptz;
  v_after timestamptz;
  v_status text;
begin
  -- (a) The three-argument version is GONE, not left beside the new one.
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_ai_pro_call'
      and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, numeric'
  ) then
    raise exception '0046 self-check (a) FAILED: the old 3-argument overload survives';
  end if;

  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice '0046 self-check: no auth.users row, skipping the lease walk';
    return;
  end if;

  insert into public.ai_generations (
    user_id, ip_hash, idempotency_key, profile, status, prompt_version, provider_cost_usd, expires_at
  ) values (
    v_owner, '0046-check', '0046-check-' || gen_random_uuid()::text, 'pro', 'reserved', '0046-check',
    0.15, pg_catalog.now() + interval '30 seconds'
  ) returning id, expires_at into v_id, v_before;

  -- (b) A settled call pushes the lease forward.
  select call_status into v_status from public.record_ai_pro_call(v_id, v_owner, 0.07, 240000);
  select expires_at into v_after from public.ai_generations where id = v_id;
  if v_status is distinct from 'recorded' or v_after <= v_before then
    raise exception '0046 self-check (b) FAILED: % / lease went % -> %', v_status, v_before, v_after;
  end if;

  -- (c) A SHORTER lease never pulls it back in.
  perform public.record_ai_pro_call(v_id, v_owner, 0.001, 1000);
  if (select expires_at from public.ai_generations where id = v_id) < v_after then
    raise exception '0046 self-check (c) FAILED: a late short lease shortened the reservation';
  end if;

  delete from public.ai_generations where id = v_id;
end;
$$;
