-- The growth funnel ledger (docs/FUNNEL_EVENTS.md): visit -> signup -> activation ->
-- export, plus the return visit that carries the retention number the growth plan steers
-- on (docs/GROWTH_EXECUTION_PLAN.md §11).
--
-- Server-write-only, like ai_gateway_requests (0012). What it deliberately does NOT hold:
--   * no raw IP - the salted hash the route computes is used for the burst gate only and
--     is never written here;
--   * no user agent, no screen size, no device fingerprint of any kind;
--   * no page URLs, titles, prompts, template content, or any free text - `detail` is a
--     short slug from a fixed allowlist the server enforces;
--   * no cookies anywhere in the path. `visitor_id` is a random first-party id the
--     browser mints for itself and can erase at any time.
-- The visitor id is what makes activation and D7 return countable at all; it is not
-- derived from the account, the address, or anything the user did not generate.

create table if not exists public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  event text not null check (event in ('visit', 'return', 'signup', 'activation', 'export')),
  -- Random, browser-minted, first-party. Not an account id and not derived from one.
  visitor_id uuid not null,
  -- Present only once the visitor is signed in, so a funnel row can be attributed to an
  -- account without the anonymous half of the funnel needing one.
  user_id uuid references auth.users(id) on delete set null,
  -- FIRST-touch attribution: captured on the visitor's first ever page load and never
  -- overwritten, so a campaign keeps credit for the account it actually brought in.
  source text check (source is null or char_length(source) <= 64),
  medium text check (medium is null or char_length(medium) <= 64),
  campaign text check (campaign is null or char_length(campaign) <= 64),
  -- Referrer HOSTNAME only - never the full referring URL.
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 128),
  -- Low-cardinality slug from the server's allowlist (export target, activation kind).
  detail text check (detail is null or detail ~ '^[a-z0-9-]{1,40}$'),
  created_at timestamptz not null default now()
);

create index if not exists funnel_events_created_idx
  on public.funnel_events (created_at desc);
create index if not exists funnel_events_event_created_idx
  on public.funnel_events (event, created_at desc);
-- The retention query walks one visitor's timeline.
create index if not exists funnel_events_visitor_created_idx
  on public.funnel_events (visitor_id, created_at);

alter table public.funnel_events enable row level security;
-- No client policies by design: the browser posts to /api/events, which validates and
-- writes with the Supabase secret key. Nothing readable or writable from anon or
-- authenticated - a forged or scraped funnel is worth less than no funnel at all.
revoke all on table public.funnel_events from public, anon, authenticated;
grant select, insert on table public.funnel_events to service_role;
