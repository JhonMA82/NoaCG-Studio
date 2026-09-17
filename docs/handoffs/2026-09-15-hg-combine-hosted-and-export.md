# COMBINE runs on the hosted control page; the export says where it runs instead

AC-6's remaining half. A production published to the hosted page now draws its combined controls
in a **Combined** section at the foot of the ⚡ block - the same button, ticks, countdown and
cancel as the in-app page - and the exported controller carries §6f's one line where those buttons
would be.

**Landed:** `bfa285b6` (the shared resolver and button, the hosted half, the exported line, the
specs, the docs, the owner-queue item), `0983ba88` (four review defects plus two cleanups). Check
stamp: `claude-hg-combine-hosted-and-export.json`, PASS at `0983ba88`. Owner-queue item:
`docs/acceptance/owner-queue/2026-09-15-combined-controls-where-the-show-is-run.md`.

check: `review: delegated` (scope confirmed: base `dca203b4`, 13 files, identical to
`review-request.mjs`; 5 findings, 4 fixed, 1 reworded), `simplify: inline` (the skill returned
fan-out instructions, not a result), `verify: inline`, `taste: not applicable` - nothing here can
move what a graphic looks like. The one new visual element, the exported controller's line, was
rendered and looked at (job `j-1122`, a temporary spec, deleted): it sits under the "More" drawer
behind a hairline rule, in `--dim` at the drawer summary's own size, measured off the pixels rather
than eyeballed.

## The decisions worth arguing with, so they can be reverted rather than rediscovered

- **The resolver moved out of `ProductionPage` into `src/control/combineSend.ts`, and both
  dashboards call it.** The row asked for a port; a port of ninety lines that decide what a `+1`
  carries is two surfaces that look identical in review and disagree on air. The surface now hands
  over a `CombineWorld` - four questions about its own production - and gets back the rows, the
  mirrors, the liveness and the drops. `src/components/control/CombinedButton.tsx` is the same move
  for the button, its ticks and its countdown, which are three carefully worded tooltips.
- **`combineSend.ts` is a SECOND module rather than more of `combine.ts`.** `combine.ts` must stay
  runtime-dependency-free or `scripts/combine-control.test.mjs` stops transpiling it in the build
  gate; this half needs `eventPayload` and the cue verbs, so it lives beside that fence.
- **The hosted mirror is the SHARED STAGING BUFFER, not a stored cue.** The in-app page writes the
  moved figure back into the cue record; this page cannot author one, and staging is where an
  operator's values live here anyway - so every open page counts from the same figure.
- **The exported package carries ONE BOOLEAN.** Not the control's name, not its steps, not its
  timings. The spec asserts the absence as well as the line.
- **The line sits inside the cue editor's ⚡ block, not at page level**, so an operator taught on
  the two hosted surfaces looks where the Combined section is.
- **`src/control/hostedCombine.ts` exists so the hosted half can be measured at all.** The hosted
  page cannot be mounted by an offline spec, so a rule written inside its JSX is a rule nothing in
  the merge gate can run. These functions take the published bytes and hand back exactly what the
  page hands the resolver, and the spec drives them.

## Evidence and traps that exist in no repo file

- **The hosted page never recorded an accepted EVENT's payload in `airedData`.** It merged only
  `update` rows, so the unsent-changes chip announced a change about a figure the press had just
  aired - a defect that predates this row - and my combined `+1` counted from the figure before the
  previous press, so the score froze one short. The in-app page's `rememberAired` comment asserts
  "the hosted log merges it the same way", which was the thing that was not true. Fixed in
  `0983ba88`. **The plain hosted ⚡ button worked around the gap** by counting from its staged echo
  instead, which is why nobody met it.
- **A step after a TAKE in the same press was refused by its own press.** The take queues rows and
  airs nothing until the `cue` row comes back, so `stepBlocked` judged "Take the board, then +1 on
  it" against a board the surface still thought was off and the feed reported a drop that never
  happened. This shipped in HF's in-app code too and is fixed for both.
- **`commandBatches` cut by raw item count and could split a Take.** Three takes are nine items,
  so the third take's `cue` row landed alone in the second call; every caller stops at the first
  refusal, and the likeliest refusal is the log's 50-per-5-s cap. That graphic would have been
  playing in on air with no ON AIR marker, no `liveCue` entry and nothing able to take it off. It
  packs whole steps now.
- **The hosted cue editor's `echo` beats the staged buffer**, so a combined press that moved a
  field the operator had typed into left the box showing the older figure - and the next plain ⚡
  press would count from the box and send the board backwards. The moved fields are handed down to
  the editor now, as a fresh array per press (keyed on identity, because two presses of one control
  carry the same values).
- **The Edit AND Write tools turn a literal `\u0000` into an actual NUL byte.** It bit twice
here: once in `tickKey`, once in this very paragraph. The file then reads as binary to `grep`
while `git diff` shows nothing at all. HF’s handoff named the Edit tool; Write does it too, so
even a prose mention of the escape trips it. Put the text in place with a script, or pick a
printable separator.
- **`e2e-affected --list` escalates this branch to the FULL suite plus the catalog**, and it also
  reports files this branch never touched (it diffs the local `main`, which the queue no longer
  moves). CI is the pre-merge gate per `root/let-pre-merge-gate-laptop-does`. Locally the two specs
  covering every surface this touches ran green twice: `j-1121` (37 passed, exit 0, before the
  check) and `j-1123` (37 passed, exit 0, after it).
- **`src/components/HostedControlPage.tsx` is on `e2e-lists.mjs`'s CONFIGURED-ONLY list**, so the
  affected plan says out loud that this change "touches behaviour only a configured deployment
  has". That is not a gap this row could close: the e2e server pins offline mode, and the row
  prompt's claim that the hosted rig answers the RPCs from memory is about the hosted RECEIVER (a
  graphic page), not about this page.
- **`node scripts/jobs.mjs add` takes the command FIRST and `--cost` after it.** The row prompt
  said the opposite again; this is the fifth handoff to say so.

## What needs the owner

Nothing blocking. One question is on the owner-queue item's route and is the only expensive one to
change later: **whether a wait that dies with a browser reload is acceptable for 2026-10-20.** It
matters more here than it did in-app, because this is the surface the show is run from and a phone
reloads a page for its own reasons.

## What is left

- **The hosted page's own DOM is not gated.** The merge gate pins its RESOLUTION over the published
  bytes - the wire baseline against the cue's, the dropped step, the greying, a take feeding its own
  next step, the batch seam - and the buttons are step 10 of the live-verify checklist in
  `docs/CONTROL_LAYER.md`, written this row. Two things in that step can only be seen on a real
  backend: two operators (the countdown is one tab's, the rows are everybody's) and the batch cap.
- **`own()` is written three times** - `model/profile.ts` (private), `ProductionPage.tsx`,
  `control/hostedCombine.ts`. Exporting the first would ripple outside this branch's diff, so it is
  reported rather than done.
- **A combined step's legality is still judged against the last REPORT**, so a step after a Take in
  one press is judged against the state the graphic had before it played in. §6b accepts that and
  the fix above deliberately stops at liveness; if a walk ever needs it, the graphic has to report
  between the two steps, which is a wait, which is a different feature.
- **A patch step still cannot be composed**, only stored and sent (HF's decision, unchanged).
