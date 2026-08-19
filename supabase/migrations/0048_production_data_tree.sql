-- Production Data, the hosted half: a production-scoped tree of live values, and the one RPC
-- that writes it (docs/PRODUCTION_DATA_PLAN.md §4; the shipped graphic-addressed ingress is
-- 0047 + docs/DATA_API.md).
--
-- WHAT CHANGES FOR AN INTEGRATOR. 0047's /api/data/update addresses a GRAPHIC by name and its
-- fields by LABEL, so a scoreboard has to know the production's rundown. This migration moves
-- the address to the DATA: a caller patches `match.home.score`, and every field any graphic has
-- BOUND to that path follows. The renderer still learns nothing new - the RPC resolves bindings
-- itself and appends the same ordinary `update` rows every operator surface writes.
--
-- WHY THE MERGE HAPPENS HERE rather than in the serverless function. A patch is a
-- read-modify-write of one jsonb column, and two feeds (or a feed and an operator) racing
-- through separate function instances would lose one of the two updates. The row is locked and
-- merged inside ONE transaction here, so the last writer wins the KEY it wrote and nothing
-- else. That is also why the merge is duplicated in plpgsql at all - see the conformance note
-- on jsonb_merge_patch below, which is the guard against the two implementations drifting.
--
-- WHY THE DIFF IS DERIVED, NOT STORED. Only fields whose STRING actually changed become rows:
-- the log caps a production at 50 commands per 5 s (0008) and every row fans out over Realtime
-- to the renderer and every open operator page. The baseline is not kept anywhere - it is the
-- tree as it was BEFORE this patch, which the same transaction still has. A stored "last sent"
-- would be a second piece of state to keep true.

-- ── 1. The columns ───────────────────────────────────────────────────────────────────────────
-- `data` is the LIVE tree (what is true right now). `bindings` is graphic -> field id -> path,
-- pinned at publish beside `panel`/`output` because it is authored state, not runtime state.
-- Both default to an empty object so a production published by an older build reads as "no data,
-- no bindings" rather than null-checking at every use.
alter table public.control_shows
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists bindings jsonb not null default '{}'::jsonb;

-- ── 2. RFC 7386 JSON Merge Patch ─────────────────────────────────────────────────────────────
-- The twin of `mergePatch` in src/model/productionData.ts. THE RULES: a patch that is not an
-- object replaces the target (which is what makes arrays replace wholesale - the RFC's own
-- answer, and the one this project wants: no invented array-element semantics); a JSON `null`
-- VALUE deletes its key; everything else merges recursively.
--
-- CONFORMANCE: the self-check at the bottom of this file runs the shared table from
-- scripts/merge-patch-conformance.mjs against this body, and
-- scripts/production-data-migration.test.mjs fails the build if the two tables stop matching.
-- Neither implementation owns the rules; that file does.
create or replace function public.jsonb_merge_patch(p_target jsonb, p_patch jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_out jsonb;
  v_key text;
  v_val jsonb;
begin
  -- Not an object: the patch IS the new value. `null::jsonb` (SQL NULL) means "no patch".
  if p_patch is null then return p_target; end if;
  if jsonb_typeof(p_patch) <> 'object' then return p_patch; end if;
  if p_target is null or jsonb_typeof(p_target) <> 'object' then
    v_out := '{}'::jsonb;
  else
    v_out := p_target;
  end if;
  for v_key, v_val in select key, value from jsonb_each(p_patch) loop
    if jsonb_typeof(v_val) = 'null' then
      v_out := v_out - v_key;
    else
      v_out := jsonb_set(v_out, array[v_key], public.jsonb_merge_patch(v_out -> v_key, v_val), true);
    end if;
  end loop;
  return v_out;
end $$;
revoke execute on function public.jsonb_merge_patch(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.jsonb_merge_patch(jsonb, jsonb) to service_role;

-- ── 3. The value -> field string rule ────────────────────────────────────────────────────────
-- The twin of `formatValue` in src/model/productionData.ts, and the reason a missing feed key
-- never blanks a live graphic: NULL here means WRITE NOTHING, and every caller below skips it.
-- A scalar stringifies; an array of scalars joins with newlines (that is what a `lines` field
-- is - a ticker binds to `headlines`); an object, an array of objects, an empty array and a
-- JSON null are not values a field can hold, so they write nothing and the field keeps its last
-- good value. Number FORMATTING stays in the template, where it already lives.
create or replace function public.production_data_format(p_value jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_elem jsonb;
  v_parts text[] := array[]::text[];
begin
  if p_value is null then return null; end if;
  case jsonb_typeof(p_value)
    when 'string' then return p_value #>> '{}';
    when 'number' then return p_value #>> '{}';
    when 'boolean' then return p_value #>> '{}';
    when 'array' then
      if jsonb_array_length(p_value) = 0 then return null; end if;
      for v_elem in select value from jsonb_array_elements(p_value) loop
        if jsonb_typeof(v_elem) not in ('string', 'number', 'boolean') then return null; end if;
        v_parts := v_parts || (v_elem #>> '{}');
      end loop;
      return array_to_string(v_parts, chr(10));
    else return null;  -- 'object', 'null'
  end case;
end $$;
revoke execute on function public.production_data_format(jsonb) from public, anon, authenticated;
grant execute on function public.production_data_format(jsonb) to service_role;

-- ── 4. Resolve every binding against one tree ────────────────────────────────────────────────
-- The twin of `resolveBindings`. Returns (graphic, field, value) for every binding that
-- actually resolves to something writable; an unresolvable one contributes NO ROW, which is
-- what makes "a missing path writes nothing" structural rather than remembered.
-- The path grammar is dot segments with numeric indices (`match.home.score`, `drivers.0.gap`);
-- `#>` walks object keys and array indices with the same text array, so one grammar covers both.
create or replace function public.production_data_resolve(p_data jsonb, p_bindings jsonb)
returns table (graphic text, field text, value text)
language sql immutable set search_path = '' as $$
  select g.key, f.key, public.production_data_format(p_data #> string_to_array(f.value #>> '{}', '.'))
  from jsonb_each(coalesce(p_bindings, '{}'::jsonb)) as g(key, value)
  cross join lateral jsonb_each(case when jsonb_typeof(g.value) = 'object' then g.value else '{}'::jsonb end) as f(key, value)
  where jsonb_typeof(f.value) = 'string'
    and f.value #>> '{}' <> ''
    and public.production_data_format(p_data #> string_to_array(f.value #>> '{}', '.')) is not null;
$$;
revoke execute on function public.production_data_resolve(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.production_data_resolve(jsonb, jsonb) to service_role;

-- ── 5. The patch RPC ─────────────────────────────────────────────────────────────────────────
-- Merge, resolve, diff, append - in ONE transaction with the row locked. Mirrors
-- control_data_send's gates exactly (unknown key, entitlement, the 50-per-5s cap and the
-- 25-per-5s INGEST BUDGET that keeps operator headroom), and writes nothing but `update` rows
-- marked `src:'api'`. It cannot play, stop, take or clear a graphic: this function is the only
-- thing the data key opens, and there is no branch here that emits any other `t`.
--
-- A patch that changes nothing writes NO rows and still succeeds - re-sending the same score is
-- the normal shape of a polling connector, and it must not spend the production's budget.
create or replace function public.control_data_patch(p_key text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
  v_before jsonb;
  v_after jsonb;
  v_bindings jsonb;
  v_recent int;
  v_ingest int;
  v_graphic text;
  v_changes jsonb;
  v_changed jsonb;
  v_id bigint;
  v_writes jsonb := '[]'::jsonb;
  v_pending int;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'not a data patch';
  end if;
  -- FOR UPDATE is the whole reason this is one RPC: it serialises two feeds racing on the same
  -- production, so a merge can never be computed from a tree another writer has already moved.
  select s.id, s.owner_id, s.data, s.bindings
    into v_show, v_owner, v_before, v_bindings
    from public.control_shows s
    where s.data_key = p_key and p_key is not null
    for update;
  if v_show is null then raise exception 'unknown data key'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;

  v_after := public.jsonb_merge_patch(coalesce(v_before, '{}'::jsonb), p_patch);

  -- WHAT ACTUALLY CHANGED, per graphic: the fields whose resolved STRING differs between the
  -- tree before this patch and the tree after it. A path that DISAPPEARED is absent from the
  -- `after` side, so it produces no entry and the live field keeps its last good value.
  --
  -- Deliberately a plain query into a jsonb, not a temporary table: this function runs with
  -- `search_path = ''`, where an unqualified temp relation resolves only through Postgres's
  -- implicit pg_temp rule - a subtlety no reader should have to know to be sure the function
  -- works.
  select coalesce(jsonb_object_agg(g.graphic, g.fields), '{}'::jsonb), count(*)
    into v_changes, v_pending
  from (
    select a.graphic, jsonb_object_agg(a.field, a.value) as fields
    from public.production_data_resolve(v_after, v_bindings) a
    left join public.production_data_resolve(v_before, v_bindings) b
      on b.graphic = a.graphic and b.field = a.field
    where b.value is distinct from a.value
    group by a.graphic
  ) g;

  if v_pending > 0 then
    select count(*), count(*) filter (where e.msg->>'src' = 'api')
      into v_recent, v_ingest
      from public.control_events e
      where e.show_id = v_show and e.created_at > now() - interval '5 seconds';
    -- One patch may touch several graphics, so it costs several rows. Both caps are checked
    -- against what this call is ABOUT to write, not against what it already wrote.
    if v_recent + v_pending > 50 then
      raise exception 'too many commands — slow down' using errcode = 'check_violation';
    end if;
    if v_ingest + v_pending > 25 then
      raise exception 'data budget spent — the operator keeps priority' using errcode = 'check_violation';
    end if;
  end if;

  -- The tree moves whether or not anything was bound: production data is the production's
  -- state, and a value nothing displays yet is still true.
  update public.control_shows s set data = v_after where s.id = v_show;

  for v_graphic, v_changed in select key, value from jsonb_each(v_changes) loop
    insert into public.control_events (show_id, graphic, msg)
      values (v_show, v_graphic, jsonb_build_object('t', 'update', 'data', v_changed, 'src', 'api'))
      returning public.control_events.id into v_id;
    v_writes := v_writes || jsonb_build_object('graphic', v_graphic, 'event', v_id, 'applied', v_changed);
  end loop;

  return jsonb_build_object('data', v_after, 'writes', v_writes);
end $$;
revoke execute on function public.control_data_patch(text, jsonb) from public, anon, authenticated;
grant execute on function public.control_data_patch(text, jsonb) to service_role;

-- ── 6. The read RPC ──────────────────────────────────────────────────────────────────────────
-- What NoaCG currently believes this production's state is - what an integrator asks after a
-- restart, a crash or a network partition instead of blindly pushing a whole snapshot
-- (docs/PRODUCTION_DATA_PLAN.md §7). Reading is compatible with the invariant that matters:
-- external integrations manipulate production DATA, never individual graphic instances.
-- It deliberately returns neither the control slug nor the panel - the data key never widens.
create or replace function public.control_data_read(p_key text)
returns jsonb language sql security definer set search_path = '' stable as $$
  select jsonb_build_object('data', s.data, 'bindings', s.bindings)
  from public.control_shows s
  where s.data_key = p_key and p_key is not null;
$$;
revoke execute on function public.control_data_read(text) from public, anon, authenticated;
grant execute on function public.control_data_read(text) to service_role;

-- ── 7. Prove it, or refuse to apply ──────────────────────────────────────────────────────────
-- CALL every body. A self-check that only inspected catalogs would pass a merge function that
-- silently replaced instead of merging.
do $$
declare
  -- THE SHARED CONFORMANCE TABLE, embedded from scripts/merge-patch-conformance.mjs.
  -- scripts/production-data-migration.test.mjs fails the build if this literal and that file
  -- stop matching, so adding a case there forces it to be answered here.
  v_cases jsonb := $cases$[
    {"name":"a nested patch keeps the siblings it did not mention","base":{"a":{"b":1,"c":2}},"patch":{"a":{"b":5}},"expect":{"a":{"b":5,"c":2}}},
    {"name":"null deletes exactly its own key","base":{"a":{"b":1,"c":2}},"patch":{"a":{"b":null}},"expect":{"a":{"c":2}}},
    {"name":"a patch creates the branch it needs","base":{},"patch":{"match":{"home":{"score":4}}},"expect":{"match":{"home":{"score":4}}}},
    {"name":"arrays REPLACE wholesale - no element merging","base":{"rows":[1,2,3]},"patch":{"rows":[9]},"expect":{"rows":[9]}},
    {"name":"a scalar replaces an object","base":{"a":{"b":1}},"patch":{"a":"gone"},"expect":{"a":"gone"}},
    {"name":"an object replaces a scalar","base":{"a":"text"},"patch":{"a":{"b":1}},"expect":{"a":{"b":1}}},
    {"name":"deleting a key that is not there is not an error","base":{"a":1},"patch":{"b":null},"expect":{"a":1}},
    {"name":"an empty patch changes nothing","base":{"a":{"b":1}},"patch":{},"expect":{"a":{"b":1}}},
    {"name":"false and 0 are values, not absences","base":{"open":true,"votes":7},"patch":{"open":false,"votes":0},"expect":{"open":false,"votes":0}},
    {"name":"deleting a whole branch","base":{"match":{"home":{"score":1}},"weather":{"temp":4}},"patch":{"weather":null},"expect":{"match":{"home":{"score":1}}}},
    {"name":"a deep patch merges without disturbing a sibling branch","base":{"match":{"home":{"name":"Finland","score":1},"away":{"name":"Sweden","score":0}}},"patch":{"match":{"home":{"score":2}}},"expect":{"match":{"home":{"name":"Finland","score":2},"away":{"name":"Sweden","score":0}}}},
    {"name":"an empty object value creates an empty branch rather than deleting","base":{"a":1},"patch":{"b":{}},"expect":{"a":1,"b":{}}}
  ]$cases$::jsonb;
  v_case jsonb;
  v_got jsonb;
  v_refused boolean := false;
  v_rows int;
begin
  -- (a) The two columns exist, are jsonb, and are NOT NULL with an object default.
  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'control_shows'
      and c.column_name in ('data', 'bindings') and c.data_type = 'jsonb'
      and c.is_nullable = 'NO'
    having count(*) = 2
  ) then
    raise exception 'control_shows.data / .bindings missing, nullable, or not jsonb';
  end if;

  -- (b) CALL the merge body on every shared conformance case.
  for v_case in select value from jsonb_array_elements(v_cases) loop
    v_got := public.jsonb_merge_patch(v_case->'base', v_case->'patch');
    if v_got is distinct from (v_case->'expect') then
      raise exception 'merge-patch conformance failed: % — got %, expected %',
        v_case->>'name', v_got, v_case->'expect';
    end if;
  end loop;

  -- (c) CALL the format body: the writes, and the four write-nothings.
  if public.production_data_format('"Finland"'::jsonb) is distinct from 'Finland'
     or public.production_data_format('3'::jsonb) is distinct from '3'
     or public.production_data_format('17.4'::jsonb) is distinct from '17.4'
     or public.production_data_format('true'::jsonb) is distinct from 'true'
     or public.production_data_format('false'::jsonb) is distinct from 'false'
     or public.production_data_format('["a","b"]'::jsonb) is distinct from ('a' || chr(10) || 'b') then
    raise exception 'production_data_format does not stringify a writable value correctly';
  end if;
  if public.production_data_format('null'::jsonb) is not null
     or public.production_data_format('{"a":1}'::jsonb) is not null
     or public.production_data_format('[{"a":1}]'::jsonb) is not null
     or public.production_data_format('[]'::jsonb) is not null
     or public.production_data_format(null::jsonb) is not null then
    raise exception 'production_data_format wrote something for a value a field cannot hold';
  end if;

  -- (d) CALL the resolve body: a bound path resolves, a missing one contributes NO ROW (which
  --     is what keeps a live field from going blank), and an array index walks.
  select count(*) into v_rows from public.production_data_resolve(
    '{"match":{"home":{"score":3}},"drivers":[{"gap":"LEADER"}]}'::jsonb,
    '{"Scorebug":{"f1":"match.home.score","f2":"match.away.score","f3":"drivers.0.gap"}}'::jsonb);
  if v_rows <> 2 then
    raise exception 'production_data_resolve returned % rows, expected 2 (the missing path must contribute none)', v_rows;
  end if;
  if not exists (
    select 1 from public.production_data_resolve(
      '{"match":{"home":{"score":3}}}'::jsonb,
      '{"Scorebug":{"f1":"match.home.score"}}'::jsonb) r
    where r.graphic = 'Scorebug' and r.field = 'f1' and r.value = '3'
  ) then
    raise exception 'production_data_resolve did not resolve a bound path to its string';
  end if;

  -- (e) CALL the patch body: an unknown key is refused before anything is written.
  begin
    perform public.control_data_patch('self-check-no-such-key', '{"a":1}'::jsonb);
  exception when others then
    v_refused := sqlerrm = 'unknown data key';
  end;
  if not v_refused then
    raise exception 'control_data_patch accepted an unknown key';
  end if;

  -- (f) CALL the patch body with a non-object: it must refuse before touching the row.
  v_refused := false;
  begin
    perform public.control_data_patch('self-check-no-such-key', '"scalar"'::jsonb);
  exception when others then
    v_refused := sqlerrm = 'not a data patch';
  end;
  if not v_refused then
    raise exception 'control_data_patch accepted a patch that is not an object';
  end if;

  -- (g) CALL the read body: an unknown key answers nothing rather than erroring.
  if public.control_data_read('self-check-no-such-key') is not null then
    raise exception 'control_data_read answered an unknown key';
  end if;
end $$;
