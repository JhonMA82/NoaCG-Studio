-- Server-write-only request ledger for the AI model gateway (/api/ai/generate).
-- It records accounting and outcomes only, never prompts, messages, images,
-- generated output, provider response bodies, or raw IP addresses.
--
-- This is deliberately a separate table from ai_generations: the Lite quota
-- functions (ai_lite_usage) count every ai_generations row toward Lite's fleet
-- spend and concurrency, and gateway traffic - much of it spending the user's
-- own BYO key - must not consume Lite's budget.

create table if not exists public.ai_gateway_requests (
  id uuid primary key default gen_random_uuid(),
  task text not null default 'byo-generate' check (task = 'byo-generate'),
  -- Null when the caller is anonymous (BYO-key traffic needs no sign-in).
  user_id uuid references auth.users(id) on delete set null,
  ip_hash text not null,
  key_source text not null check (key_source in ('byo', 'managed')),
  provider text not null,
  model text not null,
  -- 'ok' or the AiGatewayErrorCode the request failed with.
  outcome text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  reasoning_tokens integer not null default 0 check (reasoning_tokens >= 0),
  provider_cost_usd numeric(12, 8) not null default 0 check (provider_cost_usd >= 0),
  created_at timestamptz not null default now()
);

create index if not exists ai_gateway_requests_created_idx
  on public.ai_gateway_requests (created_at desc);
create index if not exists ai_gateway_requests_user_created_idx
  on public.ai_gateway_requests (user_id, created_at desc);

alter table public.ai_gateway_requests enable row level security;
-- No client policies by design. Server functions use the Supabase secret key.
revoke all on table public.ai_gateway_requests from public, anon, authenticated;
grant select, insert on table public.ai_gateway_requests to service_role;
