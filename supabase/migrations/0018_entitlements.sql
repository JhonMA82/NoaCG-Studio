-- Entitlements: account state, plans, assignments, and per-user grants (docs/ADMIN.md §2).
--
-- The MEANING of these rows lives in src/entitlements/contract.ts, not here. This migration
-- only stores them, and stores them in the shapes that module already merges, so there is one
-- precedence order (default < plan < temporary grant < manual override) expressed once.
--
-- THE NEUTRALITY RULE, restated because it constrains the schema: a numeric limit of NULL means
-- "inherit whatever the server already used". The seeded default plan sets every number to NULL,
-- so applying this migration changes nobody's access. That is asserted in
-- api/_lib/entitlements.test.ts and must stay true.
--
-- HOW SUSPENSION IS ENFORCED, and why it is the safest available shape: the existing write
-- policies on documents, assets, community_templates and control_shows are NOT edited. Postgres
-- ANDs RESTRICTIVE policies with the permissive ones, so a suspension check ships as its own
-- policy per table and the live, verified rules stay byte-for-byte as they were. A mistake here
-- can only ever deny too much - it cannot widen anyone's access, and reverting is a DROP POLICY.
--
-- READ ACCESS IS DELIBERATELY UNTOUCHED. A suspended user can still open and export their own
-- work. Suspension stops someone from producing more load and more content; it is not a way to
-- take their data away from them.
--
-- Known limit, stated in docs/ADMIN.md §6: an access token already issued stays valid until it
-- expires. These policies stop database writes immediately, the API handlers check per request,
-- and banning the account stops refresh - but there is a window, and it is a property of
-- stateless JWTs rather than something this migration can close.

-- ── account state ────────────────────────────────────────────────────────────────────────────
-- One row per user who has ever had a non-default state. A user with no row is active, so
-- suspension costs one insert and reactivation is honest about its history through the audit log.
create table if not exists public.user_accounts (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  state       text not null default 'active' check (state in ('active', 'suspended')),
  reason      text not null default '',
  changed_by  uuid references auth.users (id) on delete set null,
  changed_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

alter table public.user_accounts enable row level security;   -- no policy ⇒ invisible to clients
revoke all on table public.user_accounts from public, anon, authenticated;
grant select, insert, update, delete on table public.user_accounts to service_role;

-- Is the given user suspended? SECURITY DEFINER so the RLS policies below can read the locked
-- table above. STABLE, and it takes the id as an argument rather than reading auth.uid() itself,
-- so a future admin surface can ask about someone else with the same function.
create or replace function public.is_suspended(p_user uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.user_accounts a where a.user_id = p_user and a.state = 'suspended'
  );
$$;
revoke execute on function public.is_suspended(uuid) from public, anon;
grant execute on function public.is_suspended(uuid) to authenticated;

-- ── the suspension gate: restrictive, additive, per table ────────────────────────────────────
-- Written out per table rather than looped, because each one is a live access rule and a reader
-- reviewing this migration should see exactly which tables changed and which operations.
--
-- DELETE is deliberately absent everywhere: a suspended user removing their own rows harms
-- nobody, and blocking it would be spite rather than protection.

create policy "documents_not_suspended_insert" on public.documents
  as restrictive for insert to authenticated
  with check (not public.is_suspended((select auth.uid())));
create policy "documents_not_suspended_update" on public.documents
  as restrictive for update to authenticated
  using (not public.is_suspended((select auth.uid())))
  with check (not public.is_suspended((select auth.uid())));

create policy "assets_not_suspended_insert" on public.assets
  as restrictive for insert to authenticated
  with check (not public.is_suspended((select auth.uid())));
create policy "assets_not_suspended_update" on public.assets
  as restrictive for update to authenticated
  using (not public.is_suspended((select auth.uid())))
  with check (not public.is_suspended((select auth.uid())));

create policy "community_not_suspended_insert" on public.community_templates
  as restrictive for insert to authenticated
  with check (not public.is_suspended((select auth.uid())));
create policy "community_not_suspended_update" on public.community_templates
  as restrictive for update to authenticated
  using (not public.is_suspended((select auth.uid())))
  with check (not public.is_suspended((select auth.uid())));

create policy "control_shows_not_suspended_insert" on public.control_shows
  as restrictive for insert to authenticated
  with check (not public.is_suspended((select auth.uid())));
create policy "control_shows_not_suspended_update" on public.control_shows
  as restrictive for update to authenticated
  using (not public.is_suspended((select auth.uid())))
  with check (not public.is_suspended((select auth.uid())));

-- Uploads too, or suspension would still leave a way to consume storage. Scoped to the private
-- user bucket by the bucket_id disjunction: a restrictive policy applies to every row of
-- storage.objects, so anything outside 'user-assets' must be allowed through untouched.
create policy "user_assets_not_suspended_insert" on storage.objects
  as restrictive for insert to authenticated
  with check (bucket_id <> 'user-assets' or not public.is_suspended((select auth.uid())));

-- ── plans ────────────────────────────────────────────────────────────────────────────────────
-- Plan keys and names are DATA. Nothing in the codebase branches on a particular key, which is
-- why `key` is a free text column with no CHECK: creating, renaming or archiving a plan must
-- never need a release.
create table if not exists public.plans (
  id              uuid primary key default gen_random_uuid(),
  key             text not null unique,
  name            text not null,
  description     text not null default '',
  status          text not null default 'active' check (status in ('active', 'archived')),
  is_default      boolean not null default false,
  -- Feature key -> boolean. A key the plan omits falls through to the built-in default, so an
  -- older plan row keeps working when a new FeatureKey ships.
  features        jsonb not null default '{}'::jsonb,
  -- Limit key -> number or null. NULL means inherit; see the neutrality rule above.
  limits          jsonb not null default '{}'::jsonb,
  -- Which src/render/limits.ts tier this plan renders at. Text, not an enum: the render tier
  -- table is code, and an unknown value is ignored by the resolver rather than breaking a plan.
  render_tier     text not null default 'free',
  -- Cloud render output formats, or NULL for "whatever the tier already allows". LOCAL export
  -- targets are free-forever core and are deliberately not expressible here.
  render_formats  text[],
  -- BILLING PREP ONLY. No code reads this column. It exists so a future payment integration has
  -- a place to land without a schema change: {amount_cents, currency, interval, external_price_ref}.
  billing         jsonb not null default '{}'::jsonb,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id) on delete set null
);

-- Exactly one default. A partial unique index says it in the schema rather than in a comment,
-- so two concurrent admins cannot both mark their plan the default.
create unique index if not exists plans_one_default_idx on public.plans (is_default) where is_default;

alter table public.plans enable row level security;   -- no policy ⇒ invisible to clients
revoke all on table public.plans from public, anon, authenticated;
grant select, insert, update, delete on table public.plans to service_role;

create trigger plans_set_updated_at before update on public.plans
  for each row execute function public.set_updated_at();   -- reuse 0001's trigger fn

-- The seeded default. Every limit is NULL and every account feature is on, which is exactly what
-- a signed-in user has today - so this row is a starting point to edit, never a change.
insert into public.plans (key, name, description, is_default, features, limits, render_tier, sort_order)
values (
  'free',
  'Free',
  'Everything the product offers today. Every allowance inherits the server configuration.',
  true,
  '{"ai.lite":true,"ai.import-analysis":true,"ai.video":true,"ai.byo-key":true,"render.cloud":true,"sync.cloud":true,"community.publish":true,"control.hosted":true,"showchat":true,"templates.beta":false,"templates.internal":false}'::jsonb,
  '{}'::jsonb,
  'free',
  0
)
on conflict (key) do nothing;

-- ── plan assignment ──────────────────────────────────────────────────────────────────────────
-- One current assignment per user; the history is the audit log. `expires_at` makes a whole plan
-- temporary (a trial), which the resolver reads the same way it reads a temporary grant.
create table if not exists public.user_plans (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  plan_id      uuid not null references public.plans (id) on delete restrict,
  assigned_by  uuid references auth.users (id) on delete set null,
  assigned_at  timestamptz not null default now(),
  expires_at   timestamptz,
  note         text not null default ''
);

create index if not exists user_plans_plan_idx on public.user_plans (plan_id);
create index if not exists user_plans_expiry_idx on public.user_plans (expires_at) where expires_at is not null;

alter table public.user_plans enable row level security;   -- no policy ⇒ invisible to clients
revoke all on table public.user_plans from public, anon, authenticated;
grant select, insert, update, delete on table public.user_plans to service_role;

-- ── grants and overrides: ONE table ──────────────────────────────────────────────────────────
-- expires_at set  = a temporary access grant.
-- expires_at null = a permanent manual override.
-- They differ only in whether they end, and keeping them in one table is what keeps the
-- precedence order short enough to state in a single line.
--
-- Rows are never deleted on revoke: revoked_at is stamped instead, so "why did this user lose
-- access on the 3rd" stays answerable.
create table if not exists public.user_grants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('feature', 'quota')),
  -- A FeatureKey when kind is 'feature', a LimitKey when kind is 'quota'. Validated in the API
  -- against the contract's key lists, not here: the key set is code, and a CHECK constraint
  -- would need a migration every time a feature is added.
  key         text not null,
  -- {"value": true} or {"value": 500} or {"value": null}. Wrapped so the column can hold either
  -- type without two nullable columns that must be kept mutually exclusive.
  value       jsonb not null,
  reason      text not null default '',
  starts_at   timestamptz,
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- The resolver reads a user's ACTIVE grants on every entitlement check, so index the lookup it
-- actually performs.
create index if not exists user_grants_user_active_idx
  on public.user_grants (user_id) where revoked_at is null;
create index if not exists user_grants_expiry_idx
  on public.user_grants (expires_at) where expires_at is not null and revoked_at is null;

alter table public.user_grants enable row level security;   -- no policy ⇒ invisible to clients
revoke all on table public.user_grants from public, anon, authenticated;
grant select, insert, update, delete on table public.user_grants to service_role;
