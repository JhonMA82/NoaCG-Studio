-- A TEMPORARY denying grant joins the entitlement absolutes (docs/ADMIN.md §2).
--
-- WHAT WAS MISSING. `0022` put three inputs in SQL - suspension, the instance-wide kill switch,
-- and a PERMANENT override that denies. "Stop this account publishing for a week" is the most
-- natural moderation action of the lot, and it was the one shape an operator could express on the
-- admin page that the database would ignore: the row resolved correctly everywhere the TypeScript
-- resolver runs, and the RLS gates simply did not look at it.
--
-- WHY IT IS SAFE NOW, AND WAS NOT BEFORE. It was excluded from `0022` as precedence-bearing: a
-- temporary grant sits BELOW a permanent override, so "a temporary deny exists" did not on its
-- own mean "the resolver denies" - an override allowing the same key would win. `0021` closed
-- that: with at most ONE active grant per `(user_id, kind, key)`, a temporary deny is the only
-- grant there can be, it outranks the plan, and nothing else can be present to outrank it. So it
-- lands in the same strict subset as the other three - SQL still denies only where
-- `resolveEntitlement()` denies. The reasoning is different from the permanent case (that one
-- wins because it is top of the order; this one wins because uniqueness leaves it alone), but the
-- conclusion is the same, which is why one condition can now express both.
--
-- THE KNOWN EDGE, stated rather than left to be discovered. The subset property holds for every
-- key this predicate is actually used for, and would NOT hold for an `ai.*` key: the legacy
-- `AI_LITE_OVERRIDE_USER_IDS` list widens a false back to true for `ai.` keys only
-- (`contract.ts`, the `envOverride` branch), so on such a key the contract could allow where this
-- predicate denies. That is true of `0022`'s permanent-override branch too. It costs nothing
-- today because the AI keys are gated at their endpoints and no policy names one here, and
-- `scripts/admin-security-migration.test.mjs` pins the key list so adding one is a deliberate act
-- rather than an accident.

-- ── 1. the fourth absolute, folded into the grant test ───────────────────────────────────────
-- Only the grant branch changes. Suspension and the kill switch are untouched, and the value test
-- stays strict for the same reason as before: `toGrant()` DROPS a row whose payload is not a bare
-- boolean, so a malformed row must not become a denial here either.
create or replace function public.feature_denied_for(p_user uuid, p_key text)
returns boolean language sql security definer set search_path = '' stable as $$
  select
    -- (1) SUSPENSION - every feature resolves false for a suspended account.
    exists (
      select 1 from public.user_accounts a
       where a.user_id = p_user and a.state = 'suspended'
    )
    -- (2) THE INSTANCE-WIDE KILL SWITCH - checked last in the contract precisely so it beats a
    --     manual override.
    or coalesce(
         (select s.value from public.system_settings s where s.key = 'disabled_features'),
         '[]'::jsonb
       ) ? p_key
    -- (3) AN ACTIVE DENYING GRANT, permanent or temporary. `expires_at is null` is a permanent
    --     override, which is top of the precedence order; a live `expires_at` is a temporary
    --     grant, which outranks the plan and - by `0021`'s partial unique index - is the only
    --     active grant that can exist for this key. The date rules mirror `grantActive()` line
    --     for line: revoked beats everything, a start in the future has not begun, an expiry in
    --     the past no longer applies.
    or exists (
      select 1 from public.user_grants g
       where g.user_id = p_user
         and g.kind = 'feature'
         and g.key = p_key
         and g.revoked_at is null
         and (g.starts_at is null or g.starts_at <= now())
         and (g.expires_at is null or g.expires_at > now())
         and jsonb_typeof(g.value -> 'value') = 'boolean'
         and (g.value ->> 'value') = 'false'
    );
$$;

-- Grants are unchanged: CREATE OR REPLACE preserves the ACL, and `0022` already revoked this
-- function from every client role. Asserted below rather than assumed.

-- ── 2. prove it, or refuse to apply ──────────────────────────────────────────────────────────
-- `0022` could only exercise the kill switch, because `user_grants.user_id` references
-- `auth.users` and a synthetic subject has no row to point at. This one CAN exercise the grant
-- branch - the branch it exists to add - by writing a real row against an existing account under
-- a key no product code will ever ask about, asserting all four cases, and deleting it again.
-- The key is `__selfcheck__`: not a FeatureKey, so it cannot collide with a real grant and cannot
-- trip `0021`'s one-active-grant index on whatever that account already has.
--
-- An instance with no users at all (a fresh self-host) skips the behavioural half and says so,
-- rather than failing to apply over an empty table. And no session role is changed anywhere -
-- `supabase db push` elevates with SET SESSION ROLE and a RESET would break its own ledger write.
do $$
declare
  v_user uuid;
  denied boolean;
begin
  -- (a) The ACL must have survived CREATE OR REPLACE. If the cross-user predicate became callable
  --     by a client role, this migration would have reopened the arbitrary-account probe `0020`
  --     removed - and it would have done it silently.
  if has_function_privilege('authenticated', 'public.feature_denied_for(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.feature_denied_for(uuid, text)', 'execute') then
    raise exception '0023 self-check (a) FAILED: feature_denied_for(uuid, text) is executable by a '
      'client role';
  end if;
  if not has_function_privilege('authenticated', 'public.feature_denied(text)', 'execute') then
    raise exception '0023 self-check (a) FAILED: authenticated lost execute on feature_denied(text) '
      '- every gated write would fail 42501 rather than being allowed';
  end if;

  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise notice '0023 self-check: no accounts exist, skipping the behavioural half.';
    return;
  end if;

  -- (b) A LIVE temporary deny must deny. This is the whole point of the migration.
  insert into public.user_grants (user_id, kind, key, value, expires_at, reason)
    values (v_user, 'feature', '__selfcheck__', '{"value": false}'::jsonb,
            now() + interval '1 hour', 'migration 0023 self-check');
  if not public.feature_denied_for(v_user, '__selfcheck__') then
    raise exception '0023 self-check (b) FAILED: a live temporary deny does not deny';
  end if;

  -- (c) An EXPIRED one must not. A grant that has run out is not a denial, and `grantActive()`
  --     treats the boundary as exclusive - expiry in the past means no longer in force.
  update public.user_grants set expires_at = now() - interval '1 hour'
   where user_id = v_user and key = '__selfcheck__';
  if public.feature_denied_for(v_user, '__selfcheck__') then
    raise exception '0023 self-check (c) FAILED: an expired grant still denies - access would '
      'never come back';
  end if;

  -- (d) A temporary grant that ALLOWS must not deny, and neither must a revoked one. Without
  --     this, "give this account video for a week" would read as a denial - the exact opposite
  --     of what the operator wrote.
  update public.user_grants set expires_at = now() + interval '1 hour', value = '{"value": true}'::jsonb
   where user_id = v_user and key = '__selfcheck__';
  select public.feature_denied_for(v_user, '__selfcheck__') into denied;
  if denied then
    raise exception '0023 self-check (d) FAILED: a temporary ALLOW reads as a denial';
  end if;
  update public.user_grants set value = '{"value": false}'::jsonb, revoked_at = now()
   where user_id = v_user and key = '__selfcheck__';
  if public.feature_denied_for(v_user, '__selfcheck__') then
    raise exception '0023 self-check (d) FAILED: a revoked deny still denies';
  end if;

  -- Deleted, not revoked: this row is scaffolding, not history. A failure above raises, which
  -- rolls the whole transaction back and removes it just the same.
  delete from public.user_grants where user_id = v_user and key = '__selfcheck__';

  raise notice '0023 self-check passed: a temporary deny denies, and only while it is in force.';
end $$;
