# AC-6 - COMBINE sends one row per step, shows its wait, and reports a dropped step

**Verdict: unverified.** Everything the criterion names is observed on the in-app production page
and pinned by specs; the hosted page's rendered buttons have never been seen by anybody, on any
machine, and that is half of what the criterion asks. Reviewed at
`dfac5b9cf230532565f57d6988517bb25cdbf94d` on 2026-09-16.

## What was observed in-app, by hand

The proof case's own control - "Reveal performer, then after 3 s the five +1s as ticks" - composed
in the Controls panel of a production made from the two §3a/§3b graphics, then pressed:

- **It greys while its first step is illegal.** Before either cue was taken the button's title read
  `Greyed because the first step cannot go: "Votes board" is not on air`. After the votes cue went
  to air the same button read `Sends 6 steps: Reveal performer on Votes board; Panelist 1 +1 on
  Totals board (after 3 s, ticked by default); …` and was enabled.
- **A step is offered as a tick.** Five check boxes, labelled `Panelist N +1 on Totals board`, all
  ticked by default. Panelists 2 and 4 were unticked before the press, which is the operator's real
  gesture on 2026-10-20: +1 under each person who was right.
- **The wait counts down on the button.** Sampled from the page's own clock after the press:
  `⚡ Reveal, then the +1s · 3s` at +0.0 s and +0.9 s, `· 1s` at +2.1 s, and the plain label back at
  +3.9 s.
- **The steps landed, and only the ticked ones.** Points for panelists 1 to 5 went from `0,0,0,0,0`
  to `1,0,1,0,1` by 3.904 s after the press, of which 3.000 s is the declared wait. On air the
  votes board had already revealed: the correct performer lit and each pick marked right or wrong
  by the graphic's own `markGuesses()`.

## What the specs pin

Through the queue at this revision:

- `e2e/production-controls.spec.ts` (job `j-1137`): **22 passed**, exit 0, including
  "a step the machine would drop is dropped alone, and the feed says which".
- `e2e/hosted-control.spec.ts` (job `j-1138`): **12 passed**, exit 0. These drive
  `src/control/hostedCombine.ts` over the published bytes - the wire baseline against the cue's,
  the dropped step, the greying, a take feeding its own next step, the batch seam - which is the
  most a spec can reach for a page the offline server cannot mount.

The batch itself goes through `control_send_many` with whole steps packed per call
(`COMMAND_BATCH_MAX` in `hostedControl.ts`), after HG found that cutting by raw item count could
split a Take and leave a graphic playing on air with no ON AIR marker.

## Why this is unverified rather than passed

The criterion says the control "renders on the in-app and hosted pages". The hosted page is the
surface the show is run from on 2026-10-20, and:

- its DOM is configured-only, so no spec in the merge gate mounts it;
- AC-9's hosted leg, which existed to close exactly this, did not run - no checkout this session
  could reach carries backend configuration;
- step 10 of the live-verify checklist in `docs/CONTROL_LAYER.md` names two things only a real
  backend can show at all: two operators counting from the WIRE rather than from a cue, and the
  batch cap.

Nothing here suggests the hosted half is broken. It is simply unwitnessed, and rounding that up to
a pass would make the ledger say something no one can point at.

## Limitations worth carrying

- **Nothing persists a wait.** A tab reloaded mid-countdown loses the unsent tail by design (§6d).
  The button's hover says so. Whether that is acceptable for 2026-10-20 is the one question HF and
  HG both put on the owner's route, and it is the expensive one to change later.
- A combined step's legality is judged against the last REPORT, so a step after a Take in one press
  is judged against the state the graphic had before it played in. §6b accepts that.
- A patch step can be stored and sent but not composed: the composer authors no values, which is
  what keeps it from becoming a payload editor.
