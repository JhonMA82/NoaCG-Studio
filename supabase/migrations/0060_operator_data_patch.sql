-- The OPERATOR's door on production data: a ± press or an event's `adjust` on a BOUND field
-- moves the shared value instead of the field (docs/PRODUCTION_DATA_PLAN.md §2.9's Phase 3,
-- docs/CONTROL_PANEL_ANY_GRAPHIC.md §5 row 9). 0048 built the tree and the feed's door into it;
-- this file adds the two things a DASHBOARD needs and nothing else.
--
-- THIS FILE WAS CORRECTED AFTER ITS OWN BRANCH LANDED, and that is allowed here for one reason:
-- it has never applied anywhere. Its self-check raised on the post-land push for pull request
-- 280 and again for 281, the whole migration rolled back in one transaction, and
-- `list_migrations` on the project carries no 0060 row - so there is no applied text to disagree
-- with and supabase/README.md's "a new migration, never by editing an applied one" does not
-- bite. The correction is one qualification in `production_data_patch_paths`, explained where it
-- sits. If this file ever DOES apply somewhere, the next correction is 0061.
--
-- WHY THE HOSTED CONTROL PAGE COULD NOT DO THIS BEFORE. That page is capability-addressed by an
-- unguessable control slug and signed out. It has no data key and must never be given one -
-- docs/DATA_API.md's "never a web page" warning is about exactly this surface - and until now
-- nothing it could reach read or wrote `control_shows.data`. So a `+1` there wrote one field on
-- one graphic, and the next shared write put it back. That is the bug §2.9 names.
--
-- WHY THE SLUG IS THE RIGHT CAPABILITY. It already reaches `control_send_many` (0029/0057),
-- which appends `update` rows to any graphic in the production. A patch of the tree RESOLVES to
-- exactly those rows, through `production_data_resolve`, and can emit nothing else. So this
-- widens what the slug can do by nothing at all; what it changes is that the figure lands in the
-- production's own state rather than on one graphic, which is the whole point.
--
-- WHY THE OPERATOR'S ROWS ARE NOT THE FEED'S. 0048 charges every patch against TWO caps: the
-- log's 50 commands per 5 s, and a 25-per-5-s INGEST budget counted over rows marked
-- `src:'api'`. That second cap exists so that a feed cannot spend the production's allowance and
-- leave the operator unable to act - "the operator keeps priority" is its own comment. Routing
-- an operator's press through it would have inverted it exactly: a saturated feed would refuse
-- the operator's own score. So `src` becomes a parameter, an operator's rows are marked
-- `operator`, and only `api` is charged to the ingest budget. Both roads still meet the 50.
--
-- WHY control_data_patch IS REWRITTEN RATHER THAN COPIED. Merge, resolve, diff, cap, append is
-- one paragraph of rules, and 0048's own header argues at length against two implementations of
-- the merge. Two implementations of the DIFF would be the same mistake one level up: the copy
-- that forgets "a path that disappeared writes nothing" blanks a live graphic. So the body moves
-- once into `control_data_apply` and both doors call it. The two wrappers keep their exact
-- signatures, so `create or replace` suffices and nothing is dropped: `api/_lib/dataIngest.ts`
-- calls `control_data_patch(p_key, p_patch)` and is untouched by this file.

-- ── 1. The one body: merge, resolve, diff, cap, append ───────────────────────────────────────
-- 0048's `control_data_patch` body, with the show already resolved and the source named. It is
-- INTERNAL: the callers below are what hold a credential, and this function holds none - being
-- handed a show id IS the authorization, so nothing that can reach a client may call it.
create or replace function public.control_data_apply(p_show uuid, p_patch jsonb, p_src text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner_id uuid;
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
  -- A source this file does not know would be a row nobody's budget counts. Better to refuse it
  -- than to let a future caller invent one and quietly leave the ingest cap unenforced.
  if p_src is null or p_src not in ('api', 'operator') then
    raise exception 'unknown data source';
  end if;
  -- FOR UPDATE is the whole reason the merge lives in one function: it serialises two feeds (or
  -- a feed and an operator) racing on the same production, so a merge can never be computed from
  -- a tree another writer has already moved.
  select s.owner_id, s.data, s.bindings
    into v_owner_id, v_before, v_bindings
    from public.control_shows s
    where s.id = p_show
    for update;
  if v_owner_id is null then raise exception 'unknown production'; end if;
  if public.feature_denied_for(v_owner_id, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;

  v_after := public.jsonb_merge_patch(coalesce(v_before, '{}'::jsonb), p_patch);

  -- WHAT ACTUALLY CHANGED, per graphic: the fields whose resolved STRING differs between the
  -- tree before this patch and the tree after it. A path that DISAPPEARED is absent from the
  -- `after` side, so it produces no entry and the live field keeps its last good value.
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
      where e.show_id = p_show and e.created_at > now() - interval '5 seconds';
    -- One patch may touch several graphics, so it costs several rows. Both caps are checked
    -- against what this call is ABOUT to write, not against what it already wrote.
    if v_recent + v_pending > 50 then
      raise exception 'too many commands — slow down' using errcode = 'check_violation';
    end if;
    -- THE INGEST BUDGET IS THE FEED'S ALONE. An operator's press is one of the production's own
    -- 50 and nothing more; charging it here is what would let a feed at its cap refuse the
    -- operator's score, which is the opposite of what the budget is for.
    if p_src = 'api' and v_ingest + v_pending > 25 then
      raise exception 'data budget spent — the operator keeps priority' using errcode = 'check_violation';
    end if;
  end if;

  -- The tree moves whether or not anything was bound: production data is the production's
  -- state, and a value nothing displays yet is still true. A patch that changes NOTHING is the
  -- one case that writes nothing: both caps above sit behind `v_pending > 0`, so a no-op is
  -- uncapped, and this door is granted to `anon` - a stuck retry or a second phone re-sending
  -- the same score would otherwise take the production's row lock and leave a dead tuple per
  -- call, serializing every real press behind it while the programme is on air.
  if v_after is distinct from v_before then
    update public.control_shows s set data = v_after where s.id = p_show;
  end if;

  for v_graphic, v_changed in select key, value from jsonb_each(v_changes) loop
    insert into public.control_events (show_id, graphic, msg)
      values (p_show, v_graphic, jsonb_build_object('t', 'update', 'data', v_changed, 'src', p_src))
      returning public.control_events.id into v_id;
    v_writes := v_writes || jsonb_build_object('graphic', v_graphic, 'event', v_id, 'applied', v_changed);
  end loop;

  return jsonb_build_object('data', v_after, 'writes', v_writes);
end $$;
revoke execute on function public.control_data_apply(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.control_data_apply(uuid, jsonb, text) to service_role;

-- ── 2. The FEED's door, unchanged in signature and in behaviour ──────────────────────────────
-- Same name, same arguments, same answer, same `src:'api'` rows, same two caps. All that moved
-- is where the paragraph lives. `create or replace` because the signature is identical - nothing
-- is dropped here and no caller changes.
create or replace function public.control_data_patch(p_key text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
begin
  select s.id into v_show from public.control_shows s where s.data_key = p_key and p_key is not null;
  if v_show is null then raise exception 'unknown data key'; end if;
  return public.control_data_apply(v_show, p_patch, 'api');
end $$;
revoke execute on function public.control_data_patch(text, jsonb) from public, anon, authenticated;
grant execute on function public.control_data_patch(text, jsonb) to service_role;

-- ── 3a. What a patch actually NAMES ─────────────────────────────────────────────────────────
-- Every path a merge patch writes a value at, in the plan's own grammar (dot segments). An OBJECT
-- is a branch and is walked into; everything else - scalar, array, null, `{}` - is a value, and
-- the path that reaches it is what the patch writes. `{"match":{"home":{"score":5}}}` names
-- exactly `match.home.score`, which is precisely what one press of a bound field produces.
create or replace function public.production_data_patch_paths(p_patch jsonb, p_prefix text default '')
returns table (path text, value jsonb) language plpgsql immutable set search_path = '' as $$
declare
  v_key text;
  v_val jsonb;
  v_path text;
begin
  -- `jsonb_each` IS ALIASED AND ITS COLUMNS QUALIFIED, and that is not a style choice. This
  -- function's RETURNS TABLE names an out-parameter `value`, which is a plpgsql variable in
  -- scope here; an unqualified `value` in this query is therefore ambiguous between that
  -- variable and `jsonb_each`'s own column, and Postgres refuses the statement at run time with
  -- `column reference "value" is ambiguous`. Nothing plans this query until the loop executes,
  -- so the whole migration applied as far as its own self-check before failing - which is what
  -- it did on the post-land push for pull request 280 (run 35045162515, statement 15), rolling
  -- 0060 back in full. `control_data_apply` above runs the same `select key, value` shape and is
  -- fine, because that function returns a scalar and declares no such out parameter.
  for v_key, v_val in select e.key, e.value from jsonb_each(p_patch) e loop
    v_path := case when p_prefix = '' then v_key else p_prefix || '.' || v_key end;
    if jsonb_typeof(v_val) = 'object' and v_val <> '{}'::jsonb then
      return query select p.path, p.value from public.production_data_patch_paths(v_val, v_path) p;
    else
      return query select v_path, v_val;
    end if;
  end loop;
end $$;
revoke execute on function public.production_data_patch_paths(jsonb, text) from public, anon, authenticated;
grant execute on function public.production_data_patch_paths(jsonb, text) to service_role;

-- ── 3b. The OPERATOR's door ─────────────────────────────────────────────────────────────────
-- The control slug is the authorization, exactly as it is for `control_show_by_slug` and
-- `control_send_many`: operating a production needs no account, and this is one of the things
-- operating it means. Open to both client roles, because the hosted control page runs signed out
-- and the in-app production page runs signed in, and they press the same button.
--
-- IT MAY ONLY MOVE VALUES THE PRODUCTION HAS BOUND, and that restriction is the difference
-- between this door and the feed's. The feed holds a data key, which is the owner's and says "you
-- may write this production's state". The slug is a SHARED OPERATING LINK - passed to a class, to
-- a second phone, to whoever is running the show - and until this migration it reached only the
-- append-only command log. Forwarding an arbitrary merge patch would have made it reach
-- `control_shows.data` wholesale, where `{"match": null}` deletes a production's authored tree
-- permanently and nothing on any surface would say who did it. That is a new capability, not the
-- one the header above argues is already there: the rows a patch resolves to are indeed only
-- `update` rows, but the COLUMN it writes on the way is durable state the log is not.
--
-- A press can name nothing else, so nothing else is allowed. The one shape that is not a bound
-- path is an ARRAY replacing a branch a binding reaches into: merge-patch cannot address an array
-- ELEMENT at all (`drivers.0.gap` is the plan's own example), so a press on such a binding must
-- send the whole array. That is allowed for an array and for no other type, which is what keeps
-- `{"match": "x"}` - replacing a whole branch with a scalar - refused.
create or replace function public.control_data_patch_by_slug(p_slug text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_bindings jsonb;
  v_stray text;
begin
  select s.id, s.bindings into v_show, v_bindings
    from public.control_shows s where s.slug = p_slug and p_slug is not null;
  if v_show is null then raise exception 'unknown control slug'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'not a data patch'; end if;

  select p.path into v_stray
  from public.production_data_patch_paths(p_patch) p
  where not exists (
    select 1
    from jsonb_each(coalesce(v_bindings, '{}'::jsonb)) g
    cross join lateral jsonb_each_text(
      case when jsonb_typeof(g.value) = 'object' then g.value else '{}'::jsonb end) f
    where f.value = p.path
       -- THE ARRAY CARVE-OUT IS NARROW ON PURPOSE, and both halves of it are load-bearing.
       -- A PREFIX TEST, NOT `like`: `p.path` is a key out of the caller's own JSON, so a `%` or
       -- an `_` in it is a LIKE wildcard. `{"%": [1]}` builds the pattern `%.%`, which matches
       -- every dotted binding there is, and the door then writes an arbitrary top-level key.
       -- AND THE BINDING MUST REACH THROUGH AN INDEX. The exception exists because merge-patch
       -- cannot address an array ELEMENT, so a press on `drivers.0.gap` has to send the whole
       -- `drivers` array. A binding that descends by NAME needs no such thing, and letting an
       -- array through on one is how `{"panel": []}` deletes a production's authored branch
       -- behind a binding like `panel.katri.points` - silently, because the bound leaves are
       -- then gone from the resolve and no `update` row is appended to say anything happened.
       -- That is the very destruction this whole door was written to refuse, reached by a
       -- different literal. Both shapes are pinned in the self-check below.
       or (jsonb_typeof(p.value) = 'array'
           and starts_with(f.value, p.path || '.')
           and split_part(substr(f.value, length(p.path) + 2), '.', 1) ~ '^[0-9]+$')
  )
  limit 1;
  if v_stray is not null then
    raise exception 'not a bound path: %', v_stray using errcode = '42501';
  end if;

  return public.control_data_apply(v_show, p_patch, 'operator');
end $$;
revoke execute on function public.control_data_patch_by_slug(text, jsonb) from public;
grant execute on function public.control_data_patch_by_slug(text, jsonb) to anon, authenticated, service_role;

-- ── 4. The operator's READ of the same two columns ───────────────────────────────────────────
-- The twin of 0048's `control_data_read`, on the slug. A dashboard needs both halves: the
-- BINDINGS say which of a graphic's fields follow a shared value (so the box reads out instead
-- of editing, and so a press knows which road to take), and the TREE says what those fields read
-- right now (so a `+1` counts from the figure the production is actually showing).
--
-- It deliberately does not widen the slug: `control_show_by_slug` already hands this caller every
-- graphic's code, fields and cue values, and the tree is the values those same graphics are
-- currently displaying. It returns no key of any kind.
create or replace function public.control_data_by_slug(p_slug text)
returns jsonb language sql security definer set search_path = '' stable as $$
  select jsonb_build_object('data', s.data, 'bindings', s.bindings)
  from public.control_shows s
  where s.slug = p_slug and p_slug is not null;
$$;
revoke execute on function public.control_data_by_slug(text) from public;
grant execute on function public.control_data_by_slug(text) to anon, authenticated, service_role;

-- ── 5. Prove it, or refuse to apply ─────────────────────────────────────────────────────────
-- supabase/AGENTS.md: a self-check proves SHAPE, never behaviour, so CALL the thing. This one
-- drives a whole production through both doors and reads the ROWS back, because the claim being
-- made is about which budget a press spends and what the wire then carries - neither of which a
-- catalog can answer. The migration runs in one transaction, so a failure here rolls the
-- rewrite above back rather than leaving the feed's door half-moved.
do $$
declare
  v_owner uuid;
  v_show  uuid := '00000000-0060-4000-8000-000000000060';
  v_slug  text;
  v_key   text;
  v_got   jsonb;
  v_rows  int;
  v_refused text;
begin
  -- (a) SHAPE: the four functions exist, and the two slug doors are open to a signed-out
  --     operator while the internal body is not.
  if to_regprocedure('public.control_data_apply(uuid,jsonb,text)') is null
     or to_regprocedure('public.control_data_patch(text,jsonb)') is null
     or to_regprocedure('public.control_data_patch_by_slug(text,jsonb)') is null
     or to_regprocedure('public.control_data_by_slug(text)') is null then
    raise exception 'operator-patch self-check failed: a function is missing';
  end if;
  if not has_function_privilege('anon', 'public.control_data_patch_by_slug(text,jsonb)', 'execute')
     or not has_function_privilege('anon', 'public.control_data_by_slug(text)', 'execute') then
    raise exception 'operator-patch self-check failed: the operator doors are shut to a signed-out page';
  end if;
  if has_function_privilege('anon', 'public.control_data_apply(uuid,jsonb,text)', 'execute')
     or has_function_privilege('authenticated', 'public.control_data_apply(uuid,jsonb,text)', 'execute') then
    raise exception 'operator-patch self-check failed: the internal body is reachable from a client';
  end if;

  -- (b) An unknown slug is refused, and says which credential it did not recognise.
  v_refused := null;
  begin
    perform public.control_data_patch_by_slug('self-check-no-such-slug', '{"a":1}'::jsonb);
  exception when others then
    v_refused := sqlerrm;
  end;
  if v_refused is distinct from 'unknown control slug' then
    raise exception 'operator-patch self-check failed: an unknown slug was not refused (%)', coalesce(v_refused, 'it was accepted');
  end if;
  if public.control_data_by_slug('self-check-no-such-slug') is not null then
    raise exception 'operator-patch self-check failed: control_data_by_slug answered an unknown slug';
  end if;

  -- (c) CALL both doors against a real production. 0057's guard: an instance with no account
  --     cannot insert an owned row, and a migration must still apply there.
  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice 'operator-patch self-check skipped the live half: no account on this instance';
    return;
  end if;

  insert into public.control_shows (id, owner_id, title, data, bindings)
    values (v_show, v_owner, 'Operator patch self-check',
            '{"match":{"home":{"score":4}},"drivers":[{"gap":"LEADER"}]}'::jsonb,
            '{"Board":{"f1":"match.home.score"},"Bug":{"f2":"match.home.score","f3":"drivers.0.gap"}}'::jsonb)
    returning slug, data_key into v_slug, v_key;

  -- (c1) A PATCH NAMES WHAT IT WRITES, and the operator door accepts nothing else. These four are
  --      the whole of the restriction, and the first two are what the feed's door may do and this
  --      one may not: a shared operating link must not be able to delete or replace a production's
  --      authored state.
  v_refused := null;
  begin
    perform public.control_data_patch_by_slug(v_slug, '{"match":null}'::jsonb);
  exception when others then v_refused := sqlerrm;
  end;
  if v_refused is distinct from 'not a bound path: match' then
    raise exception 'operator-patch self-check failed: the operator door deleted an unbound branch (%)',
      coalesce(v_refused, 'it was accepted');
  end if;
  v_refused := null;
  begin
    perform public.control_data_patch_by_slug(v_slug, '{"match":"gone"}'::jsonb);
  exception when others then v_refused := sqlerrm;
  end;
  if v_refused is distinct from 'not a bound path: match' then
    raise exception 'operator-patch self-check failed: the operator door replaced a whole branch (%)',
      coalesce(v_refused, 'it was accepted');
  end if;
  v_refused := null;
  begin
    perform public.control_data_patch_by_slug(v_slug, '{"weather":{"temp":4}}'::jsonb);
  exception when others then v_refused := sqlerrm;
  end;
  if v_refused is distinct from 'not a bound path: weather.temp' then
    raise exception 'operator-patch self-check failed: the operator door wrote a path nothing binds (%)',
      coalesce(v_refused, 'it was accepted');
  end if;
  -- An ARRAY over a branch a binding descends into BY NAME is the fourth shape, and it is the one
  -- that reads like an accident: `match.home.score` is bound, so `{"match":[]}` looks like a press
  -- on a bound path and is in fact the same deletion as `{"match":null}` wearing a type the
  -- carve-out below was written for. The carve-out belongs to a binding that reaches through an
  -- INDEX and to no other.
  v_refused := null;
  begin
    perform public.control_data_patch_by_slug(v_slug, '{"match":[]}'::jsonb);
  exception when others then v_refused := sqlerrm;
  end;
  if v_refused is distinct from 'not a bound path: match' then
    raise exception 'operator-patch self-check failed: an array emptied a branch bound by name (%)',
      coalesce(v_refused, 'it was accepted');
  end if;
  -- And the fifth: a key that is a LIKE WILDCARD. The guard compares prefixes rather than running
  -- the caller's own key as a pattern, so a key of "%" matches nothing and is refused like any
  -- other unbound path. Run this one through a variable, because the string carries a `%` and a
  -- raise format would eat it.
  v_refused := null;
  begin
    perform public.control_data_patch_by_slug(v_slug, '{"%":[1]}'::jsonb);
  exception when others then v_refused := sqlerrm;
  end;
  if v_refused is distinct from 'not a bound path: %' then
    raise exception 'operator-patch self-check failed: a wildcard key was matched as a pattern (%)',
      coalesce(v_refused, 'it was accepted');
  end if;
  -- …and the one shape that is NOT a bound path and must still go: merge-patch cannot address an
  -- array element, so a press on `drivers.0.gap` has to send the whole array.
  v_got := public.control_data_patch_by_slug(v_slug, '{"drivers":[{"gap":"+1.204"}]}'::jsonb);
  if v_got #>> '{data,drivers,0,gap}' <> '+1.204' then
    raise exception 'operator-patch self-check failed: an indexed binding could not be written';
  end if;
  if not exists (
    select 1 from public.control_events e
    where e.show_id = v_show and e.graphic = 'Bug' and e.msg #>> '{data,f3}' = '+1.204'
  ) then
    raise exception 'operator-patch self-check failed: the array write did not reach its bound field';
  end if;

  -- The FEED's door still behaves as 0048 wrote it: the tree moves, and one row per bound
  -- graphic carries the resolved string, marked `api`.
  v_got := public.control_data_patch(v_key, '{"match":{"home":{"score":5}}}'::jsonb);
  if v_got #>> '{data,match,home,score}' <> '5' then
    raise exception 'operator-patch self-check failed: the feed door did not merge';
  end if;
  select count(*) into v_rows from public.control_events e
    where e.show_id = v_show and e.msg->>'src' = 'api' and e.msg #>> '{data,f1}' = '5';
  if v_rows <> 1 then
    raise exception 'operator-patch self-check failed: the feed door wrote % rows for the bound board, expected 1', v_rows;
  end if;

  -- The OPERATOR's door: same merge, same diff, EVERY bound graphic, and rows that are not the
  -- feed's. Two graphics are bound to this one path, so one press must move both.
  v_got := public.control_data_patch_by_slug(v_slug, '{"match":{"home":{"score":6}}}'::jsonb);
  if v_got #>> '{data,match,home,score}' <> '6' then
    raise exception 'operator-patch self-check failed: the operator door did not merge';
  end if;
  -- Counted by the FIGURE this press carried rather than by `src` alone, so the array write above
  -- (also the operator's) cannot make this pass by accident.
  select count(*) into v_rows from public.control_events e
    where e.show_id = v_show and e.msg->>'src' = 'operator'
      and (e.msg #>> '{data,f1}' = '6' or e.msg #>> '{data,f2}' = '6');
  if v_rows <> 2 then
    raise exception 'operator-patch self-check failed: one press on a value two graphics bind wrote % rows, expected 2', v_rows;
  end if;
  if not exists (
    select 1 from public.control_events e
    where e.show_id = v_show and e.graphic = 'Bug' and e.msg #>> '{data,f2}' = '6'
  ) then
    raise exception 'operator-patch self-check failed: the second bound graphic did not follow the press';
  end if;

  -- The operator's read hands back both halves.
  v_got := public.control_data_by_slug(v_slug);
  if v_got #>> '{data,match,home,score}' <> '6'
     or v_got #>> '{bindings,Board,f1}' <> 'match.home.score' then
    raise exception 'operator-patch self-check failed: the operator read lost the tree or the bindings';
  end if;

  -- A patch that changes nothing writes no rows and still succeeds - re-sending the same score
  -- is the normal shape of a press held down, and it must not spend the production's budget.
  select count(*) into v_rows from public.control_events e where e.show_id = v_show;
  perform public.control_data_patch_by_slug(v_slug, '{"match":{"home":{"score":6}}}'::jsonb);
  if (select count(*) from public.control_events e where e.show_id = v_show) <> v_rows then
    raise exception 'operator-patch self-check failed: a patch that changed nothing still wrote a row';
  end if;

  -- A source this file does not know is refused before anything is written.
  v_refused := null;
  begin
    perform public.control_data_apply(v_show, '{"match":{"home":{"score":7}}}'::jsonb, 'whoever');
  exception when others then
    v_refused := sqlerrm;
  end;
  if v_refused is distinct from 'unknown data source' then
    raise exception 'operator-patch self-check failed: an unknown source was not refused (%)', coalesce(v_refused, 'it was accepted');
  end if;

  -- The rows this check made go with the show: `control_events.show_id` is
  -- `references control_shows (id) on delete cascade` (0008), so one delete takes both, and the
  -- only table this block removes from is the one it inserted into.
  delete from public.control_shows where id = v_show;
end $$;
