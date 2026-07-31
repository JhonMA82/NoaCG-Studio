-- The precedence-free entitlement ABSOLUTES, enforced in SQL (docs/ADMIN.md §2).
--
-- WHY THIS EXISTS. `community.publish`, `control.hosted` and `showchat` have no endpoint to
-- gate: every one of them writes STRAIGHT FROM THE BROWSER through the Supabase client
-- (`src/community/communityData.ts`, `src/control/hostedControl.ts`, `src/showchat/chatData.ts`),
-- so RLS is the only thing in the path. Until now their admin switches wrote a row that nothing
-- read - which is the failure this whole subsystem was built to stop.
--
-- WHAT IS AND IS NOT IN SQL, and why the split is exactly here. A full resolver in SQL was
-- rejected: it would be a SECOND AUTHORITY on precedence, the neutrality rule and expiry, in a
-- second language, and the drift guard would be a differential test needing a live database -
-- which CI does not have. So only the three inputs that WIN OUTRIGHT in the contract are
-- expressed here, and each is a single-row test with no precedence to re-implement:
--
--   1. suspension                     - `user_accounts.state = 'suspended'`
--   2. the instance-wide kill switch  - `system_settings.disabled_features` contains the key
--   3. a permanent override that DENIES - a `user_grants` row: value false, no expires_at,
--                                         not revoked, not future-dated
--
-- Plans, temporary grants, defaults and expiry stay in `src/entitlements/contract.ts`. The
-- property that makes this sound is ONE-DIRECTIONAL: the set of denials expressible here is a
-- strict SUBSET of what `resolveEntitlement()` denies, so the two can never disagree in the
-- direction that matters, which is SQL allowing something the resolver refuses. Every branch
-- below mirrors a specific line of that module - `grantActive()` for the date rules, `toGrant()`
-- for the `{"value": …}` shape, the suspended short-circuit and the `disabledFeatures` check at
-- the end of the feature loop.
--
-- THE PRECONDITION IS `0021`. The subset property assumes "a denying override exists" and "the
-- resolver denies" are the same statement. With two active grants for one key that was a coin
-- flip; the partial unique index makes it unreachable, and it is applied before this file by
-- construction.
--
-- THE CONSTRAINT THAT SHAPES THE FUNCTION SPLIT (learned in `0020`, at the cost of a failed
-- apply): a policy expression runs with the QUERYING role's privileges, so `authenticated` must
-- hold EXECUTE on every function a policy names - even a SECURITY DEFINER one. `feature_denied()`
-- is therefore granted to `authenticated` and is self-scoped, with NO argument that could point
-- at another account. The cross-user form it delegates to is revoked from every client role and
-- is only ever reached from inside a SECURITY DEFINER function, where the definer's privileges
-- apply.
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   * `sync.cloud` stays UNENFORCED. It would gate a user from saving their OWN work, there is
--     no paid tier, the free core stays free (docs/GOALS.md), and the real need is already
--     covered by suspension. The key exists; that is not a reason to wire it.
--   * READS stay untouched everywhere, exactly as `0018` argued. A denied account can still open,
--     export and read back its own work, and an already-published template stays readable - a
--     takedown is moderation, not an entitlement.
--   * DELETE stays untouched. Unpublishing, closing down a show or removing a control page must
--     keep working; blocking them would be spite rather than protection.

-- ── 1. the predicates ────────────────────────────────────────────────────────────────────────

-- The cross-user form. INTERNAL: it answers about an arbitrary account, so it is revoked from
-- every client role and never granted back - PostgREST publishes whatever `authenticated` may
-- execute, and an argument that takes a user id is exactly the probe `0020` spent a migration
-- removing. It is reachable only from the SECURITY DEFINER functions below, where the nested
-- call runs with the definer's privileges and needs no grant at all.
create or replace function public.feature_denied_for(p_user uuid, p_key text)
returns boolean language sql security definer set search_path = '' stable as $$
  select
    -- (1) SUSPENSION. `resolveEntitlement()` resolves every feature to false for a suspended
    --     account, whatever the plan says, so this can never deny more than the contract does.
    exists (
      select 1 from public.user_accounts a
       where a.user_id = p_user and a.state = 'suspended'
    )
    -- (2) THE INSTANCE-WIDE KILL SWITCH. Checked last in the contract precisely so it beats a
    --     manual override; here it stands alone for the same reason. `?` tests membership of the
    --     stored jsonb array, which is the shape `api/_lib/systemSettings.ts` reads.
    or coalesce(
         (select s.value from public.system_settings s where s.key = 'disabled_features'),
         '[]'::jsonb
       ) ? p_key
    -- (3) A PERMANENT MANUAL OVERRIDE THAT DENIES. `expires_at is null` is what makes a row an
    --     override rather than a temporary grant; the rest mirrors `grantActive()` line for line,
    --     including "a future start has not begun yet". The value test is deliberately strict -
    --     `toGrant()` DROPS a row whose payload is not a bare boolean/number/null, so a malformed
    --     row must not become a denial here either.
    or exists (
      select 1 from public.user_grants g
       where g.user_id = p_user
         and g.kind = 'feature'
         and g.key = p_key
         and g.revoked_at is null
         and g.expires_at is null
         and (g.starts_at is null or g.starts_at <= now())
         and jsonb_typeof(g.value -> 'value') = 'boolean'
         and (g.value ->> 'value') = 'false'
    );
$$;

revoke execute on function public.feature_denied_for(uuid, text) from public, anon, authenticated;

-- The self-scoped form the policies call. No argument but the key, so there is nothing to point
-- at anyone else - the same shape `0020` reduced `is_suspended()` to, for the same reason.
--
-- STATED PLAINLY, because it is a real (small) disclosure: a signed-in caller can ask this about
-- their OWN account and learn that a denial is ABSOLUTE rather than plan-level. Two of the three
-- branches are already public - `is_suspended()` is granted to `authenticated` and
-- `public_system_notice()` publishes the disabled list to everyone - so the only new bit is
-- "there is a denying override on my account", about a feature the caller can already observe
-- they do not have. It cannot be revoked without breaking every policy below (see the header).
create or replace function public.feature_denied(p_key text)
returns boolean language sql security definer set search_path = '' stable as $$
  select public.feature_denied_for((select auth.uid()), p_key);
$$;

revoke execute on function public.feature_denied(text) from public, anon;
grant execute on function public.feature_denied(text) to authenticated;   -- REQUIRED by the policies

-- ── 2. the gates on the browser's own writes ─────────────────────────────────────────────────
-- RESTRICTIVE and additive, the shape `0018` established: Postgres ANDs a restrictive policy with
-- the permissive ones, so the live ownership rules from `0003`, `0004` and `0008` stay
-- byte-for-byte as they are. A mistake here can only ever deny too much, and reverting is a
-- DROP POLICY. Written out per table rather than looped, because each one is a live access rule.

-- community.publish -------------------------------------------------------------------------
-- INSERT is the publish itself. UPDATE is a re-publish of the same row's content, so it is gated
-- too - but a MODERATOR is exempt, and that exemption is load-bearing rather than tidy: without
-- it, switching `community.publish` off instance-wide during an incident would also freeze the
-- takedowns that are the reason to reach for the switch. `is_moderator()` is already granted to
-- `authenticated` (0004), which the header's constraint requires.
create policy "community_templates_publish_insert" on public.community_templates
  as restrictive for insert to authenticated
  with check (not (select public.feature_denied('community.publish')));
create policy "community_templates_publish_update" on public.community_templates
  as restrictive for update to authenticated
  using ((select public.is_moderator()) or not (select public.feature_denied('community.publish')))
  with check ((select public.is_moderator()) or not (select public.feature_denied('community.publish')));

-- The publish flow externalizes binaries into the community bucket first, so leaving this open
-- would let a denied account keep consuming storage on a publish that can no longer land. Scoped
-- by the bucket_id disjunction: a restrictive policy applies to every row of storage.objects, so
-- everything outside 'community-assets' must pass through untouched.
create policy "community_assets_publish_insert" on storage.objects
  as restrictive for insert to authenticated
  with check (bucket_id <> 'community-assets' or not (select public.feature_denied('community.publish')));

-- showchat ------------------------------------------------------------------------------------
-- The owner's half: creating or reopening a send-in show, and promoting a submission to air.
-- The audience's half is closed in §3 - a policy here cannot reach it, because the anonymous
-- insert is checked against the SHOW'S OWNER, not against the caller.
create policy "shows_showchat_insert" on public.shows
  as restrictive for insert to authenticated
  with check (not (select public.feature_denied('showchat')));
create policy "shows_showchat_update" on public.shows
  as restrictive for update to authenticated
  using (not (select public.feature_denied('showchat')))
  with check (not (select public.feature_denied('showchat')));

-- Moderating the queue IS the feature: without this, a denied account could still air messages
-- that arrived before the switch flipped.
create policy "chat_submissions_showchat_update" on public.chat_submissions
  as restrictive for update to authenticated
  using (not (select public.feature_denied('showchat')))
  with check (not (select public.feature_denied('showchat')));

-- control.hosted ------------------------------------------------------------------------------
-- Creating or re-publishing a hosted control page. The OPERATING of an existing page runs through
-- the capability RPCs and is gated in §3; this policy alone would be close to decorative, since
-- the traffic a hosted page costs is the event log, not the row.
create policy "control_shows_hosted_insert" on public.control_shows
  as restrictive for insert to authenticated
  with check (not (select public.feature_denied('control.hosted')));
create policy "control_shows_hosted_update" on public.control_shows
  as restrictive for update to authenticated
  using (not (select public.feature_denied('control.hosted')))
  with check (not (select public.feature_denied('control.hosted')));

-- ── 3. the gates on the capability RPCs ──────────────────────────────────────────────────────
-- These paths are reached by ANONYMOUS callers holding an unguessable slug - an audience member
-- sending a message, an operator driving a show. RLS cannot express the check, twice over: the
-- functions are SECURITY DEFINER and run as the table owner, so policies do not apply to them at
-- all, and the account being gated is the SHOW'S OWNER rather than the caller. So the check goes
-- inside the function, against `feature_denied_for(owner)`.
--
-- Gating these is the difference between a switch and a row nobody reads. Leaving them open would
-- mean an account denied `showchat` keeps collecting send-ins and an account denied
-- `control.hosted` keeps running a live show; only the ability to create a NEW one would stop.
--
-- No new surface is exposed by either change: same signatures, same grants, and both already
-- answered these questions for anyone holding the capability. The answers only ever become MORE
-- restrictive.

-- Whether a show accepts submissions - already the anonymous insert policy's gate on `is_open`.
-- A denied owner's show now reads as not accepting, which is exactly what the send-in page
-- already knows how to render.
create or replace function public.show_accepts(p_show uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.shows s
     where s.id = p_show
       and s.is_open
       and not public.feature_denied_for(s.owner_id, 'showchat')
  );
$$;

-- And the same answer where the send-in page ASKS it, so the two cannot disagree. Without this
-- the page would render an open form off `is_open` and then fail the insert with a raw row-level
-- security error; with it, the visitor gets the "submissions are closed" state SendIn.tsx already
-- renders. The gate is `show_accepts` either way - this only stops the UI lying about it.
create or replace function public.show_by_slug(p_slug text)
returns table (id uuid, title text, is_open boolean)
language sql security definer set search_path = '' stable as $$
  select s.id, s.title,
         s.is_open and not public.feature_denied_for(s.owner_id, 'showchat')
  from public.shows s where s.slug = p_slug;
$$;

-- The three control WRITES. `control_show_by_slug` and `control_tail` are deliberately left
-- alone: they are reads, and a page whose commands are refused should still render and explain
-- itself rather than appear broken.
--
-- 42501 rather than the check_violation the burst caps raise: this is a refusal of privilege, and
-- the message says which page is off rather than pretending the page does not exist. An operator
-- who can already resolve the slug learns nothing new from being told the truth.
create or replace function public.control_send(p_slug text, p_graphic text, p_msg jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
  v_recent int;
  v_id bigint;
begin
  select id, owner_id into v_show, v_owner from public.control_shows where slug = p_slug;
  if v_show is null then raise exception 'unknown control page'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;
  if coalesce(p_msg->>'t', '') not in ('update', 'play', 'stop', 'next', 'event', 'snap') then
    raise exception 'not a control command';
  end if;
  -- A light burst cap per show (an operator surface, not an ingest API).
  select count(*) into v_recent from public.control_events
    where show_id = v_show and created_at > now() - interval '5 seconds';
  if v_recent >= 50 then
    raise exception 'too many commands — slow down' using errcode = 'check_violation';
  end if;
  insert into public.control_events (show_id, graphic, msg) values (v_show, p_graphic, p_msg)
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.control_stage(p_slug text, p_graphic text, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
  v_next jsonb;
begin
  select id, owner_id into v_show, v_owner from public.control_shows where slug = p_slug;
  if v_show is null then raise exception 'unknown control page'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;
  update public.control_shows
    set staged = jsonb_set(staged, array[p_graphic], coalesce(staged->p_graphic, '{}'::jsonb) || coalesce(p_data, '{}'::jsonb))
    where id = v_show
    returning staged->p_graphic into v_next;
  insert into public.control_events (show_id, graphic, msg)
    values (v_show, p_graphic, jsonb_build_object('t', 'staged', 'data', v_next));
end $$;

create or replace function public.control_report(p_slug text, p_graphic text, p_data jsonb, p_state jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
begin
  select id, owner_id into v_show, v_owner from public.control_shows where slug = p_slug;
  if v_show is null then raise exception 'unknown control page'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;
  update public.control_shows
    set live = jsonb_set(live, array[p_graphic],
      jsonb_build_object('data', coalesce(p_data, '{}'::jsonb), 'state', p_state, 'at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
    where id = v_show;
  insert into public.control_events (show_id, graphic, msg)
    values (v_show, p_graphic, jsonb_build_object('t', 'live', 'data', p_data, 'state', p_state));
end $$;

-- ── 4. prove it, or refuse to apply ──────────────────────────────────────────────────────────
-- Same posture as `0020` §5 and `0021` §3: assert against the live catalog and the live
-- behaviour, and raise on any failure so the whole migration rolls back rather than half
-- applying. And NEVER change the session role - `supabase db push` elevates with SET SESSION
-- ROLE and a RESET would break its own ledger write (docs/ADMIN.md §7).
do $$
declare
  prev_claims   constant text := current_setting('request.jwt.claims', true);
  prev_disabled jsonb;
  had_row       boolean;
  gated         integer;
  denied        boolean;
begin
  -- (a) The grant every policy above depends on must EXIST. Without it a gated write fails with
  --     42501 instead of being allowed through - the failure mode `0020` measured.
  if not has_function_privilege('authenticated', 'public.feature_denied(text)', 'execute') then
    raise exception '0022 self-check (a) FAILED: authenticated cannot execute feature_denied(text) '
      '- every gated write would fail 42501 rather than being allowed';
  end if;
  if has_function_privilege('anon', 'public.feature_denied(text)', 'execute') then
    raise exception '0022 self-check (a) FAILED: anon can execute feature_denied(text)';
  end if;

  -- (b) The CROSS-USER form must be off the REST surface entirely. It takes a user id, which is
  --     precisely the probe shape `0020` removed; reachable only from definer functions.
  if has_function_privilege('authenticated', 'public.feature_denied_for(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.feature_denied_for(uuid, text)', 'execute') then
    raise exception '0022 self-check (b) FAILED: feature_denied_for(uuid, text) is executable by a '
      'client role - arbitrary-account probing is open';
  end if;

  -- (c) All eight gates must exist AND be restrictive. A permissive policy of the same name would
  --     be worse than nothing: it would WIDEN access, since permissive policies are ORed.
  select count(*) into gated
    from pg_policies
   where schemaname in ('public', 'storage')
     and policyname in (
       'community_templates_publish_insert', 'community_templates_publish_update',
       'community_assets_publish_insert',
       'shows_showchat_insert', 'shows_showchat_update', 'chat_submissions_showchat_update',
       'control_shows_hosted_insert', 'control_shows_hosted_update')
     and permissive = 'RESTRICTIVE';
  if gated <> 8 then
    raise exception '0022 self-check (c) FAILED: expected 8 restrictive gates, found %', gated;
  end if;

  -- (d) The predicate must actually DENY through the real read path, and only for the key asked
  --     about. Static review cannot show that the jsonb membership test, the key spelling and the
  --     settings row all line up. Exercised against a synthetic caller - `auth.uid()` reads the
  --     JWT claim, so no such user need exist and no role is changed. The kill switch is the one
  --     branch testable without an `auth.users` row to hang a foreign key on.
  select value into prev_disabled from public.system_settings where key = 'disabled_features';
  had_row := found;
  insert into public.system_settings (key, value) values ('disabled_features', '["showchat"]'::jsonb)
    on conflict (key) do update set value = excluded.value;

  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);

  select public.feature_denied('showchat') into denied;
  if not denied then
    raise exception '0022 self-check (d) FAILED: the kill switch does not deny - a switched-off '
      'feature would keep working';
  end if;
  select public.feature_denied('community.publish') into denied;
  if denied then
    raise exception '0022 self-check (d) FAILED: the kill switch denies a key it was not set for';
  end if;

  perform set_config('request.jwt.claims', prev_claims, true);

  -- Restore. A failure above raises, which rolls the whole transaction back and undoes the test
  -- row too, so this line only ever runs on the success path.
  if had_row then
    update public.system_settings set value = prev_disabled where key = 'disabled_features';
  else
    delete from public.system_settings where key = 'disabled_features';
  end if;

  raise notice '0022 self-check passed: the absolutes deny, and only the caller can be asked about.';
end $$;
