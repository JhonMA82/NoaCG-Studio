-- Close arbitrary-user probing through the suspension and admin predicates (docs/ADMIN.md §3).
--
-- THE HOLE, reproduced on the live database before this was written: `0018` granted
-- `public.is_suspended(p_user uuid)` to `authenticated`, and PostgREST publishes every function
-- `authenticated` may execute as `/rest/v1/rpc/<name>`. So any signed-in user could ask
-- `is_suspended('<someone-else>')` and get a straight answer about an account that is not theirs.
-- Measured: an ordinary non-admin account read another user's suspension state as `true`.
-- Suspension state is moderation history - who has been sanctioned is nobody else's business.
--
-- `is_admin(min_role)` was NOT part of that hole: it takes a ROLE, never a user id, and reads
-- `auth.uid()` itself, so it can only ever answer about the caller. It is revoked below for a
-- different and smaller reason - nothing calls it, and an unused SECURITY DEFINER function
-- reachable over REST is standing surface. A signed-in user hitting `/rest/v1/rpc/is_admin` and
-- getting `false` rather than an error also confirms an admin system exists, which is precisely
-- what the 404-never-403 posture in §4 spends effort denying.
--
-- ── THE CONSTRAINT THAT SHAPES THIS WHOLE MIGRATION ──────────────────────────────────────────
-- A policy expression is evaluated with the privileges of the QUERYING role, so the caller must
-- hold EXECUTE on every function the policy names - even a SECURITY DEFINER one. Verified
-- directly: revoking the predicate and inserting as `authenticated` fails with
-- `42501 permission denied for function`, not with a policy denial.
--
-- Therefore `is_suspended` CANNOT simply be revoked from `authenticated`. The nine restrictive
-- policies from `0018` call it on every write, so revoking it would deny documents, assets,
-- community publishes, control shows and uploads to EVERY signed-in user. The fix is to change
-- the function's SHAPE - drop the argument so there is nothing to point at another account -
-- and keep the grant the policies depend on.
--
-- The self-check at the bottom asserts all four properties at apply time and ABORTS the
-- migration if any of them fails, so a self-hoster cannot end up half-locked-down.

-- ── 1. the self-scoped predicate ─────────────────────────────────────────────────────────────
-- No argument, so there is no way to ask about anyone but yourself. Same body as the old
-- function with the caller substituted for the parameter; STABLE and SECURITY DEFINER for the
-- same reasons as before (the policies must read an RLS-locked table).
create or replace function public.is_suspended()
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.user_accounts a
    where a.user_id = (select auth.uid()) and a.state = 'suspended'
  );
$$;

revoke execute on function public.is_suspended() from public, anon;
grant execute on function public.is_suspended() to authenticated;   -- REQUIRED by the policies below

-- ── 2. repoint the nine policies, then drop the probe ────────────────────────────────────────
-- Written out per table rather than looped, for the same reason `0018` did: each one is a live
-- access rule and a reviewer should see exactly which tables and operations changed. The
-- predicate is wrapped in `(select ...)` so it is hoisted into an InitPlan and evaluated once per
-- statement, which is what `(select auth.uid())` was doing before.
--
-- Behaviour is unchanged: same tables, same operations, same answer. DELETE stays absent
-- everywhere and read access stays untouched, exactly as `0018` argued.

drop policy if exists "documents_not_suspended_insert" on public.documents;
drop policy if exists "documents_not_suspended_update" on public.documents;
create policy "documents_not_suspended_insert" on public.documents
  as restrictive for insert to authenticated
  with check (not (select public.is_suspended()));
create policy "documents_not_suspended_update" on public.documents
  as restrictive for update to authenticated
  using (not (select public.is_suspended()))
  with check (not (select public.is_suspended()));

drop policy if exists "assets_not_suspended_insert" on public.assets;
drop policy if exists "assets_not_suspended_update" on public.assets;
create policy "assets_not_suspended_insert" on public.assets
  as restrictive for insert to authenticated
  with check (not (select public.is_suspended()));
create policy "assets_not_suspended_update" on public.assets
  as restrictive for update to authenticated
  using (not (select public.is_suspended()))
  with check (not (select public.is_suspended()));

drop policy if exists "community_not_suspended_insert" on public.community_templates;
drop policy if exists "community_not_suspended_update" on public.community_templates;
create policy "community_not_suspended_insert" on public.community_templates
  as restrictive for insert to authenticated
  with check (not (select public.is_suspended()));
create policy "community_not_suspended_update" on public.community_templates
  as restrictive for update to authenticated
  using (not (select public.is_suspended()))
  with check (not (select public.is_suspended()));

drop policy if exists "control_shows_not_suspended_insert" on public.control_shows;
drop policy if exists "control_shows_not_suspended_update" on public.control_shows;
create policy "control_shows_not_suspended_insert" on public.control_shows
  as restrictive for insert to authenticated
  with check (not (select public.is_suspended()));
create policy "control_shows_not_suspended_update" on public.control_shows
  as restrictive for update to authenticated
  using (not (select public.is_suspended()))
  with check (not (select public.is_suspended()));

drop policy if exists "user_assets_not_suspended_insert" on storage.objects;
create policy "user_assets_not_suspended_insert" on storage.objects
  as restrictive for insert to authenticated
  with check (bucket_id <> 'user-assets' or not (select public.is_suspended()));

-- Only droppable now that nothing references it. This is the line that closes the hole.
drop function if exists public.is_suspended(uuid);

-- ── 3. the admin-only replacement ────────────────────────────────────────────────────────────
-- Asking about ANOTHER account is a privileged question, so it gets a privileged function that
-- answers it only for admins and says nothing at all to anyone else. The authorization check is
-- INSIDE the function rather than left to the grant, so a future mis-grant still cannot leak:
-- being able to call it is not the same as being allowed an answer.
--
-- Not granted to service_role on purpose. Server code holds the service key, which reads
-- `public.user_accounts` directly (`api/_lib/adminUsers.ts`) and never needs this indirection -
-- and under the service key `auth.uid()` is null, so the admin check would refuse it anyway.
-- This function exists for a signed-in ADMIN's own session.
create or replace function public.admin_user_suspended(p_user uuid)
returns boolean language plpgsql security definer set search_path = '' stable as $$
begin
  -- Reject before reading anything. `is_admin` resolves the caller from auth.uid(); the nested
  -- call works even though `authenticated` no longer holds EXECUTE on it, because inside a
  -- SECURITY DEFINER function the privileges are the definer's.
  if not public.is_admin('support') then
    raise exception 'insufficient privilege' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.user_accounts a
    where a.user_id = p_user and a.state = 'suspended'
  );
end;
$$;

revoke execute on function public.admin_user_suspended(uuid) from public, anon;
grant execute on function public.admin_user_suspended(uuid) to authenticated;

-- ── 4. retire the unused REST surface ────────────────────────────────────────────────────────
-- Nothing calls `is_admin` or `admin_role_rank` - no policy, no client code, and the API gate in
-- `api/_lib/adminAuth.ts` deliberately does its own service-key lookup instead. `admin_role_rank`
-- is only ever reached from inside `is_admin`, where definer privileges apply.
--
-- READ THIS BEFORE ADDING AN ADMIN-READ POLICY: per the constraint at the top, a policy that
-- names `public.is_admin(...)` requires the QUERYING role to hold EXECUTE on it. Such a
-- migration must re-grant it to `authenticated` in the same change, or every read against that
-- table fails with `42501` rather than simply returning no rows.
revoke execute on function public.is_admin(text) from authenticated;
revoke execute on function public.admin_role_rank(text) from authenticated;
grant execute on function public.is_admin(text) to service_role;

-- ── 5. prove it, or refuse to apply ──────────────────────────────────────────────────────────
-- Static review cannot show that a grant actually denies anything, so the migration demonstrates
-- it against the database it is being applied to. Any failure raises, which rolls the whole
-- migration back.
--
-- A MIGRATION MUST NEVER CHANGE THE SESSION ROLE, and this block learned it the expensive way.
-- The first version impersonated the caller with `set local role authenticated` and restored with
-- `RESET ROLE`. Every assertion passed and the migration still failed to apply: `supabase db push`
-- connects as an unprivileged `cli_login_postgres` login role and elevates with
-- `SET SESSION ROLE postgres`, so `RESET ROLE` dropped the session back to the login role and the
-- CLI could no longer write its own row in `supabase_migrations.schema_migrations`. The whole
-- transaction rolled back on a permission error that had nothing to do with the change.
--
-- So the grants are asserted against the catalog with `has_function_privilege`, which reads the
-- real ACL rather than the SQL text, and the one behavioural check swaps only the JWT claim -
-- `is_admin` resolves the caller from `auth.uid()`, not from the database role, so the guard can
-- be exercised for real without touching the role at all.
do $$
declare
  probe_target constant uuid := gen_random_uuid();
  prev_claims  constant text := current_setting('request.jwt.claims', true);
  answer boolean;
begin
  -- (a) The grant the nine policies depend on must SURVIVE. If this regresses, every signed-in
  --     user loses the ability to write anything, because a policy expression is evaluated with
  --     the querying role's privileges.
  if not has_function_privilege('authenticated', 'public.is_suspended()', 'execute') then
    raise exception '0020 self-check (a) FAILED: authenticated cannot execute is_suspended() - '
      'the suspension policies would deny every write';
  end if;
  if has_function_privilege('anon', 'public.is_suspended()', 'execute') then
    raise exception '0020 self-check (a) FAILED: anon can execute is_suspended()';
  end if;

  -- (b) The old probe must be GONE - dropped, not merely ungranted.
  if to_regprocedure('public.is_suspended(uuid)') is not null then
    raise exception '0020 self-check (b) FAILED: is_suspended(uuid) still exists - '
      'arbitrary-user probing is still open';
  end if;

  -- (c) The admin-only replacement must REFUSE a non-admin, before returning anything. Exercised
  --     for real against a synthetic subject; no such user need exist, auth.uid() reads the claim.
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    select public.admin_user_suspended(probe_target) into answer;
    raise exception '0020 self-check (c) FAILED: admin_user_suspended answered a non-admin (%)',
      coalesce(answer::text, 'null');
  exception
    when insufficient_privilege then null;   -- expected
  end;
  perform set_config('request.jwt.claims', prev_claims, true);

  -- (d) is_admin must no longer be reachable over REST by an ordinary signed-in user.
  if has_function_privilege('authenticated', 'public.is_admin(text)', 'execute') then
    raise exception '0020 self-check (d) FAILED: is_admin is still executable by authenticated';
  end if;

  raise notice '0020 self-check passed: self-scoped predicate intact, probes closed.';
end $$;
