-- `control_show_by_slug` returns the production's CONTROL PROFILE (0058's column).
--
-- WHY THIS IS A SEPARATE FILE FROM 0058, and the correction that goes with it.
-- `control_show_by_slug` is `RETURNS TABLE`, so it cannot gain a column with `create or replace` -
-- PostgreSQL refuses to change a function's return type in place - and it needs the drop-and-
-- create below. 0058 deferred that on the belief that `npm run db:push` would refuse a DROP
-- without an explicit `--allow`, which would put an owner action on every landing; its header
-- says so, and so does `docs/handoffs/2026-09-15-hd-show-profile.md`.
--
-- **That belief is wrong, measured on this file.** `scripts/db-push.mjs` exempts a DROP of an
-- object the SAME migration creates back - `createdObjects` collects `create function`, and the
-- drop rule clears anything in that set, because net it removes nothing. 0031 did this exact
-- drop-and-create on this exact function and applied unattended. `classifyMigration` on this file
-- reports 4 statements and no findings, so it lands with the branch and needs no `--allow` and no
-- owner action at all. 0058 stays exactly as it was applied, per supabase/AGENTS.md; this header
-- is the correction, because this is the file a reader arrives at.
--
-- WHAT IT COSTS TO BE WRONG HERE, and why the body below is a copy rather than a rewrite. A
-- `create or replace` takes whatever text it is handed, so a body copied from an OLDER migration
-- silently reverts every change made since. 0031 is the CURRENT definition of this function -
-- 0057 only mentions it in a comment, and 0022 and 0029 are earlier - so the select below is
-- 0031's, unchanged, with `s.profile` appended and nothing else touched. That is 0057's own
-- lesson, taken deliberately.
--
-- WHAT THE CLIENT DOES WITH IT. `hostedControl.ts` already reads the column through
-- `readPublishedProfile` (src/model/profile.ts), which answers null both for "no profile" and for
-- "a profile a newer build wrote". So an instance that has NOT applied this migration returns no
-- such key, the normalizer reads it as no profile, and the hosted page renders the generated
-- panel - the same honest degradation deleting a profile gives. Nothing fails; the arrangement
-- simply does not arrive until the migration does.

-- ── 1. The widening: 0031's body, one column longer. ─────────────────────────────────────────
drop function if exists public.control_show_by_slug(text);
create function public.control_show_by_slug(p_slug text)
returns table (id uuid, title text, panel jsonb, staged jsonb, live jsonb, last_event_id bigint,
               output jsonb, output_seen_at timestamptz, live_cue jsonb, profile jsonb)
language sql security definer set search_path = '' stable as $$
  select s.id, s.title, s.panel, s.staged, s.live,
         coalesce((select max(e.id) from public.control_events e where e.show_id = s.id), 0),
         s.output, s.output_seen_at, s.live_cue, s.profile
  from public.control_shows s where s.slug = p_slug;
$$;
-- The operator page works SIGNED OUT (capability-addressed by slug), so both roles keep execute -
-- 0031's grant, restated because the drop above took the old function's grants with it.
grant execute on function public.control_show_by_slug(text) to anon, authenticated;

-- ── 2. Prove it, or refuse to apply ──────────────────────────────────────────────────────────
-- supabase/AGENTS.md: a self-check proves SHAPE, never behaviour, so CALL the thing. The shape
-- half matters here too, because a dropped-and-recreated function that lost its grant would fail
-- for every signed-out operator and for nobody testing as the owner.
do $$
declare
  v_owner uuid;
  v_show  uuid := '00000000-0059-4000-8000-000000000059';
  v_slug  text;
  v_profile jsonb := '{"v":1,"arrange":{"Totals board":{"reveal":{"order":0,"pinned":true}}},"combine":[]}'::jsonb;
  v_row   record;
begin
  -- (a) SHAPE: the function exists, still returns a table, and `anon` can still call it.
  if to_regprocedure('public.control_show_by_slug(text)') is null then
    raise exception 'profile-read self-check failed: control_show_by_slug is missing';
  end if;
  if not has_function_privilege('anon', 'public.control_show_by_slug(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.control_show_by_slug(text)', 'execute') then
    raise exception 'profile-read self-check failed: the drop took the operator grant with it';
  end if;

  -- (b) CALL it. 0057's guard: an instance with no account cannot insert an owned row, and a
  --     migration must still apply there.
  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice 'profile-read self-check skipped: no account on this instance';
    return;
  end if;

  insert into public.control_shows (id, owner_id, title, profile)
    values (v_show, v_owner, 'Profile read self-check', v_profile)
    returning slug into v_slug;

  select * into v_row from public.control_show_by_slug(v_slug);
  if v_row.profile is distinct from v_profile then
    raise exception 'profile-read self-check failed: the resolve did not return the profile it was given';
  end if;
  -- The columns that were already there are still there, in case a future edit of this body
  -- drops one while adding another.
  if v_row.id is distinct from v_show or v_row.title <> 'Profile read self-check' then
    raise exception 'profile-read self-check failed: the resolve lost a column it used to return';
  end if;

  delete from public.control_shows where id = v_show;
end $$;
