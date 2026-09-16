# AC-7 - a stepper on a bound field patches the shared value

**Verdict: pass.** The two things that failed this criterion are both answered: migration 0060 has
applied to production and staging, and a ± press on a bound field has now been made on the HOSTED
control page and the resulting rows read off the wire. Re-reviewed at `66b000808a1547695a6cc07ae5fc2ed1315713df` on 2026-09-16.

## What failed before, and what settled it

The previous receipt failed this criterion for one reason: `control_data_by_slug` and
`control_data_patch_by_slug` did not exist anywhere. `0060_operator_data_patch.sql` had refused
itself on two consecutive post-land pushes on an ambiguous `value` reference, rolling the whole
file back each time, so roughly nineteen assertions of its own self-check, both doors, the
row-count checks over two bound graphics and the four refusals had never executed.

**They have now.** Post-land run `35055657854`, the push after pull request 283:

```
Applying migration 0060_operator_data_patch.sql...
Applied 1 migration(s): 0060.
  ledger: +1 -0            + 0060 operator_data_patch
  function_grants: +8 -0   + anon/authenticated/service_role execute on control_data_by_slug,
                             control_data_patch_by_slug, control_data_apply,
                             production_data_patch_paths
```

on `kprolrchuldgfrzspthy` (production) and again on `garafohbzmsybtysxphb` (staging), the job green.
That is the first execution of every statement past 15, including the two refusals this chain added
for the array carve-out and the LIKE-pattern key.

The configured suite applies the same 51 migrations to a fresh local Postgres on every run and
asserts the count matches the repository before any spec runs, so 0060 is now executed on three
databases rather than none.

## What the run observed, on the hosted page

`configured-suite` run `35059312926` on `claude/hk-hosted-half-configured`: **43 passed, 0 skipped.**

The production binds three fields across the two proof-case boards: the votes board's
"Panelist 1" (f5) and the totals board's "Name 1" (f0) to `panel.katri.name`, and the totals
board's "Points 1" (f5) to `panel.katri.points`, seeded to `Katri` and `0` through the owner's own
data key.

- **A bound field has no box to type into.** `hosted-bound-f5` renders as a read-out wearing its
  path, its input `readOnly`, reading `0` off the tree - not off the cue, which is the §2.7 rule.
- **The ± press moves the VALUE.** One `+` on the live totals cue, and the log gained exactly one
  command row: an `update` on `Totals board` carrying `f5: "1"`. Nothing was written to the field
  and nothing was mirrored into the cue.
- **The tree moved, and stayed a number.** `control_data_by_slug` read back
  `panel.katri.points === 1` as a JSON number, so a feed writing the same path does not find a
  string there.
- **Every graphic bound to a value follows it.** Moving `panel.katri.name` through the same
  operator door produced exactly two rows, one per bound graphic: `Votes board` with
  `f5: "Katri V."` and `Totals board` with `f0: "Katri V."`.

## Why the criterion's own scenario is proved on two leaves rather than one

The spec's scenario is "two graphics bound to `panel.katri.points`, a `+1` on one, both showing the
new figure". The proof-case fixture cannot offer that honestly: **the votes board declares no
number field at all** (sixteen inputs, all text, dropdown or hidden), so the only leaf both boards
can carry is the panelist's NAME and the only leaf a ± stepper can move is the POINTS the totals
board alone shows.

So the walk binds both: the press proves the patch road on the points leaf, and the multi-graphic
follow is proved on the name leaf, through the same `control_data_patch_by_slug` door on the same
page. Binding the votes board's "Panelist 1" to a points figure would have satisfied the sentence
and aired nonsense, which is a worse receipt than this paragraph.

The in-app half, where two graphics DO share a number, is unchanged and still pinned:
`e2e/production-data.spec.ts` holds "a ± press on a bound field moves the shared value, and every
graphic bound to it follows" and "an adjust on a bound field patches the tree, and the event still
fires", both against `match.home.score` on two scoreboards.

## The rest of the criterion

- **An unbound field keeps the field stepper unchanged.** Pinned in-app in the same spec; the
  hosted walk exercises the unbound road incidentally, since the combined control's `plus2` moves
  the unbound `f6` and mirrors it into the shared staging buffer rather than the tree.
- **The exported controller, which carries no tree, is unchanged.** The byte and render comparison
  is in `ac-10-nothing-a-downloaded-graphic-carries-changed.md`.
- `controlModel.pressSend` remains the one rule both the ⚡ buttons and the combined-control
  resolver use to decide what a press carries, split by boundness, so the surfaces cannot disagree
  on air.

## Limitations worth carrying

- **The local stack answers in about a millisecond where a hosted project answers in about two
  hundred from a runner**, which `configured-suite.yml`'s own header states plainly. Nothing here
  is latency-shaped, but "the press landed" on this rig is not evidence that it lands fast enough
  from a phone on a venue's network.
- The three defects this chain fixed inside 0060 - the array carve-out, the LIKE-pattern key and
  the no-op write - are pinned by the migration's own self-check and by
  `scripts/production-data-migration.test.mjs` (14/14). The self-check now runs on every fresh
  database, including this suite's, which is the standing guard that was missing.
