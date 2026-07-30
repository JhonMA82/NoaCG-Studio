-- One active grant per (user, kind, key) - closing a non-deterministic access answer.
--
-- THE DEFECT. `public.user_grants` carries both meanings at once (docs/ADMIN.md §2): a row with
-- `expires_at` is a temporary grant, a row without one is a permanent override. Nothing stopped
-- two ACTIVE rows naming the same key for the same user - the API inserted without checking, and
-- there was no constraint. The resolver merges grants LAST-WINS within a precedence rank
-- (`src/entitlements/contract.ts`), its sort is stable, and the loader read the rows with no
-- ORDER BY. So with two active rows of equal rank the winner was whichever one Postgres happened
-- to return last, which a seq-versus-index scan, a VACUUM, or an unrelated UPDATE can change.
--
-- Concretely: an admin overrides `community.publish` to false ("abuse"), a second admin later
-- overrides it to true ("appeal upheld"), and the account's real access afterwards is a coin
-- flip that can land differently on two consecutive requests - with no audit event, because
-- nobody did anything.
--
-- Why a permanent override and a temporary grant for one key are ALSO forbidden here, not just
-- two of the same shape: a permanent override outranks a temporary grant unconditionally, so the
-- pair is never useful - the temporary row is inert from the moment it is written. Refusing it
-- turns a grant that silently does nothing into an error an operator can act on.
--
-- The API refuses the clash first (`api/_lib/admin/grants.ts`) and this index is the backstop
-- that a second concurrent writer cannot get past. Both, deliberately: the check gives a usable
-- message, the index gives the guarantee.

-- ── 1. resolve any pair that already exists ──────────────────────────────────────────────────
-- A unique index cannot be created over data that already violates it, and a self-hoster may
-- have written a pair before this migration existed. Keep the NEWEST active row per key - the
-- most recent decision is the one an operator meant - and revoke the rest, which is the same
-- stamp the API's own revoke writes, so the history stays readable rather than being deleted.
--
-- No audit row is written for these: `admin_audit_log` records what an ACTOR did, and this is
-- the schema repairing itself. The revoked rows keep their reason and timestamps, so what
-- happened is still visible on the user's detail view.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, kind, key
      order by created_at desc, id desc
    ) as rn
  from public.user_grants
  where revoked_at is null
)
update public.user_grants g
   set revoked_at = now()
  from ranked r
 where g.id = r.id
   and r.rn > 1;

-- ── 2. make the ambiguous state unreachable ──────────────────────────────────────────────────
-- Partial, so the index constrains only ACTIVE rows: revoked history accumulates freely, which
-- is the whole point of revoking-by-stamp rather than deleting.
create unique index if not exists user_grants_one_active_idx
  on public.user_grants (user_id, kind, key)
  where revoked_at is null;

-- ── 3. prove it, or refuse to apply ──────────────────────────────────────────────────────────
-- Same posture as `0020` §5: assert against the live catalog and the live data, and raise on any
-- failure so the whole migration rolls back rather than half-applying. Reads the real catalog
-- (`pg_index`) rather than trusting that the CREATE above did what its text says, and never
-- changes the session role - `supabase db push` elevates with SET SESSION ROLE and a RESET would
-- break its own ledger write (docs/ADMIN.md §7).
do $$
declare
  duplicates bigint;
begin
  -- (a) No active pair may survive step 1.
  select count(*) into duplicates from (
    select 1 from public.user_grants
     where revoked_at is null
     group by user_id, kind, key
    having count(*) > 1
  ) s;
  if duplicates > 0 then
    raise exception '0021 self-check (a) FAILED: % (user, kind, key) group(s) still have '
      'multiple active grants', duplicates;
  end if;

  -- (b) The index must exist, be UNIQUE, and be PARTIAL. A non-partial one would forbid
  --     revoked history, which the revoke-by-stamp design depends on.
  if not exists (
    select 1
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
     where c.relname = 'user_grants_one_active_idx'
       and i.indisunique
       and i.indpred is not null
  ) then
    raise exception '0021 self-check (b) FAILED: user_grants_one_active_idx is missing, not '
      'unique, or not partial - the ambiguous state is still reachable';
  end if;

  raise notice '0021 self-check passed: one active grant per (user, kind, key).';
end $$;
