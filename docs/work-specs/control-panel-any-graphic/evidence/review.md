# The review itself - who ran it, against what, and what it did not do

**Reviewed revision:** `3ae9388b`, the tip of this review's own branch, whose base is
`dfac5b9cf230532565f57d6988517bb25cdbf94d` - `main` carrying every pull request of the chain, 270
to 281. **Spec:** `spec.md` at `c8b1ea4b966db1efcee1dd636a238d9cb05bd8bfba347d25455deb30a7443620`,
which is the amended text (AC-5 narrowed to controls on 2026-09-15). **Date:** 2026-09-16.

**Independence.** This session wrote none of the ten rows. It read each criterion against the
integrated tree, re-ran the named scenarios, and walked the proof case itself. It is not
independent of the three changes its own branch makes to `0060_operator_data_patch.sql`: the
migration had never applied anywhere, and correcting it is implementation, committed before this
record rather than after it. What those three are and how each was proved is in `ac-7-…`.

**This review ages the moment anything else lands.** `origin/main` moved to `223a52ad` (pull
request 282, which rewrites the ledger's own freshness rule) while this walk was running. That is
the design - a review is fresh against the tree it read - and nothing in this record depends on
main standing still; the receipts name the revision they read.

## What was run, in one list

| What | Where | Result |
|---|---|---|
| `npm run build` | this worktree, twice - before and after the check's fixes | exit 0 both times; 1713 tests, 1712 pass, 0 fail |
| `node --test scripts/production-data-migration.test.mjs` | this worktree | 14/14 |
| `npx -y @noacg/cli@0.3.2` doctor/docs/scaffold/validate/inspect/pack | `C:\claude\noacg-hj-walk`, against `https://noacg.studio` bridge `main@dfac5b9cf2` | all exit 0; 32.6 s of tool time for the seven authoring verbs |
| `cli`: `npm ci`, `npm run build`, `build-skill.mjs --check`, `node --test test/unit.test.mjs` | this worktree | exit 0; 11 generated files match; 33/33 |
| `cli/test/smoke.test.mjs` | this worktree | 1 passed, **5 skipped** for want of a bridge |
| `e2e/agent-made-graphics.spec.ts` | queue `j-1136` | 3 passed |
| `e2e/production-controls.spec.ts` | queue `j-1137` | 22 passed |
| `e2e/hosted-control.spec.ts` | queue `j-1138` | 12 passed |
| `e2e/production-data.spec.ts` | queue `j-1139`, re-run `j-1144` | 20 passed + 1 load flake, green alone |
| `e2e/exports.spec.ts` | queue `j-1140`, re-run `j-1143` | 15 passed + 1 load flake, green alone |
| `e2e/control-panel-types.spec.ts` | queue `j-1141` | 8 passed |
| `e2e/lite-field-paint.spec.ts` | queue `j-1142` | 16 passed |
| The proof case's minute, by hand | this worktree's dev server, offline | composed, driven, timed - `ac-9-the-proof-case-timed.md` |
| Export byte and render comparison, this revision against `1fc7ffc6` | in-page | `ac-10-…` |
| `list_migrations`, `pg_proc`, `pg_get_function_result`, and a `pg_temp` reproduction | project `kprolrchuldgfrzspthy` | `ac-4-…` and `ac-7-…` |

## The verdict

Seven pass, one unverified, two fail.

- **Pass:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-8, AC-10.
- **AC-6 unverified.** Every clause is observed in-app and pinned by specs except the one that
  matters most on the night: nobody has ever seen a combined control render on the hosted page.
- **AC-7 fails.** Migration 0060 has applied nowhere and refused itself twice on the post-land
  push. Corrected in the reviewed revision; the correction has not been watched apply.
- **AC-9 fails.** The profile was composed, driven and timed, but on the in-app page. Publishing
  needs a checkout carrying backend configuration, and reaching one would have meant this session
  authenticating as the owner.

The last three are one gap wearing three numbers: the hosted control page has never been driven
with a profile on it. That is the walk to schedule before 2026-10-20, and
`docs/CONTROL_LAYER.md`'s live-verify steps 8, 9 and 10 are its script.

## What this review is not

- It did not re-author the two proof-case graphics; it re-derived their gates. See `ac-2-…`.
- It did not run the catalog calibration tripwire, which is CI's and needs RAM this box has not got
  tonight.
- It did not press "Bind all by title" by hand; the spec that drives it did.
- `evidence-complete` is record integrity. Every receipt here says what it observed and what it
  could not, and the three that could not observe something say so in their verdicts rather than in
  a footnote.
