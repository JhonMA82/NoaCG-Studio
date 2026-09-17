---
kind: walk
date: 2026-09-16
because: taste
serves: now
---
# Bind all by title, one press instead of one per field

Two graphics made with matching field titles - by hand, or by an agent - used to need one binding
typed per field even though the Data tab already computes the right suggestion for each. Now a
"Bind all by title" button sits beside the whole bindings table and one beside every graphic's own
section; a press accepts every suggestion that is unambiguous and leaves anything ambiguous
unbound, naming what it matched.

## Route, in the app, about a minute

From this feature worktree with `npm run dev`:

1. New project -> **Scoreboards** -> **House Score** -> Create. Dock **Productions** -> name it
   `Derby` -> **Create** -> **+ Add current** -> **Open production page**.
2. New project -> **Scoreboards** -> **Club Scorebug** -> Create. Dock **Productions** -> pick
   `Derby` -> **+ Add current** -> **Open production page**.
3. **DATA** tab. Under *Production data* add three paths: `match.scoreA` = `10`, `match.teamA` =
   `Home`, `results.teamA` = `Away`.
4. In the bindings table, click **Bind this graphic by title** under **House Score**.

## What to look at

- **F1 "Score A" binds itself** to `match.scoreA` - the only leaf whose name matches - with no
  typing.
- **F0 "Team A" stays empty**, and its row now reads `2 paths match, pick one: match.teamA,
  results.teamA`: two leaves match the title, so the button refuses to guess rather than picking
  one at random.
- **F2 "Team B" and F3 "Score B" stay empty with no note at all** - nothing matched their titles,
  which is different from an ambiguous match and the row says nothing rather than implying a
  problem.
- **Click the production-wide "Bind all by title"** at the top of the table. Club Scorebug's own
  F1 now binds to `match.scoreA` too, in the same press, without opening its section first.
- **Press either button again.** The note reads "Nothing left to bind. No empty field has exactly
  one matching path.": an already-bound field is never re-suggested, so the button is safe to
  press more than once. The line under the **Bindings** heading says the same rule before you
  press (the Data-tab item of the same date covers that wording and the row layout).

## What this does not do

The button never writes anything until pressed - the suggestion beside a single field already
existed and was always just offered, never applied on load; this is the same rule extended to a
press that covers many fields at once. It also never resolves an ambiguous title on your behalf:
that row still needs a person, or a data tree with only one plausible match.
