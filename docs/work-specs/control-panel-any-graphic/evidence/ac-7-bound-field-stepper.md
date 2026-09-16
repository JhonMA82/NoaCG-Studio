# AC-7 - a stepper on a bound field patches the shared value

**Verdict: fail.** The in-app half works and is pinned. The hosted half cannot work in any
deployment, because the migration it needs has never applied anywhere and refuses itself when it
tries. Reviewed at `dfac5b9cf230532565f57d6988517bb25cdbf94d` on 2026-09-16.

## The in-app half, which holds

Through the queue, `e2e/production-data.spec.ts` (job `j-1139`), both of the criterion's own cases
green at this revision:

```
ok  a ± press on a bound field moves the shared value, and every graphic bound to it follows (6.0s)
ok  an adjust on a bound field patches the tree, and the event still fires (21.8s)
```

`controlModel.pressSend` is the one rule both ⚡ buttons and the combined-control resolver use to
decide what a press carries, split by boundness, so the two surfaces cannot disagree on air. An
unbound field keeps the field stepper unchanged and the exported controller, which carries no tree,
is untouched - the export comparison in `ac-10-…` confirms the exported package gained no tree and
no production path.

## Why the criterion fails

The hosted page needs `control_data_by_slug` and `control_data_patch_by_slug`, which migration
`0060_operator_data_patch.sql` creates. Read off the live project `kprolrchuldgfrzspthy` on
2026-09-16:

- `list_migrations` ends at **0059**. There is no 0060 row.
- `pg_proc` in `public` has **none** of `control_data_apply`, `control_data_by_slug`,
  `control_data_patch_by_slug`, `production_data_patch_paths`. The three functions 0060 depends on
  and does not create - `control_data_patch`, `jsonb_merge_patch`, `production_data_resolve` - are
  all present, so nothing was missing on the way in.

The post-land workflow that applies migrations has been **red for two consecutive landings**:
run `35045162515` (pull request 280) and run `35050545400` (pull request 281). Its log:

```
ERROR: operator-patch self-check failed: the operator door deleted an unbound branch
       (column reference "value" is ambiguous) (SQLSTATE P0001)
At statement: 15
…
nothing: no privilege, column, policy or ledger row differs.
supabase db push exited 1. The diff above is what actually landed.
```

The migration applies in one transaction, so its own self-check rolled the whole file back. That is
the outcome HH's handoff predicted in as many words: 0060 had never been executed, there is no
Docker on this machine, and "it lands on the post-land push, and that is the first time any of it
executes."

So on 2026-10-20 as things stand, a `+1` on a bound field made from the hosted control page writes
the field on one graphic and the next shared write puts it back - the exact bug the criterion
exists to remove.

## The cause, and what this branch did about it

`production_data_patch_paths` is declared `returns table (path text, value jsonb)`, which puts a
plpgsql variable called `value` in scope, and its loop read
`select key, value from jsonb_each(p_patch)` with the column unqualified. Postgres refuses that at
run time, and nothing plans the query until the loop executes - which is why the file applied all
the way to its self-check before failing.

Both directions were executed on the real Postgres 17 instance, in `pg_temp`, so nothing in the
project was touched:

- the original body: `ERROR: 42702 column reference "value" is ambiguous / DETAIL: It could refer
  to either a PL/pgSQL variable or a table column / QUERY: select key, value from
  jsonb_each(p_patch)` - the post-land error, reproduced;
- the corrected body (`select e.key, e.value from jsonb_each(p_patch) e`): walks
  `{"match":{"home":{"score":4}},"drivers":[{"gap":"LEADER"}],"gone":null}` to
  `match.home.score=4`, `drivers=[…]`, `gone=null` - the grammar the migration's own header
  documents, recursion included.

This branch corrects 0060 in place rather than adding 0061, because the file has applied nowhere
and there is no applied text to disagree with; the reasoning is written into the file's header so a
reader does not mistake it for editing an applied migration. `control_data_apply` runs the same
`select key, value` shape and is fine - it returns a scalar and declares no such out parameter -
and that is the only other site in the file.

## Two more defects, found by this branch's own review of the same file

Reading the migration for the ambiguity turned up two ways for a slug holder - signed out, holding
nothing but a shared operating link - to destroy a production's authored tree, which is the exact
thing the door's header argues it prevents. Both were reproduced against the live Postgres 17
instance in `pg_temp`, using the self-check's own bindings
(`match.home.score`, `drivers.0.gap`), before and after the change:

| the press | before | after |
|---|---|---|
| `{"match":{"home":{"score":5}}}` | allowed | allowed |
| `{"drivers":[{"gap":"+1.204"}]}` | allowed | allowed |
| `{"match":null}` / `{"match":"gone"}` | refused | refused |
| `{"weather":{"temp":4}}` | refused | refused |
| **`{"match":[]}`** | **allowed** | refused |
| **`{"%":[1]}`** | **allowed** | refused |
| **`{"matc_":[1]}`** | **allowed** | refused |

The array carve-out accepted an array at any path a binding descends into, by NAME as well as by
index, so `{"panel":[]}` against a binding of `panel.katri.points` replaced the whole branch - and
silently, because the bound leaves are then gone from the resolve, no `update` row is appended and
the activity feed says nothing. And the prefix test was a `like` pattern built from the caller's own
JSON key, so `%` and `_` in a key were wildcards. It is a `starts_with` comparison now and the
segment after the prefix must be numeric, which is the only shape merge-patch cannot address
element-wise and so the only one the exception is for.

A third, smaller one: a patch resolving to no change still took the row lock and rewrote the row,
uncapped, on a door granted to `anon` - both rate gates sit behind the pending-row count. It writes
nothing now when the tree did not move.

The migration's self-check gains the two refusals and `scripts/production-data-migration.test.mjs`
pins all three conditions of the carve-out separately (14/14 green). None of this changes the
verdict above: the door still cannot work anywhere until 0060 applies.

## What is still unexecuted

**The fix does not make this criterion pass, and the ledger should not say it does.** Statements
past 15 - roughly nineteen further assertions of the self-check, the two doors themselves, the
row-count checks over two bound graphics, the four refusals - have still never run anywhere. The
next post-land push is the first execution of them, and it may stop at the next one. Marking AC-7
anything but fail would hide that behind a one-line fix nobody has watched apply.
