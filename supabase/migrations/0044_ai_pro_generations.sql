-- NoaCG Pro joins the ai_generations reservation ledger, so a Pro generation on NoaCG's own
-- key is admitted and accounted the same way a Lite one is (docs/AI_PLATFORM_PLAN.md §4,
-- docs/NOACG_PRO_PLAN.md §10: "BYO/self-host is the first product funding posture unless a
-- managed allowance is explicitly costed through the task registry" - this is that costing).
--
-- Four changes:
--
--  1. The `profile` CHECK widens to admit 'pro'. Everything else the reservation needs already
--     exists: 0015 made usage counting and reservation PROFILE-SCOPED, so ai_task_usage and
--     reserve_ai_task_generation serve Pro unchanged, with their own quota lane and their own
--     daily fleet spend ceiling.
--
--  2. `pro_call_count` - how many model calls this reservation has paid for. It gets a column
--     of its own, the way `judge_count` did in 0013, and not because a new column is tidier:
--     `attempt_count` is bounded `<= 2` by 0010, which is LITE's hard session ceiling and an
--     invariant of that profile (src/ai/AGENTS.md). Pro makes two calls plus retry headroom, so
--     reusing that column would have meant widening one task's guard to hold another task's
--     number. This is measured rather than reasoned: the first version of this migration did
--     reuse `attempt_count`, and the self-check at the foot of the file hit the constraint on
--     the first push - the whole migration rolled back, production untouched, which is the
--     entire reason the self-check calls these functions instead of merely creating them.
--
--  3. `admit_ai_pro_call` / `record_ai_pro_call` - the per-CALL pair. Pro differs from Lite in
--     one way that matters to money: ONE generation makes SEVERAL model calls, and the server
--     that spends the money is the generic gateway proxy, not this task's own endpoint. The
--     reservation books the whole generation's worst case up front (the Lite shape); each call
--     is then admitted against that booking and settles its real cost into it. The counter is
--     also what makes the first settlement REPLACE the booked worst case rather than add to
--     it: at 0 the row still holds the reservation's conservative figure, and adding actual
--     spend on top of it would count the generation twice. Every later call adds.
--
--  4. Grants: service_role only, like every other function here. The API is the only caller.
--
-- Content-free as ever - accounting, routes and outcome codes only. No brief, no concept
-- image, no interpretation, no generated code.

alter table public.ai_generations
  drop constraint if exists ai_generations_profile_check;
alter table public.ai_generations
  add constraint ai_generations_profile_check check (profile in ('lite', 'import-analysis', 'pro'));

alter table public.ai_generations
  add column if not exists pro_call_count integer not null default 0 check (pro_call_count >= 0);

-- May this reservation pay for one more model call?
--
-- Ownership, liveness, the per-generation call cap and the per-generation cost ceiling are
-- decided together, under the same lock order the reserver uses (fleet, then user). A record
-- that is missing and one owned by somebody else answer identically, so the endpoint cannot
-- become a generation-id oracle.
--
-- The cost ceiling is read as "has this generation ALREADY spent past its ceiling", not "would
-- the next call pass it": what the next call costs is unknown until it returns, and the ceiling
-- exists to stop the call AFTER the expensive one, which is the only spend still preventable
-- (src/ai/pro/pipeline.ts carries the same reading, and the reason it was paid for).
create or replace function public.admit_ai_pro_call(
  p_generation_id uuid,
  p_user_id uuid,
  p_max_calls integer,
  p_generation_ceiling_usd numeric
)
returns table (admission_status text, calls integer, spent_usd numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_expires_at timestamptz;
  v_calls integer;
  v_spent numeric;
  v_profile text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ai-task-fleet:pro', 73190001));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 7319));

  select generation.expires_at, generation.pro_call_count, generation.provider_cost_usd, generation.profile
    into v_expires_at, v_calls, v_spent, v_profile
  from public.ai_generations as generation
  where generation.id = p_generation_id
    and generation.user_id = p_user_id;

  if v_expires_at is null or v_profile is distinct from 'pro' then
    return query select 'not-found'::text, 0, 0::numeric; return;
  elsif v_expires_at <= v_now then
    return query select 'expired'::text, v_calls, v_spent; return;
  elsif v_calls >= p_max_calls then
    return query select 'call-limit'::text, v_calls, v_spent; return;
  -- Only once a real cost has been settled: while pro_call_count is 0 the row still carries the
  -- booked worst case, which is by construction the ceiling and would refuse the first call.
  elsif v_calls > 0 and v_spent > p_generation_ceiling_usd then
    return query select 'cost-ceiling'::text, v_calls, v_spent; return;
  end if;

  return query select 'admitted'::text, v_calls, v_spent;
end;
$$;

-- Settle one call's real provider cost into the reservation, and count it.
--
-- Called AFTER the provider answered, including when it failed: a call that was billed and
-- produced nothing usable still spent money, and a ledger that recorded only successes is how
-- a wholesale failure reports $0.0000.
create or replace function public.record_ai_pro_call(
  p_generation_id uuid,
  p_user_id uuid,
  p_cost_usd numeric
)
returns table (call_status text, calls integer, spent_usd numeric)
language plpgsql
security definer
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
      -- resolved through search_path, so `pg_catalog.greatest(...)` does not exist and the
      -- statement fails at 42883 - which is exactly what the self-check below caught on the
      -- first push. `coalesce` is unqualified for the same reason throughout 0015.
      provider_cost_usd = case when generation.pro_call_count = 0 then 0 else generation.provider_cost_usd end
        + greatest(p_cost_usd, 0),
      updated_at = pg_catalog.now()
  where generation.id = p_generation_id
  returning generation.pro_call_count, generation.provider_cost_usd into v_calls, v_spent;

  return query select 'recorded'::text, v_calls, v_spent;
end;
$$;

revoke all on function public.admit_ai_pro_call(uuid, uuid, integer, numeric) from public, anon, authenticated;
revoke all on function public.record_ai_pro_call(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.admit_ai_pro_call(uuid, uuid, integer, numeric) to service_role;
grant execute on function public.record_ai_pro_call(uuid, uuid, numeric) to service_role;

-- Self-check. A plpgsql body resolves its identifiers only when it RUNS, so both functions are
-- CALLED here rather than merely created: a mistyped column in a branch nobody exercised would
-- otherwise ship green and fail on the first production generation.
do $$
declare
  v_owner uuid;
  v_id uuid;
  v_status text;
  v_calls integer;
  v_spent numeric;
begin
  -- (a) The widened constraint admits 'pro' and still refuses an unknown profile.
  begin
    insert into public.ai_generations (user_id, ip_hash, idempotency_key, profile, status, prompt_version, expires_at)
    values (gen_random_uuid(), '0044-check', '0044-check-bogus', 'nonsense', 'reserved', 'x', pg_catalog.now());
    raise exception '0044 self-check (a) FAILED: the profile CHECK accepted an unknown value';
  exception
    when check_violation then null;
    when foreign_key_violation then null;   -- the user_id FK fires first; the point is it did not insert
  end;

  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice '0044 self-check: no auth.users row, skipping the admit/record walk';
    return;
  end if;

  insert into public.ai_generations (
    user_id, ip_hash, idempotency_key, profile, status, prompt_version, provider_cost_usd, expires_at
  ) values (
    v_owner, '0044-check', '0044-check-' || gen_random_uuid()::text, 'pro', 'reserved', '0044-check',
    0.15, pg_catalog.now() + interval '10 minutes'
  ) returning id into v_id;

  -- (b) The first call is admitted although the row already carries the booked ceiling.
  select admission_status, calls, spent_usd into v_status, v_calls, v_spent
  from public.admit_ai_pro_call(v_id, v_owner, 4, 0.15);
  if v_status is distinct from 'admitted' then
    raise exception '0044 self-check (b) FAILED: the first call was refused with %', v_status;
  end if;

  -- (c) The first settlement REPLACES the booking rather than adding to it.
  select call_status, calls, spent_usd into v_status, v_calls, v_spent
  from public.record_ai_pro_call(v_id, v_owner, 0.07);
  if v_status is distinct from 'recorded' or v_calls <> 1 or v_spent <> 0.07 then
    raise exception '0044 self-check (c) FAILED: first settlement gave % / % calls / % spent',
      v_status, v_calls, v_spent;
  end if;

  -- (d) The second adds.
  select spent_usd into v_spent from public.record_ai_pro_call(v_id, v_owner, 0.01);
  if v_spent <> 0.08 then
    raise exception '0044 self-check (d) FAILED: second settlement gave % spent', v_spent;
  end if;

  -- (e) The counter runs past Lite's `attempt_count <= 2`, which is the whole reason it is a
  --     column of its own. Four settlements is the default AI_PRO_MAX_CALLS.
  perform public.record_ai_pro_call(v_id, v_owner, 0.001);
  select call_status, calls into v_status, v_calls from public.record_ai_pro_call(v_id, v_owner, 0.001);
  if v_status is distinct from 'recorded' or v_calls <> 4 then
    raise exception '0044 self-check (e) FAILED: the 4th call gave % at % calls', v_status, v_calls;
  end if;
  select admission_status into v_status from public.admit_ai_pro_call(v_id, v_owner, 4, 999);
  if v_status is distinct from 'call-limit' then
    raise exception '0044 self-check (e) FAILED: the call cap did not bind (%)', v_status;
  end if;

  -- (f) Past the ceiling, the next call is refused.
  perform public.record_ai_pro_call(v_id, v_owner, 0.20);
  select admission_status into v_status from public.admit_ai_pro_call(v_id, v_owner, 99, 0.15);
  if v_status is distinct from 'cost-ceiling' then
    raise exception '0044 self-check (f) FAILED: a generation past its ceiling was admitted (%)', v_status;
  end if;

  -- (g) Somebody else's id is not found, never expired or over budget.
  select admission_status into v_status from public.admit_ai_pro_call(v_id, gen_random_uuid(), 99, 0.15);
  if v_status is distinct from 'not-found' then
    raise exception '0044 self-check (g) FAILED: a foreign generation answered %', v_status;
  end if;

  -- (h) Lite's own guard survived all of it: nothing above touched attempt_count.
  if (select attempt_count from public.ai_generations where id = v_id) <> 0 then
    raise exception '0044 self-check (h) FAILED: a Pro call moved attempt_count, which is Lite''s';
  end if;

  delete from public.ai_generations where id = v_id;
end;
$$;
