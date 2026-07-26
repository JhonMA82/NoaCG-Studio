-- Server-write-only Creative AI generation ledger. It records accounting and
-- machine-readable outcomes, never prompts, assets, DesignSpecs, templates, code,
-- provider response bodies, or raw IP addresses.

create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ip_hash text not null,
  idempotency_key text not null,
  profile text not null check (profile = 'lite'),
  status text not null check (
    status in ('reserved', 'model_running', 'spec_ready', 'usable', 'accepted', 'unsupported', 'failed', 'expired')
  ),
  prompt_version text not null,
  requested_category text,
  resolved_category text,
  provider text,
  model text,
  attempt_count integer not null default 0 check (attempt_count >= 0 and attempt_count <= 2),
  repair_count integer not null default 0 check (repair_count >= 0 and repair_count <= 1),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  reasoning_tokens integer not null default 0 check (reasoning_tokens >= 0),
  provider_cost_usd numeric(12, 8) not null default 0 check (provider_cost_usd >= 0),
  validation_rule_codes text[] not null default '{}',
  runtime_ms integer check (runtime_ms is null or runtime_ms >= 0),
  rejection_reason text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists ai_generations_user_created_idx
  on public.ai_generations (user_id, created_at desc);
create index if not exists ai_generations_status_expires_idx
  on public.ai_generations (status, expires_at);
create index if not exists ai_generations_created_cost_idx
  on public.ai_generations (created_at, provider_cost_usd);

alter table public.ai_generations enable row level security;
-- No client policies by design. Server functions use the Supabase secret key.
revoke all on table public.ai_generations from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_generations to service_role;

create or replace function public.ai_generations_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists ai_generations_updated_at on public.ai_generations;
create trigger ai_generations_updated_at
before update on public.ai_generations
for each row execute function public.ai_generations_set_updated_at();

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
  from public.ai_generations as generation;
$$;

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
  -- The global lock makes fleet concurrency and spend admission atomic. The
  -- per-user lock independently prevents parallel requests from bypassing that
  -- user's allowance. Every caller takes the locks in this order.
  perform pg_catalog.pg_advisory_xact_lock(73190001);
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
  from public.ai_lite_usage(p_user_id, v_now);

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
    p_user_id, p_ip_hash, p_idempotency_key, 'lite', 'reserved',
    p_prompt_version, p_requested_category, p_session_cost_ceiling_usd, p_expires_at
  ) returning id into v_id;

  return query select 'created'::text, v_id;
end;
$$;

revoke all on function public.ai_lite_usage(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.reserve_ai_lite_generation(
  uuid, text, text, text, text, timestamptz, integer, integer, integer,
  integer, integer, integer, numeric, numeric
) from public, anon, authenticated;
revoke all on function public.ai_generations_set_updated_at() from public, anon, authenticated;
grant execute on function public.ai_lite_usage(uuid, timestamptz) to service_role;
grant execute on function public.reserve_ai_lite_generation(
  uuid, text, text, text, text, timestamptz, integer, integer, integer,
  integer, integer, integer, numeric, numeric
) to service_role;
