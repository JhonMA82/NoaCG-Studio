# QA: migration 0060 applies - 2026-09-16

**The row's goal was already true when the session opened, and no fix was needed.** Migration 0060
had been corrected and applied hours before this session started. What this branch carries is the
verification that says so, a header correction on 0060 so the file stops claiming otherwise, and a
defect the verification turned up.

Branch `claude/qa-migration-0060-applies`, merge base `16ed46e9`, tip `a766c02a`.

## The verdict on the assigned goal

Every condition the prompt named holds, re-derived here rather than taken from a report:

| condition | result |
| --- | --- |
| `npm run db:push` applies 0060 to production | `kprolrchuldgfrzspthy holds all 60 migration(s). Nothing to push.` |
| `npm run db:push -- --ref garafohbzmsybtysxphb` | `garafohbzmsybtysxphb holds all 60 migration(s). Nothing to push.` |
| `node scripts/migration-drift.mjs` | `Production holds all 60. Staging holds all 60.` |
| post-land green on main's tip | run `35065091235`, sha `16ed46e9`, success |

**The reproduce step in the prompt could not reproduce anything**, and that is the finding, not a
failure of the step. `npm run db:push` answered "Nothing to push" on the first try. The self-check
abort the prompt quotes was real, and it stopped happening at 04:27 UTC.

What actually happened: `1ecf34d8` (03:50 UTC) qualified the `jsonb_each` columns in
`production_data_patch_paths`, `3ae9388b` (04:10 UTC) narrowed the array carve-out to indexed
bindings, both landed in pull request 283, and post-land run `35055657854` (04:27 UTC) applied 0060
to production and to staging. The three failing post-land runs the morning report counts
(`35045162515`, `35050545400`, `35054152242`) all predate that.

## The evidence that matters, because a ledger row is not proof of WHICH text applied

A ledger row says a version applied. It does not say the database holds the text now in git - and
this file was edited twice while unapplied, so "0060 is in the ledger" would have been compatible
with the databases holding the pre-narrowing text and the security fix living only in git. That is
the trap in `docs/backlog/advisor-gate-runs-nowhere.md` wearing its other face.

So it was checked directly. All five function bodies 0060 defines were hashed out of the file and
compared against `md5(pg_proc.prosrc)` on both projects:

```
control_data_apply           37e64e0960743d9a780438aed278c5b3
control_data_by_slug         65995322a72dae08a3ce56d241cd2ef9
control_data_patch           e1052031073532fa04baf54dc26b6ee2
control_data_patch_by_slug   a7f35db786aeac771c5b0c7a5670f31e
production_data_patch_paths  2f22dd953e74c7a5fc16f1b026275be4
```

Production and staging both match the file on all five, so both hold the narrowed carve-out.

**Two traps in doing that comparison, neither of which is in a repo file:**

- **Normalise line endings first.** The checkout is CRLF and Postgres stores the body with LF, so a
  naive hash disagrees on every function and looks like real drift. The byte counts differ by
  exactly one per line, which is the tell.
- **`length(prosrc)` counts characters, not bytes.** The bodies carry an em dash and box-drawing
  characters, so a matching md5 sits beside a length that is four short. Trust the hash.

Also worth knowing: `supabase_migrations.schema_migrations.statements` stores the applied SQL,
comments included, so what ran is recoverable per statement. 0060 applied as 16 statements;
statement 15 is the `control_data_by_slug` grant and statement 16 is the self-check, which is why
the old failure was reported at statement 15 - the file had one fewer statement then.

## What this branch changes

**`supabase/migrations/0060_operator_data_patch.sql` - header comment only, nothing executable.**
The header still said the file had never applied anywhere and offered that as the reason it could
be corrected in place. That was true when written and is now false, and it is the shape of sentence
that gets acted on: a reader who takes the permission without re-checking the ledger edits a
migration no push will ever re-run, and the edit lives in git and in neither database. The header
now records the apply and says any further correction is 0061.

**This is itself an edit to an applied migration, done deliberately and narrowly.** It changes only
the header, which sits outside every `$$` body, so the `prosrc` comparison above still holds and
nothing executable disagrees with what ran. The ledger's copy of the file does carry the old
comment text; nothing reads it, and `db push` and `migration-drift` both key on the four-digit
version alone (checked - neither script hashes migration content).

**`docs/backlog/the-operator-door-guards-a-branch-and-not-a-leaf.md` - a new defect.**

## The defect, which is the real output of this session

`control_data_patch_by_slug`'s guard decides from the PATH a patch names and the JSON type there.
It never asks whether the value can reach a field. Two holes, both silent:

- **A whole branch is still deletable, through the carve-out added to protect it.**
  `{"drivers":null}` is refused; `{"drivers":[]}` is accepted, because `drivers.0.gap` descends
  through an index and the carve-out exempts any array at that path. Same branch, same destruction.
  A shorter array truncates it. This is exactly what the self-check pins for `{"match":[]}` and
  `{"panel":[]}`, reached on the one binding shape the carve-out exempts.
- **A bound leaf can be erased silently** - `null`, `{}` and `[]` all pass, none renders, so no
  `update` row is written and the graphic keeps showing a value the tree no longer has.

The `[]` case arrives from the ordinary UI: clearing a bound list field sends `{"path":[]}` through
this door on an ordinary `remove` press. The branch deletions need a hand-written RPC, but the slug
is shared by design and the function is granted to `anon`.

The backlog file carries the re-derivation tables, the fix that closes both without breaking list
presses, and the fix that looks obvious and is wrong. **It must be 0061, never an edit to 0060.**

**Nothing was minted here.** The prompt's TOUCHES line scopes this row to 0060, and another row in
this wave could be minting 0061 - two branches minting the same number is silently skipped by
`db push` (`supabase/AGENTS.md`). Whoever writes 0061 should run `node scripts/merge-order.mjs`
first.

## Traps worth carrying forward

- **The Supabase MCP `execute_sql` runs read-only**, so the door could not be driven end to end
  through it. The guard's predicate is a pure read and was run directly instead, with the bindings
  as a literal - that re-derives the accept/refuse decision without writing anything. Same tool
  cannot call `production_data_patch_paths`: it is revoked from everything but `service_role`,
  which is the revoke working.
- **A delegated review is worth the round trip on a prose change.** The first version of the
  backlog file had the severity backwards and proposed a fix that would have broken every list
  press on the hosted control page. The review caught five findings, all confirmed against the
  code, and the corrected entry leads with a hole the first pass had not found at all.

## Needs the owner

Nothing to decide now. One question is parked in the backlog file rather than answered: clearing a
bound list does not clear the graphic, because `production_data_format` deliberately renders an
empty array as nothing so a board cannot go blank (0048). Whether an operator who empties a bound
list should see the board empty is a product question with the owner's taste in it, and 0061 should
not settle it as a side effect of tightening a guard. `needs: alignment`, when someone gets to it.

## Loose end this session could not close

`docs/handoffs/ci-morning-report.local.md` is stale and still says 0060 refuses to apply. It is
gitignored and lives only in the primary checkout, which a worktree-isolated session may not write
to, so it stands uncorrected - the next session to read it will chase a bug that is already fixed.
Whoever regenerates or reads that report should replace it with this file.

## Pointers

- `ed85fb6c` - freeze 0060's header, file the defect
- `a766c02a` - correct the defect report after review
- check stamp: `.git/noacg-jobs/checks/claude-qa-migration-0060-applies.json`, PASS at `a766c02a`
- `review: delegated` (5 findings, 5 fixed) · `simplify: inline` (2 fixed) · `verify: inline` ·
  `taste: not applicable` - a SQL comment and a markdown file cannot move what a graphic looks like
