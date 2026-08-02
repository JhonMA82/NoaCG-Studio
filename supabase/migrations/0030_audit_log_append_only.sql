-- Make the audit log append-only BY PRIVILEGE, which docs/ADMIN.md §5 has claimed since 0017
-- and which has never been true on this instance.
--
-- WHAT WENT WRONG. `0017` writes `grant select, insert on table public.admin_audit_log to
-- service_role` and nothing else. That reads like a restriction and is not one: Supabase
-- configures
--
--   alter default privileges in schema public grant all on tables to service_role
--
-- so the table was created holding DELETE, UPDATE, TRUNCATE, SELECT, INSERT, REFERENCES and
-- TRIGGER, and a narrower grant adds nothing on top of privileges that are already there.
-- Verified against production on 2026-08-02: `service_role` held all seven.
--
-- **"I only granted two privileges" is a different statement from "only two privileges exist."**
-- The gap survived five migrations of review because every one of them stated the property in a
-- comment. `0028` found the identical defect in `user_feedback` within a minute of being
-- written, because it asserted the property in a DO block instead - the migration refused to
-- apply until the revoke was actually there. That is the pattern; this migration adopts it for
-- the table the claim was made about.
--
-- WHY IT MATTERS HERE SPECIFICALLY. The audit log is the record of what operators did to other
-- people's accounts - suspensions, plan changes, grants, entitlement overrides. Its whole value
-- is that the person who took an action cannot later edit or remove the evidence. An operator
-- who can rewrite the log is exactly the threat the log exists to document, so "nothing in the
-- code does that" is the wrong kind of guarantee for it to rest on.
--
-- SAFE TO REVOKE, checked rather than assumed. Every reference to this table in the repository
-- is an INSERT or a SELECT: `api/_lib/adminAuth.ts` (writeAudit, insert), `api/_lib/admin/
-- audit.ts` (the log view, select), `api/_lib/adminUsers.ts` (per-account activity, select) and
-- `scripts/admin.mjs` (the bootstrap grant, insert). No update, no delete, no upsert anywhere.
--
-- WHAT THIS DELIBERATELY DOES NOT TOUCH, and why - so the omissions read as decisions:
--
--   * `funnel_events` has the same over-granted shape, and it is LEFT ALONE. It takes a row per
--     page load, so it is the one ledger here that will genuinely need retention pruning, and a
--     pruning job needs DELETE. Making it append-only would trade a real future need for a
--     guarantee nothing has asked for - 0016 promises server-write-only, which is about who may
--     write, and that part is already true.
--   * `ai_generations` and `ai_gateway_requests` keep UPDATE: their rows transition through
--     status and cost values as a generation runs. Neither claims to be append-only.
--
-- THE ESCAPE HATCH, stated rather than left to be discovered. The table OWNER can always grant
-- itself back through the SQL editor. That is not a hole - it is what keeps a genuine legal
-- erasure request possible while making it an out-of-band act somebody has to decide to
-- perform, rather than something an endpoint can do by accident. Same reasoning as `0028`.

revoke update, delete, truncate on table public.admin_audit_log from service_role;

-- Re-asserted for the client roles too. `0017` already revoked them, and nothing since should
-- have changed that - but this migration exists precisely because a grant that was assumed to
-- hold did not, so the assumption is not repeated here.
revoke all on table public.admin_audit_log from public, anon, authenticated;
grant select, insert on table public.admin_audit_log to service_role;

-- ── self-check ───────────────────────────────────────────────────────────────────────────
-- The property, asserted against the live catalog rather than described in a comment. This is
-- the whole point of the migration: had 0017 carried these four lines, the claim in
-- docs/ADMIN.md §5 could never have been false for five migrations.
do $$
begin
  if pg_catalog.has_table_privilege('service_role', 'public.admin_audit_log', 'update')
     or pg_catalog.has_table_privilege('service_role', 'public.admin_audit_log', 'delete')
     or pg_catalog.has_table_privilege('service_role', 'public.admin_audit_log', 'truncate')
  then
    raise exception 'admin_audit_log must be append-only: service_role still holds update, delete or truncate';
  end if;

  -- And it must still WORK. An append-only log nobody can write to or read is not a stricter
  -- audit trail, it is a broken one - writeAudit inserts on every mutating admin call and two
  -- surfaces select from it.
  if not pg_catalog.has_table_privilege('service_role', 'public.admin_audit_log', 'insert')
     or not pg_catalog.has_table_privilege('service_role', 'public.admin_audit_log', 'select')
  then
    raise exception 'admin_audit_log must still be insertable and readable by service_role';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.admin_audit_log', 'select')
     or pg_catalog.has_table_privilege('authenticated', 'public.admin_audit_log', 'select')
  then
    raise exception 'admin_audit_log must not be readable from a client role';
  end if;
end;
$$;
