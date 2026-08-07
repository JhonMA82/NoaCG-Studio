-- Fix `audience_open_round`, which 0035 shipped broken.
--
-- It closed any already-open round with an UNQUALIFIED predicate:
--
--     update public.audience_rounds set closed_at = now()
--       where show_id = v_show and closed_at is null;
--
-- and the function's own RETURNS TABLE declares an OUT parameter called `closed_at`, so Postgres
-- refused the whole call at RUNTIME with `column reference "closed_at" is ambiguous` (42702).
-- Nothing in the migration's self-check could see it: the function compiles, its signature is
-- right, and its result columns are right - a plpgsql body is only resolved when it runs. It was
-- caught by CALLING it against the live database, which is the lesson worth keeping: a structural
-- check proves shape, never behaviour.
--
-- 0035 is left exactly as it was applied. This is a CREATE OR REPLACE with the same signature, so
-- the ACL survives and a fresh install lands on the same end state as production.

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
  -- EVERY column here is table-qualified, because six of this function's own OUT parameters
  -- share a name with a column of the table it writes.
  update public.audience_rounds r set closed_at = now()
    where r.show_id = v_show and r.closed_at is null;
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

-- Prove the BODY, not just the signature - the whole point of this migration. A throwaway
-- production is created against a real owner, a round is opened and closed through the public
-- entry points, and everything is rolled back out again.
do $$
declare
  v_owner uuid;
  v_show  uuid := '00000000-0036-4000-8000-000000000036';
  v_slug  text;
  v_round uuid;
begin
  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice 'audience_open_round self-check skipped: no account on this instance';
    return;
  end if;
  insert into public.control_shows (id, owner_id, title) values (v_show, v_owner, 'Round self-check');
  select slug into v_slug from public.control_shows where id = v_show;

  select r.id into v_round from public.audience_open_round(
    v_slug, 'quiz', 'Which one?', '["A","B","C"]'::jsonb, 2) r;
  if v_round is null then
    raise exception 'audience self-check failed: opening a round returned nothing';
  end if;
  -- The pointer followed the table…
  if (select audience_state->>'round' from public.control_shows where id = v_show) <> v_round::text then
    raise exception 'audience self-check failed: the state pointer does not name the open round';
  end if;
  -- …opening a second round closes the first (the partial unique index would refuse otherwise)…
  perform public.audience_open_round(v_slug, 'poll', 'And now?', '["Yes","No"]'::jsonb, null);
  if (select count(*) from public.audience_rounds where show_id = v_show and closed_at is null) <> 1 then
    raise exception 'audience self-check failed: more than one round is open';
  end if;
  -- …and closing clears the pointer.
  perform public.audience_close_round(v_slug, r.id)
    from public.audience_rounds r where r.show_id = v_show and r.closed_at is null;
  if (select audience_state->'round' from public.control_shows where id = v_show) <> 'null'::jsonb then
    raise exception 'audience self-check failed: the state pointer outlived the round';
  end if;

  delete from public.control_shows where id = v_show;
end $$;
