-- Content-free quality signals for NoaCG Lite. The server records only the
-- selected deterministic chassis, a broad lower-third intent facet, and an
-- optional enumerated discard reason. No user-authored content or generated
-- artifact is stored.

alter table public.ai_generations
  add column if not exists resolved_variant_id text,
  add column if not exists intent_kind text,
  add column if not exists feedback_reason text;

alter table public.ai_generations
  drop constraint if exists ai_generations_intent_kind_check,
  add constraint ai_generations_intent_kind_check check (
    intent_kind is null
    or intent_kind in ('person', 'story', 'event', 'team', 'organization', 'promotion')
  ),
  drop constraint if exists ai_generations_feedback_reason_check,
  add constraint ai_generations_feedback_reason_check check (
    feedback_reason is null
    or feedback_reason in (
      'regenerated', 'closed', 'wrong-style', 'hard-to-read',
      'missing-information', 'wrong-layout', 'poor-motion', 'other'
    )
  );

create index if not exists ai_generations_variant_quality_idx
  on public.ai_generations (intent_kind, resolved_variant_id, created_at desc)
  where resolved_variant_id is not null and intent_kind is not null;

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
