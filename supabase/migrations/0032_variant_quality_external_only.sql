-- Stop the Lite prompt learning from our own testing.
--
-- WHAT THE LOOP IS. `0011` records a content-free outcome per Lite generation - resolved
-- chassis, intent facet, kept or discarded. `ai_lite_variant_quality()` aggregates it, and
-- `api/_lib/lite/generations.ts` feeds the result into the trusted system prompt as a
-- tie-breaker: where the brief does not clearly favour a chassis, lean toward the one people
-- keep. Learning from what users keep is the whole point.
--
-- WHAT IT IS ACTUALLY LEARNING FROM. Every row in that ledger is ours. Measured 2026-08-02:
-- all 43 generations came from `synctest1@gmail.com`, a throwaway test account, and the Stage 1
-- fallback bench added 30 more the same day. Not one row is a user's opinion. So any chassis
-- that crosses the sample floor is the product tie-breaking on ITS OWN DEVELOPER'S discards -
-- many of which were a regeneration during development, which says nothing about whether a
-- design is good.
--
-- Worse, it degrades silently and in the wrong direction: every bench round makes the internal
-- signal stronger and the eventual real signal proportionally weaker.
--
-- THE FIX IS THE SAME PREDICATE THE ADMIN SCOPE USES (`0027`): exclude accounts marked
-- `user_accounts.internal`. One definition of "ours", used by the dashboard and now by the
-- generator, so the two can never disagree about who counts.
--
-- THE EXPECTED IMMEDIATE EFFECT IS THAT THE PROMPT GETS NOTHING, and that is the correct
-- state rather than a regression. The feature was built to learn from users; there are no
-- users in the ledger yet. Feeding it our own testing is not a weaker version of the feature,
-- it is a different one nobody asked for. `liteContract.ts` already treats an empty prior set
-- as normal - it is a tie-breaker applied "only after brief, intent, and chassis fit" - so
-- nothing downstream needs to change and no generation can fail for want of a prior.
--
-- CREATE OR REPLACE, not DROP: the signature and return type are unchanged, so the existing
-- ACL survives and there is no revoke to re-assert (the trap `0026` and `0027` had to handle).
-- The grant is re-stated at the bottom anyway, because this migration exists partly because a
-- privilege that was assumed to hold did not.
--
-- SECURITY INVOKER, deliberately unchanged. The function reads `user_accounts` now, and
-- `service_role` - its only caller - already holds select on that table (`0018`). Making it
-- SECURITY DEFINER to read one boolean would widen it for no reason.

create or replace function public.ai_lite_variant_quality(
  p_since timestamptz,
  p_min_samples integer
)
returns table (
  variant_id text,
  intent_kind text,
  accepted bigint,
  discarded bigint
)
language sql
stable
set search_path = ''
as $$
  select
    generation.resolved_variant_id,
    generation.intent_kind,
    count(*) filter (where generation.status = 'accepted') as accepted,
    count(*) filter (where generation.rejection_reason = 'user_discarded') as discarded
  from public.ai_generations as generation
  where generation.created_at >= p_since
    and generation.resolved_variant_id is not null
    and generation.intent_kind is not null
    and (
      generation.status = 'accepted'
      or generation.rejection_reason = 'user_discarded'
    )
    -- The one change. `ai_generations.user_id` is NOT NULL, so this is exact - unlike the
    -- funnel, there is no anonymous half to reason about (docs/ADMIN.md §8).
    and not exists (
      select 1 from public.user_accounts as account
      where account.user_id = generation.user_id and account.internal
    )
  group by generation.resolved_variant_id, generation.intent_kind
  having count(*) >= case when p_min_samples > 4 then p_min_samples else 4 end
  order by
    count(*) filter (where generation.status = 'accepted')::numeric / count(*) desc,
    count(*) desc
  limit 24;
$$;

revoke all on function public.ai_lite_variant_quality(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.ai_lite_variant_quality(timestamptz, integer)
  to service_role;

-- ── self-check ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_leaked text;
begin
  if pg_catalog.has_function_privilege('authenticated', 'public.ai_lite_variant_quality(timestamptz, integer)', 'execute')
     or pg_catalog.has_function_privilege('anon', 'public.ai_lite_variant_quality(timestamptz, integer)', 'execute')
  then
    raise exception 'ai_lite_variant_quality must not be executable by a client role';
  end if;

  -- THE SUBSTANTIVE ASSERTION, written to hold on any instance rather than against this one's
  -- numbers: every pair the function returns must have at least one contributing row from a
  -- NON-internal account. A pair built purely from our own testing reaching the prompt is
  -- exactly the defect this migration removes, so it is asserted rather than described.
  select q.variant_id || '/' || q.intent_kind into v_leaked
  from public.ai_lite_variant_quality(pg_catalog.now() - interval '3650 days', 4) q
  where not exists (
    select 1
    from public.ai_generations g
    left join public.user_accounts a on a.user_id = g.user_id
    where g.resolved_variant_id = q.variant_id
      and g.intent_kind = q.intent_kind
      and (g.status = 'accepted' or g.rejection_reason = 'user_discarded')
      and coalesce(a.internal, false) = false
  )
  limit 1;

  if v_leaked is not null then
    raise exception 'ai_lite_variant_quality returned %, which no external account contributed to', v_leaked;
  end if;
end;
$$;
