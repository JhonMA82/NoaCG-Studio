-- Audience participation (docs/INTERACTIVE_PLAYOUT_PLAN.md, "Audience backend design").
--
-- A sibling capability plane on the EXISTING control_shows row: viewers reach a production
-- through a `join_slug`, operators through the control slug they already hold, a future
-- presenter view through its own slug. Everything is browser -> Supabase direct; this migration
-- adds ZERO Vercel functions (the Hobby plan caps a deployment at 12, and this repo has spent
-- four days of production deploys on that limit once already).
--
-- THE GOVERNING RULE, kept STRUCTURAL rather than remembered: nothing viewer-written can reach
-- Preview or Program without an operator. Not one function here writes to `control_events`, so
-- there is no path from a submission to air that does not go through an operator making a cue
-- and taking it. A future provider cannot bypass that, because the surface gives it nowhere
-- to write.
--
-- THE SHAPE, and why it is three tables rather than one jsonb blob:
--   * `audience_submissions` - moderated text. The ORIGINAL (`author`/`body`) is immutable and
--     the BROADCAST version (`broadcast_author`/`broadcast_body`) is the operator's to edit.
--     That is the whole moderation model: a surface that edited the original in place would
--     destroy the only evidence of what a person actually wrote.
--   * `audience_rounds` - one opened poll or quiz question. A TABLE, not only a jsonb pointer,
--     so `audience_vote` can validate round-exists / belongs-to-this-show / still-open
--     server-side rather than trusting what the phone sent.
--   * `audience_votes` - primary key `(round_id, device_token)`. The PK IS the dedupe, and an
--     upsert IS "change your vote while the round is open" (the owner's ratified decision).
--     Votes and submissions share almost no columns, votes need the composite key, and
--     tallying needs its own index shape - hence three tables.
--
-- ABUSE DEFENCE, ratified by the owner 2026-08-07: a device token, the trigger caps below, and
-- operator approval. **No IP is stored, hashed, or otherwise** - and there is deliberately no
-- per-IP cap. The use case is a classroom or an auditorium, where the whole audience is NATted
-- behind one address: an IP cap would throttle every legitimate viewer as though they were one
-- abuser, while a real spammer switches to mobile data and is unaffected.
--
-- RLS POSTURE: the three tables have RLS enabled and NO POLICIES AT ALL. Every read and write
-- goes through a slug-keyed SECURITY DEFINER function, which is what lets authorization be
-- "you hold this capability" rather than "you are this user" - the join page has no account,
-- and the hosted operator page deliberately does not either.

-- ══ 1. The audience plane on control_shows ══════════════════════════════════════════════════
-- gen_random_bytes is schema-qualified: pgcrypto lives in `extensions` on Supabase and the
-- migration runner's search_path does not include it (the lesson 0029 paid for).
--
-- A volatile default backfills PER ROW (Postgres cannot use the fast-path rewrite for one), so
-- existing productions get distinct slugs; the self-check at the bottom proves it rather than
-- assuming it. The alphabet is URL-safe base64 (`-_` for `+/`) like 0029's output slug: a join
-- URL is read off a screen and typed into a phone, so `+` and `/` are traps.
alter table public.control_shows
  add column if not exists join_slug text unique
    default translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_'),
  add column if not exists presenter_slug text unique
    default translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_'),
  -- What the join page is showing and what the operator controls. `round` moves ONLY through
  -- audience_open_round / audience_close_round, so the pointer and the rounds table can never
  -- disagree; `rev` bumps on every change, which is what makes a 5 s poll cheap to reason about.
  add column if not exists audience_state jsonb not null default jsonb_build_object(
    'v', 1,
    'open', false,
    'mode', 'waiting',
    'prompt', 'Send us your question',
    'round', null,
    'presenter', jsonb_build_object('current', null, 'next', null),
    'brand', null,
    'rev', 0
  );

-- The join slug's SHAPE, which is also the reserved-word list for the vanity names the operator
-- may later claim (`noacg.app/join/friday-night-live`). It lives on the column rather than in
-- application code because the uniqueness that makes a vanity name safe is already the database's
-- job, and a second copy of the rules in TypeScript would drift from this one.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'control_shows_join_slug_shape'
  ) then
    alter table public.control_shows add constraint control_shows_join_slug_shape check (
      join_slug is null
      or (
        join_slug ~ '^[A-Za-z0-9_-]{3,40}$'
        and lower(join_slug) <> all (array[
          'join', 'app', 'admin', 'output', 'api', 'new', 'about', 'help', 'login', 'signup',
          'presenter', 'noacg', 'studio', 'settings', 'static', 'assets', 'public', 'robots',
          'favicon', 'index', 'null', 'undefined'
        ])
      )
    );
  end if;
end $$;

-- ══ 2. The three tables ═════════════════════════════════════════════════════════════════════

create table if not exists public.audience_submissions (
  id               uuid primary key default gen_random_uuid(),
  show_id          uuid not null references public.control_shows (id) on delete cascade,
  created_at       timestamptz not null default now(),
  -- Exactly as sent. Never updated - `audience_update`'s allowlist is what enforces that, and
  -- these two columns are not in it.
  author           text not null default '',
  body             text not null,
  -- What would go on air. Starts as a copy of the original (the guard trigger sets it).
  broadcast_author text not null default '',
  broadcast_body   text not null default '',
  -- Air it without a name. Kept separate from clearing broadcast_author so the intent survives
  -- an edit and can be undone.
  anonymize        boolean not null default false,
  status           text not null default 'new' check (status in ('new', 'approved', 'rejected')),
  -- An operator's "maybe", which is not the same as approved.
  shortlisted      boolean not null default false,
  used_at          timestamptz,
  skipped_at       timestamptz,
  moderated_at     timestamptz,
  -- The sending device, opaque and client-minted. NEVER returned by any operator-facing
  -- function: an operator moderates words, not devices.
  device_token     text not null
);
create index if not exists audience_submissions_show_idx
  on public.audience_submissions (show_id, created_at);
-- The two windows the guard trigger counts over, and the join page's "what I sent" read.
create index if not exists audience_submissions_device_idx
  on public.audience_submissions (show_id, device_token, created_at);
alter table public.audience_submissions enable row level security;   -- no policies: RPCs only

create table if not exists public.audience_rounds (
  id             uuid primary key default gen_random_uuid(),
  show_id        uuid not null references public.control_shows (id) on delete cascade,
  kind           text not null check (kind in ('poll', 'quiz')),
  question       text not null default '',
  -- At most 8 (the trigger truncates). A vote is an INDEX into this list.
  options        jsonb not null default '[]'::jsonb,
  -- NEVER returned to the join page. A capability that leaks the answer is not one.
  correct_option int,
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz
);
create index if not exists audience_rounds_show_idx
  on public.audience_rounds (show_id, opened_at desc);
-- One open round per production, enforced by the database rather than by the function that
-- happens to close the previous one: two operators on two devices can open a round in the same
-- second, and the loser of that race must fail rather than leave two rounds taking votes.
create unique index if not exists audience_rounds_one_open
  on public.audience_rounds (show_id) where closed_at is null;
alter table public.audience_rounds enable row level security;

create table if not exists public.audience_votes (
  round_id     uuid not null references public.audience_rounds (id) on delete cascade,
  device_token text not null,
  option_index int not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (round_id, device_token)
);
-- Tally = count-on-read over this index. There is deliberately no maintained counter column:
-- hot-row conflicts and drift risk, for no benefit at this scale.
create index if not exists audience_votes_tally_idx
  on public.audience_votes (round_id, option_index);
alter table public.audience_votes enable row level security;

-- ══ 3. Guard triggers - 0003-style, defence in depth ════════════════════════════════════════
-- These run BELOW the RPCs on purpose. The RPC is the authorization boundary; the trigger is
-- what holds if a future function forgets a check, and it is where the caps live so that every
-- writer - including a service-role script - obeys the same numbers.

-- The hard caps, in one place. They mirror AUDIENCE_LIMITS in src/audience/audienceTypes.ts;
-- the local rehearsal provider clamps identically, so rehearsal is a faithful stand-in rather
-- than a more permissive one.
create or replace function public.audience_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  recent_show   int;
  recent_device int;
  bad           text;
begin
  if new.device_token !~ '^[A-Za-z0-9_-]{8,128}$' then
    raise exception 'invalid device' using errcode = 'check_violation';
  end if;
  new.author := btrim(left(coalesce(new.author, ''), 40));
  new.body   := btrim(left(coalesce(new.body, ''), 500));
  if new.body = '' then
    raise exception 'nothing to send' using errcode = 'check_violation';
  end if;

  -- Per-show burst: an audience is many phones, so this is far looser than the per-device cap
  -- and exists only to stop a scripted flood filling the inbox faster than a human can read it.
  select count(*) into recent_show from public.audience_submissions
    where show_id = new.show_id and created_at > now() - interval '10 seconds';
  if recent_show >= 20 then
    raise exception 'too many messages' using errcode = 'check_violation';
  end if;
  -- Per-device: the cap that actually matters, because it is the one an abuser meets first.
  select count(*) into recent_device from public.audience_submissions
    where show_id = new.show_id and device_token = new.device_token
      and created_at > now() - interval '30 seconds';
  if recent_device >= 3 then
    raise exception 'too many messages' using errcode = 'check_violation';
  end if;

  -- Courtesy profanity mask, reusing 0003's editable blocklist. It is a COURTESY pre-filter and
  -- never the safety boundary - the human moderation queue is.
  for bad in select word from public.chat_blocklist loop
    new.body := regexp_replace(new.body, bad, repeat('*', char_length(bad)), 'gi');
  end loop;

  -- The broadcast version starts as a copy of what was sent.
  new.broadcast_author := new.author;
  new.broadcast_body   := new.body;
  new.status           := 'new';        -- the only state a viewer can put a row in
  new.shortlisted      := false;
  new.used_at          := null;
  new.skipped_at       := null;
  new.moderated_at     := null;
  return new;
end $$;
revoke execute on function public.audience_guard() from public, anon, authenticated;

drop trigger if exists audience_submissions_guard on public.audience_submissions;
create trigger audience_submissions_guard before insert on public.audience_submissions
  for each row execute function public.audience_guard();

-- Rounds: bound the question, the option list and the answer key. A round is operator-authored,
-- so this is about keeping the data sane rather than about abuse.
create or replace function public.audience_round_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  count_options int;
begin
  new.question := btrim(left(coalesce(new.question, ''), 200));
  if jsonb_typeof(coalesce(new.options, 'null'::jsonb)) <> 'array' then
    raise exception 'invalid round' using errcode = 'check_violation';
  end if;
  -- At most 8 options, each at most 60 characters, every one a string.
  new.options := coalesce((
    select jsonb_agg(btrim(left(value #>> '{}', 60)) order by ord)
    from jsonb_array_elements(new.options) with ordinality as o(value, ord)
    where jsonb_typeof(value) = 'string' and ord <= 8
  ), '[]'::jsonb);
  count_options := jsonb_array_length(new.options);
  if count_options < 2 then
    raise exception 'invalid round' using errcode = 'check_violation';
  end if;
  if new.correct_option is not null
     and (new.correct_option < 0 or new.correct_option >= count_options) then
    raise exception 'invalid round' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.audience_round_guard() from public, anon, authenticated;

drop trigger if exists audience_rounds_guard on public.audience_rounds;
create trigger audience_rounds_guard before insert or update on public.audience_rounds
  for each row execute function public.audience_round_guard();

-- Votes: bound the token, keep the option inside the round it belongs to, and cap the per-round
-- burst. The option check is deliberately repeated here even though audience_vote makes it too -
-- a vote is the one write a stranger's phone performs most often.
create or replace function public.audience_vote_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  count_options int;
  is_open       boolean;
  recent        int;
begin
  if new.device_token !~ '^[A-Za-z0-9_-]{8,128}$' then
    raise exception 'that vote could not be counted' using errcode = 'check_violation';
  end if;
  select jsonb_array_length(r.options), r.closed_at is null
    into count_options, is_open
    from public.audience_rounds r where r.id = new.round_id;
  if count_options is null or not is_open
     or new.option_index < 0 or new.option_index >= count_options then
    raise exception 'that vote could not be counted' using errcode = 'check_violation';
  end if;
  select count(*) into recent from public.audience_votes
    where round_id = new.round_id and updated_at > now() - interval '10 seconds';
  if recent >= 300 then
    raise exception 'that vote could not be counted' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.audience_vote_guard() from public, anon, authenticated;

drop trigger if exists audience_votes_guard on public.audience_votes;
create trigger audience_votes_guard before insert or update on public.audience_votes
  for each row execute function public.audience_vote_guard();

-- ══ 4. The VIEWER's half - the join slug is the only capability ═════════════════════════════
-- Capability discipline (the plan's own words): audience_join_by_slug must never return the show
-- id (which is a log-reading capability under 0008's anon policy), any other slug, panel/staged/
-- live/output, correct_option, tallies, presenter pointers, or another submitter's anything.
-- Errors stay generic: an endpoint that explains precisely why it refused is an oracle.

create or replace function public.audience_join_by_slug(p_join_slug text, p_device text)
returns table (production_name text, state jsonb, brand jsonb, mine jsonb, my_vote int)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_show    uuid;
  v_owner   uuid;
  v_title   text;
  v_state   jsonb;
  v_denied  boolean;
  v_round   public.audience_rounds%rowtype;
begin
  select s.id, s.owner_id, s.title, s.audience_state
    into v_show, v_owner, v_title, v_state
    from public.control_shows s where s.join_slug = p_join_slug and p_join_slug is not null;
  if v_show is null then
    return;               -- zero rows, no explanation: an unknown slug and a closed door look alike
  end if;
  -- A denial folds into "not accepting" rather than into an error. The kill switch is about
  -- stopping participation, not about telling a stranger's phone why.
  v_denied := public.feature_denied_for(v_owner, 'audience');

  select * into v_round from public.audience_rounds r
    where r.show_id = v_show and r.closed_at is null
    order by r.opened_at desc limit 1;

  production_name := v_title;
  state := jsonb_build_object(
    'open', (coalesce((v_state->>'open')::boolean, false) and not v_denied),
    'mode', coalesce(v_state->>'mode', 'waiting'),
    'prompt', coalesce(v_state->>'prompt', ''),
    -- The round WITHOUT its answer key, and without any tally.
    'round', case when v_round.id is null then null else jsonb_build_object(
      'id', v_round.id,
      'kind', v_round.kind,
      'question', v_round.question,
      'options', v_round.options,
      'openedAt', v_round.opened_at
    ) end
  );
  brand := v_state->'brand';
  -- ONLY this device's own submissions. A join view that could see another submitter's anything
  -- would turn a public URL into a moderation feed.
  mine := coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'body', x.body, 'createdAt', x.created_at)
                     order by x.created_at)
    from public.audience_submissions x
    where x.show_id = v_show and x.device_token = p_device
  ), '[]'::jsonb);
  my_vote := (
    select v.option_index from public.audience_votes v
    where v.round_id = v_round.id and v.device_token = p_device
  );
  return next;
end $$;
revoke execute on function public.audience_join_by_slug(text, text) from public;
grant execute on function public.audience_join_by_slug(text, text) to anon, authenticated;

create or replace function public.audience_submit(
  p_join_slug text, p_device text, p_author text, p_body text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_show  uuid;
  v_owner uuid;
  v_state jsonb;
begin
  select s.id, s.owner_id, s.audience_state into v_show, v_owner, v_state
    from public.control_shows s where s.join_slug = p_join_slug and p_join_slug is not null;
  if v_show is null
     or not coalesce((v_state->>'open')::boolean, false)
     or coalesce(v_state->>'mode', 'waiting') not in ('question', 'comment')
     or public.feature_denied_for(v_owner, 'audience') then
    raise exception 'that message could not be sent' using errcode = 'check_violation';
  end if;
  begin
    insert into public.audience_submissions (show_id, author, body, device_token)
      values (v_show, p_author, p_body, p_device);
  exception when others then
    -- Every trigger refusal becomes ONE message. The caps are a defence, and a defence that
    -- reports which limit was hit tells an abuser exactly what to tune.
    raise exception 'that message could not be sent' using errcode = 'check_violation';
  end;
end $$;
revoke execute on function public.audience_submit(text, text, text, text) from public;
grant execute on function public.audience_submit(text, text, text, text) to anon, authenticated;

create or replace function public.audience_vote(
  p_join_slug text, p_device text, p_round uuid, p_option int
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_show  uuid;
  v_owner uuid;
begin
  select s.id, s.owner_id into v_show, v_owner
    from public.control_shows s where s.join_slug = p_join_slug and p_join_slug is not null;
  -- Round exists, belongs to THIS production, and is open - checked server-side rather than
  -- trusted from the phone, which is why rounds are a table.
  if v_show is null
     or public.feature_denied_for(v_owner, 'audience')
     or not exists (
       select 1 from public.audience_rounds r
       where r.id = p_round and r.show_id = v_show and r.closed_at is null
     ) then
    raise exception 'that vote could not be counted' using errcode = 'check_violation';
  end if;
  begin
    -- The upsert IS "change your mind while the round is open": the PK is (round, device).
    insert into public.audience_votes (round_id, device_token, option_index)
      values (p_round, p_device, p_option)
      on conflict (round_id, device_token)
      do update set option_index = excluded.option_index, updated_at = now();
  exception when others then
    raise exception 'that vote could not be counted' using errcode = 'check_violation';
  end;
end $$;
revoke execute on function public.audience_vote(text, text, uuid, int) from public;
grant execute on function public.audience_vote(text, text, uuid, int) to anon, authenticated;

-- ══ 5. The OPERATOR's half - the control slug ═══════════════════════════════════════════════
-- Both operator surfaces use the CONTROL slug: the in-app production page holds it locally, and
-- the anon hosted control page gets moderation parity for free.

-- Resolve the control slug to (show, owner) or refuse. One place, so every operator function
-- below checks the capability and the kill switch identically.
create or replace function public.audience_owner_for_control(p_slug text)
returns table (show_id uuid, owner_id uuid)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_show  uuid;
  v_owner uuid;
begin
  select s.id, s.owner_id into v_show, v_owner
    from public.control_shows s where s.slug = p_slug and p_slug is not null;
  if v_show is null then raise exception 'unknown control page'; end if;
  if public.feature_denied_for(v_owner, 'audience') then
    raise exception 'audience participation is switched off for this page' using errcode = '42501';
  end if;
  show_id := v_show;
  owner_id := v_owner;
  return next;
end $$;
-- INTERNAL. It answers with an owner id, so it is never granted to a client role; the SECURITY
-- DEFINER functions below reach it with the definer's privileges and need no grant.
revoke execute on function public.audience_owner_for_control(text) from public, anon, authenticated;

create or replace function public.audience_list(p_slug text)
returns table (
  id uuid, created_at timestamptz, author text, body text,
  broadcast_author text, broadcast_body text, anonymize boolean,
  status text, shortlisted boolean, used_at timestamptz, skipped_at timestamptz
) language plpgsql security definer set search_path = '' stable as $$
declare
  v_show uuid;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  -- device_token is deliberately NOT selected. The operator moderates words, not devices, and a
  -- column no surface can render is a column no surface can leak.
  return query
    select x.id, x.created_at, x.author, x.body, x.broadcast_author, x.broadcast_body,
           x.anonymize, x.status, x.shortlisted, x.used_at, x.skipped_at
    from public.audience_submissions x
    where x.show_id = v_show
    order by x.created_at;
end $$;
revoke execute on function public.audience_list(text) from public;
grant execute on function public.audience_list(text) to anon, authenticated;

-- The moderation patch. THE ALLOWLIST IS WHERE IMMUTABILITY LIVES: `author` and `body` are not
-- in it, here or in any provider, so neither a UI bug nor a future caller can rewrite what a
-- person actually sent.
create or replace function public.audience_update(p_slug text, p_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_key  text;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  if jsonb_typeof(coalesce(p_patch, 'null'::jsonb)) <> 'object' then
    raise exception 'not a moderation patch';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('broadcast_author', 'broadcast_body', 'anonymize', 'status',
                     'shortlisted', 'used_at', 'skipped_at') then
      raise exception 'not a moderation patch';
    end if;
  end loop;
  update public.audience_submissions x set
    broadcast_author = case when p_patch ? 'broadcast_author'
      then btrim(left(coalesce(p_patch->>'broadcast_author', ''), 40)) else x.broadcast_author end,
    broadcast_body = case when p_patch ? 'broadcast_body'
      then btrim(left(coalesce(p_patch->>'broadcast_body', ''), 500)) else x.broadcast_body end,
    anonymize = case when p_patch ? 'anonymize'
      then coalesce((p_patch->>'anonymize')::boolean, x.anonymize) else x.anonymize end,
    status = case when p_patch ? 'status'
      then (case when p_patch->>'status' in ('new', 'approved', 'rejected')
                 then p_patch->>'status' else x.status end) else x.status end,
    shortlisted = case when p_patch ? 'shortlisted'
      then coalesce((p_patch->>'shortlisted')::boolean, x.shortlisted) else x.shortlisted end,
    used_at = case when p_patch ? 'used_at'
      then (p_patch->>'used_at')::timestamptz else x.used_at end,
    skipped_at = case when p_patch ? 'skipped_at'
      then (p_patch->>'skipped_at')::timestamptz else x.skipped_at end,
    moderated_at = now()
  where x.id = p_id and x.show_id = v_show;
end $$;
revoke execute on function public.audience_update(text, uuid, jsonb) from public;
grant execute on function public.audience_update(text, uuid, jsonb) to anon, authenticated;

-- The state patch, allowlisted the same way. `round` is deliberately absent: it moves only
-- through open/close, so the pointer and the table can never disagree.
--
-- AN EMPTY PATCH IS THE READ. The operator surfaces have to be able to ask what the audience
-- plane is currently doing, and giving that its own RPC would mean a twelfth entry point with
-- the identical capability check; giving it to this one means the read and the write can never
-- disagree about who may ask. An empty patch deliberately does NOT bump `rev` - a poll that
-- moved the revision every four seconds would make the number useless as a change signal.
create or replace function public.audience_set_join(p_slug text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show  uuid;
  v_key   text;
  v_state jsonb;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  if jsonb_typeof(coalesce(p_patch, 'null'::jsonb)) <> 'object' then
    raise exception 'not an audience state patch';
  end if;
  if p_patch = '{}'::jsonb then
    select s.audience_state into v_state from public.control_shows s where s.id = v_show;
    return v_state;
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('open', 'mode', 'prompt', 'presenter', 'brand') then
      raise exception 'not an audience state patch';
    end if;
  end loop;
  if p_patch ? 'mode' and coalesce(p_patch->>'mode', '')
     not in ('waiting', 'question', 'comment', 'poll', 'quiz') then
    raise exception 'not an audience state patch';
  end if;
  update public.control_shows s
    set audience_state = s.audience_state
      || (p_patch - 'prompt')
      || case when p_patch ? 'prompt'
              then jsonb_build_object('prompt', btrim(left(coalesce(p_patch->>'prompt', ''), 160)))
              else '{}'::jsonb end
      || jsonb_build_object('rev', coalesce((s.audience_state->>'rev')::int, 0) + 1)
    where s.id = v_show
    returning s.audience_state into v_state;
  return v_state;
end $$;
revoke execute on function public.audience_set_join(text, jsonb) from public;
grant execute on function public.audience_set_join(text, jsonb) to anon, authenticated;

create or replace function public.audience_open_round(
  p_slug text, p_kind text, p_question text, p_options jsonb, p_correct int
) returns table (
  id uuid, kind text, question text, options jsonb,
  correct_option int, opened_at timestamptz, closed_at timestamptz
) language plpgsql security definer set search_path = '' as $$
declare
  v_show  uuid;
  v_round public.audience_rounds%rowtype;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  if p_kind not in ('poll', 'quiz') then raise exception 'not a round'; end if;
  -- Close whatever is open first: the partial unique index means the insert below would
  -- otherwise fail, and "one open round" is the model rather than an error to report.
  update public.audience_rounds set closed_at = now()
    where show_id = v_show and closed_at is null;
  insert into public.audience_rounds (show_id, kind, question, options, correct_option)
    values (v_show, p_kind, p_question, p_options, case when p_kind = 'quiz' then p_correct end)
    returning * into v_round;
  update public.control_shows s set audience_state = s.audience_state || jsonb_build_object(
      'open', true,
      'mode', p_kind,
      'round', v_round.id,
      'rev', coalesce((s.audience_state->>'rev')::int, 0) + 1
    ) where s.id = v_show;
  id := v_round.id; kind := v_round.kind; question := v_round.question;
  options := v_round.options; correct_option := v_round.correct_option;
  opened_at := v_round.opened_at; closed_at := v_round.closed_at;
  return next;
end $$;
revoke execute on function public.audience_open_round(text, text, text, jsonb, int) from public;
grant execute on function public.audience_open_round(text, text, text, jsonb, int) to anon, authenticated;

create or replace function public.audience_close_round(p_slug text, p_round uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  update public.audience_rounds set closed_at = now()
    where id = p_round and show_id = v_show and closed_at is null;
  -- The pointer follows the table, in the same statement pair, for the same reason `round` is
  -- not patchable: a stale pointer would have the join page voting into a closed round.
  update public.control_shows s set audience_state = s.audience_state || jsonb_build_object(
      'round', null,
      'rev', coalesce((s.audience_state->>'rev')::int, 0) + 1
    ) where s.id = v_show and s.audience_state->>'round' = p_round::text;
end $$;
revoke execute on function public.audience_close_round(text, uuid) from public;
grant execute on function public.audience_close_round(text, uuid) to anon, authenticated;

-- Count on read. `generate_series` over the option list rather than a group-by, so an option
-- nobody picked is a 0 rather than a missing row the client has to guess at.
create or replace function public.audience_tally(p_slug text, p_round uuid)
returns table (round_id uuid, counts jsonb, total int)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_show    uuid;
  v_options int;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  select jsonb_array_length(r.options) into v_options
    from public.audience_rounds r where r.id = p_round and r.show_id = v_show;
  if v_options is null then raise exception 'unknown round'; end if;
  round_id := p_round;
  counts := coalesce((
    select jsonb_agg(c.n order by c.i) from (
      select i, (select count(*) from public.audience_votes v
                 where v.round_id = p_round and v.option_index = i) as n
      from generate_series(0, v_options - 1) as i
    ) as c(i, n)
  ), '[]'::jsonb);
  select count(*) into total from public.audience_votes v where v.round_id = p_round;
  return next;
end $$;
revoke execute on function public.audience_tally(text, uuid) from public;
grant execute on function public.audience_tally(text, uuid) to anon, authenticated;

create or replace function public.audience_rounds_list(p_slug text)
returns table (
  id uuid, kind text, question text, options jsonb,
  correct_option int, opened_at timestamptz, closed_at timestamptz
) language plpgsql security definer set search_path = '' stable as $$
declare
  v_show uuid;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  return query
    select r.id, r.kind, r.question, r.options, r.correct_option, r.opened_at, r.closed_at
    from public.audience_rounds r where r.show_id = v_show order by r.opened_at;
end $$;
revoke execute on function public.audience_rounds_list(text) from public;
grant execute on function public.audience_rounds_list(text) to anon, authenticated;

-- ══ 6. The PRESENTER's half - its own slug, read-only ═══════════════════════════════════════
-- A phone or tablet in a presenter's hand: what is on air next, in their own words. It resolves
-- from the presenter slug alone and returns only the BROADCAST version of the two pointed-at
-- submissions - never the inbox, never a tally, never anyone's device.
create or replace function public.audience_presenter_by_slug(p_presenter_slug text)
returns table (production_name text, mode text, current_item jsonb, next_item jsonb)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_show  uuid;
  v_state jsonb;
begin
  select s.id, s.title, s.audience_state into v_show, production_name, v_state
    from public.control_shows s
    where s.presenter_slug = p_presenter_slug and p_presenter_slug is not null;
  if v_show is null then return; end if;
  mode := coalesce(v_state->>'mode', 'waiting');
  select jsonb_build_object(
           'author', case when x.anonymize then '' else x.broadcast_author end,
           'body', x.broadcast_body)
    into current_item from public.audience_submissions x
    where x.show_id = v_show and x.id = nullif(v_state->'presenter'->>'current', '')::uuid;
  select jsonb_build_object(
           'author', case when x.anonymize then '' else x.broadcast_author end,
           'body', x.broadcast_body)
    into next_item from public.audience_submissions x
    where x.show_id = v_show and x.id = nullif(v_state->'presenter'->>'next', '')::uuid;
  return next;
end $$;
revoke execute on function public.audience_presenter_by_slug(text) from public;
grant execute on function public.audience_presenter_by_slug(text) to anon, authenticated;

-- ══ 7. Prove it, or refuse to apply ═════════════════════════════════════════════════════════
do $$
declare
  v_slug     text;
  v_result   text;
  v_leak     text;
begin
  -- (a) The slug alphabet is URL-safe (a join URL gets typed by hand).
  v_slug := translate(encode(extensions.gen_random_bytes(64), 'base64'), '+/', '-_');
  if v_slug ~ '[+/]' then
    raise exception 'audience self-check failed: slug alphabet is not URL-safe';
  end if;

  -- (b) All eleven RPCs exist with the expected signature.
  if to_regprocedure('public.audience_join_by_slug(text, text)') is null
     or to_regprocedure('public.audience_submit(text, text, text, text)') is null
     or to_regprocedure('public.audience_vote(text, text, uuid, int)') is null
     or to_regprocedure('public.audience_list(text)') is null
     or to_regprocedure('public.audience_update(text, uuid, jsonb)') is null
     or to_regprocedure('public.audience_set_join(text, jsonb)') is null
     or to_regprocedure('public.audience_open_round(text, text, text, jsonb, int)') is null
     or to_regprocedure('public.audience_close_round(text, uuid)') is null
     or to_regprocedure('public.audience_tally(text, uuid)') is null
     or to_regprocedure('public.audience_rounds_list(text)') is null
     or to_regprocedure('public.audience_presenter_by_slug(text)') is null then
    raise exception 'audience self-check failed: an audience RPC is missing';
  end if;

  -- (c) THE CAPABILITY LEAK CHECK, checked STRUCTURALLY rather than by reading the body. The two
  --     UNAUTHENTICATED resolves are the whole exposure of this migration, so what they may
  --     return is asserted here: a future edit that adds the show id, another slug, the answer
  --     key, a tally or a device token fails the migration rather than shipping.
  for v_result in
    select pg_get_function_result(to_regprocedure(p)) from unnest(array[
      'public.audience_join_by_slug(text, text)',
      'public.audience_presenter_by_slug(text)',
      'public.audience_list(text)'
    ]) as p
  loop
    for v_leak in select w from unnest(array[
      'show_id', 'slug', 'correct', 'counts', 'device', 'panel', 'staged', 'output'
    ]) as w
    loop
      if v_result like '%' || v_leak || '%' then
        raise exception 'audience self-check failed: a capability resolve returns % (%)', v_leak, v_result;
      end if;
    end loop;
  end loop;
  --     …and the join resolve still returns what the join page actually needs.
  v_result := pg_get_function_result(to_regprocedure('public.audience_join_by_slug(text, text)'));
  if v_result not like '%production_name%' or v_result not like '%mine%' or v_result not like '%my_vote%' then
    raise exception 'audience self-check failed: the join resolve returns %', v_result;
  end if;

  -- (d) The trigger functions and the internal resolver are unreachable from a client role.
  --     PostgREST publishes whatever `authenticated` may execute, so an EXECUTE grant here
  --     would be a public endpoint.
  for v_leak in
    select p from unnest(array[
      'public.audience_guard()', 'public.audience_round_guard()', 'public.audience_vote_guard()',
      'public.audience_owner_for_control(text)'
    ]) as p
  loop
    if has_function_privilege('anon', v_leak, 'execute')
       or has_function_privilege('authenticated', v_leak, 'execute') then
      raise exception 'audience self-check failed: % is callable by a client role', v_leak;
    end if;
  end loop;

  -- (e) The three tables have RLS ON and NO policies - every path is an RPC.
  if exists (
    select 1 from pg_tables
    where schemaname = 'public'
      and tablename in ('audience_submissions', 'audience_rounds', 'audience_votes')
      and not rowsecurity
  ) then
    raise exception 'audience self-check failed: an audience table has RLS off';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('audience_submissions', 'audience_rounds', 'audience_votes')
  ) then
    raise exception 'audience self-check failed: an audience table has a policy';
  end if;

  -- (f) Every existing production was back-filled with distinct, non-null slugs.
  if exists (select 1 from public.control_shows where join_slug is null or presenter_slug is null) then
    raise exception 'audience self-check failed: a row has no join/presenter slug';
  end if;
  if (select count(distinct join_slug) from public.control_shows)
     <> (select count(*) from public.control_shows) then
    raise exception 'audience self-check failed: join slugs are not distinct';
  end if;
end $$;
