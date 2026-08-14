-- Take the two identity TRIGGER functions off the anon and authenticated roles.
--
-- WHAT THIS CLOSES. 0040 created `control_show_record_identity` and `control_show_restore_identity`
-- without naming the roles they revoke, so Supabase's default privileges left both callable over
-- /rest/v1/rpc/... - the same defect 0041 fixed for `storage_within_quota`, and the lesson that
-- migration ends on ("a definer function in `public` is exposed to anon the moment it is created").
-- Every other trigger function here (audience_guard, audience_round_guard, audience_vote_guard,
-- chat_guard, community_report_guard) is already closed to both roles; these two were the outliers.
--
-- Directly calling a trigger function over PostgREST fails with "trigger functions can only be
-- called as triggers", so nothing was reachable through them. That is why this is hygiene rather
-- than an incident - but the ACL is the thing the security advisor reads, and an open EXECUTE on a
-- SECURITY DEFINER function is worth exactly zero to keep.
--
-- WHY THE TRIGGERS STILL FIRE. Postgres checks EXECUTE on a trigger function at CREATE TRIGGER
-- time, not at fire time; the DML that fires it needs no privilege on the function at all. That is
-- a claim about behaviour, so the self-check below publishes a production AS `authenticated` after
-- the revoke and reads the identity row back, rather than asserting the grants look right.

revoke execute on function public.control_show_record_identity() from public, anon, authenticated;
revoke execute on function public.control_show_restore_identity() from public, anon, authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────────────────────
-- (a) the ACL is actually closed, (b) an INSERT from a role that no longer holds EXECUTE still
-- gets both triggers. (b) needs a real auth.users row to own the throwaway production and a JWT
-- claim so `auth.uid()` matches it, because control_shows_owner_all is what admits the insert.
-- An instance with no users yet skips the behavioural half rather than failing the migration.
--
-- One trap, learned the hard way on the first attempt: RESET ROLE is the WRONG way back. It
-- restores `session_user`, and a migration does not run as its session user - the CLI connects as a
-- temporary login role and switches to `postgres` to apply the file. RESET ROLE therefore lands on
-- a role with no grants at all, and the next statement dies with "permission denied", which reads
-- like the revoke broke something. Capture `current_role` and set it back by name.
do $$
declare
  v_role text := current_role;
  v_owner uuid;
  v_id uuid := gen_random_uuid();
  v_slug text;
  v_again text;
begin
  -- (a) Neither role may hold EXECUTE any more.
  if has_function_privilege('anon', 'public.control_show_record_identity()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.control_show_record_identity()', 'EXECUTE')
     or has_function_privilege('anon', 'public.control_show_restore_identity()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.control_show_restore_identity()', 'EXECUTE') then
    raise exception '0042 self-check (a) FAILED: a client role still holds EXECUTE on an identity trigger function';
  end if;

  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice '0042 self-check: no auth.users row, skipping the publish/unpublish walk';
    return;
  end if;

  -- (b) Publish -> unpublish -> publish, all as `authenticated`, and the addresses must survive.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.control_shows (id, owner_id, title) values (v_id, v_owner, '0042 self-check');
  select slug into v_slug from public.control_shows where id = v_id;

  delete from public.control_shows where id = v_id;                 -- what unpublish does

  insert into public.control_shows (id, owner_id, title) values (v_id, v_owner, '0042 self-check');
  select slug into v_again from public.control_shows where id = v_id;

  delete from public.control_shows where id = v_id;
  execute format('set local role %I', v_role);

  if v_slug is null or v_again is distinct from v_slug then
    raise exception '0042 self-check (b) FAILED: revoking EXECUTE stopped the identity triggers (was %, now %)',
      v_slug, v_again;
  end if;

  -- The identity row is the record trigger's own output - proof it fired - and the cleanup needs
  -- the applying role back, since control_show_identity is closed to every client role by design.
  if not exists (select 1 from public.control_show_identity where id = v_id) then
    raise exception '0042 self-check (b) FAILED: the record trigger wrote no identity row';
  end if;
  delete from public.control_show_identity where id = v_id;
exception when others then
  execute format('set local role %I', v_role);                      -- never leave it as `authenticated`
  raise;
end $$;
