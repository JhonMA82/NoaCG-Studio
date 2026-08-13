-- A production's URLs survive unpublishing (docs/CLOUD_PLAYOUT.md §3).
--
-- THE DEFECT THIS CLOSES. Unpublishing DELETES the control_shows row, and publishing re-inserts
-- it - so every slug came back freshly minted from its column default: a new output URL, a new
-- control link, a new join name, a new presenter link. An operator who had pasted the output URL
-- into CasparCG or an OBS browser source, then unpublished for any reason, was left with a dead
-- source and no way back to the old address. That is the one mechanism matching the unexplained
-- "the CasparCG URL stopped working" report from student-release acceptance round 2, and it
-- contradicts what the app tells the operator at publish time ("it stays the same across
-- re-publishes") and what §3 of the doc promises.
--
-- THE SHAPE OF THE FIX. Separate the production's IDENTITY (which URLs address it) from its
-- PUBLICATION (whether those URLs currently resolve). Publication stays exactly as it was: the
-- control_shows row is the published thing, unpublish deletes it, and every capability RPC keeps
-- 404ing honestly on a deleted row - so this migration changes no function, no policy and no
-- authorization path, and cannot leave a door open behind an unpublished production. Identity
-- moves to its own table, which the delete does not touch, and two triggers keep the two in step:
-- the row remembers its slugs on the way out and is handed them back on the way in.
--
-- Doing it in the database rather than in the client is deliberate: restoring identity becomes an
-- invariant of the table instead of a step a publish path could forget, and it holds for every
-- writer - the app, a future server-side publish, a hand-run SQL fix.
--
-- Identity rows are kept forever, including for a production that is never published again. They
-- are ~100 bytes and they are the entire point: an address that expires is the defect.

-- ── 1. The identity table ────────────────────────────────────────────────────────────────────
-- Same id as the production (the local Show.id, as control_shows uses it). Uniqueness is per
-- table: a published production's slug lives in BOTH tables at once, which is not a conflict.
-- RLS on with NO policies, like the audience tables (0035): nothing reads this from a client -
-- the triggers below are SECURITY DEFINER and are the only access path.
create table if not exists public.control_show_identity (
  id             uuid primary key,
  owner_id       uuid not null references auth.users (id) on delete cascade,
  slug           text not null unique,
  output_slug    text unique,
  join_slug      text unique,
  presenter_slug text unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists control_show_identity_owner_idx on public.control_show_identity (owner_id);
alter table public.control_show_identity enable row level security;

-- ── 2. Remember: every slug the live row carries is written here ─────────────────────────────
-- AFTER INSERT (the database minted them) and AFTER UPDATE of any slug column, which is how a
-- readable join name claimed later (hostedControl.ts claimJoinName) is remembered too.
-- COALESCE on update: an instance without 0029/0035 has null output/join/presenter columns, and
-- a null there must never erase an address this table already knows.
create or replace function public.control_show_record_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.control_show_identity as i
    (id, owner_id, slug, output_slug, join_slug, presenter_slug)
  values (new.id, new.owner_id, new.slug, new.output_slug, new.join_slug, new.presenter_slug)
  on conflict (id) do update set
    slug           = excluded.slug,
    output_slug    = coalesce(excluded.output_slug, i.output_slug),
    join_slug      = coalesce(excluded.join_slug, i.join_slug),
    presenter_slug = coalesce(excluded.presenter_slug, i.presenter_slug),
    updated_at     = now();
  return null;
end $$;

-- ── 3. Restore: a re-published production is handed its own addresses back ───────────────────
-- BEFORE INSERT, so the column defaults are overwritten before the row is written and the unique
-- indexes see the final values. A production publishing for the first time has no identity row,
-- finds nothing here, and keeps exactly the freshly minted slugs it always got.
create or replace function public.control_show_restore_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v public.control_show_identity%rowtype;
begin
  select * into v from public.control_show_identity i where i.id = new.id;
  if found then
    new.slug := v.slug;
    if v.output_slug is not null then new.output_slug := v.output_slug; end if;
    if v.join_slug is not null then new.join_slug := v.join_slug; end if;
    if v.presenter_slug is not null then new.presenter_slug := v.presenter_slug; end if;
  end if;
  return new;
end $$;

drop trigger if exists control_shows_restore_identity on public.control_shows;
create trigger control_shows_restore_identity
  before insert on public.control_shows
  for each row execute function public.control_show_restore_identity();

drop trigger if exists control_shows_record_identity on public.control_shows;
create trigger control_shows_record_identity
  after insert or update of slug, output_slug, join_slug, presenter_slug on public.control_shows
  for each row execute function public.control_show_record_identity();

-- ── 4. Back-fill every production that is published RIGHT NOW ────────────────────────────────
-- Without this, a production published before this migration would still lose its URLs the first
-- time it is unpublished - the exact defect, surviving the fix.
insert into public.control_show_identity (id, owner_id, slug, output_slug, join_slug, presenter_slug)
select s.id, s.owner_id, s.slug, s.output_slug, s.join_slug, s.presenter_slug
from public.control_shows s
on conflict (id) do nothing;

-- ── 5. Self-check - it RUNS the triggers rather than describing them ─────────────────────────
-- A plpgsql body only resolves when it is called, and "the trigger exists" is not the claim being
-- made here: the claim is that a delete-then-insert comes back with the SAME four addresses.
-- So the check publishes a throwaway production, unpublishes it the way the app does, publishes
-- it again, and compares. It needs a real auth.users row to own it (owner_id is a foreign key);
-- an instance with no users yet skips the behavioural half with a notice rather than failing a
-- migration over an empty table.
do $$
declare
  v_owner uuid;
  v_id uuid := gen_random_uuid();
  v_first public.control_shows%rowtype;
  v_again public.control_shows%rowtype;
begin
  -- (a) Structure: both triggers are attached, and the table is not readable from a client.
  if not exists (
    select 1 from pg_trigger where tgrelid = 'public.control_shows'::regclass
      and tgname = 'control_shows_restore_identity'
  ) or not exists (
    select 1 from pg_trigger where tgrelid = 'public.control_shows'::regclass
      and tgname = 'control_shows_record_identity'
  ) then
    raise exception 'identity self-check failed: a trigger is missing from control_shows';
  end if;
  if not (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'control_show_identity') then
    raise exception 'identity self-check failed: control_show_identity has RLS off';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'control_show_identity') then
    raise exception 'identity self-check failed: control_show_identity has a policy (the triggers are the only path)';
  end if;

  -- (b) Back-fill: every published production knows its own addresses.
  if exists (
    select 1 from public.control_shows s
    where not exists (select 1 from public.control_show_identity i where i.id = s.id)
  ) then
    raise exception 'identity self-check failed: a published production has no identity row';
  end if;

  -- (c) Behaviour: publish -> unpublish -> publish keeps all four addresses.
  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice 'identity self-check: no auth.users row, skipping the publish/unpublish walk';
    return;
  end if;

  insert into public.control_shows (id, owner_id, title) values (v_id, v_owner, 'identity self-check');
  select * into v_first from public.control_shows where id = v_id;

  delete from public.control_shows where id = v_id;                 -- what unpublish does
  if not exists (select 1 from public.control_show_identity where id = v_id) then
    raise exception 'identity self-check failed: unpublishing dropped the identity row';
  end if;

  insert into public.control_shows (id, owner_id, title) values (v_id, v_owner, 'identity self-check');
  select * into v_again from public.control_shows where id = v_id;

  if v_again.slug is distinct from v_first.slug
     or v_again.output_slug is distinct from v_first.output_slug
     or v_again.join_slug is distinct from v_first.join_slug
     or v_again.presenter_slug is distinct from v_first.presenter_slug then
    raise exception 'identity self-check failed: re-publishing minted a new address (was %, now %)',
      v_first.slug, v_again.slug;
  end if;

  delete from public.control_shows where id = v_id;
  delete from public.control_show_identity where id = v_id;
end $$;
