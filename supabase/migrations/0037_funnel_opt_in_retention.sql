-- Optional product-improvement analytics: explicit browser consent, withdrawal, and a hard
-- 90-day server retention limit. New clients no longer write the legacy attribution columns;
-- they remain nullable until their final pre-consent rows age out so older admin functions do
-- not break while releases roll forward.

-- Remove data already older than the new promise at migration time.
delete from public.funnel_events
where created_at < now() - interval '90 days';

-- The events function uses the service role for an opted-out browser/account deletion.
grant delete on table public.funnel_events to service_role;

-- Supabase provides pg_cron. Keeping the schedule in the migration makes retention an
-- infrastructure rule rather than a best-effort request-path cleanup.
create extension if not exists pg_cron with schema extensions;

do $$
declare
  v_job bigint;
begin
  for v_job in
    select jobid from cron.job where jobname = 'noacg-prune-funnel-events'
  loop
    perform cron.unschedule(v_job);
  end loop;
end $$;

select cron.schedule(
  'noacg-prune-funnel-events',
  '23 3 * * *',
  $$delete from public.funnel_events where created_at < now() - interval '90 days'$$
);

comment on table public.funnel_events is
  'Explicitly opted-in product-improvement milestones. Rows are automatically deleted after 90 days.';
