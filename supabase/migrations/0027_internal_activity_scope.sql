-- Separate OUR OWN activity from everybody else's, everywhere the admin overview counts.
--
-- THE PROBLEM, measured on this instance before writing a line of it: all 43 rows in
-- `ai_generations`, 92 of 93 rows in `ai_gateway_requests`, all 3 renders and 4 of 6
-- `activation` events were produced by the operator's own accounts while building and testing
-- the product. Every AI number on the dashboard is therefore a number about us. A dashboard
-- that cannot tell its owner apart from its users does not answer the question it exists for.
--
-- WHY NOT `admin_users`. The obvious reading of "internal" is "an admin", and on this instance
-- it excludes NOTHING: the account that produced all 43 generations
-- (a throwaway test account) is not in `admin_users`, and the one account that IS has produced
-- none. Role and internal-ness are genuinely different facts - an admin can be a real user of
-- their own product, and a test account is internal without being an admin - so this is an
-- explicit mark, set deliberately per account, and not an inference from anything else.
--
-- WHY NOT AN EMAIL LIST IN CODE. A hard-coded address is a second authority on identity that
-- drifts the day an account is added, needs a deploy to change, and cannot be audited. The mark
-- lives on `user_accounts` beside suspension, is set through the existing admin user endpoint,
-- and therefore writes an `admin_audit_log` row like every other account change.
--
-- WHAT "SCOPE" MEANS. Three values, one vocabulary, on all three aggregate functions:
--
--   'external'  the default the dashboard reads. Internal accounts, and the browsers they
--               signed in from, are excluded.
--   'internal'  the exact complement, so the owner can still inspect their own activity for
--               debugging without it polluting the normal picture.
--   'all'       the unfiltered numbers these functions returned before this migration.
--
-- 'external' and 'internal' always sum to 'all'. That is the property that makes the filter
-- checkable, and the self-check at the bottom asserts it against the live tables.
--
-- THE HONEST LIMIT, which the page states as well. An account-keyed ledger filters exactly:
-- `ai_generations`, `ai_gateway_requests`, `render_jobs` and `auth.users` all carry a user id.
-- The FUNNEL does not, for most of its rows. A browser is excluded when it has ever carried an
-- internal user id on a funnel row - which reaches our own signed-in browsing and does NOT
-- reach signed-out development traffic, because nothing distinguishes it from a stranger's.
-- Every funnel figure under 'external' is therefore an upper bound on external activity, in
-- exactly the same direction as the opt-out and Do-Not-Track floor that docs/FUNNEL_EVENTS.md
-- already documents. Saying so is the alternative to the cross-identifier link that document
-- refuses to build.
--
-- Note the direction of the one link this DOES make: visitor -> "is internal" is used only to
-- REMOVE rows from a count. Nothing associates a visitor with an account in any output, and no
-- row of this database is written by it.
--
-- DROP-then-CREATE for all three, since the signatures change. A DROP discards the ACL, so the
-- revokes and the grants are re-asserted at the bottom - the mistake `0026` called out and
-- avoided for the same reason.

-- ── the mark ─────────────────────────────────────────────────────────────────────────────

alter table public.user_accounts
  add column if not exists internal boolean not null default false;

comment on column public.user_accounts.internal is
  'Operator-owned account: development, testing, demos. Excluded from the default admin '
  'overview scope. Not a role and not a permission - it changes no access whatsoever.';

-- A row exists here only once an admin has touched the account, so an unmarked account is
-- simply absent rather than present-and-false. Every read below is written to treat absent as
-- external, which is the safe direction: a new account is somebody else's until we say it is
-- ours.
create index if not exists user_accounts_internal_idx
  on public.user_accounts (user_id) where internal;

-- ── the scope guard ──────────────────────────────────────────────────────────────────────
-- Validated in ONE place rather than in each function, and it RAISES rather than coercing.
-- Quietly reading an unknown scope as 'all' would put internal activity back into the
-- external numbers with nothing on screen to say so, which is the exact failure this
-- migration exists to end.
create or replace function public.admin_scope(p_scope text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if p_scope is null or p_scope not in ('external', 'internal', 'all') then
    raise exception 'admin scope must be external, internal or all (got %)', coalesce(p_scope, 'null');
  end if;
  return p_scope;
end;
$$;
revoke all on function public.admin_scope(text) from public, anon, authenticated;
grant execute on function public.admin_scope(text) to service_role;

-- ── the internal sets, readable by the API too ───────────────────────────────────────────
-- Exposed as a function because the aggregation is not the only surface that needs it: the
-- Usage and cost section reads `ai_generations` straight through PostgREST and classifies in
-- JavaScript (docs/ADMIN.md §8 - "a metric that exists on more than one surface has to be
-- changed on all of them"), so it needs the same list rather than a second definition of who
-- is internal.
create or replace function public.admin_internal_user_ids()
returns setof uuid language sql security definer stable set search_path = '' as $$
  select a.user_id from public.user_accounts a where a.internal;
$$;
revoke all on function public.admin_internal_user_ids() from public, anon, authenticated;
grant execute on function public.admin_internal_user_ids() to service_role;

-- ── one window ───────────────────────────────────────────────────────────────────────────

drop function if exists public.admin_overview_window(timestamptz, timestamptz);

create function public.admin_overview_window(
  p_from timestamptz,
  p_to timestamptz,
  p_scope text
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
  -- ONE row, computed once and cross-joined into every count below, so the two membership
  -- sets are gathered a single time however many aggregates read them.
  --
  -- The predicate each count then carries reads the same everywhere:
  --     (s.mode = 'all' or <is-internal> = (s.mode = 'internal'))
  -- true for every row when the scope is 'all', for internal rows when it is 'internal', and
  -- for the rest when it is 'external'. Written out per subquery rather than hidden in a
  -- helper, because these are the lines a reader has to be able to check.
  with s as (
    select
      public.admin_scope(p_scope) as mode,
      coalesce(
        (select pg_catalog.array_agg(a.user_id) from public.user_accounts a where a.internal),
        '{}'::uuid[]
      ) as users,
      -- A browser that has ever been signed in as an internal account. See the header for what
      -- this reaches and what it cannot.
      coalesce(
        (select pg_catalog.array_agg(distinct f.visitor_id)
           from public.funnel_events f
           join public.user_accounts a on a.user_id = f.user_id and a.internal),
        '{}'::uuid[]
      ) as visitors
  )
  select
    -- ACCOUNTS. The auth directory is the only place a registration exists; the funnel's
    -- `signup` event is email-path-only by design (docs/FUNNEL_EVENTS.md) and would undercount
    -- every OAuth account, so it is reported separately below rather than used as this number.
    (select count(*) from auth.users u, s
      where u.created_at >= p_from and u.created_at < p_to
        and (s.mode = 'all' or (u.id = any(s.users)) = (s.mode = 'internal'))),

    -- ACTIVITY. A visitor id is a BROWSER, not a person: one human on a phone and a laptop is
    -- two. The account count next to it is the same window restricted to rows that carried a
    -- signed-in token, which is the only unique-PERSON number this ledger can honestly produce.
    --
    -- `coalesce(..., false)` on the user test throughout: an anonymous row yields NULL from
    -- `= any(...)`, and NULL would drop it from the EXTERNAL scope - silently deleting exactly
    -- the traffic this dashboard cares most about.
    (select count(distinct f.visitor_id) from public.funnel_events f, s
      where f.created_at >= p_from and f.created_at < p_to
        and (s.mode = 'all'
             or (coalesce(f.user_id = any(s.users), false) or f.visitor_id = any(s.visitors))
                = (s.mode = 'internal'))),
    (select count(distinct f.user_id) from public.funnel_events f, s
      where f.user_id is not null and f.created_at >= p_from and f.created_at < p_to
        and (s.mode = 'all' or (f.user_id = any(s.users)) = (s.mode = 'internal'))),
    (select count(*) from public.funnel_events f, s
      where f.event in ('visit', 'return') and f.created_at >= p_from and f.created_at < p_to
        and (s.mode = 'all'
             or (coalesce(f.user_id = any(s.users), false) or f.visitor_id = any(s.visitors))
                = (s.mode = 'internal'))),
    (select count(*) from public.funnel_events f, s
      where f.event = 'signup' and f.created_at >= p_from and f.created_at < p_to
        and (s.mode = 'all'
             or (coalesce(f.user_id = any(s.users), false) or f.visitor_id = any(s.visitors))
                = (s.mode = 'internal'))),

    -- CREATION. One activation row per create. 'video' is the video project's door and every
    -- other door produces an SPX graphic, so the split is a `detail` test rather than a second
    -- event - which is what keeps a graphic and a video counted by the same rule.
    (select count(*) from public.funnel_events f, s
      where f.event = 'activation' and f.detail is distinct from 'video'
        and f.created_at >= p_from and f.created_at < p_to
        and (s.mode = 'all'
             or (coalesce(f.user_id = any(s.users), false) or f.visitor_id = any(s.visitors))
                = (s.mode = 'internal'))),
    (select count(*) from public.funnel_events f, s
      where f.event = 'activation' and f.detail = 'video'
        and f.created_at >= p_from and f.created_at < p_to
        and (s.mode = 'all'
             or (coalesce(f.user_id = any(s.users), false) or f.visitor_id = any(s.visitors))
                = (s.mode = 'internal'))),
    (select count(distinct f.visitor_id) from public.funnel_events f, s
      where f.event = 'activation' and f.created_at >= p_from and f.created_at < p_to
        and (s.mode = 'all'
             or (coalesce(f.user_id = any(s.users), false) or f.visitor_id = any(s.visitors))
                = (s.mode = 'internal'))),

    -- FIRST-TIME creators: created in this window, and never before it. An anti-join over
    -- (visitor_id, created_at), which funnel_events_visitor_created_idx already serves. The
    -- "returning creator" number is this subtracted from the creator count, so the two can
    -- never add up to something other than the whole.
    --
    -- The anti-join itself is deliberately UNSCOPED: it asks whether THIS visitor ever created
    -- before, and the visitor has already passed the scope test. Filtering it again would let
    -- a browser that changed scope-membership read as a first-timer twice.
    (select count(*) from (
      select distinct f.visitor_id
      from public.funnel_events f, s
      where f.event = 'activation' and f.created_at >= p_from and f.created_at < p_to
        and (s.mode = 'all'
             or (coalesce(f.user_id = any(s.users), false) or f.visitor_id = any(s.visitors))
                = (s.mode = 'internal'))
        and not exists (
          select 1 from public.funnel_events e
          where e.visitor_id = f.visitor_id and e.event = 'activation' and e.created_at < p_from
        )
    ) first_timers),

    (select count(*) from public.funnel_events f, s
      where f.event = 'activation' and f.user_id is null
        and f.created_at >= p_from and f.created_at < p_to
        and (s.mode = 'all' or (f.visitor_id = any(s.visitors)) = (s.mode = 'internal'))),
    (select count(*) from public.funnel_events f, s
      where f.event = 'activation' and f.user_id is not null
        and f.created_at >= p_from and f.created_at < p_to
        and (s.mode = 'all'
             or (f.user_id = any(s.users) or f.visitor_id = any(s.visitors)) = (s.mode = 'internal'))),

    -- WITHOUT AN ACCOUNT. The editor has no login wall (root AGENTS.md, "Auth posture"), so how
    -- much gets MADE by people who never sign up is a first-class product question rather than a
    -- footnote - it is the free core's whole promise, measured. Graphics only, matching the
    -- graphics/videos split above, and the creator count beside it so one enthusiastic anonymous
    -- visitor cannot read as adoption.
    --
    -- These rows carry no user id at all, so only the browser test can apply - which is the
    -- sharpest form of the header's limit: our own signed-out creating is counted as somebody
    -- else's unless that browser has signed in at some point.
    (select count(*) from public.funnel_events f, s
      where f.event = 'activation' and f.detail is distinct from 'video' and f.user_id is null
        and f.created_at >= p_from and f.created_at < p_to
        and (s.mode = 'all' or (f.visitor_id = any(s.visitors)) = (s.mode = 'internal'))),
    (select count(distinct f.visitor_id) from public.funnel_events f, s
      where f.event = 'activation' and f.user_id is null
        and f.created_at >= p_from and f.created_at < p_to
        and (s.mode = 'all' or (f.visitor_id = any(s.visitors)) = (s.mode = 'internal'))),

    -- EXPORTS. The event fires after the zip reaches the disk, so every row is a SUCCESS.
    -- There is no failure counterpart, which is stated on the page rather than implied by a
    -- success rate the ledger cannot compute.
    (select count(*) from public.funnel_events f, s
      where f.event = 'export' and f.created_at >= p_from and f.created_at < p_to
        and (s.mode = 'all'
             or (coalesce(f.user_id = any(s.users), false) or f.visitor_id = any(s.visitors))
                = (s.mode = 'internal'))),
    (select count(distinct f.visitor_id) from public.funnel_events f, s
      where f.event = 'export' and f.created_at >= p_from and f.created_at < p_to
        and (s.mode = 'all'
             or (coalesce(f.user_id = any(s.users), false) or f.visitor_id = any(s.visitors))
                = (s.mode = 'internal'))),
    (select count(*) from public.funnel_events f, s
      where f.event = 'export' and f.user_id is null
        and f.created_at >= p_from and f.created_at < p_to
        and (s.mode = 'all' or (f.visitor_id = any(s.visitors)) = (s.mode = 'internal'))),

    -- AI, the NoaCG-funded half: the Lite ledger. A row per reservation, so the count is
    -- attempts and the success/failure pair below it does not sum to it - a generation still
    -- running is neither. `ai_generations.user_id` is NOT NULL, so the scope test is exact
    -- here: no upper bound, no caveat.
    (select count(*) from public.ai_generations g, s
      where g.created_at >= p_from and g.created_at < p_to
        and (s.mode = 'all' or (g.user_id = any(s.users)) = (s.mode = 'internal'))),
    (select count(*) from public.ai_generations g, s
      where g.status in ('usable', 'accepted') and g.created_at >= p_from and g.created_at < p_to
        and (s.mode = 'all' or (g.user_id = any(s.users)) = (s.mode = 'internal'))),
    -- FAILED = the generation broke. `expired` is a reservation nobody came back for, which is
    -- an abandoned tab rather than a fault, and `unsupported` is the next column (0026).
    (select count(*) from public.ai_generations g, s
      where g.status = 'failed' and g.created_at >= p_from and g.created_at < p_to
        and (s.mode = 'all' or (g.user_id = any(s.users)) = (s.mode = 'internal'))),
    -- DECLINED = Lite refused a brief outside its scope. The guardrail FIRING, and the product
    -- behaving exactly as designed - so it is reported next to the failures and never inside
    -- them.
    (select count(*) from public.ai_generations g, s
      where g.status = 'unsupported' and g.created_at >= p_from and g.created_at < p_to
        and (s.mode = 'all' or (g.user_id = any(s.users)) = (s.mode = 'internal'))),
    (select count(distinct g.user_id) from public.ai_generations g, s
      where g.created_at >= p_from and g.created_at < p_to
        and (s.mode = 'all' or (g.user_id = any(s.users)) = (s.mode = 'internal'))),
    -- SPEND, over rows that actually reached a provider (0026). A row with no route recorded
    -- still carries the reservation's cost CEILING rather than anything spent.
    (select coalesce(sum(g.provider_cost_usd), 0) from public.ai_generations g, s
      where g.model is not null and g.created_at >= p_from and g.created_at < p_to
        and (s.mode = 'all' or (g.user_id = any(s.users)) = (s.mode = 'internal'))),

    -- AI, the gateway: split by WHO PAID. `managed` is NoaCG's money and belongs in the spend
    -- figure; `byo` is the user's own key and must never be added to it (0012 keeps the two
    -- tables apart for the same reason).
    (select count(*) from public.ai_gateway_requests r, s
      where r.key_source = 'managed' and r.created_at >= p_from and r.created_at < p_to
        and (s.mode = 'all' or coalesce(r.user_id = any(s.users), false) = (s.mode = 'internal'))),
    (select count(*) from public.ai_gateway_requests r, s
      where r.key_source = 'byo' and r.created_at >= p_from and r.created_at < p_to
        and (s.mode = 'all' or coalesce(r.user_id = any(s.users), false) = (s.mode = 'internal'))),
    -- AI with NO ACCOUNT AT ALL. Deliberately NOT the same question as the `byo` split above -
    -- anonymity and whose key paid are independent. Anonymous by definition, so it can never be
    -- attributed to an internal account and is therefore ZERO under the 'internal' scope: an
    -- honest zero, not a filtered one.
    (select count(*) from public.ai_gateway_requests r, s
      where r.user_id is null and r.created_at >= p_from and r.created_at < p_to
        and (s.mode = 'all' or s.mode = 'external')),
    (select coalesce(sum(r.provider_cost_usd), 0) from public.ai_gateway_requests r, s
      where r.key_source = 'managed' and r.created_at >= p_from and r.created_at < p_to
        and (s.mode = 'all' or coalesce(r.user_id = any(s.users), false) = (s.mode = 'internal'))),
    (select count(*) from public.ai_gateway_requests r, s
      where r.outcome <> 'ok' and r.created_at >= p_from and r.created_at < p_to
        and (s.mode = 'all' or coalesce(r.user_id = any(s.users), false) = (s.mode = 'internal'))),

    -- RENDERS, all three by SUBMISSION time, so a job submitted near the window edge and
    -- finished after it counts as started here and delivered nowhere.
    (select count(*) from public.render_jobs j, s
      where j.created_at >= p_from and j.created_at < p_to
        and (s.mode = 'all' or coalesce(j.user_id = any(s.users), false) = (s.mode = 'internal'))),
    -- DELIVERED = it finished, whether or not the file still exists. `expired` is reachable
    -- only from `complete` (api/render/cleanup.ts), so including it is what makes this number
    -- stable: on `complete` alone it would decay to zero as outputs age out (0026).
    (select count(*) from public.render_jobs j, s
      where j.status in ('complete', 'expired') and j.created_at >= p_from and j.created_at < p_to
        and (s.mode = 'all' or coalesce(j.user_id = any(s.users), false) = (s.mode = 'internal'))),
    -- FAILED = actually failed. Not `cancelled`, and emphatically not `expired`.
    (select count(*) from public.render_jobs j, s
      where j.status = 'failed' and j.created_at >= p_from and j.created_at < p_to
        and (s.mode = 'all' or coalesce(j.user_id = any(s.users), false) = (s.mode = 'internal'))),
    -- Median over `complete` only: expiring a job overwrites updated_at with the deletion
    -- time, so a delivered-but-expired row cannot contribute a real duration (0026).
    (select percentile_cont(0.5) within group (
       order by extract(epoch from (j.updated_at - j.created_at)) * 1000
     )::bigint
     from public.render_jobs j, s
      where j.status = 'complete' and j.created_at >= p_from and j.created_at < p_to
        and (s.mode = 'all' or coalesce(j.user_id = any(s.users), false) = (s.mode = 'internal')))
$$;

-- ── the standing picture ─────────────────────────────────────────────────────────────────

drop function if exists public.admin_overview_state();

create function public.admin_overview_state(p_scope text)
returns table (
  total_accounts bigint,
  suspended_accounts bigint,
  accounts_never_created bigint,
  internal_accounts bigint,
  active_grants bigint,
  grants_expiring_soon bigint,
  renders_in_flight bigint,
  renders_overdue bigint,
  accounts_since timestamptz,
  funnel_since timestamptz,
  generations_since timestamptz,
  gateway_since timestamptz,
  renders_since timestamptz
)
language sql
security definer
set search_path = ''
as $$
  with s as (
    select
      public.admin_scope(p_scope) as mode,
      coalesce(
        (select pg_catalog.array_agg(a.user_id) from public.user_accounts a where a.internal),
        '{}'::uuid[]
      ) as users,
      coalesce(
        (select pg_catalog.array_agg(distinct f.visitor_id)
           from public.funnel_events f
           join public.user_accounts a on a.user_id = f.user_id and a.internal),
        '{}'::uuid[]
      ) as visitors
  )
  select
    (select count(*) from auth.users u, s
      where s.mode = 'all' or (u.id = any(s.users)) = (s.mode = 'internal')),
    (select count(*) from public.user_accounts a, s
      where a.state = 'suspended'
        and (s.mode = 'all' or a.internal = (s.mode = 'internal'))),

    -- Registered and has never created anything. It reads funnel rows ATTRIBUTED to the
    -- account, and attribution only happens when the visitor was signed in at the time - so
    -- somebody who built a graphic before signing up counts here. The page says so; the
    -- alternative (joining a browser id to an account) would be exactly the cross-identifier
    -- link docs/FUNNEL_EVENTS.md refuses to build.
    (select count(*) from auth.users u, s
      where (s.mode = 'all' or (u.id = any(s.users)) = (s.mode = 'internal'))
        and not exists (
          select 1 from public.funnel_events f
          where f.user_id = u.id and f.event = 'activation'
        )),

    -- How many accounts are marked internal, ALWAYS unfiltered. This is the number that makes
    -- the filter itself legible: an operator seeing "0 internal accounts" beside an external
    -- scope knows the exclusion is doing nothing, which is the difference between a working
    -- filter and one nobody has configured.
    (select count(*) from public.user_accounts a where a.internal),

    (select count(*) from public.user_grants g, s
      where g.revoked_at is null
        and (g.starts_at is null or g.starts_at <= pg_catalog.now())
        and (g.expires_at is null or g.expires_at > pg_catalog.now())
        and (s.mode = 'all' or (g.user_id = any(s.users)) = (s.mode = 'internal'))),
    (select count(*) from public.user_grants g, s
      where g.revoked_at is null
        and g.expires_at is not null
        and g.expires_at > pg_catalog.now()
        and g.expires_at <= pg_catalog.now() + interval '7 days'
        and (s.mode = 'all' or (g.user_id = any(s.users)) = (s.mode = 'internal'))),

    (select count(*) from public.render_jobs j, s
      where j.status not in ('complete', 'failed', 'cancelled', 'expired')
        and j.deadline_at > pg_catalog.now()
        and (s.mode = 'all' or coalesce(j.user_id = any(s.users), false) = (s.mode = 'internal'))),
    -- Past its own deadline and still not terminal: the sweep has not caught it, which is a
    -- different problem from a queue that is merely busy.
    (select count(*) from public.render_jobs j, s
      where j.status not in ('complete', 'failed', 'cancelled', 'expired')
        and j.deadline_at <= pg_catalog.now()
        and (s.mode = 'all' or coalesce(j.user_id = any(s.users), false) = (s.mode = 'internal'))),

    -- How far back each ledger goes, ONE FLOOR PER LEDGER, and SCOPED like everything else.
    -- That is deliberate rather than incidental: under an external scope the honest floor is
    -- the first row the scope counts, because a ledger whose early months are entirely our own
    -- testing genuinely has no external history before that. An unscoped floor would let a
    -- comparison span be judged complete over a stretch in which the external ledger was
    -- empty, which is the same "counting began" artefact the floors exist to suppress.
    (select min(u.created_at) from auth.users u, s
      where s.mode = 'all' or (u.id = any(s.users)) = (s.mode = 'internal')),
    (select min(f.created_at) from public.funnel_events f, s
      where s.mode = 'all'
        or (coalesce(f.user_id = any(s.users), false) or f.visitor_id = any(s.visitors))
           = (s.mode = 'internal')),
    (select min(g.created_at) from public.ai_generations g, s
      where s.mode = 'all' or (g.user_id = any(s.users)) = (s.mode = 'internal')),
    (select min(r.created_at) from public.ai_gateway_requests r, s
      where s.mode = 'all' or coalesce(r.user_id = any(s.users), false) = (s.mode = 'internal')),
    (select min(j.created_at) from public.render_jobs j, s
      where s.mode = 'all' or coalesce(j.user_id = any(s.users), false) = (s.mode = 'internal'))
$$;

-- ── the enumerated distributions ─────────────────────────────────────────────────────────

drop function if exists public.admin_overview_mix(timestamptz, timestamptz);

create function public.admin_overview_mix(
  p_from timestamptz,
  p_to timestamptz,
  p_scope text
)
-- `total`, not `count`: a RETURNS TABLE column is an OUT parameter and its name is in scope in
-- the body, so calling one `count` puts a parameter and the aggregate in the same namespace.
returns table (bucket text, key text, total bigint)
language sql
security definer
set search_path = ''
as $$
  -- Every `key` below is a value this codebase itself writes from a fixed set: a creation
  -- door, an export target id, a render format, or a rejection/outcome code. None of them is
  -- user text, and `detail` additionally carries the 0016 CHECK constraint.
  with s as (
    select
      public.admin_scope(p_scope) as mode,
      coalesce(
        (select pg_catalog.array_agg(a.user_id) from public.user_accounts a where a.internal),
        '{}'::uuid[]
      ) as users,
      coalesce(
        (select pg_catalog.array_agg(distinct f.visitor_id)
           from public.funnel_events f
           join public.user_accounts a on a.user_id = f.user_id and a.internal),
        '{}'::uuid[]
      ) as visitors
  )
  (select 'creation-door'::text, coalesce(f.detail, 'unknown'), count(*)
     from public.funnel_events f, s
     where f.event = 'activation' and f.created_at >= p_from and f.created_at < p_to
       and (s.mode = 'all'
            or (coalesce(f.user_id = any(s.users), false) or f.visitor_id = any(s.visitors))
               = (s.mode = 'internal'))
     group by 2 order by 3 desc limit 40)
  union all
  (select 'export-target'::text, coalesce(f.detail, 'unknown'), count(*)
     from public.funnel_events f, s
     where f.event = 'export' and f.created_at >= p_from and f.created_at < p_to
       and (s.mode = 'all'
            or (coalesce(f.user_id = any(s.users), false) or f.visitor_id = any(s.visitors))
               = (s.mode = 'internal'))
     group by 2 order by 3 desc limit 40)
  union all
  (select 'referrer'::text, f.referrer_host, count(*)
     from public.funnel_events f, s
     where f.referrer_host is not null and f.created_at >= p_from and f.created_at < p_to
       and (s.mode = 'all'
            or (coalesce(f.user_id = any(s.users), false) or f.visitor_id = any(s.visitors))
               = (s.mode = 'internal'))
     group by 2 order by 3 desc limit 20)
  union all
  (select 'ai-failure'::text, g.rejection_reason, count(*)
     from public.ai_generations g, s
     where g.rejection_reason is not null and g.created_at >= p_from and g.created_at < p_to
       and (s.mode = 'all' or (g.user_id = any(s.users)) = (s.mode = 'internal'))
     group by 2 order by 3 desc limit 20)
  union all
  (select 'gateway-failure'::text, r.outcome, count(*)
     from public.ai_gateway_requests r, s
     where r.outcome <> 'ok' and r.created_at >= p_from and r.created_at < p_to
       and (s.mode = 'all' or coalesce(r.user_id = any(s.users), false) = (s.mode = 'internal'))
     group by 2 order by 3 desc limit 20)
  union all
  (select 'render-format'::text, j.format, count(*)
     from public.render_jobs j, s
     where j.created_at >= p_from and j.created_at < p_to
       and (s.mode = 'all' or coalesce(j.user_id = any(s.users), false) = (s.mode = 'internal'))
     group by 2 order by 3 desc limit 20)
$$;

-- ── grants ───────────────────────────────────────────────────────────────────────────────
-- Re-asserted because the DROPs above discarded the old ACLs. A dropped-and-recreated function
-- is PUBLIC-executable by default, so skipping this would put the instance's whole activity
-- ledger on the REST surface (docs/ADMIN.md §1) - the mistake 0026 names explicitly.
revoke all on function public.admin_overview_window(timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.admin_overview_state(text) from public, anon, authenticated;
revoke all on function public.admin_overview_mix(timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.admin_overview_window(timestamptz, timestamptz, text) to service_role;
grant execute on function public.admin_overview_state(text) to service_role;
grant execute on function public.admin_overview_mix(timestamptz, timestamptz, text) to service_role;

-- ── self-check ───────────────────────────────────────────────────────────────────────────
-- The property that makes this filter checkable rather than merely plausible: external and
-- internal must PARTITION all. Asserted against the live tables over all time, so it holds on
-- this instance and on an empty one, and it fails the moment a subquery's predicate is written
-- in a way that drops or double-counts a row - which is exactly the mistake a hand-repeated
-- WHERE clause invites.
do $$
declare
  v_all record;
  v_ext record;
  v_int record;
  v_from timestamptz := pg_catalog.now() - interval '3650 days';
  v_to timestamptz := pg_catalog.now();
begin
  if pg_catalog.has_function_privilege('authenticated', 'public.admin_overview_window(timestamptz, timestamptz, text)', 'execute')
     or pg_catalog.has_function_privilege('anon', 'public.admin_overview_state(text)', 'execute')
     or pg_catalog.has_function_privilege('authenticated', 'public.admin_overview_mix(timestamptz, timestamptz, text)', 'execute')
     or pg_catalog.has_function_privilege('authenticated', 'public.admin_internal_user_ids()', 'execute')
  then
    raise exception 'the admin overview functions must not be executable by a client role';
  end if;

  select * into v_all from public.admin_overview_window(v_from, v_to, 'all');
  select * into v_ext from public.admin_overview_window(v_from, v_to, 'external');
  select * into v_int from public.admin_overview_window(v_from, v_to, 'internal');
  if v_all is null or v_ext is null or v_int is null then
    raise exception 'admin_overview_window returned no row';
  end if;

  -- Every additive COUNT column. The two distinct-visitor and distinct-account columns are
  -- excluded on purpose: a visitor counted in both halves would be double-counted by a sum,
  -- and `active_accounts` can legitimately not partition. Only the row counts are additive,
  -- and only they are asserted - an assertion that is true by luck is worse than none.
  if v_all.visits <> v_ext.visits + v_int.visits
     or v_all.graphics_created <> v_ext.graphics_created + v_int.graphics_created
     or v_all.videos_created <> v_ext.videos_created + v_int.videos_created
     or v_all.exports <> v_ext.exports + v_int.exports
     or v_all.ai_generations <> v_ext.ai_generations + v_int.ai_generations
     or v_all.ai_successes <> v_ext.ai_successes + v_int.ai_successes
     or v_all.ai_failures <> v_ext.ai_failures + v_int.ai_failures
     or v_all.ai_declined <> v_ext.ai_declined + v_int.ai_declined
     or v_all.renders_started <> v_ext.renders_started + v_int.renders_started
     or v_all.renders_delivered <> v_ext.renders_delivered + v_int.renders_delivered
     or v_all.renders_failed <> v_ext.renders_failed + v_int.renders_failed
     or v_all.gateway_managed <> v_ext.gateway_managed + v_int.gateway_managed
     or v_all.gateway_byo <> v_ext.gateway_byo + v_int.gateway_byo
     or v_all.new_accounts <> v_ext.new_accounts + v_int.new_accounts
  then
    raise exception 'external + internal does not partition all - a scope predicate is wrong';
  end if;

  -- Money too, at the ledger's own precision.
  if v_all.ai_cost_usd <> v_ext.ai_cost_usd + v_int.ai_cost_usd
     or v_all.gateway_managed_cost_usd <> v_ext.gateway_managed_cost_usd + v_int.gateway_managed_cost_usd
  then
    raise exception 'spend does not partition across the scopes';
  end if;

  -- An anonymous gateway call can never belong to an account, so the internal scope must
  -- report zero rather than "whatever the predicate happened to do with a NULL".
  if v_int.anonymous_gateway_calls <> 0 then
    raise exception 'the internal scope claimed account-free AI calls';
  end if;

  -- The scope guard raises rather than coercing. Verified rather than assumed, because a
  -- silent fallback to 'all' would put internal activity back into the external numbers with
  -- nothing on screen to say so.
  begin
    perform public.admin_overview_state('everything');
    raise exception 'an unknown scope was accepted';
  exception
    when others then
      if sqlerrm like 'an unknown scope was accepted%' then raise; end if;
  end;
end;
$$;
