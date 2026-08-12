-- Take `storage_within_quota` back off the anonymous role.
--
-- Migration 0039 created the function and revoked it from PUBLIC, which was the wrong target:
-- Supabase's default privileges grant EXECUTE on every new function in `public` to `anon`,
-- `authenticated` and `service_role` at CREATE time, as an explicit per-role grant. Revoking
-- PUBLIC leaves all three untouched, so the function shipped callable by anon over
-- /rest/v1/rpc/storage_within_quota - visible in the ACL as `anon=X/postgres`, and absent from
-- every comparable function here (is_suspended, feature_denied, community_list) because their
-- migrations revoked the ROLE.
--
-- The function only ever answers a boolean, so nothing much leaks. What it does hand an
-- unauthenticated caller is an aggregate over every row of a bucket, once per request, against a
-- table sized for a thousand accounts' assets. That is the reason to close it, not the boolean.
--
-- `authenticated` keeps EXECUTE: the RESTRICTIVE policies from 0039 run as the querying role and
-- would fail closed without it. Uploads are `to authenticated` only, so anon needs nothing here.

revoke execute on function public.storage_within_quota(text, text) from anon;

-- The lesson generalized: a definer function in `public` is exposed to anon the moment it is
-- created, so every one of them must name the roles it revokes. PUBLIC is not the role that
-- carries the grant.
