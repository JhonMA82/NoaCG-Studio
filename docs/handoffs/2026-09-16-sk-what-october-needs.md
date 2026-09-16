# SK - what 20 October actually needs

**Branch:** `claude/sk-what-october-needs`, two commits on `6575ff28`.
**Gate:** `npm run build` green, read from its own exit code (`EXIT=0`), three times: after the
first commit, after the review fixes, and after the last two sentences were tightened.
**Check:** `review: delegated` (6 findings, 6 fixed), `simplify: inline` (the skill returned
fan-out instructions, so the four angles were covered here), `verify: inline`, `taste: not
applicable` - nothing in this branch can move what a graphic looks like. Stamped PASS at `d97a99ab`.

## What landed

The owner answered ALIGN-2026-09-15-6 in conversation on 2026-09-16: 20 October is a
DEMONSTRATION, not an air date. It is recorded verbatim in `docs/OWNER_RULINGS.md` as the last
entry, with four things it settles and one it does not.

- **`docs/OWNER_RULINGS.md`** - the ruling, his words untouched.
- **`docs/GOALS.md`** - the dates paragraph said "2026-10-20, Elämäni biisi on Yle", which reads as
  an air date; it now says what the day is. The NOW bullet for the control profile said the rows
  were "started 2026-09-15"; all ten have landed, so it now names the date's two open ends instead.
  193 lines, inside the 200 the file declares.
- **`docs/CONTROL_PANEL_ANY_GRAPHIC.md`** - a framing note in the intro, a paragraph in §3c saying
  who the operator's minute is FOR, and a new **§5a, "What 20 October actually needs"**: four items,
  each marked exists / gap and carrying the evidence. That section is the thing the next wave should
  read; `docs/GOALS.md` points at it.
- **`docs/backlog/spx-is-the-playout-on-20-october.md`** - a `kind: finding`, `source: derived`
  receipt for the one gap, scoped to the offline half so `needs-owner: none` is honest.

## What I changed outside the branch, and why it matters

**`docs/handoffs/2026-09-15-orchestrator-week.local.md` in the PRIMARY checkout now has an
`**Answer:**` under ALIGN-2026-09-15-6.** That file is gitignored, so this is not in the diff and
cannot be. `scripts/alignment-answers.mjs` decides OPEN versus RECORDED from the weekly file's
`**Answer:**` line, not from `docs/OWNER_RULINGS.md`, and `.agent-workflows/orchestrator-week.md`
carries an open question forward - so recording the ruling alone would have put a settled question
back in front of the owner at the next weekly session. Verified both ways: before the edit the id
printed under OPEN with the ruling already committed; after it, under RECORDED. **Anyone recording
a conversational answer to an ALIGN id must do both halves.** The deeper fix - teaching
`alignmentState()` to treat an id present in the rulings log as answered - is a change to a script
this row did not own, and is worth a row of its own.

## What I found already correct, and left alone

- **`docs/PROGRAMMES.md`** - the P2 and P3 register rows and their bodies never mention 20 October,
  Elämäni biisi, air or broadcast. Silent, so untouched.
- **`docs/CONTROL_PANEL_ROAD.md`** §"2026-09-15, the alignment brief" and the entry below it. They
  are a dated log of what was said on those days and they claim no broadcast; rewriting them would
  rewrite a record.
- **`docs/README.md`** line 143 describes the plan accurately.
- **`docs/DEMO_2026-09-25.md`** - not touched, per the row's instruction. Nothing I found in it is
  affected: R2.5 is a measurement of the authoring road, quoted by §5a with its source named, and
  the 25 September beats do not depend on anything the 20 October answer moves.

## The control-panel work's shape, since the row asked

**It does not change, and I checked rather than assumed.** `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §6
was built on ALIGN-2026-09-15-2, which said in the owner's own words that the Elämäni biisi press is
evidence for a general capability and never the workflow being designed around, and §6c proves the
two primitives against nine sequences of which the proof case is one. None of that reasoning rests
on the date being live. Nothing is downgraded.

One consequence does fall out, and it is §5a item 2. "We will be running that on SPX" meets a seam
the plan already drew: by §6f the exported package carries ARRANGE but neither COMBINE nor the
production data tree. So the door matters. The output embed (`src/export/outputEmbed.ts`) leaves
every cue and the whole profile with the NoaCG operator and is what the day wants; the SPX starter
export is self-contained and costs the profile. The embed has never run on a real SPX server
(owner-queue item open since 2026-08-25). I did NOT turn this into SPX work - the comparison is one
offline session and the hardware check is the owner's existing queue item.

## Traps that exist in no repo file

- **Two owner-queue receipts now read wrong about this date and I did not edit them**, because they
  are dated records of landings and not mine to rewrite. They are worth a decision by whoever owns
  the queue: `2026-09-15-combined-controls-where-the-show-is-run.md` says the hosted control page is
  "the surface you and a class will be holding on 2026-10-20" - there is no class on 20 October,
  that is the 25 September lecture - and `2026-09-16-a-profile-driven-where-the-show-is-run.md`
  repeats it and calls the day "the night". The hosted-page claim itself survives the ruling if the
  output embed is the door; the class and the night do not.
- **`git commit -q -F - <<'EOF'` is refused in a worktree-isolated session** ("names git in a form
  too complex to verify"). Write the message to a file in the scratchpad and pass the path. A
  `Co-Authored-By` trailer is refused separately by `scripts/hooks/guard-command.mjs`, so the
  attribution reminder in the session prompt loses to the repo rule.
- **`docs/OWNER_RULINGS.md`, `docs/GOALS.md` and the backlog files are CRLF in the working tree**
  (autocrlf, and they are not in `.gitattributes`). A python patch that reads with `newline=''` and
  matches an LF-only string finds nothing and looks like a missing anchor. Normalise, patch, write
  back with the original ending.
- **`npm run build` was run three times here and each write went to its own log name** in the
  session scratchpad. Cheap, and it is what keeps a neighbour's log from being read as evidence.

## Pointers

- The day's list: `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §5a.
- The ruling: `docs/OWNER_RULINGS.md`, the ALIGN-2026-09-15-6 entry at the end of the file.
- The open gap: `docs/backlog/spx-is-the-playout-on-20-october.md` and
  `docs/acceptance/owner-queue/2026-08-25-spx-output-embed-on-a-real-spx-server.md`.
- The evidence §5a cites for the walks:
  `docs/acceptance/owner-queue/2026-09-16-the-proof-case-with-the-profile-in-use.md` and
  `docs/work-specs/control-panel-any-graphic/evidence/ac-9-the-proof-case-timed.md`.
