-- The output renderer's recovery baseline (docs/CLOUD_PLAYOUT.md §3).
--
-- 0029 resolved the renderer with two things that looked like one: `live` — the last state the
-- renderer REPORTED, per graphic — and `last_event_id`, which was the log HEAD at resolve time.
-- Boot rebuilt from `live` and then started following AFTER the head, so every command written
-- between a graphic's last report and the boot was treated as already applied, and dropped.
--
-- While a renderer runs the gap is about a second (a report follows any forwarded command
-- within ~800 ms), which is why this never showed in the editor or in rehearsal. While the
-- renderer is DOWN the gap is the whole outage: kill the output page, take a cue, bring the
-- page back — it returns to the pre-kill picture, and the cue taken meanwhile never airs.
-- Found live on prod, 2026-08-03, against the checklist's kill-and-reload step.
--
-- The fix is one field: each per-graphic report records the id of the last log row the
-- renderer had applied when it was written. Recovery is then exactly "rebuild each graphic
-- from its own report, then replay only what came after THAT graphic's report" — per graphic,
-- because reports are per graphic and one of them can be seconds fresher than another.
--
-- `last_event_id` keeps meaning the log head, so a production that has never had a renderer
-- (no reports at all) still boots at the head instead of replaying its whole history.

-- ── The report carries the applied row id, inside the graphic's own live entry ────────────────
-- A defaulted 5th parameter rather than a second function: an output page already loaded in
-- CasparCG (or a browser tab nobody will reload for days) keeps calling the 4-argument form,
-- and PostgREST cannot choose between an overload and a default — so the old signature is
-- dropped and the new one absorbs both calls. An old caller passes null and its entry simply
-- carries no `event`, which the renderer reads as "no baseline" — exactly today's behaviour.
drop function if exists public.control_output_report(text, text, jsonb, jsonb);
create function public.control_output_report(
  p_output_slug text, p_graphic text, p_data jsonb, p_state jsonb, p_last_event_id bigint default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
  v_entry jsonb;
begin
  select id, owner_id into v_show, v_owner from public.control_shows where output_slug = p_output_slug;
  if v_show is null then raise exception 'unknown output page'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;
  v_entry := jsonb_build_object(
    'data', coalesce(p_data, '{}'::jsonb),
    'state', p_state,
    'at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  if p_last_event_id is not null then
    v_entry := v_entry || jsonb_build_object('event', p_last_event_id);
  end if;
  update public.control_shows
    set live = jsonb_set(live, array[p_graphic], v_entry)
    where id = v_show;
  insert into public.control_events (show_id, graphic, msg)
    values (v_show, p_graphic, jsonb_build_object('t', 'live', 'data', p_data, 'state', p_state));
end $$;
grant execute on function public.control_output_report(text, text, jsonb, jsonb, bigint) to anon, authenticated;

-- ── Prove it, or refuse to apply ─────────────────────────────────────────────────────────────
do $$
begin
  -- The 4-argument form must be GONE and the 5-argument one present, or a 4-argument call from
  -- an already-loaded renderer becomes an ambiguous-overload error instead of a working report.
  if to_regprocedure('public.control_output_report(text, text, jsonb, jsonb)') is not null then
    raise exception 'output recovery self-check failed: the 4-argument report survived';
  end if;
  if to_regprocedure('public.control_output_report(text, text, jsonb, jsonb, bigint)') is null then
    raise exception 'output recovery self-check failed: the reporting RPC is missing';
  end if;
end $$;
