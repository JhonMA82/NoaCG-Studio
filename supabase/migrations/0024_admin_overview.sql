-- The admin overview's aggregation, in SQL rather than in a serverless function.
--
-- WHY THIS IS NOT THE `usage.ts` PATTERN. Every other admin read pages a bounded slice into
-- JavaScript and sums it there, because the Supabase client cannot express GROUP BY and the
-- slices are small (docs/ADMIN.md §6). That trade does not survive contact with
-- `funnel_events`: it takes a row per PAGE LOAD, so a month of it is the one table on this
-- instance that can outgrow a 20 000-row read - and the overview needs six windows of it at
-- once. Reading it into the function would be the "count a large dataset in application
-- memory" mistake, so the counting happens where the indexes are.
--
-- THREE FUNCTIONS, split by what they are asking, not by table:
--   * admin_overview_window(from, to)  - everything countable inside one time window. Called
--     once per window (today, week, month, and the elapsed-matched previous span of each), so
--     the REPORTING TIMEZONE stays entirely in TypeScript: this function is told two instants
--     and never decides what "today" means. That is deliberate - a day boundary defined in two
--     places is a day boundary that will disagree with itself.
--   * admin_overview_state()           - the standing picture: totals, suspensions, grants
--     about to expire, work in flight, and how far back each ledger actually goes.
--   * admin_overview_mix(from, to)     - the enumerated distributions (creation door, export
--     target, failure reason, render format), as (bucket, key, count) rows.
--
-- CONTENT-FREE, like every ledger it reads. Ids, enumerated slugs and counts. `detail` is
-- already regex-constrained to a short lowercase slug by 0016, the failure reasons are strings
-- this codebase writes, and nothing here can reach a prompt, a brief, a template, a project
-- name or a piece of free text.
--
-- SECURITY DEFINER because they read `auth.users` and four server-write-only tables, and
-- REVOKED from every client role: the admin API calls them with the service key, having
-- already authorized the caller itself (api/_lib/adminAuth.ts). They are not on the REST
-- surface, so they are not a probe for whether an admin system exists.

-- ── indexes the three functions actually need ────────────────────────────────────────────
-- funnel_events already indexes (created_at), (event, created_at) and (visitor_id, created_at)
-- - which covers the window counts and the first-time-creator anti-join. What it has never
-- had is an account-side lookup, which is what "registered but has never created anything"
-- walks.
create index if not exists funnel_events_user_event_idx
  on public.funnel_events (user_id, event) where user_id is not null;

-- render_jobs indexes (user_id, created_at) and (ip_hash, created_at), so a whole-fleet window
-- scan has no leading column to seek on.
create index if not exists render_jobs_created_idx
  on public.render_jobs (created_at desc);

-- ── one window ───────────────────────────────────────────────────────────────────────────

create or replace function public.admin_overview_window(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  new_accounts bigint,
  active_visitors bigint,
  active_accounts bigint,
  visits bigint,
  signups bigint,
  graphics_created bigint,
  videos_created bigint,
  creating_visitors bigint,
  first_time_creators bigint,
  anonymous_creates bigint,
  signed_in_creates bigint,
  exports bigint,
  exporting_visitors bigint,
  ai_generations bigint,
  ai_successes bigint,
  ai_failures bigint,
  ai_users bigint,
  ai_cost_usd numeric,
  gateway_managed bigint,
  gateway_byo bigint,
  gateway_managed_cost_usd numeric,
  gateway_failures bigint,
  renders_started bigint,
  renders_completed bigint,
  renders_failed bigint,
  render_median_ms bigint
)
language sql
security definer
set search_path = ''
as $$
  select
    -- ACCOUNTS. The auth directory is the only place a registration exists; the funnel's
    -- `signup` event is email-path-only by design (docs/FUNNEL_EVENTS.md) and would undercount
    -- every OAuth account, so it is reported separately below rather than used as this number.
    (select count(*) from auth.users u
      where u.created_at >= p_from and u.created_at < p_to),

    -- ACTIVITY. A visitor id is a BROWSER, not a person: one human on a phone and a laptop is
    -- two. The account count next to it is the same window restricted to rows that carried a
    -- signed-in token, which is the only unique-PERSON number this ledger can honestly produce.
    (select count(distinct f.visitor_id) from public.funnel_events f
      where f.created_at >= p_from and f.created_at < p_to),
    (select count(distinct f.user_id) from public.funnel_events f
      where f.user_id is not null and f.created_at >= p_from and f.created_at < p_to),
    (select count(*) from public.funnel_events f
      where f.event in ('visit', 'return') and f.created_at >= p_from and f.created_at < p_to),
    (select count(*) from public.funnel_events f
      where f.event = 'signup' and f.created_at >= p_from and f.created_at < p_to),

    -- CREATION. One activation row per create. 'video' is the video project's door and every
    -- other door produces an SPX graphic, so the split is a `detail` test rather than a second
    -- event - which is what keeps a graphic and a video counted by the same rule.
    (select count(*) from public.funnel_events f
      where f.event = 'activation' and f.detail is distinct from 'video'
        and f.created_at >= p_from and f.created_at < p_to),
    (select count(*) from public.funnel_events f
      where f.event = 'activation' and f.detail = 'video'
        and f.created_at >= p_from and f.created_at < p_to),
    (select count(distinct f.visitor_id) from public.funnel_events f
      where f.event = 'activation' and f.created_at >= p_from and f.created_at < p_to),

    -- FIRST-TIME creators: created in this window, and never before it. An anti-join over
    -- (visitor_id, created_at), which funnel_events_visitor_created_idx already serves. The
    -- "returning creator" number is this subtracted from the creator count, so the two can
    -- never add up to something other than the whole.
    (select count(*) from (
      select distinct f.visitor_id
      from public.funnel_events f
      where f.event = 'activation' and f.created_at >= p_from and f.created_at < p_to
        and not exists (
          select 1 from public.funnel_events e
          where e.visitor_id = f.visitor_id and e.event = 'activation' and e.created_at < p_from
        )
    ) first_timers),

    (select count(*) from public.funnel_events f
      where f.event = 'activation' and f.user_id is null
        and f.created_at >= p_from and f.created_at < p_to),
    (select count(*) from public.funnel_events f
      where f.event = 'activation' and f.user_id is not null
        and f.created_at >= p_from and f.created_at < p_to),

    -- EXPORTS. The event fires after the zip reaches the disk, so every row is a SUCCESS.
    -- There is no failure counterpart, which is stated on the page rather than implied by a
    -- success rate the ledger cannot compute.
    (select count(*) from public.funnel_events f
      where f.event = 'export' and f.created_at >= p_from and f.created_at < p_to),
    (select count(distinct f.visitor_id) from public.funnel_events f
      where f.event = 'export' and f.created_at >= p_from and f.created_at < p_to),

    -- AI, the NoaCG-funded half: the Lite ledger. A row per reservation, so the count is
    -- attempts and the success/failure pair below it does not sum to it - a generation still
    -- running is neither.
    (select count(*) from public.ai_generations g
      where g.created_at >= p_from and g.created_at < p_to),
    (select count(*) from public.ai_generations g
      where g.status in ('usable', 'accepted') and g.created_at >= p_from and g.created_at < p_to),
    (select count(*) from public.ai_generations g
      where g.status in ('failed', 'unsupported', 'expired')
        and g.created_at >= p_from and g.created_at < p_to),
    (select count(distinct g.user_id) from public.ai_generations g
      where g.created_at >= p_from and g.created_at < p_to),
    (select coalesce(sum(g.provider_cost_usd), 0) from public.ai_generations g
      where g.created_at >= p_from and g.created_at < p_to),

    -- AI, the gateway: split by WHO PAID. `managed` is NoaCG's money and belongs in the spend
    -- figure; `byo` is the user's own key and must never be added to it (0012 keeps the two
    -- tables apart for the same reason).
    (select count(*) from public.ai_gateway_requests r
      where r.key_source = 'managed' and r.created_at >= p_from and r.created_at < p_to),
    (select count(*) from public.ai_gateway_requests r
      where r.key_source = 'byo' and r.created_at >= p_from and r.created_at < p_to),
    (select coalesce(sum(r.provider_cost_usd), 0) from public.ai_gateway_requests r
      where r.key_source = 'managed' and r.created_at >= p_from and r.created_at < p_to),
    (select count(*) from public.ai_gateway_requests r
      where r.outcome <> 'ok' and r.created_at >= p_from and r.created_at < p_to),

    -- RENDERS. Started is by submission time; completed and failed are by submission time too,
    -- so a job that starts near the window edge and finishes after it counts as started here
    -- and completed nowhere. That is the honest reading of a per-row created_at, and it is why
    -- the page shows the three as counts rather than as a success rate.
    (select count(*) from public.render_jobs j
      where j.created_at >= p_from and j.created_at < p_to),
    (select count(*) from public.render_jobs j
      where j.status = 'complete' and j.created_at >= p_from and j.created_at < p_to),
    (select count(*) from public.render_jobs j
      where j.status in ('failed', 'expired') and j.created_at >= p_from and j.created_at < p_to),
    (select percentile_cont(0.5) within group (
       order by extract(epoch from (j.updated_at - j.created_at)) * 1000
     )::bigint
     from public.render_jobs j
      where j.status = 'complete' and j.created_at >= p_from and j.created_at < p_to)
$$;

-- ── the standing picture ─────────────────────────────────────────────────────────────────

create or replace function public.admin_overview_state()
returns table (
  total_accounts bigint,
  suspended_accounts bigint,
  accounts_never_created bigint,
  active_grants bigint,
  grants_expiring_soon bigint,
  renders_in_flight bigint,
  renders_overdue bigint,
  funnel_since timestamptz,
  generations_since timestamptz,
  renders_since timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    (select count(*) from auth.users),
    (select count(*) from public.user_accounts a where a.state = 'suspended'),

    -- Registered and has never created anything. It reads funnel rows ATTRIBUTED to the
    -- account, and attribution only happens when the visitor was signed in at the time - so
    -- somebody who built a graphic before signing up counts here. The page says so; the
    -- alternative (joining a browser id to an account) would be exactly the cross-identifier
    -- link docs/FUNNEL_EVENTS.md refuses to build.
    (select count(*) from auth.users u
      where not exists (
        select 1 from public.funnel_events f
        where f.user_id = u.id and f.event = 'activation'
      )),

    (select count(*) from public.user_grants g
      where g.revoked_at is null
        and (g.starts_at is null or g.starts_at <= pg_catalog.now())
        and (g.expires_at is null or g.expires_at > pg_catalog.now())),
    (select count(*) from public.user_grants g
      where g.revoked_at is null
        and g.expires_at is not null
        and g.expires_at > pg_catalog.now()
        and g.expires_at <= pg_catalog.now() + interval '7 days'),

    (select count(*) from public.render_jobs j
      where j.status not in ('complete', 'failed', 'cancelled', 'expired')
        and j.deadline_at > pg_catalog.now()),
    -- Past its own deadline and still not terminal: the sweep has not caught it, which is a
    -- different problem from a queue that is merely busy.
    (select count(*) from public.render_jobs j
      where j.status not in ('complete', 'failed', 'cancelled', 'expired')
        and j.deadline_at <= pg_catalog.now()),

    -- How far back each ledger goes. A "this month" that predates one of these is short for a
    -- reason the operator cannot otherwise see, and a missing floor is what turns partial
    -- history into a wrong conclusion.
    (select min(f.created_at) from public.funnel_events f),
    (select min(g.created_at) from public.ai_generations g),
    (select min(j.created_at) from public.render_jobs j)
$$;

-- ── the enumerated distributions ─────────────────────────────────────────────────────────

create or replace function public.admin_overview_mix(
  p_from timestamptz,
  p_to timestamptz
)
-- `total`, not `count`: a RETURNS TABLE column is an OUT parameter and its name is in scope in
-- the body, so calling one `count` puts a parameter and the aggregate in the same namespace.
-- It would very likely resolve correctly and there is no reason to find out.
returns table (bucket text, key text, total bigint)
language sql
security definer
set search_path = ''
as $$
  -- Every `key` below is a value this codebase itself writes from a fixed set: a creation
  -- door, an export target id, a render format, or a rejection/outcome code. None of them is
  -- user text, and `detail` additionally carries the 0016 CHECK constraint. The cap is a
  -- backstop for a code path that starts emitting something unbounded, not an expectation.
  (select 'creation-door'::text, coalesce(f.detail, 'unknown'), count(*)
     from public.funnel_events f
     where f.event = 'activation' and f.created_at >= p_from and f.created_at < p_to
     group by 2 order by 3 desc limit 40)
  union all
  (select 'export-target'::text, coalesce(f.detail, 'unknown'), count(*)
     from public.funnel_events f
     where f.event = 'export' and f.created_at >= p_from and f.created_at < p_to
     group by 2 order by 3 desc limit 40)
  union all
  (select 'referrer'::text, f.referrer_host, count(*)
     from public.funnel_events f
     where f.referrer_host is not null and f.created_at >= p_from and f.created_at < p_to
     group by 2 order by 3 desc limit 20)
  union all
  (select 'ai-failure'::text, g.rejection_reason, count(*)
     from public.ai_generations g
     where g.rejection_reason is not null and g.created_at >= p_from and g.created_at < p_to
     group by 2 order by 3 desc limit 20)
  union all
  (select 'gateway-failure'::text, r.outcome, count(*)
     from public.ai_gateway_requests r
     where r.outcome <> 'ok' and r.created_at >= p_from and r.created_at < p_to
     group by 2 order by 3 desc limit 20)
  union all
  (select 'render-format'::text, j.format, count(*)
     from public.render_jobs j
     where j.created_at >= p_from and j.created_at < p_to
     group by 2 order by 3 desc limit 20)
$$;

-- ── grants ───────────────────────────────────────────────────────────────────────────────
-- Off the REST surface entirely. PostgREST publishes every function a client role may execute
-- as /rest/v1/rpc/<name>, and an executable admin_overview_* would both leak the instance's
-- numbers and confirm that an admin system exists - the two things docs/ADMIN.md §1 spends its
-- whole posture avoiding.
revoke all on function public.admin_overview_window(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_overview_state() from public, anon, authenticated;
revoke all on function public.admin_overview_mix(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_overview_window(timestamptz, timestamptz) to service_role;
grant execute on function public.admin_overview_state() to service_role;
grant execute on function public.admin_overview_mix(timestamptz, timestamptz) to service_role;

-- ── self-check ───────────────────────────────────────────────────────────────────────────
-- 0020 and 0022 established the pattern: a migration that grants itself privileges proves the
-- lockdown rather than asking to be trusted. Here the risk is narrower - these functions read
-- but never write - so the proof is narrower too: they must be unreachable from a client role,
-- and they must actually execute rather than being syntactically valid and broken at runtime.
do $$
declare
  v_count bigint;
begin
  if pg_catalog.has_function_privilege('authenticated', 'public.admin_overview_window(timestamptz, timestamptz)', 'execute')
     or pg_catalog.has_function_privilege('anon', 'public.admin_overview_state()', 'execute')
     or pg_catalog.has_function_privilege('authenticated', 'public.admin_overview_mix(timestamptz, timestamptz)', 'execute')
  then
    raise exception 'admin overview functions must not be executable by a client role';
  end if;

  select w.graphics_created into v_count
  from public.admin_overview_window(pg_catalog.now() - interval '1 day', pg_catalog.now()) w;
  if v_count is null then
    raise exception 'admin_overview_window returned no row';
  end if;

  perform 1 from public.admin_overview_state();
  perform 1 from public.admin_overview_mix(pg_catalog.now() - interval '1 day', pg_catalog.now());
end;
$$;
