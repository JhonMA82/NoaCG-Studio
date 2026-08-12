-- Capacity ceilings and server-side retention, so hosted usage cannot drift past the plan's
-- included quota and start billing.
--
-- The hosted project's included quota is 8 GB of database disk, 100 GB of Storage and 250 GB of
-- egress per month. Nothing here changes what a user can do; it bounds how much of that quota one
-- account, one bucket, or one unbounded log table can consume. The sizing this is derived from
-- (roughly 1000 accounts inside the included quota) lives in `supabase/README.md`.
--
-- Two ceilings, because they fail differently:
--   * a PER-FILE limit on the bucket rejects the single huge upload at the API edge;
--   * a PER-OWNER and PER-BUCKET limit rejects the slow accumulation that no single upload
--     would have looked wrong for.
-- Retention is the third: a log table with no upper bound is a disk bill with a delay on it.

-- ── 1. Per-file ceilings ─────────────────────────────────────────────────────
-- Both buckets held `null` (unlimited) since they were created. 8 MB clears every asset the app
-- can actually produce - video assets are capped client-side at 3 MB (assetUtils
-- MAX_VIDEO_ASSET_BYTES) and a whole shared template's media at 12 MB (templateBench) - while
-- refusing the arbitrary upload a stolen token could push through the same REST endpoint.
--
-- Deliberately NO mime allowlist: assets are decoded from data URLs before upload, so their
-- content type is whatever the original file declared (fonts in particular vary between
-- `font/woff2` and `application/octet-stream`). A type allowlist would reject legitimate assets
-- for no saving - size is what costs money, not type.
update storage.buckets
set file_size_limit = 8 * 1024 * 1024
where id in ('user-assets', 'community-assets');

-- ── 2. Accumulation ceilings ─────────────────────────────────────────────────
-- The limits live in a table rather than in the function body so raising one is an UPDATE by the
-- service role, not a migration and a deploy. RLS on with no policy: this is infrastructure
-- configuration, readable only through the SECURITY DEFINER function below.
create table if not exists public.storage_quotas (
  bucket            text primary key,
  per_owner_bytes   bigint not null check (per_owner_bytes > 0),
  per_bucket_bytes  bigint not null check (per_bucket_bytes > 0),
  updated_at        timestamptz not null default now()
);

alter table public.storage_quotas enable row level security;

-- 50 MB per account across ~1000 accounts is 50 GB, half the included 100 GB. The bucket
-- ceilings (70 + 10 GB) are the backstop that holds even if signups outrun the estimate: they
-- stop writes at 80 GB, while the plan starts charging at 100 GB.
insert into public.storage_quotas (bucket, per_owner_bytes, per_bucket_bytes)
values
  ('user-assets',      50::bigint * 1024 * 1024,        70::bigint * 1024 * 1024 * 1024),
  ('community-assets', 200::bigint * 1024 * 1024,       10::bigint * 1024 * 1024 * 1024)
on conflict (bucket) do nothing;

comment on table public.storage_quotas is
  'Storage ceilings enforced by storage_within_quota() as a RESTRICTIVE policy on storage.objects. '
  'Raise a limit with an UPDATE as the service role; the totals must stay under the plan''s '
  'included Storage quota (100 GB).';

-- Both totals in ONE pass over the bucket's rows. A bucket with no row in storage_quotas is
-- unconstrained (returns true), so adding a bucket never silently blocks its own first upload.
--
-- The in-flight object is not counted: Storage inserts the row and fills `metadata` once the
-- upload lands, so the sum covers what is already stored. That makes the ceiling soft by at most
-- one file - which is exactly what the per-file limit in §1 bounds.
create or replace function public.storage_within_quota(p_bucket text, p_owner text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select coalesce(
               sum((o.metadata->>'size')::bigint)
                 filter (where (storage.foldername(o.name))[1] = p_owner),
               0
             ) < q.per_owner_bytes
         and coalesce(sum((o.metadata->>'size')::bigint), 0) < q.per_bucket_bytes
      from public.storage_quotas q
      left join storage.objects o on o.bucket_id = q.bucket
      where q.bucket = p_bucket
      group by q.per_owner_bytes, q.per_bucket_bytes
    ),
    true
  );
$$;

-- An RLS policy runs as the QUERYING role, so that role must hold EXECUTE on every function the
-- policy calls. `authenticated` is the only role that writes through these policies.
revoke all on function public.storage_within_quota(text, text) from public;
grant execute on function public.storage_within_quota(text, text) to authenticated;

comment on function public.storage_within_quota(text, text) is
  'True while the owner folder and the bucket are both under their storage_quotas ceiling.';

-- RESTRICTIVE, so it ANDs with the existing ownership policies instead of offering an
-- alternative way in. UPDATE is covered too: `upsert: true` replaces an object in place, which
-- would otherwise be an unmetered way to grow a folder past its ceiling.
drop policy if exists storage_quota_insert on storage.objects;
create policy storage_quota_insert on storage.objects
  as restrictive for insert to authenticated
  with check (public.storage_within_quota(bucket_id, (storage.foldername(name))[1]));

drop policy if exists storage_quota_update on storage.objects;
create policy storage_quota_update on storage.objects
  as restrictive for update to authenticated
  with check (public.storage_within_quota(bucket_id, (storage.foldername(name))[1]));

-- ── 3. Retention ─────────────────────────────────────────────────────────────
-- Same reasoning as the funnel-events prune in 0037: retention belongs in the infrastructure, not
-- in a request path that only runs while somebody happens to be using the feature.
create extension if not exists pg_cron with schema extensions;

do $$
declare
  v_job bigint;
begin
  for v_job in
    select jobid from cron.job
    where jobname in (
      'noacg-prune-control-events',
      'noacg-prune-render-jobs',
      'noacg-prune-gateway-requests',
      'noacg-prune-ai-generations'
    )
  loop
    perform cron.unschedule(v_job);
  end loop;
end $$;

-- The control log is the one table a 24/7 output URL grows continuously. The publish path
-- already deletes rows older than 7 days (docs/CLOUD_PLAYOUT.md §6), so this is a strictly
-- weaker backstop for a show that stopped publishing but kept its output open. A browser output
-- recovers from the baseline stored on the show row (migration 0033), never from log history, so
-- pruning old events cannot cost a recovery.
select cron.schedule(
  'noacg-prune-control-events',
  '11 3 * * *',
  $$delete from public.control_events where created_at < now() - interval '14 days'$$
);

-- Render jobs are short-lived by construction (they carry their own output TTL in expires_at);
-- the row itself is only useful while somebody is watching the job.
select cron.schedule(
  'noacg-prune-render-jobs',
  '17 3 * * *',
  $$delete from public.render_jobs where created_at < now() - interval '30 days'$$
);

-- Gateway request accounting backs cost and allowance reporting, which is read per billing
-- period; half a year keeps every comparison anyone makes.
select cron.schedule(
  'noacg-prune-gateway-requests',
  '29 3 * * *',
  $$delete from public.ai_gateway_requests where created_at < now() - interval '180 days'$$
);

-- Generation history feeds the admin quality view and prompt-version comparisons, so it gets the
-- longest window - bounded, but long enough that a year-over-year read still has both sides.
select cron.schedule(
  'noacg-prune-ai-generations',
  '35 3 * * *',
  $$delete from public.ai_generations where created_at < now() - interval '365 days'$$
);

comment on table public.control_events is
  'Append-only control log for a production. Pruned by the publish path after 7 days and by '
  'noacg-prune-control-events after 14.';
comment on table public.render_jobs is
  'Render job records. Deleted 30 days after creation by noacg-prune-render-jobs.';
comment on table public.ai_gateway_requests is
  'Per-request AI gateway accounting. Deleted after 180 days by noacg-prune-gateway-requests.';
comment on table public.ai_generations is
  'AI generation history. Deleted after 365 days by noacg-prune-ai-generations.';
