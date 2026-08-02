-- Persist WHICH CUE IS ON AIR on the control_shows row (docs/CLOUD_PLAYOUT.md §4).
--
-- The cue status row rides the command log, so 0029's clients recovered "what is live" by
-- scanning the recent tail. That scan was windowed by GLOBAL log ids (control_events.id is one
-- identity across every show), so on a busy multi-show instance the show's last cue marker can
-- fall outside any fixed window and a reloaded operator page shows "nothing on air" while a
-- graphic is live. The row is the right home for current-state facts - exactly where `staged`
-- and `live` already live - so the send RPCs now mirror the cue marker onto the row, and a
-- resolver reads it back with no window to miss.
--
-- The log row stays: open pages FOLLOW cue changes through it exactly as before. The column is
-- only the recovery snapshot, like `live` is for graphic state.

-- ── 1. The column: { cue: <id|null>, graphic: <name|null>, at: iso }. ────────────────────────
alter table public.control_shows
  add column if not exists live_cue jsonb;

-- ── 2. control_send mirrors a cue marker onto the row (0029 body + one update). ──────────────
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
    update public.control_shows set live_cue = jsonb_build_object(
      'cue', p_msg->'cue',
      'graphic', case when p_msg->>'cue' is null then null else p_graphic end,
      'at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    where id = v_show;
  end if;
  return v_id;
end $$;

-- ── 3. control_send_many mirrors the batch's LAST cue marker (0029 body + the same update). ──
create or replace function public.control_send_many(p_slug text, p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
  v_recent int;
  v_count int;
  v_item jsonb;
  v_cue jsonb := null;
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
    if v_item->'msg'->>'t' = 'cue' then
      v_cue := jsonb_build_object(
        'cue', v_item->'msg'->'cue',
        'graphic', case when v_item->'msg'->>'cue' is null then null else v_item->>'graphic' end,
        'at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
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
  if v_cue is not null then
    update public.control_shows set live_cue = v_cue where id = v_show;
  end if;
end $$;

-- ── 4. The operator resolve returns it (additive column; return-type change needs a drop). ───
drop function if exists public.control_show_by_slug(text);
create function public.control_show_by_slug(p_slug text)
returns table (id uuid, title text, panel jsonb, staged jsonb, live jsonb, last_event_id bigint,
               output jsonb, output_seen_at timestamptz, live_cue jsonb)
language sql security definer set search_path = '' stable as $$
  select s.id, s.title, s.panel, s.staged, s.live,
         coalesce((select max(e.id) from public.control_events e where e.show_id = s.id), 0),
         s.output, s.output_seen_at, s.live_cue
  from public.control_shows s where s.slug = p_slug;
$$;
grant execute on function public.control_show_by_slug(text) to anon, authenticated;

-- ── 5. Prove it, or refuse to apply. ─────────────────────────────────────────────────────────
do $$
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'control_shows' and column_name = 'live_cue') <> 1 then
    raise exception 'live-cue self-check failed: column missing';
  end if;
  if to_regprocedure('public.control_show_by_slug(text)') is null
     or to_regprocedure('public.control_send(text, text, jsonb)') is null
     or to_regprocedure('public.control_send_many(text, jsonb)') is null then
    raise exception 'live-cue self-check failed: an RPC is missing';
  end if;
end $$;
