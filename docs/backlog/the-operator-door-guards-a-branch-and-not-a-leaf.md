# The operator door's guard reads the PATH and never the VALUE, so it still deletes branches

**Filed:** 2026-09-16. **Source:** measurement, during the QA of migration 0060 on the
`claude/qa-migration-0060-applies` branch. Every verdict below was re-derived by running the
deployed guard's own predicate on staging (`garafohbzmsybtysxphb`), not read off the file.

## Why

`control_data_patch_by_slug` (migration 0060) opens `control_shows.data` - a production's durable
authored state - to anyone holding the control slug, which is a link deliberately passed around: to
a class, to a second phone, to whoever is running the show. Its header says what the guard is for:
*"a shared operating link must not be able to delete or replace a production's authored state"*.

The guard decides from the PATH a patch names and the JSON TYPE at that path. It never asks whether
the value can actually reach a field. Two holes follow, and the first one is the one the guard was
written to close:

**A whole branch is still deletable, through the carve-out that was added to protect it.**
`{"drivers":null}` is refused. `{"drivers":[]}` - the same branch, the same deletion, a different
literal - is ACCEPTED, because `drivers.0.gap` is a binding that reaches through an index and an
array over such a binding is the carve-out's whole purpose. `{"drivers":[{"gap":"x"}]}` truncates a
twenty-car grid to one the same way. This is the exact destruction 0060's self-check pins for
`{"match":[]}` and `{"panel":[]}`, reached on the one binding shape the carve-out exempts.

**A bound leaf can be erased silently.** `null`, `{}` and `[]` all pass on an exactly-bound path,
and none of them can be rendered into a field, so no `update` row is written (the mechanism is
under Evidence). The graphic on air keeps displaying a value that is no longer in the tree, nothing
in the command log says anything happened, and the next dashboard read shows an empty box for a
figure that was on air a second ago.

Both are silent by the same mechanism, and that is what makes them worth closing: a destructive
write that leaves no `update` row leaves no trace anywhere an operator can look.

## Severity: the deletion needs a crafted call, the silent clear does not

**The branch deletions need a hand-written RPC.** No surface builds `{"drivers":[]}`: a press
always writes a leaf, so nothing in the product names a branch path. But the slug is shared by
design and the RPC is granted to `anon`, so the actor is real.

**The `[]` clear on a bound leaf arrives from the ordinary UI**, which is worth stating because the
first draft of this file got it wrong. `retypeLeaf` (`src/model/productionData.ts:385-397`) returns
`[]` whenever the leaf already holds an array and the press's text is empty, and an event's `remove`
press produces exactly that text once the last line goes (`removedValue` joins an empty list to
`''`, `src/control/controlModel.ts:114-119`). So a bound list field - the bingo `called` case
`retypeLeaf`'s own comment is about - goes `["K7"] -> []`, `replacementPatch` emits
`{"bingo":{"called":[]}}`, the guard accepts it as an exactly-bound path, and no `update` row is
written. **The operator clears the board and the board does not clear.** See the open question
below: that half is 0048's design, not the guard's bug.

`null` and `{}` reach nothing in the product at all - `retypeLeaf` and `retypeScalar` between them
return only a string, a number, a boolean or an array of those - so refusing them costs no press.

## Evidence

The guard's own `not exists` predicate, run against the deployed `production_data_patch_paths`
grammar on staging, 2026-09-16.

Bindings `{"Board":{"f1":"match.home.score"},"Bug":{"f2":"match.home.score","f3":"drivers.0.gap"},"Panel":{"f4":"panel.katri.points"}}`:

| patch | names | verdict |
| --- | --- | --- |
| `{"match":null}` | `match [null]` | refused |
| `{"match":"gone"}` | `match [string]` | refused |
| `{"panel":[]}` | `panel [array]` | refused |
| `{"%":[1]}` | `% [array]` | refused |
| `{"drivers":[{"gap":"+1.204"}]}` | `drivers [array]` | accepted (the carve-out working) |
| `{"match":{"home":{"score":6}}}` | `match.home.score [number]` | accepted (an ordinary press) |
| **`{"match":{"home":{"score":null}}}`** | `match.home.score [null]` | **accepted - silent erase** |
| **`{"panel":{"katri":{"points":{}}}}`** | `panel.katri.points [object]` | **accepted - silent erase** |

The first six rows are exactly what 0060's self-check asserts, so the fixture is known good; the
last two are shapes it never tries.

Bindings `{"Bug":{"f3":"drivers.0.gap"},"Board":{"f5":"bingo.called"}}`:

| patch | names | verdict |
| --- | --- | --- |
| `{"drivers":null}` | `drivers [null]` | refused |
| **`{"drivers":[]}`** | `drivers [array]` | **accepted - the whole branch deleted** |
| **`{"drivers":[{"gap":"x"}]}`** | `drivers [array]` | **accepted - the grid truncated to one** |
| `{"bingo":{"called":[]}}` | `bingo.called [array]` | accepted - the UI's own clear press |
| `{"bingo":{"called":["K7","B2"]}}` | `bingo.called [array]` | accepted - the UI's own add press |

The last two rows are why the obvious fix is wrong: **arrays on an exactly-bound path are the
product's normal list press** and must keep working.

The silence comes from `production_data_format` in
`supabase/migrations/0048_production_data_tree.sql`: `null`, an object and a zero-length array all
return `null`, and `production_data_resolve` drops any binding whose format is null. The diff in
`control_data_apply` iterates the AFTER side, so a path that vanished contributes no entry - 0048's
deliberate *"a missing path writes nothing"* rule, correct in itself, and what makes these
particular writes invisible.

## What it would take

A new migration - **0061, never an edit to 0060**, which has applied to production and to staging
since 2026-09-16 04:27 UTC (post-land run `35055657854`). One `create or replace` of
`control_data_patch_by_slug` and its own self-check.

Two changes to the accept rule, and no others:

- **The carve-out must require the array to still CONTAIN the bound index.** It currently asks only
  that some binding descends through `<path>.<digits>`. It should also compare that index against
  `jsonb_array_length` of the value being written, so `{"drivers":[]}` and any array too short to
  hold `drivers.0` are refused while `{"drivers":[{...}]}` still passes. That closes the branch
  deletion without touching a single real press.
- **On an exactly-bound path, refuse a JSON `null` and refuse an object.** Nothing in the product
  produces either (`retypeLeaf`), and both are the silent erase. Leave every other type alone:
  strings, numbers, booleans and arrays are all real presses.

**Do not reach for "only string, number and boolean on a bound path".** That was this file's first
proposal and it is wrong twice over: it would refuse every bingo/puzzle list press on the hosted
control page (`patchBound`, `src/components/HostedControlPage.tsx:514-530`), and since `retypeLeaf`
turns the clear press into `[]` before the patch is built, it would leave no route at all to clear a
bound list - trading a silent write for a dead button.

Extend the self-check with the four accepted-but-wrong rows above. **It needs a bigger fixture than
0060 builds:** the current one binds only `match.home.score` and `drivers.0.gap`, with no
`panel.katri.points` and no list binding, so an assertion copied straight from the table would be
refused for the wrong reason and pass without proving anything. Add a `bingo.called` binding and a
list value to the fixture first.

## The open question 0061 should NOT settle quietly

Clearing a bound list does not clear the graphic, and that is 0048's deliberate design:
`production_data_format` answers null for an empty array so that *"an empty array writes NOTHING
into a field, which is what stops a board going blank"*. The guard is not what makes the clear press
silent - the formatter is, and it is behaving as written.

So 0061 should leave `[]` on an exactly-bound path ACCEPTED and leave the formatter alone. Whether
an operator who empties a bound list should see the board empty is a product question about 0048,
worth its own decision with the owner's taste in it, and it should not be answered as a side effect
of tightening a security guard.
