# The operator door refuses to destroy a BRANCH and allows the same destruction on a LEAF

**Filed:** 2026-09-16. **Source:** measurement, during the QA of migration 0060 on the
`claude/qa-migration-0060-applies` branch. The guard was re-derived against the deployed
`production_data_patch_paths` on staging, not read off the file.

## Why

`control_data_patch_by_slug` (migration 0060) opens `control_shows.data` - a production's durable
authored state - to anyone holding the control slug, which is a link deliberately passed around:
to a class, to a second phone, to whoever is running the show. Its own header says what the guard
is for: *"a shared operating link must not be able to delete or replace a production's authored
state"*, and the five shapes its self-check pins are all deletions of a BRANCH.

One level deeper the guard stops. A bound LEAF may be set to `null`, to `{}` or to `[]`, and all
three erase the production's value for that leaf. Worse, all three are SILENT: `production_data_format`
answers `null` for a JSON null, an object and an empty array, so `production_data_resolve` emits no
row for that binding, the diff in `control_data_apply` therefore produces no `update` row, and the
graphic on air keeps displaying the value that is no longer in the tree. Nothing in the command log
records that anything happened. The next dashboard read shows an empty box for a value that was on
air a second ago, and an operator has no way to tell what removed it.

It is a completeness gap in a guard, not a live bug users are hitting - see the severity note
below. It is worth closing because the guard is the only thing standing between a shared link and
durable state, and a guard with a documented hole in it is worse than one whose limits are known.

## Severity, stated honestly

**Not reachable from the product's own UI.** Both callers build their patch with
`replacementPatch(before, withTreeWrites(before, writes))` (`src/components/HostedControlPage.tsx`
line 518, `src/components/home/ProductionPage.tsx` line 741). `withTreeWrites` only ever SETS
values, so no key is ever dropped and `replacementPatch` never emits its `null`. The owner's own
tree edits, which do emit nulls for removals, go through the DATA-KEY door
(`patchProductionData` -> `control_data_patch`), where deletion is intended and allowed.

So this needs a hand-written RPC call from someone holding the slug. That is a real actor - the
slug is shared by design and the RPC is granted to `anon` - but it is not an accident anyone will
stumble into, and no production has been damaged by it.

## Evidence

Re-derived on 2026-09-16 against the deployed functions on staging (`garafohbzmsybtysxphb`),
running the guard's own `not exists` predicate over the paths a patch names. Bindings fixture:
`{"Board":{"f1":"match.home.score"},"Bug":{"f2":"match.home.score","f3":"drivers.0.gap"},"Panel":{"f4":"panel.katri.points"}}`.

| patch | names | verdict |
| --- | --- | --- |
| `{"match":null}` | `match [null]` | refused |
| `{"match":"gone"}` | `match [string]` | refused |
| `{"panel":[]}` | `panel [array]` | refused |
| `{"%":[1]}` | `% [array]` | refused |
| `{"drivers":[{"gap":"+1.204"}]}` | `drivers [array]` | accepted (correct - the indexed carve-out) |
| `{"match":{"home":{"score":6}}}` | `match.home.score [number]` | accepted (correct - an ordinary press) |
| **`{"match":{"home":{"score":null}}}`** | `match.home.score [null]` | **accepted** |
| **`{"panel":{"katri":{"points":{}}}}`** | `panel.katri.points [object]` | **accepted** |
| **`{"match":{"home":{"score":[]}}}`** | `match.home.score [array]` | **accepted** |

The first six rows are exactly what 0060's self-check asserts, so the fixture is known good; the
last three are the shapes it never tries.

The silence half comes from `production_data_format` in
`supabase/migrations/0048_production_data_tree.sql`: `null`, `object` and a zero-length `array` all
return `null`, and `production_data_resolve` drops any binding whose format is null. The diff in
`control_data_apply` iterates the AFTER side, so a path that vanished contributes no entry - which
is 0048's deliberate *"a missing path writes nothing"* rule, correct in itself and what makes this
particular deletion invisible.

## What it would take

A new migration - **0061, never an edit to 0060**, which has applied to production and to staging
since 2026-09-16 04:27 UTC (post-land run `35055657854`). One `create or replace` of
`control_data_patch_by_slug` plus its own self-check.

The guard's accept rule is currently "this exact path is bound, OR this is an array over a binding
that reaches through an index". The missing clause is about the VALUE's type rather than the path:
a press carries a display value, so on an exactly-bound path only a `string`, a `number` or a
`boolean` should pass. That is the same set `production_data_format` can render, which is the
honest definition - the door should accept exactly what can reach a field, and an operator who
wants a field blank presses it to `""`, which resolves and writes an `update` row like any other
press.

Decide one question while writing it: whether an array on an exactly-bound path stays refused.
`production_data_format` joins a string/number/boolean array with newlines, so `["a","b"]` on a
bound leaf IS renderable and would write a visible multi-line value. Refusing it is the simpler
rule and nothing sends it; allowing it needs no extra code if the clause tests renderability
instead of type. Pick one and say why in the migration.

Extend the self-check with the three rows above. It already builds the fixture this needs.
