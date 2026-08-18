-- Production Data API: a per-production ingest credential + its two server-only RPCs
-- (docs/DATA_API.md).
--
-- External data enters the SAME command log as the operator (docs/CLOUD_PLAYOUT.md §7): the
-- serverless function at /api/data/update resolves this key, maps field LABELS to the
-- graphic's own fN ids via the published panel spec, and appends ordinary `update` rows. The
-- renderer never learns a new transport, and operator precedence stays what log ordering
-- already makes it.
--
-- WHY A DEDICATED KEY rather than the control slug as a bearer token. Two structural reasons:
--   * Scope. The control slug IS the phone operator page - holding it airs and clears graphics
--     (play/stop/take/snap). An integration config file must not carry the power to clear the
--     frame in order to write a score. The data key is update-only IN THE DATABASE:
--     control_data_send below writes nothing but `update` rows, and no other function accepts
--     the key at all.
--   * Rotation. Since 0040 the four capability slugs are IDENTITY - unpublish + republish
--     hands the same slugs back by design, so a leaked control slug cannot be rotated without
--     deleting the production. The data key is deliberately NOT identity-preserved: unpublish
--     + republish mints a fresh one (the coarse rotation), and the owner may UPDATE or NULL
--     the column at any time via control_shows_owner_all (the fine one; NULL = ingest off).
--
-- The key is read ONLY by the server function (service role) and the owner (RLS). No RPC
-- returns it, and the two RPCs below are EXECUTABLE ONLY BY service_role - the key is a
-- server-presented credential, never a browser capability. Both take the key in the RPC
-- BODY (PostgREST POST), never in a URL query string, so it stays out of the API gateway's
-- request logs - a `.eq('data_key', ...)` table read would have printed every key into the
-- log retention.
--
-- 18 random bytes -> 24 URL-safe base64 chars (no padding: 18 % 3 = 0), the 0029 output_slug
-- recipe with twice the entropy - this one is an API credential, not a URL people read out.
-- extensions.gen_random_bytes is schema-qualified because the migration runner's restricted
-- search_path does not include `extensions` (the measured 0029 trap; 0008's bare name only
-- survived an older CLI). It is VOLATILE, so the ADD COLUMN rewrites the table and evaluates
-- the default PER ROW: every already-published production gets its own key from this
-- migration.

alter table public.control_shows
  add column if not exists data_key text unique
  default translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');

-- ── The resolve RPC: everything the mapping layer needs, and nothing heavy. ──────────────────
-- Selects the panel and ONLY the cue list out of the pinned output payload - the payload's
-- graphics carry base64 assets, and resolving a key must never read megabytes to write a
-- score. Read-only, so it carries no entitlement gate (the 0022 doctrine: reads render and
-- explain themselves; commands are what the gate refuses).
-- It deliberately does NOT return the control slug: the data path is update-only, and a
-- function that handed back the operator capability would quietly widen the key's scope.
create or replace function public.control_data_resolve(p_key text)
returns table (id uuid, panel jsonb, cues jsonb)
language sql security definer set search_path = '' stable as $$
  select s.id, s.panel, coalesce(s.output->'cues', '[]'::jsonb)
  from public.control_shows s
  where s.data_key = p_key and p_key is not null;
$$;
revoke execute on function public.control_data_resolve(text) from public, anon, authenticated;
grant execute on function public.control_data_resolve(text) to service_role;

-- ── The send RPC: an `update` row, and only an `update` row. ─────────────────────────────────
-- Mirrors control_send's checks (entitlement, the 50-per-5s per-show cap) and adds the INGEST
-- BUDGET: rows written through this function carry `src: 'api'` inside the msg (receivers read
-- `t` and `data` and ignore extra keys; the Activity panel can name feed rows later), and at
-- most 25 of the trailing 5 seconds' rows may be ingest rows. That reservation is what makes
-- "a runaway feed cannot lock the operator out" TRUE GLOBALLY - it holds in this function, in
-- the database, not per serverless instance. The serverless burst gates in front of this are
-- pre-filters that keep abuse cheap; this is the authority.
create or replace function public.control_data_send(p_key text, p_graphic text, p_data jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
  v_recent int;
  v_ingest int;
  v_id bigint;
begin
  select s.id, s.owner_id into v_show, v_owner
    from public.control_shows s where s.data_key = p_key and p_key is not null;
  if v_show is null then raise exception 'unknown data key'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'not an update';
  end if;
  select count(*),
         count(*) filter (where e.msg->>'src' = 'api')
    into v_recent, v_ingest
    from public.control_events e
    where e.show_id = v_show and e.created_at > now() - interval '5 seconds';
  if v_recent >= 50 then
    raise exception 'too many commands — slow down' using errcode = 'check_violation';
  end if;
  if v_ingest >= 25 then
    raise exception 'data budget spent — the operator keeps priority' using errcode = 'check_violation';
  end if;
  insert into public.control_events (show_id, graphic, msg)
    values (v_show, p_graphic, jsonb_build_object('t', 'update', 'data', p_data, 'src', 'api'))
    returning public.control_events.id into v_id;
  return v_id;
end $$;
revoke execute on function public.control_data_send(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.control_data_send(text, text, jsonb) to service_role;

-- ── Self-check: CALL the bodies and prove the behaviour, not just that the DDL parsed. ───────
do $$
declare
  v_probe_a text;
  v_probe_b text;
  v_count int;
  v_refused boolean := false;
begin
  -- The column exists and is unique.
  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'control_shows' and c.column_name = 'data_key'
  ) then
    raise exception 'control_shows.data_key missing';
  end if;
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'control_shows'
      and c.contype = 'u'
      and (
        select array_agg(a.attname::text)
        from unnest(c.conkey) as k(attnum)
        join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
      ) = array['data_key']
  ) then
    raise exception 'control_shows.data_key unique constraint missing';
  end if;
  -- CALL the default expression: two evaluations differ, are 24 chars, and are URL-safe.
  v_probe_a := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
  v_probe_b := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
  if v_probe_a = v_probe_b or length(v_probe_a) <> 24 or v_probe_a ~ '[+/=]' then
    raise exception 'data_key default does not generate distinct URL-safe keys';
  end if;
  -- Every existing row was backfilled (the volatile-default rewrite actually ran).
  if exists (select 1 from public.control_shows s where s.data_key is null) then
    raise exception 'control_shows rows left without a data_key';
  end if;
  -- CALL the resolve body: an unknown key answers empty, and the body actually runs.
  select count(*) into v_count from public.control_data_resolve('self-check-no-such-key');
  if v_count <> 0 then
    raise exception 'control_data_resolve answered an unknown key';
  end if;
  -- CALL the send body: an unknown key must be refused before anything is written.
  begin
    perform public.control_data_send('self-check-no-such-key', 'g', '{}'::jsonb);
  exception when others then
    v_refused := sqlerrm = 'unknown data key';
  end;
  if not v_refused then
    raise exception 'control_data_send accepted an unknown key';
  end if;
end $$;
