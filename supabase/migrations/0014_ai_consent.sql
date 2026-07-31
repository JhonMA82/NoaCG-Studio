-- AI external-provider disclosure consent (docs/AI_PLATFORM_PLAN.md section 9, ratified
-- decision 2). One row per signed-in user: the latest notice version accepted and when.
-- Anonymous users record acceptance client-side only; re-acceptance is required whenever
-- the notice version changes, which is why the version rides in the row. Content-free by
-- construction: no prompts, no uploads, no template data.

create table if not exists public.ai_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notice_version text not null,
  accepted_at timestamptz not null default now()
);

alter table public.ai_consents enable row level security;
-- No client policies by design. Server functions use the Supabase secret key.
revoke all on table public.ai_consents from public, anon, authenticated;
grant select, insert, update on table public.ai_consents to service_role;
