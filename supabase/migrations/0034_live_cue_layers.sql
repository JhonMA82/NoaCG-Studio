-- Make the on-air cue snapshot PER LAYER (docs/CLOUD_PLAYOUT.md §4).
--
-- 0031 put "which cue is on air" on the control_shows row so a reloading operator page could
-- recover it without scanning a globally-numbered log window. It stored ONE cue, because a
-- production could only ever have one graphic up: Take stopped whatever was live before it.
-- That is the single-layer limit Stage 2 removes. A bug, a lower third and a ticker are three
-- pool graphics, therefore three renderer instances, therefore three layers, and each of them
-- holds its own on-air cue.
--
-- The LOG needed nothing: a cue status row has always carried its graphic (control_events.graphic),
-- so it was per-layer from 0029 onwards. Only the row snapshot and the clients that read it were
-- single-valued. So this migration changes one thing — how a cue marker is mirrored onto the row.
--
-- The stored shape becomes:
--     { "v": 2, "layers": { "<graphic name>": { "cue": "<cue id>", "at": "<iso>" } } }
-- An absent key means that layer is off air. Taking `cue: null` on a graphic removes its key
-- rather than storing a null, so "off air" has exactly one representation.
--
-- MIGRATION IS ON WRITE, not a backfill. The first cue marker after this lands converts a
-- format-1 row through control_live_cue_set; until then the row is still readable, because the
-- CLIENT migrates format 1 on read too (hostedControl.ts readLiveCue). A backfill would have to
-- guess at rows whose show has since been unpublished, and buys nothing the read path lacks.

-- ── 1. The mirror, owned once: migrate-then-set, so both send RPCs cannot drift. ─────────────
create or replace function public.control_live_cue_set(p_current jsonb, p_graphic text, p_cue jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_layers jsonb;
begin
  -- Every branch below is defensive on purpose: this runs INSIDE control_send, after the log
  -- insert and in the same transaction, so an error parsing a malformed snapshot would roll
  -- back the command itself. A row we cannot read is treated as "no layers were up", which the
  -- next cue marker corrects — never as a reason to refuse the send.
  if p_current is null or jsonb_typeof(p_current) <> 'object' then
    v_layers := '{}'::jsonb;
  elsif jsonb_typeof(p_current->'v') = 'number' and (p_current->>'v')::numeric >= 2 then
    v_layers := coalesce(p_current->'layers', '{}'::jsonb);
    if jsonb_typeof(v_layers) <> 'object' then v_layers := '{}'::jsonb; end if;
  elsif p_current->>'graphic' is not null and p_current->>'cue' is not null then
    -- Format 1: one live layer, named by its own `graphic` key.
    v_layers := jsonb_build_object(p_current->>'graphic',
                  jsonb_build_object('cue', p_current->'cue', 'at', p_current->'at'));
  else
    v_layers := '{}'::jsonb;
  end if;

  if p_cue is null or jsonb_typeof(p_cue) = 'null' then
    v_layers := v_layers - p_graphic;
  else
    v_layers := jsonb_set(v_layers, array[p_graphic], jsonb_build_object(
      'cue', p_cue,
      'at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  end if;
  return jsonb_build_object('v', 2, 'layers', v_layers);
end $$;

-- Called only from inside the two SECURITY DEFINER send RPCs, which do their own owner and
-- entitlement checks; it reads no table and grants nobody new reach.
revoke all on function public.control_live_cue_set(jsonb, text, jsonb) from public, anon, authenticated;

-- ── 2. control_send: same body as 0031, with the mirror routed through the helper. ───────────
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
  if coalesce(p_msg->>'t', '') not in ('update', 'play', 'stop', 'next', 'event', 'snap', 'cue') then
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
  if p_msg->>'t' = 'cue' then
    update public.control_shows
       set live_cue = public.control_live_cue_set(live_cue, p_graphic, p_msg->'cue')
     where id = v_show;
  end if;
  return v_id;
end $$;

-- ── 3. control_send_many: EVERY cue marker in the batch is applied, in order. ────────────────
-- 0031 kept only the batch's last one, which was right while a batch could only ever concern
-- one layer. A multi-layer verb (clear three layers at once) carries one marker per layer, and
-- dropping all but the last would leave two of them reading as still on air after a reload.
create or replace function public.control_send_many(p_slug text, p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
  v_recent int;
  v_count int;
  v_item jsonb;
begin
  select id, owner_id into v_show, v_owner from public.control_shows where slug = p_slug;
  if v_show is null then raise exception 'unknown control page'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'not a command batch';
  end if;
  v_count := jsonb_array_length(p_items);
  -- A verb is a handful of commands; anything bigger is an ingest pattern this API is not.
  if v_count < 1 or v_count > 8 then
    raise exception 'not a command batch';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(v_item->'msg'->>'t', '') not in ('update', 'play', 'stop', 'next', 'event', 'snap', 'cue')
       or coalesce(v_item->>'graphic', '') = '' then
      raise exception 'not a control command';
    end if;
  end loop;
  select count(*) into v_recent from public.control_events
    where show_id = v_show and created_at > now() - interval '5 seconds';
  if v_recent + v_count > 50 then
    raise exception 'too many commands — slow down' using errcode = 'check_violation';
  end if;
  insert into public.control_events (show_id, graphic, msg)
    select v_show, item.value->>'graphic', item.value->'msg'
    from jsonb_array_elements(p_items) with ordinality as item(value, ord)
    order by item.ord;
  for v_item in
    select item.value from jsonb_array_elements(p_items) with ordinality as item(value, ord) order by item.ord
  loop
    if v_item->'msg'->>'t' = 'cue' then
      update public.control_shows
         set live_cue = public.control_live_cue_set(live_cue, v_item->>'graphic', v_item->'msg'->'cue')
       where id = v_show;
    end if;
  end loop;
end $$;

-- ── 4. Prove it, or refuse to apply. ─────────────────────────────────────────────────────────
do $$
declare
  v_out jsonb;
begin
  if to_regprocedure('public.control_live_cue_set(jsonb, text, jsonb)') is null
     or to_regprocedure('public.control_send(text, text, jsonb)') is null
     or to_regprocedure('public.control_send_many(text, jsonb)') is null then
    raise exception 'live-cue layers self-check failed: an RPC is missing';
  end if;

  -- A format-1 row migrates into the layer it described, and the new take joins it.
  v_out := public.control_live_cue_set(
    jsonb_build_object('cue', 'cue-a', 'graphic', 'Bug', 'at', '2026-01-01T00:00:00.000Z'),
    'Lower third', to_jsonb('cue-b'::text));
  if v_out->'layers'->'Bug'->>'cue' <> 'cue-a' or v_out->'layers'->'Lower third'->>'cue' <> 'cue-b' then
    raise exception 'live-cue layers self-check failed: format-1 migration lost a layer';
  end if;

  -- Clearing a layer REMOVES its key; the other layers are untouched.
  v_out := public.control_live_cue_set(v_out, 'Bug', 'null'::jsonb);
  if v_out->'layers' ? 'Bug' or v_out->'layers'->'Lower third'->>'cue' <> 'cue-b' then
    raise exception 'live-cue layers self-check failed: clearing one layer did not leave the others';
  end if;
end $$;
