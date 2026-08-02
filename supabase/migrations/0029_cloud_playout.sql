-- Cloud playout (docs/CLOUD_PLAYOUT.md): the persistent browser-output URL over the
-- EXISTING hosted-control log (0008). No second transport, no second staging model — this
-- migration adds a READ-ONLY rendering capability beside the operating capability:
--
--   * `output_slug` — a second unguessable slug on control_shows. Holding it authorizes
--     RENDERING the production (resolve the published payload, read the log tail, report
--     applied state, heartbeat) and nothing else: it never resolves the control slug, the
--     panel spec, or the staged buffer, so an output URL pasted into CasparCG/OBS cannot
--     operate the show.
--   * `output` — the published renderable payload (templates + cues), PINNED at publish
--     (docs/CLOUD_PLAYOUT.md §2): a renderer on air must never change under the operator.
--   * a `cue` STATUS row in the control_send allowlist, so every operator page agrees on
--     which cue is live. Receivers ignore unknown `t` by construction, so already-exported
--     graphics are unaffected.
--   * owner pruning of old log rows — a 24/7 output URL must not grow the append-only log
--     without bound (0008 shipped no retention at all).
--
-- The slug alphabet is URL-safe base64 (`-_` for `+/`): 0008's raw base64 only ever lives
-- inside an encodeURIComponent'd query parameter, but an output URL gets hand-typed into
-- broadcast software, so `+` and `/` are traps.

-- ── 1. The output capability + payload + heartbeat ───────────────────────────────────────────
alter table public.control_shows
  add column if not exists output_slug text unique
    default translate(encode(gen_random_bytes(9), 'base64'), '+/', '-_'),
  add column if not exists output jsonb,
  add column if not exists output_seen_at timestamptz;

-- ── 2. Resolve for the RENDERER: payload + live snapshot + log baseline, nothing else. ───────
create or replace function public.control_output_by_slug(p_output_slug text)
returns table (id uuid, title text, output jsonb, live jsonb, last_event_id bigint)
language sql security definer set search_path = '' stable as $$
  select s.id, s.title, s.output, s.live,
         coalesce((select max(e.id) from public.control_events e where e.show_id = s.id), 0)
  from public.control_shows s where s.output_slug = p_output_slug and p_output_slug is not null;
$$;
grant execute on function public.control_output_by_slug(text) to anon, authenticated;

-- The renderer's gap fill — control_tail addressed by the output capability (a renderer never
-- holds the control slug). No graphic filter: the output page drives every graphic.
create or replace function public.control_output_tail(p_output_slug text, p_after bigint)
returns table (id bigint, graphic text, msg jsonb, created_at timestamptz)
language sql security definer set search_path = '' stable as $$
  select e.id, e.graphic, e.msg, e.created_at
  from public.control_events e
  join public.control_shows s on s.id = e.show_id
  where s.output_slug = p_output_slug and e.id > p_after
  order by e.id
  limit 500;
$$;
grant execute on function public.control_output_tail(text, bigint) to anon, authenticated;

-- The renderer's applied-state report — same write as control_report (0022 body), addressed
-- by the output slug. The boot recovery and every operator chip read what it writes.
create or replace function public.control_output_report(p_output_slug text, p_graphic text, p_data jsonb, p_state jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
begin
  select id, owner_id into v_show, v_owner from public.control_shows where output_slug = p_output_slug;
  if v_show is null then raise exception 'unknown output page'; end if;
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
grant execute on function public.control_output_report(text, text, jsonb, jsonb) to anon, authenticated;

-- The renderer's heartbeat: operator surfaces read output_seen_at staleness as "renderer
-- connected". A bare column stamp — deliberately NOT a log row (a heartbeat every 60 s must
-- not spend the shared 50-per-5-s command budget or grow the log).
create or replace function public.control_output_seen(p_output_slug text)
returns void language sql security definer set search_path = '' as $$
  update public.control_shows set output_seen_at = now()
  where output_slug = p_output_slug and p_output_slug is not null;
$$;
grant execute on function public.control_output_seen(text) to anon, authenticated;

-- ── 3. The operator resolve grows the published payload + renderer heartbeat. ────────────────
-- Additive columns on the return: the hosted page composes its local PREVIEW iframes from the
-- published templates, and shows the renderer status. Exported receivers read row fields by
-- name, so the extra columns are invisible to them. Return type changes need a drop.
drop function if exists public.control_show_by_slug(text);
create function public.control_show_by_slug(p_slug text)
returns table (id uuid, title text, panel jsonb, staged jsonb, live jsonb, last_event_id bigint,
               output jsonb, output_seen_at timestamptz)
language sql security definer set search_path = '' stable as $$
  select s.id, s.title, s.panel, s.staged, s.live,
         coalesce((select max(e.id) from public.control_events e where e.show_id = s.id), 0),
         s.output, s.output_seen_at
  from public.control_shows s where s.slug = p_slug;
$$;
grant execute on function public.control_show_by_slug(text) to anon, authenticated;

-- ── 4. control_send learns the `cue` STATUS row (0022 body + one allowlist entry). ───────────
-- {t:'cue', cue: <id> | null} — written on Take/Out so every open surface agrees on which cue
-- is live. A status row like 'staged'/'live': receivers ignore it (verified against
-- receiverScript.ts and hostedReceiver.ts — unknown t falls through), pages render it.
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
  return v_id;
end $$;

-- ── 4b. Batched send: a multi-part verb is ONE atomic, log-ordered insert. ───────────────────
-- Take is four commands (update → stop previous → play → cue status); sent one at a time it
-- pays four RPC round-trips of on-air latency and can fail halfway, leaving the renderer
-- inconsistent. The batch validates every item first, checks the burst budget once for the
-- whole batch, and inserts in array order (identity ids follow the ORDER BY, so log order is
-- the verb's order).
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
end $$;
grant execute on function public.control_send_many(text, jsonb) to anon, authenticated;

-- ── 5. Log retention: the OWNER may prune their shows' old rows (publish deletes > 7 days). ──
-- 0008 deliberately had no DELETE policy at all; the owner-scoped one keeps "writes go through
-- RPCs" true for operators while letting the publish path bound the log.
drop policy if exists "control_events_owner_delete" on public.control_events;
create policy "control_events_owner_delete" on public.control_events for delete to authenticated
  using (exists (
    select 1 from public.control_shows s
    where s.id = show_id and s.owner_id = (select auth.uid())
  ));

-- ── 6. Prove it, or refuse to apply ──────────────────────────────────────────────────────────
do $$
declare
  v_slug text;
begin
  -- (a) The output slug alphabet is URL-safe.
  v_slug := translate(encode(gen_random_bytes(64), 'base64'), '+/', '-_');
  if v_slug ~ '[+/]' then
    raise exception 'cloud playout self-check failed: slug alphabet is not URL-safe';
  end if;
  -- (b) Every new capability function exists with the expected signature.
  if to_regprocedure('public.control_output_by_slug(text)') is null
     or to_regprocedure('public.control_output_tail(text, bigint)') is null
     or to_regprocedure('public.control_output_report(text, text, jsonb, jsonb)') is null
     or to_regprocedure('public.control_output_seen(text)') is null
     or to_regprocedure('public.control_send_many(text, jsonb)') is null then
    raise exception 'cloud playout self-check failed: an output RPC is missing';
  end if;
  -- (c) The operator resolve carries the payload columns.
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'control_shows'
        and column_name in ('output_slug', 'output', 'output_seen_at')) <> 3 then
    raise exception 'cloud playout self-check failed: control_shows columns missing';
  end if;
  -- (d) Existing rows were back-filled with distinct output slugs.
  if exists (select 1 from public.control_shows where output_slug is null) then
    raise exception 'cloud playout self-check failed: a row has no output_slug';
  end if;
end $$;
