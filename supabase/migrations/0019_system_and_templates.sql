-- Operational controls and template administration (docs/ADMIN.md).
--
-- Everything an operator currently has to redeploy to change - whether a model route may serve
-- traffic, whether a broken feature stays reachable, whether visitors see a notice - becomes a
-- row. The values are read server-side with the service key; exactly ONE narrow read is exposed
-- to the browser, and it carries only what a visitor is entitled to know.
--
-- What deliberately does NOT become a row: model routes themselves. A setting can DISABLE an
-- approved route, never introduce one. The catalog in api/_lib/aiModelCatalog.ts is audited and
-- benchmarked at promotion time (docs/AI_TASK_REGISTRY.md), and a database row that could add a
-- route would route paid traffic to an unreviewed model. Disabling fails closed; enabling
-- something new stays a code change with a review.

-- ── system_settings: one row per named control ───────────────────────────────────────────────
-- Keyed by a stable name with a jsonb value, rather than a column per control: these are ops
-- knobs whose shape changes as features are added, and a migration per knob would be friction
-- exactly where speed matters (an incident).
create table if not exists public.system_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.system_settings enable row level security;   -- no policy ⇒ invisible to clients
revoke all on table public.system_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.system_settings to service_role;

-- The ONLY public read. It returns the maintenance notice and the list of features currently
-- switched off - both of which a visitor sees the effects of anyway, so publishing them costs
-- nothing and lets the app explain itself instead of appearing broken. Everything else in the
-- table (beta cohorts, model routing) stays server-side.
create or replace function public.public_system_notice()
returns jsonb language sql security definer set search_path = '' stable as $$
  select jsonb_build_object(
    'notice', coalesce((select s.value from public.system_settings s where s.key = 'maintenance_notice'), 'null'::jsonb),
    'disabledFeatures', coalesce((select s.value from public.system_settings s where s.key = 'disabled_features'), '[]'::jsonb)
  );
$$;
revoke execute on function public.public_system_notice() from public;
grant execute on function public.public_system_notice() to anon, authenticated;

-- ── template_admin: visibility for catalog and community templates ───────────────────────────
-- The catalog is CODE (src/templates), so this table does not store templates - it stores an
-- overlay keyed by template id. A row exists only for a template whose visibility has been
-- changed from the default, which is why the absence of a row means 'public'.
--
-- There is deliberately NO min_plan column. Catalog templates are free-forever core and work
-- offline, where no entitlement can be checked; a paywall column would be both unenforceable
-- and a contradiction of docs/GOALS.md. Visibility answers "is this ready for everyone yet",
-- which is a different question.
create table if not exists public.template_admin (
  template_key  text primary key,
  source        text not null check (source in ('catalog', 'community')),
  visibility    text not null default 'public' check (visibility in ('public', 'beta', 'internal', 'hidden')),
  note          text not null default '',
  updated_by    uuid references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now()
);

create index if not exists template_admin_visibility_idx on public.template_admin (visibility);

alter table public.template_admin enable row level security;   -- no policy ⇒ invisible to clients
revoke all on table public.template_admin from public, anon, authenticated;
grant select, insert, update, delete on table public.template_admin to service_role;

create trigger template_admin_set_updated_at before update on public.template_admin
  for each row execute function public.set_updated_at();
