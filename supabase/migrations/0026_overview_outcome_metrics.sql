-- Correct what the admin overview calls a FAILURE, and what it calls SPEND.
--
-- ONE MISTAKE, MADE THREE TIMES in `0024`, and worth naming as a shape rather than as three
-- bugs: a terminal state that means "the system did its job" was counted as a state that means
-- "the system broke". An `expired` render is a delivered one whose file aged out. An
-- `unsupported` generation is Lite CORRECTLY refusing a brief outside its scope - the guardrail
-- firing, not the guardrail failing. Both were folded into a failure count, and both produced
-- exactly the outcome this dashboard exists to prevent: a number that sends an operator to
-- investigate a subsystem that is working. Production read "0 completed, 6 failed" about
-- rendering that had delivered four of six, and 26 AI "failures" of which seven were refusals
-- the product is designed to make.
--
-- The third correction is about money rather than states; it is at the bottom.
--
-- THE DEFECT `0024` SHIPPED. It counted `renders_failed` as `status in ('failed','expired')`
-- and `renders_completed` as `status = 'complete'`. Both readings are wrong, and together they
-- reported this instance's rendering as "0 completed, 6 failed" when four of those six renders
-- had in fact rendered every frame and been delivered to the person who asked for them.
--
-- `expired` IS A SUCCESS. It is written in exactly one place - `api/render/cleanup.ts`, in the
-- branch guarded by `job.state === 'complete'`, and `listSweepable` only offers rows already at
-- `status = 'complete'` as candidates. So the state is unreachable except FROM completion: it
-- means "this render finished, its output was downloadable, and the TTL cron has since deleted
-- the blob and kept the row for accounting". Counting it beside a genuine `failed` was the
-- single worst kind of number this dashboard can produce - one an operator would act on.
--
-- And `complete` IS TRANSIENT, which is the other half of the same mistake. Every successful
-- render leaves it once its output ages out, so a "completed" count built on it decays toward
-- zero on a healthy instance. The honest question is "did it ever finish", which is
-- `complete OR expired`, and that is what `renders_delivered` now answers. The old
-- `renders_completed` column is dropped rather than kept alongside: two adjacent columns
-- differing only by whether the file still exists is how the first confusion started.
--
-- WHAT IS NOT FIXED HERE, deliberately. `render_median_ms` still measures only `complete` rows.
-- It cannot widen to the delivered set, because expiring a job WRITES to the row: `updated_at`
-- then holds the moment the blob was deleted, not the moment the render finished, and this
-- instance's expired rows read as 40-hour "renders" because of it. Measuring a duration for
-- them would need a completion timestamp the schema does not record. So the median stays
-- narrow and the page says what it covers - a smaller true number instead of a bigger false
-- one.
--
-- AND `ai_cost_usd` OVERSTATED SPEND, by design colliding with a different purpose.
-- `reserve_ai_lite_generation` (`0010`) books the SESSION COST CEILING into
-- `provider_cost_usd` at reservation time, so the fleet-budget admission check is conservative
-- before a single token is spent. That is right for admission and wrong as an answer to "what
-- did this cost us": a generation that dies before reaching a provider keeps the ceiling
-- forever. On this instance eleven such rows carried a uniform $0.007 each - $0.077 of a
-- reported $0.091, overstating real spend by more than six times.
--
-- The discriminator is whether a ROUTE WAS EVER RECORDED. A row with no `model` never reached
-- a provider, so its cost is still the placeholder; a row that ran always has one. So the spend
-- figures now sum only over `model is not null`, which also excludes still-reserved rows that
-- have genuinely not spent anything yet. Nothing is estimated and no placeholder is guessed at
-- - the rule is "count what actually ran".
--
-- DROP-then-CREATE rather than CREATE OR REPLACE: the column set changes, and Postgres refuses
-- to replace a function whose return type differs. A DROP also discards the ACL, so the revokes
-- and the grant are re-asserted below rather than assumed to have survived - that is the whole
-- reason this migration re-states them.

drop function if exists public.admin_overview_window(timestamptz, timestamptz);

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
  anonymous_graphics bigint,
  anonymous_creators bigint,
  exports bigint,
  exporting_visitors bigint,
  anonymous_exports bigint,
  ai_generations bigint,
  ai_successes bigint,
  ai_failures bigint,
  ai_declined bigint,
  ai_users bigint,
  ai_cost_usd numeric,
  gateway_managed bigint,
  gateway_byo bigint,
  anonymous_gateway_calls bigint,
  gateway_managed_cost_usd numeric,
  gateway_failures bigint,
  renders_started bigint,
  renders_delivered bigint,
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

    -- WITHOUT AN ACCOUNT. The editor has no login wall (root AGENTS.md, "Auth posture"), so how
    -- much gets MADE by people who never sign up is a first-class product question rather than a
    -- footnote - it is the free core's whole promise, measured. Graphics only, matching the
    -- graphics/videos split above, and the creator count beside it so one enthusiastic anonymous
    -- visitor cannot read as adoption.
    (select count(*) from public.funnel_events f
      where f.event = 'activation' and f.detail is distinct from 'video' and f.user_id is null
        and f.created_at >= p_from and f.created_at < p_to),
    (select count(distinct f.visitor_id) from public.funnel_events f
      where f.event = 'activation' and f.user_id is null
        and f.created_at >= p_from and f.created_at < p_to),

    -- EXPORTS. The event fires after the zip reaches the disk, so every row is a SUCCESS.
    -- There is no failure counterpart, which is stated on the page rather than implied by a
    -- success rate the ledger cannot compute.
    (select count(*) from public.funnel_events f
      where f.event = 'export' and f.created_at >= p_from and f.created_at < p_to),
    (select count(distinct f.visitor_id) from public.funnel_events f
      where f.event = 'export' and f.created_at >= p_from and f.created_at < p_to),
    -- An export with no account is the free core delivering its whole value to someone the
    -- product will never see again, which is the point rather than a leak.
    (select count(*) from public.funnel_events f
      where f.event = 'export' and f.user_id is null
        and f.created_at >= p_from and f.created_at < p_to),

    -- AI, the NoaCG-funded half: the Lite ledger. A row per reservation, so the count is
    -- attempts and the success/failure pair below it does not sum to it - a generation still
    -- running is neither.
    (select count(*) from public.ai_generations g
      where g.created_at >= p_from and g.created_at < p_to),
    (select count(*) from public.ai_generations g
      where g.status in ('usable', 'accepted') and g.created_at >= p_from and g.created_at < p_to),
    -- FAILED = the generation broke. `expired` is a reservation nobody came back for, which is
    -- an abandoned tab rather than a fault, and `unsupported` is the next column.
    (select count(*) from public.ai_generations g
      where g.status = 'failed'
        and g.created_at >= p_from and g.created_at < p_to),
    -- DECLINED = Lite refused a brief outside its scope (multi-graphic, advanced state machine,
    -- too complex). The guardrail FIRING, and the product behaving exactly as designed - so it
    -- is reported next to the failures and never inside them. It is still worth watching: a
    -- rising decline rate is people asking for something Lite cannot do yet.
    (select count(*) from public.ai_generations g
      where g.status = 'unsupported'
        and g.created_at >= p_from and g.created_at < p_to),
    (select count(distinct g.user_id) from public.ai_generations g
      where g.created_at >= p_from and g.created_at < p_to),
    -- SPEND, over rows that actually reached a provider - see the header. A row with no route
    -- recorded still carries the reservation's cost CEILING rather than anything spent.
    (select coalesce(sum(g.provider_cost_usd), 0) from public.ai_generations g
      where g.model is not null and g.created_at >= p_from and g.created_at < p_to),

    -- AI, the gateway: split by WHO PAID. `managed` is NoaCG's money and belongs in the spend
    -- figure; `byo` is the user's own key and must never be added to it (0012 keeps the two
    -- tables apart for the same reason).
    (select count(*) from public.ai_gateway_requests r
      where r.key_source = 'managed' and r.created_at >= p_from and r.created_at < p_to),
    (select count(*) from public.ai_gateway_requests r
      where r.key_source = 'byo' and r.created_at >= p_from and r.created_at < p_to),
    -- AI with NO ACCOUNT AT ALL. Deliberately NOT the same question as the `byo` split above -
    -- anonymity and whose key paid are independent, and prod already has an anonymous call on
    -- the MANAGED key, so reading this as "account-free BYO" would be wrong. The Lite ledger
    -- cannot answer it either (ai_generations.user_id is NOT NULL, so hosted generation always
    -- has an account behind it), which makes this the only place account-free AI is counted.
    (select count(*) from public.ai_gateway_requests r
      where r.user_id is null and r.created_at >= p_from and r.created_at < p_to),
    (select coalesce(sum(r.provider_cost_usd), 0) from public.ai_gateway_requests r
      where r.key_source = 'managed' and r.created_at >= p_from and r.created_at < p_to),
    (select count(*) from public.ai_gateway_requests r
      where r.outcome <> 'ok' and r.created_at >= p_from and r.created_at < p_to),

    -- RENDERS, all three by SUBMISSION time, so a job submitted near the window edge and
    -- finished after it counts as started here and delivered nowhere. That is the honest
    -- reading of a per-row created_at, and it is why these stay counts rather than a rate.
    (select count(*) from public.render_jobs j
      where j.created_at >= p_from and j.created_at < p_to),
    -- DELIVERED = it finished, whether or not the file still exists. `expired` is reachable
    -- only from `complete` (api/render/cleanup.ts), so including it is what makes this number
    -- stable: on `complete` alone it would decay to zero as outputs age out.
    (select count(*) from public.render_jobs j
      where j.status in ('complete', 'expired') and j.created_at >= p_from and j.created_at < p_to),
    -- FAILED = actually failed. Not `cancelled`, which is somebody changing their mind, and
    -- emphatically not `expired`.
    (select count(*) from public.render_jobs j
      where j.status = 'failed' and j.created_at >= p_from and j.created_at < p_to),
    -- Median over `complete` only - see the header: expiring a job overwrites updated_at with
    -- the deletion time, so a delivered-but-expired row cannot contribute a real duration.
    (select percentile_cont(0.5) within group (
       order by extract(epoch from (j.updated_at - j.created_at)) * 1000
     )::bigint
     from public.render_jobs j
      where j.status = 'complete' and j.created_at >= p_from and j.created_at < p_to)
$$;

-- Re-asserted because the DROP above discarded the old ACL. A dropped-and-recreated function
-- is PUBLIC-executable by default, so skipping this would put the instance's whole activity
-- ledger on the REST surface (docs/ADMIN.md §1).
revoke all on function public.admin_overview_window(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_overview_window(timestamptz, timestamptz) to service_role;

-- ── self-check ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_delivered bigint;
  v_failed bigint;
  v_ai_failed bigint;
  v_ai_declined bigint;
  v_cost numeric;
begin
  if pg_catalog.has_function_privilege('authenticated', 'public.admin_overview_window(timestamptz, timestamptz)', 'execute')
     or pg_catalog.has_function_privilege('anon', 'public.admin_overview_window(timestamptz, timestamptz)', 'execute')
  then
    raise exception 'admin_overview_window must not be executable by a client role';
  end if;

  select w.renders_delivered, w.renders_failed, w.ai_failures, w.ai_declined, w.ai_cost_usd
    into v_delivered, v_failed, v_ai_failed, v_ai_declined, v_cost
  from public.admin_overview_window(pg_catalog.now() - interval '3650 days', pg_catalog.now()) w;
  if v_delivered is null or v_failed is null or v_ai_failed is null or v_ai_declined is null then
    raise exception 'admin_overview_window returned no row';
  end if;

  -- The AI half of the same defect, asserted against the table for the same reason.
  if v_ai_failed <> (select count(*) from public.ai_generations where status = 'failed') then
    raise exception 'ai_failures disagrees with the ai_generations table';
  end if;
  if v_ai_declined <> (select count(*) from public.ai_generations where status = 'unsupported') then
    raise exception 'ai_declined disagrees with the ai_generations table';
  end if;
  -- Spend must exclude every row that never reached a provider, since those still carry the
  -- reservation ceiling. Stated as the arithmetic rather than as a fixed number, so it holds on
  -- any instance including an empty one.
  if v_cost <> (select coalesce(sum(provider_cost_usd), 0) from public.ai_generations where model is not null) then
    raise exception 'ai_cost_usd is counting rows that never reached a provider';
  end if;

  -- The defect in one assertion: over all time, delivered must equal the rows that reached
  -- completion and failed must exclude every expired one. Read straight off the table, so this
  -- compares the function against the data rather than against its own definition.
  if v_delivered <> (select count(*) from public.render_jobs where status in ('complete', 'expired')) then
    raise exception 'renders_delivered disagrees with the render_jobs table';
  end if;
  if v_failed <> (select count(*) from public.render_jobs where status = 'failed') then
    raise exception 'renders_failed disagrees with the render_jobs table';
  end if;
end;
$$;
