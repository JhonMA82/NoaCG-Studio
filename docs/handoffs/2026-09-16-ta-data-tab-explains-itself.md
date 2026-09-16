---
v: 2
kind: handoff
date: 2026-09-16
branch: claude/ta-data-tab-explains-itself
row: TA
---
# TA - the Data tab explains itself

**Done and queued.** The Data tab now carries a closed "How this tab works" drawer, one line under
Bindings that states the button's rule as `unambiguousSuggestions` and `matchTitle` implement it,
a per-graphic button that names its scope, and one grid for every value row and binding row with
a 1200px cap and a phone fallback. Build green from its own exit code, `production-data.spec.ts`
21/21 with a new geometry assertion, `feedback.spec.ts` 3/3, and the tab looked at in screenshots
at 2560x1440, 1440x900 and 480x900, drawer open and closed. Commits `0e49eeec`, `524d9b96` and
`70b878a6`; stamp `claude-ta-data-tab-explains-itself.json` at `70b878a6`, all three legs inline.

## What I decided, and why

**The grid.** Each row is its own CSS grid, and the old tracks depended on the row's own content
(`auto` for a Suggest button that only some rows have, `fr` shares that a long ambiguity note
re-divided), so the path box started at 726, 788 or 820px on neighbouring rows at 2560. The label
and path columns are now custom properties on `.pd-live` (220px and `minmax(200px, 460px)`) that
both grids read, so the value rows and the binding rows agree by construction. The Suggest button,
the ambiguity note and the live value are mutually exclusive in the component, so they share one
status track. Both grids end in `minmax(0, 1fr)` then a 28px delete track, and the delete button is
pinned to that last track, so both blocks' delete columns sit on the block's right edge; a value
row's stepper track only exists for number leaves, and before the pin a text row's delete button
auto-placed into it and stretched. Under 900px the two properties re-point to zero-minimum `fr`
tracks; at 480px the page no longer scrolls sideways (measured: scrollWidth 480, boxes at 140-304).

**The cap is on the panel, not the sub-page.** `.pd-live` stops at 1200px; the Tables block under
it is still full width, with its action cluster flush right and a spec asserting that. A wide
table wants the width, and one cap for the whole sub-page is a design question for the owner's read
of the tab rather than this row's. Two right edges stacked is the visible cost; the owner-queue
item says so.

**The wording.** "Bind all by title" fills each empty field whose title is the LAST PART of exactly
one path (normalised: case, spaces and punctuation ignored), never overwrites a typed path, and
finds nothing new on a second press unless the data or the fields changed. The first draft said
"the end of" a path; `matchTitle` does not do suffix matching, so "Home Name" would not bind
`match.home.name`, and the line was corrected before landing. The examples are `show.title` and
`Helsinki`, because the file promises no dataset is named in it. The per-graphic button reads
"Bind this graphic by title". The second-press note reads "Nothing left to bind. No empty field
has exactly one matching path."

**The dropdown stays.** The path box is an `<input list=...>` over a datalist of the current
leaves. It can be explained in one line ("click the box to pick a path from the list, or type
one"), so the control was kept and the drawer explains it. The placeholder now says "pick or type
a path".

## What the check found

`/check` ran with `review: inline`, `simplify: inline`, `verify: inline`, `taste: not applicable`.
Both skills returned fan-out instructions, and their eight finder reports reached the orchestrator
and were relayed; the relay was read in full and every finding judged against the code. Taken:
the stretched delete button, the "end of" wording, the "at Take" sentence (a bound field reads the
tree in the preview, at Take and at Update, and its cue box is locked), the stale
`2026-09-16-bind-all-by-title.md` walk that quoted the old strings, the duplicated 220px literals,
the missing geometry test, the double `matchTitle` scan per row, the mid-sentence colon, the wrong
comment numbers, the six-button head on a published production (the hint now shrinks first; this
one is computed from the 1440 screenshot's button widths, about 660px for six, and not measured
in the published state). Declined: hoisting a shared `.pd-drawer` summary into
`playout-dashboard.css`, because three drawers wear the look and that sheet was not this row's;
the drawer summary keeps its copy and the comment says so. Filed as backlog rather than done:
app-side `/docs#` links have no gate, `--mono` is undefined where the app's stylesheets read it,
and a value box writes the whole tree per keystroke (published, one PATCH per character; not
reproduced, and not a change for 01:00).

## What is in no repo file

- **The queue can admit two browser jobs that wait on each other.** My spec run and another
  session's `save-to-air-bench` were admitted together (two half-cost walks, by design) and then
  waited on each other for 22 minutes with zero CPU: the bench is a sweep, sweeps are yielded to
  unconditionally, and the bench's own loop waits for every other run with no cap. Cancelling my
  job let the bench start within the minute. `docs/backlog/job-queue-admits-two-browser-jobs-that-wait-on-each-other.md`
  has the mechanism; the fix is in the bench's loop, not the cost budget.
- **`src/styles` is CORE for `e2e-affected`**, so any CSS change escalates to the full suite. The
  two covering specs ran locally; CI runs the rest before landing.
- **The `spawn_task` chip is refused by a repo hook** with instructions to file a backlog item
  instead. Do not try it.
- **The docs anchor `/docs#data-example` does not exist yet.** Row TB writes it. The spec pins the
  href string, which guarantees the contract with TB and not the destination; the backlog item
  above is the gate that would catch a slip.

## What needs the owner

Nothing. The owner-queue item `2026-09-16-ta-data-tab-explains-itself.md` is his walk; the route
needs two lower thirds, because a scoreboard's fields are Team A and Score A and match nothing in
the route's data.

## Pointers

- Commits: `0e49eeec` (the change), `524d9b96` (phone fallback), `70b878a6` (the check's second
  round).
- Stamp: `.git/noacg-jobs/checks/claude-ta-data-tab-explains-itself.json` at `70b878a6`.
- Owner-queue: `docs/acceptance/owner-queue/2026-09-16-ta-data-tab-explains-itself.md`, and the
  updated `2026-09-16-bind-all-by-title.md`.
- Backlog filed: `job-queue-admits-two-browser-jobs-that-wait-on-each-other.md`,
  `app-links-into-the-docs-page-have-no-gate.md`, `the-mono-token-is-only-defined-on-the-docs-page.md`,
  `a-value-box-on-the-data-tab-writes-on-every-keystroke.md`.
- Spec: `e2e/production-data.spec.ts`, the AC-8 test, which now also measures the grid.
