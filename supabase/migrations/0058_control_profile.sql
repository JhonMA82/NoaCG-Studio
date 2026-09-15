-- The production CONTROL PROFILE, pinned at publish (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6e; the
-- model half is src/model/profile.ts).
--
-- WHAT THE COLUMN HOLDS. How ONE production arranges and combines the controls its graphics
-- already declare: ARRANGE (per pool graphic, per control id - order, section, shown name, hidden,
-- pinned) and COMBINE (named controls made of ordered steps). Presentation and composition over
-- declared capability, never a behaviour: a profile cannot invent an event, carry a condition or
-- override the legality the machine guards. Deleting it always leaves the complete generated
-- panel, which stays the recovery surface and the default.
--
-- WHY IT SITS BESIDE `panel`, `output` AND `bindings` rather than anywhere else. All four are
-- AUTHORED state - what the operator decided before the show - as opposed to the runtime state
-- (`staged`, `live`, `live_cue`, `data`) that moves while the show is on. Publishing is the one
-- act that carries authored state to the hosted surfaces, so the profile travels with it, exactly
-- as the bindings have since 0048.
--
-- WHY THE DEFAULT IS AN EMPTY OBJECT. A production published by an older build has no profile at
-- all, and that must read as "no profile" rather than force a null check at every use - the same
-- choice, for the same reason, that 0048 made for `data` and `bindings`.
--
-- WHY THE COLUMN CARRIES NO VERSION OF ITS OWN. The profile stamps itself: the jsonb holds
-- `{"v": 1, ...}`, and `readShowProfile` migrates on read, degrading a version it does not know
-- to READ-ONLY rather than to a crash or to silent erasure. A column-level version would be a
-- second place to keep that fact true.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO: widen `control_show_by_slug` to return the
-- column. That function is `RETURNS TABLE`, so it cannot gain a column with `create or replace` -
-- it needs a drop-and-create, and `npm run db:push` refuses a DROP without an explicit `--allow`,
-- which would mean an owner action on every landing. This file is therefore purely ADDITIVE and
-- applies unattended. The row that first RENDERS a profile on the hosted page mints that widening
-- and carries its `--allow` as its own cost.

-- ── 1. The column ────────────────────────────────────────────────────────────────────────────
alter table public.control_shows
  add column if not exists profile jsonb not null default '{}'::jsonb;

-- ── 2. Prove it, or refuse to apply ──────────────────────────────────────────────────────────
-- supabase/AGENTS.md: a self-check proves SHAPE, never behaviour, so CALL the thing. A shape
-- check would pass over a column that silently refused every write - which for a column means
-- WRITING to it, reading the value back, and asserting the default actually defaulted.
do $$
declare
  v_owner uuid;
  v_show  uuid := '00000000-0058-4000-8000-000000000058';
  v_profile jsonb := $profile$
    {"v":1,
     "arrange":{"Totals board":{"reveal":{"order":0,"pinned":true},"clear":{"hidden":true}}},
     "combine":[{"id":"c1","name":"Reveal, then the points",
                 "steps":[{"kind":"event","graphic":"Votes board","control":"reveal"},
                          {"kind":"event","graphic":"Totals board","control":"plus_katri",
                           "after":3,"ask":{"default":true}}]}]}
  $profile$::jsonb;
begin
  -- (a) The column exists, is jsonb, and is NOT NULL with an object default.
  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'control_shows'
      and c.column_name = 'profile' and c.data_type = 'jsonb' and c.is_nullable = 'NO'
  ) then
    raise exception 'control_shows.profile is missing, nullable, or not jsonb';
  end if;

  -- (b) CALL it: a real row, written and read back. 0057's guard - an instance with no account
  --     cannot insert an owned row, and a migration must still apply there.
  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice 'control_shows.profile self-check skipped: no account on this instance';
    return;
  end if;

  insert into public.control_shows (id, owner_id, title) values (v_show, v_owner, 'Profile self-check');

  -- A row published by an older build carries no profile, and that must read as an empty object
  -- rather than as null. This is the half a shape check cannot see.
  if (select profile from public.control_shows where id = v_show) is distinct from '{}'::jsonb then
    raise exception 'profile self-check failed: a new row did not default to an empty object';
  end if;

  -- A real profile survives the round trip whole - the nested arrange map, the step list in its
  -- authored ORDER, and both step marks.
  update public.control_shows set profile = v_profile where id = v_show;
  if (select profile from public.control_shows where id = v_show) is distinct from v_profile then
    raise exception 'profile self-check failed: the profile did not read back as it was written';
  end if;
  if (select profile->'combine'->0->'steps'->1->>'after' from public.control_shows where id = v_show) <> '3' then
    raise exception 'profile self-check failed: a step mark did not survive the round trip';
  end if;

  -- The throwaway production goes, and its log rows go with it (0008: on delete cascade).
  delete from public.control_shows where id = v_show;
end $$;
