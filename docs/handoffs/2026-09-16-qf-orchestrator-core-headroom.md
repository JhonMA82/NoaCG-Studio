# The orchestrator core has 32 lines of room, by relocation

`claude/qf-orchestrator-core-headroom` takes `.agent-workflows/orchestrator.md` from 199 of 200
lines to 168, measured by `node scripts/check-shared-instructions.mjs`. The common path is 635 of
640 (634 at the fork point). Neither cap moved, nothing was trimmed: 78 of 78 backticked tokens in
the fork-point core survive in the core or in the module that received them, checked by a script
rather than by reading the diff.

The method is the core's own opening test, applied to every rule it held: does the rule fire
BEFORE its module loads? A rule that does keeps one sentence in the core and its mechanics move to
the module. A rule that does not leaves whole.

## What moved, and where it now fires

- **The wave-state file's format** (15 lines) is the new module `orchestrator/wave-state.md`,
  marked *every plan*, routed at "writing the plan into the store". This module was NOT in the
  row's TOUCHES. It is a real receiving module, not scratch: the prompt's own step 2 says a rule
  that fires only after its module loads leaves the core whole, and the plan's format has no
  module until the plan is being written into the store. Putting it in an existing module would
  have been the "filed somewhere it does not belong" trap the backlog file names. It costs the
  common path its title and blank line (3 counted lines), which is where the +1 comes from.
- **Section 6's mechanics** (answer it yourself, the questionnaire, the closing pick, "a tentative
  opinion is not a requirement") are in `pushback.md`, which now owns sections 4 and 6 and says so
  in its title and routing row. The ask-test itself stays in the core because the frontier's
  "waits on no human" needs it before any module loads.
- **"Where the collision pass is UNSURE, chain"** with its owner quote is in `collisions.md`; the
  core keeps the ORDER-FREE rule and a six-word pointer.
- **The standing-ask owner quote and the per-receipt rule** are in `pushback.md`'s standing-asks
  bullet. The core keeps "spare capacity STARTS it" and the receipt-creation rule, both of which
  decide rows at table time.
- **The mechanism order behind "every wave improves the orchestration system"** was already in
  `coherence.md`; the core points there, `coherence.md` gained the two clauses it lacked, and its
  routing row now names "where a wave's lesson goes".
- **Five one-line pointers** replace restatements of mechanics `collisions.md` carried word for
  word (ALLOCATES, handoffs CONSUMED) or that `routing.md` and `specs.md` now carry after a
  one-sentence addition each (Opus by omission; explain the split in section 4, keep letters).

Nothing was ambiguous enough for a `walk-p` owner-queue item; every rule fell cleanly on one side
of the test.

## The check, with each leg's mode

- `review: delegated` (7/7). The code-review skill returned findings with its scope: base
  `16ed46e9`, the same eight files `git diff --name-only origin/main...HEAD` lists here, so the
  pass was believed. All seven findings verified against the tree and were fixed in 779109e3.
  Three were pre-existing inaccuracies I had moved verbatim and the module now owned: the plan
  check reads only `## Wave table`, `## Candidates` and `## Handoffs` by name, `## Candidates` is
  a TABLE, and the refusal list omitted four refusals - it now cites the check's own header
  comment instead of caching a list.
- `simplify: inline`. The simplify skill returned fan-out instructions, so the leg ran here over
  its four angles. One change: the fuller refusal list the review fix had introduced was itself a
  cache of the instrument (`coherence.md` item 2), so it went back to citing the script, which
  also returned 3 common-path lines.
- `verify: inline`. `npm run build > log 2>&1; echo $?` printed 0 twice, before and after the
  check's edits. No product code changed, so no e2e leg applies. `taste: not applicable` - nothing
  here can move what a graphic looks like.

## What is next, and why

- **Land the symbol-survival check beside `check-contract-freshness.mjs`** so the next compaction
  of any contract runs it as a gate rather than as a scratch script. Why: the 2026-09-04 pass
  dropped 17 tokens and only a token check caught it; this pass needed the same instrument and
  had to rebuild it. Two details it must carry: normalise CRLF, because `git show` yields LF while
  a Windows checkout holds CRLF and a token wrapped across a line break reads as lost otherwise;
  and compare against the FORK POINT, not `HEAD`, once the branch has commits. It is not in this
  branch because `scripts/check-shared-instructions.mjs` is held by `codex/orchestrator-durable-recovery`.
- **Use the 32 core lines for the ten routed memory rules** `docs/backlog/memory-store-drain.md`
  names, applying the same before-its-module-loads test to each so the core does not refill with
  mechanics. Why: that backlog item names the core's ceiling as the reason those rules have
  nowhere to go, and the ceiling is gone.
- **The common path is now the tighter number** (635 of 640, six every-plan modules).
  `codex/orchestrator-durable-recovery` frees about 11 of it when it lands. The 2026-09-05
  planner/watcher split remains the structural lever for it; nothing in this branch changes that
  argument.
- Optional: `A GATE LANDS ALONE` still carries its two-line why in the core. I left it because the
  core keeps reasons beside rules elsewhere (exception 1), and the gain was one line.

## Bottom line

NOT SAFE TO ARCHIVE YET - the branch is queued, not landed; `git merge-base --is-ancestor HEAD
origin/main` will not hold until the merge queue has taken it. Nothing else is outstanding.
