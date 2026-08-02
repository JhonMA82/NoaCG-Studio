-- Beta feedback and generation ratings: the one place free text the USER deliberately wrote is
-- allowed to land.
--
-- WHY A NEW TABLE RATHER THAN A COLUMN ON `ai_generations`. That ledger is content-free by
-- contract (src/ai/AGENTS.md: "Prompts, templates, screenshots, generated code, and full
-- DesignSpecs never enter the ledger"), and `admin_overview_*` is built on the guarantee that
-- no free text can reach it (docs/ADMIN.md §8). A `comment text` column there would quietly
-- retire both. It is also a different KIND of data: the ledger is written by the server about
-- what happened, and this is written by a person who chose to tell us something. Consent, not
-- observation.
--
-- WHAT IT DELIBERATELY DOES NOT HOLD, and cannot:
--   * no prompt, brief, design spec, template body or generated code;
--   * no uploaded asset, and no reference to one;
--   * no page URL, no user agent, no IP - not even the salted hash `ai_gateway_requests` keeps;
--   * no email. The account id is a foreign key; the inbox resolves an address through the auth
--     directory at read time, the way every other admin view already does.
-- The investigation context (route, model, chassis, intent facet) is DERIVED SERVER-SIDE from
-- the generation row. The browser cannot supply it - Lite deliberately never tells the browser
-- which model answered - so a client-supplied value would be both untrusted and usually absent.
--
-- WHO MAY WRITE. Nobody, directly. RLS is on with no client policy, exactly like
-- `funnel_events` (0016) and `ai_gateway_requests` (0012): the browser POSTs to
-- /api/me/feedback, which validates against src/feedback/contract.ts and writes with the
-- service key. That costs one round trip and buys three things - the enumerated vocabularies
-- are enforced somewhere the client cannot edit, a scraped anon key cannot forge or READ other
-- people's feedback, and anonymous users can still send it (the editor has no login wall, and a
-- feedback channel only signed-in users can reach would be a channel almost nobody reaches).

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),

  -- 'beta' = a general note. 'generation' = a rating attached to one Lite/Pro result.
  kind text not null check (kind in ('beta', 'generation')),

  -- Two-valued on purpose (src/feedback/contract.ts): a one-click rating is the only kind that
  -- gets given, and one axis makes overall satisfaction one number across both kinds.
  sentiment text not null check (sentiment in ('positive', 'negative')),

  -- Enumerated reasons, validated at the endpoint against the kind. Empty is normal and
  -- expected: a thumb with no reason is still a rating, and requiring one would make the flow
  -- the interruption it must not be.
  reasons text[] not null default '{}'
    check (
      cardinality(reasons) <= 4
      and reasons <@ array[
        'wrong-style', 'hard-to-read', 'missing-information', 'wrong-layout', 'poor-motion',
        'bug', 'confusing', 'missing-feature', 'too-slow', 'export-problem', 'other'
      ]::text[]
    ),

  -- THE ONE FREE-TEXT COLUMN IN THE PRODUCT'S SERVER-SIDE DATA. Bounded so it can never become
  -- a data channel; the endpoint refuses an over-long message rather than truncating one, so a
  -- person never discovers their paragraph was silently cut in half.
  message text not null default '' check (char_length(message) <= 2000),

  -- Who and where. Both nullable: the editor has no login wall, so the most valuable feedback
  -- may well come from someone with no account and no funnel id.
  user_id uuid references auth.users (id) on delete set null,
  visitor_id uuid,
  area text check (area is null or area in ('wizard', 'editor', 'home', 'control', 'video', 'export', 'other')),

  -- ── the investigation context, all server-derived ──────────────────────────────────────
  -- Enough to reproduce a bad result without storing anything the user typed into the product.
  -- `on delete set null`, not cascade: feedback about a generation outlives the generation, and
  -- losing the complaint because the ledger row aged out is exactly backwards.
  generation_id uuid references public.ai_generations (id) on delete set null,
  -- Copied rather than joined, and that IS deliberate denormalization. The generation row is
  -- the live ledger and can be rewritten by a retry (the reservation is idempotent per
  -- (user_id, idempotency_key), so `model` and `resolved_variant_id` can change under it); this
  -- has to keep saying what was true when the person complained. A join would silently
  -- re-attribute an old complaint to a new model.
  tier text check (tier is null or tier in ('lite', 'pro', 'custom')),
  model text check (model is null or char_length(model) <= 120),
  variant_id text check (variant_id is null or char_length(variant_id) <= 80),
  intent_kind text check (intent_kind is null or char_length(intent_kind) <= 40),
  prompt_version text check (prompt_version is null or char_length(prompt_version) <= 64),

  -- ── triage ─────────────────────────────────────────────────────────────────────────────
  status text not null default 'new' check (status in ('new', 'reviewed', 'resolved')),
  -- Three states rather than a boolean, because "I have read this" and "this is fixed" are
  -- different answers and an inbox that cannot tell them apart re-reads everything.
  admin_note text not null default '' check (char_length(admin_note) <= 2000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,

  created_at timestamptz not null default now()
);

-- A generation may be rated once. A second thumb on the same result is the person changing
-- their mind, not two data points, and counting it twice would skew satisfaction toward
-- whoever clicked most. The endpoint upserts on this.
create unique index if not exists user_feedback_generation_idx
  on public.user_feedback (generation_id) where generation_id is not null;

-- The inbox opens on "newest first" and filters on status; the satisfaction summary groups by
-- sentiment over a window.
create index if not exists user_feedback_created_idx on public.user_feedback (created_at desc);
create index if not exists user_feedback_status_created_idx on public.user_feedback (status, created_at desc);

alter table public.user_feedback enable row level security;
-- No client policies, by design - see the header. Invisible and unwritable from anon and
-- authenticated alike, the pattern 0016 established for the funnel.
revoke all on table public.user_feedback from public, anon, authenticated;
grant select, insert, update on table public.user_feedback to service_role;
-- No DELETE grant for any role. Feedback is somebody telling us something went wrong; an admin
-- surface that can make a complaint disappear is a surface that will. Triage is `status`, and
-- the audit log records who set it.

-- ── self-check ───────────────────────────────────────────────────────────────────────────
-- The three properties this table exists for, asserted rather than assumed: it is unreachable
-- from a client role, its free text is bounded, and it cannot be emptied.
do $$
begin
  if pg_catalog.has_table_privilege('anon', 'public.user_feedback', 'select')
     or pg_catalog.has_table_privilege('authenticated', 'public.user_feedback', 'select')
     or pg_catalog.has_table_privilege('authenticated', 'public.user_feedback', 'insert')
  then
    raise exception 'user_feedback must not be reachable from a client role';
  end if;

  if pg_catalog.has_table_privilege('service_role', 'public.user_feedback', 'delete') then
    raise exception 'user_feedback must not be deletable - triage is a status, not a removal';
  end if;

  begin
    insert into public.user_feedback (kind, sentiment, message)
      values ('beta', 'negative', pg_catalog.repeat('x', 2001));
    raise exception 'an over-long message was accepted';
  exception
    when check_violation then null;
    when others then
      if pg_catalog.sqlerrm like 'an over-long message was accepted%' then raise; end if;
  end;

  begin
    insert into public.user_feedback (kind, sentiment, reasons)
      values ('beta', 'negative', array['not-a-real-reason']);
    raise exception 'an unenumerated reason was accepted';
  exception
    when check_violation then null;
    when others then
      if pg_catalog.sqlerrm like 'an unenumerated reason was accepted%' then raise; end if;
  end;
end;
$$;
