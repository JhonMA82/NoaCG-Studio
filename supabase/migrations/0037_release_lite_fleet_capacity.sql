-- Fleet concurrency protects provider work, not browser-side validation. A generation
-- in `spec_ready` has already released its provider request; counting it globally meant
-- a closed tab could make Lite look full until the 15-minute outcome expiry.
--
-- Keep `spec_ready` in active_for_user: one user still may not start a second generation
-- while the first is being compiled and validated. Failed rows and every row past
-- expires_at remain inactive in both dimensions.

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
      where generation.status in ('reserved', 'model_running')
        and generation.expires_at > p_now
    ),
    coalesce(sum(generation.provider_cost_usd) filter (
      where generation.created_at >= p_now - interval '1 day'
    ), 0)
  from public.ai_generations as generation
  where generation.profile = p_profile;
$$;

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

revoke all on function public.ai_task_usage(text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.ai_lite_usage(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ai_task_usage(text, uuid, timestamptz) to service_role;
grant execute on function public.ai_lite_usage(uuid, timestamptz) to service_role;
