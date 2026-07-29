-- The private admin surface: who may operate this instance, and an append-only record of what
-- they did (docs/ADMIN.md sections 3 and 5).
--
-- Posture, in one line: this table is not the API's gate. api/_lib/adminAuth.ts looks the caller
-- up with the service key on EVERY request and answers 404 for every failure mode, so an RLS
-- mistake cannot open an endpoint. is_admin() exists for the opposite direction - letting a
-- future policy grant an admin read access to a table - and is not a substitute for that check.
--
-- The role table follows the pattern proven by public.moderators (migration 0004): RLS enabled
-- with NO policies at all, so anon and authenticated cannot see it, cannot probe it, and cannot
-- learn whether a given account is privileged. Only the service_role and the SECURITY DEFINER
-- function below can read it.
--
-- The existing community `moderators` role is deliberately untouched: it is a different job
-- (gallery takedowns) with its own live-verified policies, and merging the two would rewrite
-- working access rules for no gain.

-- ── admin_users: the role table ──────────────────────────────────────────────────────────────
-- Roles are RANKED: owner > admin > support. A handler declares the minimum role it needs and
-- admin_role_rank() compares; adding a role later means one more branch here and nothing else.
create table if not exists public.admin_users (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'admin' check (role in ('owner', 'admin', 'support')),
  note        text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.admin_users enable row level security;   -- no policy ⇒ invisible to clients
revoke all on table public.admin_users from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_users to service_role;

-- ── role ranking + the RLS predicate ─────────────────────────────────────────────────────────
-- Immutable so it can be used inside indexes and policies without a re-plan penalty. An unknown
-- role ranks 0, below every real role: an unrecognised value must never grant more than it names.
create or replace function public.admin_role_rank(p_role text)
returns integer language sql immutable set search_path = '' as $$
  select case p_role when 'owner' then 3 when 'admin' then 2 when 'support' then 1 else 0 end;
$$;

-- Is the CURRENT user an admin of at least p_min_role? SECURITY DEFINER so a policy can read the
-- RLS-locked table above (a policy subquery runs as the CALLER's role, which has no SELECT here).
create or replace function public.is_admin(p_min_role text default 'support')
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
      and public.admin_role_rank(a.role) >= public.admin_role_rank(p_min_role)
  );
$$;

-- Supabase default-grants EXECUTE on new functions to anon AND authenticated, so revoking only
-- from `public` would leave anon able to call these. Revoke anon explicitly (0004's lesson).
revoke execute on function public.admin_role_rank(text) from public, anon;
revoke execute on function public.is_admin(text) from public, anon;
grant execute on function public.admin_role_rank(text) to authenticated;
grant execute on function public.is_admin(text) to authenticated;

-- ── admin_audit_log: append-only by PRIVILEGE, not by convention ─────────────────────────────
-- Every mutating admin action writes one row in the same request that performed it. There is no
-- UPDATE or DELETE grant to any role, including service_role: an operator who can edit the log
-- does not have a log. Retention trimming, if it is ever needed, ships as an explicit migration
-- that grants and then revokes the privilege.
--
-- Content-free in the same sense as the AI ledgers: identifiers, action names and short
-- summaries only. No tokens, no passwords, no prompt or template content, no raw IP addresses.
create table if not exists public.admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users (id) on delete set null,
  actor_email  text not null default '',   -- snapshot: auth.users is not joinable from the client
  actor_role   text not null default '',
  action       text not null,              -- e.g. 'user.suspend', 'plan.update', 'system.set'
  target_type  text not null default '',   -- 'user' | 'plan' | 'grant' | 'system' | 'template'
  target_id    text not null default '',
  summary      text not null default '',   -- one human-readable line for the log view
  detail       jsonb not null default '{}'::jsonb,
  ip_hash      text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists admin_audit_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_actor_idx on public.admin_audit_log (actor_id, created_at desc);
create index if not exists admin_audit_target_idx on public.admin_audit_log (target_type, target_id, created_at desc);

alter table public.admin_audit_log enable row level security;   -- no policy ⇒ invisible to clients
revoke all on table public.admin_audit_log from public, anon, authenticated;
grant select, insert on table public.admin_audit_log to service_role;
