# Interactive & Data-Driven Playout — plan and tracker

The durable tracker for the interactive-playout program: a controlled quiz workflow, a generic
sports controller, audience participation through a public production page, moderation of
audience material, polls and audience quiz answers, a minimal production-owned Data Hub, and
contextual per-cue controls inside the existing playout workflow. Update this file as phases
move; it is the cross-session source of truth for this program.

**Governing principle: data and audience activity may prepare or update graphics, but they
never bypass the operator or the normal Preview/Take/Update/Next/Out workflow.** The existing
playout dashboard (ProductionPage, HostedControlPage, the exported controller) stays the
central operational surface; nothing here replaces it or builds a parallel cue, control,
state, data, or playout system.

Reviewed at plan stage by an independent fresh-context pass (2026-08-05): AGREE WITH
CORRECTIONS; every corrected item is folded in below (G9 is the important one).

## Status board

States: Not started · Investigating · Planned · In progress · Blocked · **Implemented**
(code + automated verification complete) · **Verified** (visible behaviour demonstrated and
accepted by the owner) · Deferred.

| Phase | Scope | Status |
|---|---|---|
| 0 | Investigation + grounded plan + this tracker | Implemented |
| 1 | Control-panel truth for four pilots (production contextual controls) | Implemented |
| 2 | Shared data foundation (datasets on Show + Data workspace) | Implemented |
| 3 | Quiz pilot | Implemented |
| 4 | Generic sports pilot | Implemented |
| 5 | Audience questions/comments (join page, moderation → cue, presenter) | Planned (design done) |
| 6 | Poll + audience quiz answers | Not started |
| 7 | CSV/JSON import into the Data Hub | Not started |

## Verification contract (owner requirement, 2026-08-05)

A phase is never "working" because the code looks right, the build is green, tests pass,
internal state exists, or a control event was sent. **Implemented** requires code plus the
automated gates below. **Verified** requires a **visual acceptance pack**: screenshots or a
short recording of the REAL running app (never a mockup) at the important stages, with the
exact route, production, cue and action sequence written down so the owner can repeat it by
hand — and the owner's acceptance. Where the phase touches them, the pack covers: the selected
cue on the real ProductionPage; every intended editable control; Preview before Take; Program
after Take; Update while on air; graphic-specific actions and state changes; Next; reload/snap
recovery; cue switching without leaked values or state; the real `/output` renderer; the
exported controller / CasparCG path. If the visible result differs from intent, looks
incomplete, contains fake controls, or repaints wrongly, the phase stays unverified — green
tests notwithstanding.

Automated gates (supporting evidence): `npm run build`; `npm run test:e2e:focus` (or its
`:queued` form when another worktree is running a suite); a Playwright spec per new flow,
mapped in `scripts/e2e-lists.mjs` in the
same commit; `node scripts/l3-sweep.mjs <shots> quiz|poll|audience` after template changes;
the catalog gates (`type-floor`, `overflow-sweep --baseline`, `field-coverage`, `numerals`,
`test:e2e:catalog`) after catalog-affecting type edits — `numerals.mjs` specifically once
scores become live number fields; `npm run test:local-relay` + `e2e/exports.spec.ts` where
exports are touched.

## What exists (investigated 2026-08-05 — reuse, do not rebuild)

- **Production model** (`src/model/shows.ts`): pool + cues (a cue OWNS its `values`) + look +
  `hostedSlug`/`outputSlug`; `patchShow` envelope; sync kind `'show'`; additive-optional
  fields are the sanctioned extension pattern.
- **Verbs as data** (`src/control/hostedControl.ts` `takeCueItems` etc.), one decision point
  `runVerb` in ProductionPage; the one `control_events` log (0008/0029/0031/0033/0034) with
  slug-keyed SECURITY DEFINER RPCs and the `followControlLog` recovery discipline.
- **Contextual-controls architecture** (`docs/CONTROL_LAYER.md`): `machine.controls` travels
  inside the template; `eventButtons`/`eventLegality`/`isEventLegal` render identical,
  structurally-greyed buttons on five surfaces already.
- **State machines** (`docs/STATE_MACHINE_SCHEMA.md`) + graphic types compiling machines
  declaratively (`docs/GRAPHIC_TYPES.md`).
- **Pilot template mass**: quiz qz01–12 (`select`/`lock`/`judge`), scoreboards sb01–20 with
  the match clock (`clockStart/Stop/Reset`), audience pack (20 designs), poll pl01–04
  (`close`/`result`/`call`), competition-pack rosters/standings.
- **Audience send-in precedent**: `src/showchat/` + migration 0003 (anon submit with caps,
  rate limit, profanity mask; 4-state moderation).

### The gaps this program closes

| # | Gap |
|---|-----|
| G1 | ProductionPage renders no machine event buttons — quiz/sports/poll actions unreachable from the production dashboard (`ProductionPage.tsx` fields region; `docs/PLAYOUT_DASHBOARD.md` §8 reserves the region) |
| G2 | No production-scoped audience participation (showchat is a standalone `shows` row; no join page, poll votes, quiz answers, or tallies) |
| G3 | `chatGraphicBlock` airs content by REST-polling inside the graphic — bypasses the log, the operator, and Preview/Program |
| G4 | No Data Hub: no dataset concept, no CSV/JSON import, no grid editor |
| G5 | No presenter view; capability model is binary (control = write, output = render) |
| G6 | Quiz machine lacks an answers-open beat, a hidden-pick-then-reveal beat, and audience-result display |
| G7 | Moderation cannot edit a submission (status only); nothing converts a submission into a cue |
| G8 | Poll voting window is authored on the arrow, not per play; no re-open after reveal |
| G9 | **Recovery defect (found in plan review):** `noacgSnap` replays with suppressed callbacks, so the quiz's call-driven `selected`/`locked` visuals do not survive snap recovery; and the quiz runtime's `update()` unconditionally `clearReveal()`s, so a live ✎ Update mid-lock wipes the lock visual while the machine still reports Locked |

## Architecture decisions

- **D1 — Contextual controls complete the existing vocabulary.** ProductionPage's cue editor
  gains the machine event-button block (sections, payloads from the cue draft, structural
  greying, a state chip, a permitted-state snap select for recovery) rendered by the same
  `eventButtons`/`isEventLegal` as everywhere else. State source: `control_shows.live` when
  published; ProgramStage state replies when local (`src/output/stage.ts` already collects
  them — `PayloadStage` surfaces them). Events act ON AIR: legality follows ✎ Update's rule
  (live only while the selected cue's graphic is up on its layer) and the buttons sit under
  their own "acts on air" heading, outside the amber preview-editing frame.
- **D2 — Reusable presentation, not per-template controllers.** `FieldControl` upgrades:
  `select` with ≤5 short options renders as segmented buttons; `number` gets +/− steppers.
  Sports scores become `number` fields. The two deliberate vanilla-JS second renderers
  (`control/controlPanelHtml.ts`, `control/productionControllerHtml.ts`) are updated in step.
- **D3 — Data Hub = additive-optional `datasets` on `Show`.** `{ id, name, kind
  ('quiz'|'teams'|'roster'|'generic'), columns, rows }`, edited in the Data workspace, synced
  inside the show doc, offline-capable. Bindings are deterministic operator actions ("load
  row N into this cue"), never a live wire. *Known limit: doc sync is record-level LWW with
  conflict copies; concurrent multi-person editing of one production can mint a conflict copy
  (which drops the slugs). Acceptable at classroom scale; named, not hidden.*
- **D4 — Audience backend = production-scoped tables + slug-keyed RPCs** (§ Audience backend
  design). New capability slugs on `control_shows`: `join_slug` (public) + `presenter_slug`
  (read-only). `/join` is a new tiny MPA entry (the `/output` build shape).
- **D5 — Tallies never touch the renderer on their own.** Reveal = the operator writes counts
  into fields via normal `update` + fires the machine's `result` event; "auto refresh" is an
  operator-side toggle that resends updates through the log.
- **D6 — Workspaces are hash sub-routes**: `#/production/<id>` (Playout, unchanged),
  `#/production/<id>/audience`, `#/production/<id>/data`.
- **D7 — QR codes**: a tiny vendored MIT encoder, app-side only; generated templates stay
  dependency-free (the invitation graphic's QR arrives as an ordinary image-field data URL).
- **D8 — Pilot machine changes are TYPE changes** (`answerBoard.ts`, `livePoll.ts`); the
  default path stays intact so the SPX `next()` walk survives. No new state engine, no node
  editor.

**Conflict resolutions:** the shipped MachineGraph node editor stays what it is (Advanced
mode; no new logic-authoring surface is built). The quiz's instant-paint `select` is kept AND
a hidden path added (lock reachable from the entrance state; `revealChoice` paints later) —
both flows coexist structurally. The new audience backend supersedes showchat FOR PRODUCTIONS;
standalone showchat stays untouched until a separate owner decision. Concept translation: the
blueprint mock shows quiz beats as four rundown cues; a literal cue-per-beat would replay
`play()` per beat, so beats are EVENTS on one cue.

## Phases

### Phase 0 — Investigation + plan. Status: Implemented
Three deep read-only maps (playout/production/control; template controls + state machines;
audience/backend/data), the re-design concept review, an independent second-opinion pass, and
this tracker. Plan of record: the session plan of 2026-08-05 (owner-approved in principle);
this file carries everything durable from it.

### Phase 1 — Control-panel truth for four pilots. Status: Implemented (awaiting owner Verified)
**Goal:** the production dashboard renders honest, complete contextual controls for one
ordinary lower third, one quiz board, one scorebug, one audience Q&A card — and the whole
operator-to-output path is demonstrated visually.
**Why:** G1 blocks every later workflow; the quiz/sports/poll machines are already authored
but unreachable from the surface students use.
**Implemented (2026-08-05):** machine state surfaced through `PayloadStage`/`ProgramStage`
(`onState` prop over the stage's existing replies) and, when published, seeded from
`control_shows.live` + followed via the log's `{t:'live'}` rows; the GRAPHIC ACTIONS block on
ProductionPage (own panel outside the editor frame, "act on air" header, sections, structural
greying via `isEventLegal`, state chip naming the current state, payloads riding from the
edited cue); the "Snap to state…" recovery picker — the snap rides WITH an update of the cue's
values, because recovery is both halves and a lone snap suppresses call-painted looks;
`machineStateGroups` in `control/controlModel.ts`; the G9 fix (`paintQuizState()` in the quiz
runtime — `update()` repaints selection/lock/verdict from `noacgMachineState()` + fields
instead of the unconditional `clearReveal()`); segmented-select presentation for short
constrained choices in `FieldControl` AND both vanilla renderers (`controlPanelHtml.ts`,
`productionControllerHtml.ts` — kept in step per the one-control doctrine); number steppers
added to the exported controller (it was the one renderer without them). Three
`e2e/control.spec.ts` call sites updated for the segmented row.
**Adversarial review round (20-agent workflow over the diff, same day) — all confirmed
findings fixed before commit:** (1) reopening a published production replayed a bare `play()`
into the local monitor, whose state reply then clobbered the wire-seeded machine state — boot
recovery now replays the full recipe (data → snap to the reported state → data); (2) snap
recovery sourced its data half from the PREVIEWED cue, airing unprepared content when a
different cue was live — events and snaps now carry the ON-AIR cue's values only; (3) the quiz
repaint replayed its pop/shake tweens on every live keystroke — painters now stamp a paint
signature (state + the two letters) and a repeat paint is skipped; (4) the exported
controller's missing number steppers; (5) a third `control.spec.ts` call site and the
Millionaire spec still pinned the OLD update-clears-reveal behaviour — the Millionaire test
now pins the two-operation reset (data alone keeps the verdict; snap(null)+update cleans);
(6) the source catalog baseline re-recorded for the 12 quiz variants (render baseline held —
the rest look did not move); (7) the snap spec assertion was vacuous (snap fires the TARGET
state's own call) — it now proves the data half on `locked`, where the suppressed
intermediate selection can only repaint through the riding update; (8) a quiz-runtime
mapping row added to `e2e-affected.mjs`.
**Verification:** `e2e/production-controls.spec.ts` (3 specs), control.spec 16/16,
graphic-types + catalog-baseline green after the doctrine updates, sprint-focus affected
suite green post-fixes (first run had 2 failures the review round caught — initially
misread as green; corrected here), catalog tripwire 22 green, quiz l3-sweep 12/12, build
green. **Visual pack delivered 2026-08-05** (12 frames + reproducible steps; offline mode —
the local PROGRAM monitor is the same renderer as `/output`; live published `/output` proof
lands in the Phase 3 pack).
**Known cosmetic notes:** the quiz entrance state chip reads "Enter" (step name — Phase 3's
beat renaming makes it "Question"); after "Back to start" the layer stays ON AIR over an
empty program (correct visual-reset semantics; hint line if the owner wants one).

### Phase 2 — Shared data foundation. Status: Implemented (awaiting owner Verified)
**Goal:** a production owns editable structured data, and an operator can load a row into a
cue deliberately.
**Implemented (2026-08-05):** `ShowDataset` on the Show record (additive-optional `datasets`;
columns carry stable keys + operator-facing labels; kinds quiz/teams/roster/generic pick
starter columns only), the full mutator set through `patchShow`, and
`datasetValuesForFields` — THE binding: column LABELS match field TITLES (trimmed,
case-insensitive), deterministic and visible on both sides, no mapping UI. The Data workspace
(`ProductionDataWorkspace`, route `#/production/<id>/data` via the router's new `sub`
segment — unknown third segments degrade to Playout) edits tables inline: rename table/
columns, add/remove rows + columns, two-step table delete. The Playout cue editor gains
"Load data row" — rows from any table with ≥1 matching column, labelled by their first
non-empty cell; loading fills the edited cue's DRAFT (data prepares, Take airs). Header tabs
Playout | Data on the production shell.
**Out:** CSV/JSON import (Phase 7), any auto-updating binding, teams/roster load ergonomics
(Phase 4 — one row carries one team; a two-team scorebug needs an A/B load gesture).
**Verification:** `e2e/production-data.spec.ts` (2 specs: the quiz-bank walk — author on Data,
load into cue, preview updates, air only on Take, reload + deep-link persistence, row/table
deletion; and the binding-by-words walk — generic table matches nothing until a column is
renamed to a field title). Mapped in both runner lists. Focus suite 364/0 + tripwire 22/22
with exit codes read directly. **Visual pack delivered 2026-08-05** (3 frames + steps).
**Two defects the phase's own verification caught and fixed:** the quiz paint signature,
stamped by a PARTIAL painter during a snap, made the post-snap repaint a no-op and left the
stale verdict on air (partial painters no longer stamp; the spec's snap case now proves the
data half on `locked`); and the preview came back UNSCALED after a Data-tab round trip — the
scale measurement was keyed on the unchanged document, so the remounted frame was never
measured (DOM assertions passed while the picture showed an empty corner; caught by the
visual capture, fixed by measuring on node attach, pinned by a scale assertion).

### Phase 3 — Quiz pilot. Status: Implemented (awaiting owner Verified)
**Goal:** the controlled sequence runs deliberately from the production page — hidden pick,
lock, choice reveal, verdict, audience result, next question from the bank.
**Implemented (2026-08-05):** the `answerBoard` machine grew two states and stayed
history-independent: `sealed` ("Locked, choice hidden" — `lock` fires straight from the
Question state over a pick typed as DATA, nothing paints) with `revealChoice` → `locked`
(whose entry now paints selection AND lock, correct from both routes); and `audience`
("Audience result") off the Reveal waypoint — a third hidden field (`Audience results`,
"34 | 52 | 9 | 5") painted as tabular per-row chips by the state, the percentages riding the
`audience` event as payload. Five control buttons in sequence order. The TV-style flow
(select paints immediately → lock → judge) is untouched; the SPX `next()` walk unchanged
(both new states are branches; `settings.steps` stays 2). The entrance step is named
**Question** (the chip cosmetic from Phase 1). ↷ Next on the load-row picker walks the
question bank row by row into the PREVIEW draft; Take airs it clean (a fresh entrance is the
reset, both halves). Live percentage edits refresh chips without re-popping the verdict
(the paint signature carries the results text; partial painters never stamp).
**Deliberately deferred, with reasons:** the answers-open beat — it moves the row entrances
into a new walk step, which cascades into four catalog gates including a `field-coverage`
mechanism change (rows hidden at rest read as unreachable), and the binding first-version
criteria require the lock/reveal discipline, not that beat. Recorded as a follow-up; the
concept's "Open answers" button stays wanted.
**Verification:** `e2e/quiz-pilot.spec.ts` (2 specs: the full hidden-pick sequence + bank
walk; the TV-style flow with the wrong-pick verdict) and **`e2e/configured/quiz-output.spec.ts`
— a PERMANENT live spec**: published production, the REAL `/output` renderer over the real
hosted log, the sealed sequence, a renderer reboot mid-lock recovering the sealed board
(data → snap → data on the wire), audience chips, full cleanup. All five catalog gates exit 0
(field-coverage passes without excuses — the results field drives its hidden holder); source
baseline re-recorded (12 quiz variants); render baseline re-recorded once for the deliberate
hidden-holder DOM growth (the diff listed only `#count` + the new holder per variant) and
verified stable. Machine-shape consumers updated: exported-panel greying example,
machine-graph arrow indices/names, the OGraf action list (now five, `audienceResults` riding
`audience`), the Millionaire spec already on two-operation reset. **Visual pack delivered
2026-08-05** (8 live frames, dashboard + output pairs). **Two real defects this phase's
verification caught and fixed:** the links popover sat UNDER the shared menu backdrop
(z 89 vs 40) — Copy URL / Publish changes / Unpublish were unclickable on every published
production; and the live spec's first Take assertions were vacuous (markup defaults + a
locally-fed chip) — replaced with a renderer-side computed-opacity poll.

### Phase 4 — Generic sports pilot. Status: Implemented (awaiting owner Verified)
Score steppers, clock verbs from the production page, period/status/lineup coverage; verify
score + clock through the log on `/output` AND on the exported controller (local relay).
`numerals.mjs` after the score-field kind change. No sport-specific rules, stats, brackets,
hardware, or external APIs.

**Landed so far (2026-08-06), four commits:**
- **The field-type gate first** (`76330d71`). A type declares its fields and each design emits
  them, and NOTHING compared the two beyond counting — the count matched, every `id="fN"`
  existed, and a score declared as a number could still ship as a text box. So the gate went in
  before the change it had to see: `e2e/graphic-types.spec.ts` + `scripts/factory.mjs` now
  compare the emitted ftype against `typeFieldsToSpx`. Titles are deliberately excluded (a
  design may relabel for its own vocabulary — mr04, rs04). Mutation-tested both ways.
  It also found `sports.spec.ts` mapped to NO runner list at all: 13 tests over the match
  clock, the colour lift and the period rebuild only ever ran in the nightly. Now mapped.
- **Scores are `number` fields** (`218a773f`) across sb01–sb20 — the two sports types and both
  field-contract builders, which is the dual declaration the gate above now holds together.
  The CLOCK deliberately stays text (`matchClockUpdate` parses on `':'`). Accepted cost, written
  down: no composite score ("3 (4)", "241/6"). esports (`es01–es04`) is deliberately EXCLUDED —
  different pack, and it is the one path where `lineCount` uses a textfield count as a proxy for
  an fN index range.
- **The stress that would have gone missing, restored in the same commit.** `runtimeBench`
  doubles text to widen it, which cannot widen a number ("0" → "0 0"), so the calibration
  tripwire silently stopped stressing scores the moment they stopped being textfields — a gate
  getting GREENER while covering less, and nothing else covers it (type-floor measures font
  size, overflow-sweep runs at design defaults, `numerals.mjs` substitutes digits without
  changing how many there are). Calibrated to three digits: four trips sb10's doubled club name,
  but no sport produces a four-digit score. `template-escaping.spec.ts` and the fixed-strip test
  had the identical hole and are fixed with it.
- **Three scoreboard recovery defects** (`41e9a003`), all found by driving the drill rather than
  reasoning about it, each red independently before its fix and re-checked by disabling it:
  (1) the club-colour and period holders hid INLINE, and the entrance reset clears inline props
  off every descendant — so recovery itself printed `#f6a623` and `Q1 | 24 | 19` on air. They
  hide in the stylesheet now (the rule `cornerBug/statusParts.ts` already wrote down).
  (2) `.scoreboard-final` / `-break` are CLASSES, which the visual reset never touches and a
  snap skips for a group already at its initial — a board recovered mid-match came back wearing
  FULL TIME while the machine said live. `update()` repaints them from the machine (the quiz's
  `paintQuizState` precedent), so a genuinely finished board keeps its treatment.
  (3) sb01–sb04 draw no clock but their type declared a clock group and Start/Stop buttons; the
  count-direction guard is skipped when there is no element, so one press left a 1 s interval
  running for the life of the graphic. Group and buttons dropped; `startMatchClock` now refuses
  outright without a clock element.
- **Production-page reachability**: image fields were passed no picture list on the cockpit at
  all, so a match board's two crest slots were settable from the hosted page and NOT from the
  production page — the divergence `docs/PLAYOUT_DASHBOARD.md` forbids. Fixed, deriving the list
  exactly as `hostedControl.ts` does (no upload: that write path belongs to the editor). The
  state chip had no width bound because the quiz has ONE group and a scorebug has four
  (~65 characters), so a sports cue stretched the actions header.

**Verification so far:** build green; `graphic-types` (ftype gate, mutation-tested);
`sports` incl. the new recovery drill; `control`, `wave2`, `template-escaping`,
`production-controls` (incl. a new match-board test covering clockReset, the interval pair, the
four-group chip and the crest pickers), `production-data`, `snap-recovery`; catalog tripwire
22/22; `type-floor`, `field-coverage`, `numerals`, `overflow-sweep --baseline` and the scoreboard
`l3-sweep` all exit 0. Source catalog baseline re-recorded twice (16 boards for the ftype, all 20
for the CSS/JS); **the render baseline never moved**, which is the proof the holder fix is
invisible on screen.

- **The A/B-side team load gesture.** One dataset row is one team, but a two-team board titles
  its fields "Team A" / "Score A" / "Team B" / … — so a teams row matched none of them and the
  preset bound NOTHING. The fix is a side token dropped off the FIELD TITLE at the ProductionPage
  call site ("Team A colour" → "Team colour"), over an UNCHANGED `datasetValuesForFields`: that
  function already takes `{key,label}` pairs, so no model change, no persisted-format change and
  no migration. The other side's fields are excluded from the match entirely, so loading team A
  can never overwrite team B. The plain literal match still runs first (a column named exactly
  "Team A" keeps binding) and a graphic with no sides never grows the picker, which is what keeps
  the quiz binding untouched. The `teams` preset is reshaped to `Team · Score · Team colour ·
  Team logo` — every column now binds a real field; `Code` was dropped because a starter column
  that matches nothing teaches the wrong thing. Read only at creation, so existing tables keep
  their columns. `lastLoaded` is already per-cue, so ↷ Next walks the table with no new state.

- **Both end-to-end arms.** `e2e/local-relay.spec.ts` gains the OFFLINE half: a scorebug aired
  from the exported controller, a goal added with the stepper that STAGES and does not air (the
  prepared-vs-published rule holding on the third renderer too), and the clock verbs proven by
  two reads separated by real seconds — Start makes the number move, Stop leaves it identical,
  Reset returns it to the period start, and the score survives all three because a clock verb is
  a state change and a score is data. `e2e/configured/scorebug-output.spec.ts` is the LIVE half,
  a permanent spec like the quiz one: published production, the real `/output` renderer over the
  real hosted log, a score bump arriving, a renderer reboot at full time recovering the aired
  score with the colour holders still hidden, and a clock proven running on the renderer itself
  (the state chip cannot prove it — it is fed by the local monitor and would read "Clock running"
  over a dead wire). Ten live frames land in `test-results/signed-in/`.

**Visual pack delivered 2026-08-06** (12 frames + `PACK.md` with reproducible steps, in
`shots/phase4/`; frames 7-12 are the real published `/output` renderer). The recovery frame is the
one that matters: the board reloaded at full time comes back with its aired score and NO club
colour hex or period source on screen — that leak was live on every board before this branch.
One frame is deliberately absent and said so in the pack: the exported controller over the local
relay has no screenshot, because the capture stub served the package files but not the relay log
endpoint. Its BEHAVIOUR is proven by `e2e/local-relay.spec.ts` plus the conformance run.

**Deliberately NOT done, with reasons:** esports scores stay textfields (different pack, and the
one path where `lineCount` uses a textfield count as a proxy for an fN index range — fold it in
after that proxy is fixed); no sport-specific rules, stats, brackets, hardware or external feeds,
per the phase's own scope line.

**A follow-up this phase's new gate exposed and did not fix:** `ftypeFor` maps `role: 'hidden'`
straight to SPX ftype `hidden`, but the role means "input-only, in a display:none holder" — the
operator still TYPES a countdown's minutes. Nothing ships the wrong value today (the only two such
fields belong to categories that write their fields by hand), so it is declarative drift; the new
assertion skips those fields with the reason written down, and removing the skip is the
regression test for whoever fixes it.

**Two live-arm traps to encode as correct rather than fight:** a reboot REWINDS the clock to the
last operator-typed value (the renderer reports what it forwarded, never what the clock ticked
to), and every Take/Update/Snap re-seeds the running clock because the wire sends the whole
`cue.values` — so a score bump on air pulls the clock back. Also `clockReset` returns to the
design's baked `data-start`, not the cue's clock value; asserting otherwise would encode a bug.

### Phase 5 — Audience questions/comments. Status: Planned (design done, below)
Migration 0035 + `/join` page (ask/comment modes) + the Audience workspace (inbox, immutable
original vs editable broadcast version, anonymize, approve/reject, shortlist, mark
used/answered, send-to-rundown creating a normal `ShowCue`) + presenter view + rehearsal
(simulated submissions through the offline seam). Nothing viewer-written reaches Preview or
Program without explicit approval — enforced by construction (no audience write path into the
command log). Carried items to resolve at phase start: the open owner decisions below; the
`/join/<name>` path-form rewrite (vercel rewrite + dev middleware — `cleanUrls` alone serves
only `?p=`); vanity-slug lifecycle (unpublish deletes the `control_shows` row, freeing a
hand-picked name to squatting until republish); fix `docs/PLAYOUT_DASHBOARD.md` §8's and root
`AGENTS.md`'s stale `src/community/showchat/` path (showchat lives at `src/showchat/`).

### Phase 6 — Poll + audience quiz answers. Status: Not started
Join-page poll/quiz modes, vote intake + tally, the operator poll module (open/close/reveal/
reset per D5), the audience-result feed into the quiz pilot. Results are never revealed
merely because responses arrived.

### Phase 7 — CSV/JSON import. Status: Not started
Import quiz banks, teams, lineups into Data Hub datasets via a small shared quoted-CSV parser
(`src/model/csv.ts`, no new dependency) + JSON. Imported data stays editable; no permanent
file dependency.

## Audience backend design (for Phases 5–6; designed 2026-08-05, review before building)

Audience participation is a sibling capability plane on the existing `control_shows` row.
Everything is browser → Supabase direct (zero Vercel functions), one migration
(`supabase/migrations/0035_audience_participation.sql` — re-verify the number at
implementation time; two branches minting the same number is a known trap), one new MPA entry.

- **Three tables, not one:** `audience_submissions` (moderated text; immutable original
  `author`/`body` + editable `broadcast_author`/`broadcast_body`; `anonymize`, `shortlisted`,
  `used_at`/`skipped_at`/`moderated_at`; status `new/approved/rejected`; `device_token`),
  `audience_rounds` (one opened poll or quiz question: `kind`, `question`, `options` jsonb
  ≤8, `correct_option` — never returned to the join page, `opened_at`/`closed_at`), and
  `audience_votes` (PK `(round_id, device_token)` — the PK IS the dedupe; upsert =
  change-your-vote while open). Votes and submissions share almost no columns, votes need the
  composite PK, and tallying needs its own index shape. Rounds are a table (not only jsonb)
  so `audience_vote` can validate round-exists/belongs/open server-side.
- **Guard triggers, 0003-style, defence in depth:** trim + hard truncate (author ≤40, body
  ≤500), per-show 20/10 s + per-device 3/30 s submission caps, profanity mask reusing the
  existing `chat_blocklist`; a vote guard bounding token length and per-show vote bursts.
  Trigger functions revoked from client roles.
- **`control_shows` grows the audience plane:** `join_slug` + `presenter_slug` (unique,
  URL-safe base64 defaults, backfilled per-row) + `audience_state` jsonb
  `{v, open, mode: waiting|question|comment|poll|quiz, round, presenter:{current,next},
  brand, rev}`. Mode/open/presenter change via `audience_set_join` (allowlisted keys);
  `round` changes only through `audience_open_round`/`audience_close_round` so the pointer
  and the table can never disagree. `brand` is written at publish from `Show.look` (owner
  RLS write inside `publishControlShow`).
- **Eleven slug-keyed SECURITY DEFINER RPCs, zero anon table policies:**
  `audience_join_by_slug`, `audience_submit`, `audience_vote` (join slug);
  `audience_list`, `audience_update` (allowlisted patch keys — author/body/kind are NOT in
  the allowlist, which is where immutability lives), `audience_set_join`,
  `audience_open_round`, `audience_close_round`, `audience_tally`, `audience_rounds_list`
  (control slug); `audience_presenter_by_slug` (presenter slug). Writes check
  `feature_denied_for(owner, 'audience')`; the join resolve folds a denial into
  `open = false`.
- **Join capability discipline** — `audience_join_by_slug` must never return: the show id
  (it is a log-reading capability under 0008's anon `using(true)` policy), any other slug,
  `panel`/`staged`/`live`/`output`, `correct_option`, tallies, presenter pointers, or any
  other submitter's anything. Errors stay generic.
- **Polling, no realtime.** Decisive: realtime `postgres_changes` filters rows by the
  SUBSCRIBER's RLS, and the anon hosted-operator page has (and must have) no SELECT policy
  on a moderation table — slug authorization cannot be expressed to realtime. Join page polls
  ~5 s with jitter + `visibilitychange` pause; operator inbox ~4 s; tally ~2 s while a round
  is open. A `{t:'audience'}` nudge row in `control_events` was considered and rejected for
  v1: every nudge counts against the shared 50-per-5-s burst budget and a submission storm
  could block the operator's own Take.
- **Tally = count-on-read** over the votes PK; no maintained counter column (hot-row
  conflicts, drift risk, no benefit at this scale).
- **Both operator surfaces use the control slug** (ProductionPage holds `hostedSlug`
  locally; the anon HostedControlPage gets moderation parity free). "Make cue"
  (submission → `addShowCue`) is cockpit-only; "stage tally to graphic" maps counts onto
  poll-template fields via ordinary `control_stage`/`control_send` — the renderer never
  learns votes exist.
- **`/join` = 5th MPA entry** (`join.html` → `src/join/main.ts`; the output.html pattern:
  vanilla TS, no React, code-split supabase client, noindex). `?pv=<presenter_slug>` on the
  same entry serves the presenter view. A shared framework-free `src/audience/joinSurface.ts`
  renderer is used by both the standalone page and the ProductionPage rehearsal preview, so
  preview and reality cannot drift.
- **Rehearsal/offline seam:** one `AudienceBackend` interface
  (`src/audience/audienceTypes.ts`), two providers — `audienceData.ts` (Supabase) and
  `localAudience.ts` (in-memory + a submission/vote simulator). Rehearse mode or an offline
  build uses the local provider, which makes the whole audience workflow drivable by the
  offline e2e suite.
- **Entitlement: new key `audience`** (not a widening of `showchat` — the 0022 kill-switch
  contract promises the admin page states exactly what a switch stops). One entry each in
  `FEATURE_KEYS`/`FEATURE_LABELS`/`ENFORCED_FEATURE_KEYS`/`FEATURE_ENFORCEMENT_NOTES`.
- **`Show` record:** additive-optional `joinSlug?`/`presenterSlug?` mirroring the existing
  slugs (stripped from conflict copies), written by `publishControlShow`'s read-back.
- **Vanity join names (owner decision):** `join_slug` defaults random at publish; the
  operator can claim a readable name (`noacg.app/join/friday-night-live`) — global
  uniqueness, reserved-word list, availability check, random fallback.

**Owner decisions open for Phase 5:** retire-or-keep standalone showchat; change-your-vote
(recommended) vs first-vote-sticks; presenter page in v1 vs schema-now-page-later
(recommended); whether the join page may ever show tallies (v1: never — the reveal is a
graphic); per-IP abuse caps beyond device tokens; question length cap (280 vs 500 —
500 recommended).

## Sequencing and deliberate deferrals

- GOALS "Student release" step 10's remaining half is the owner's hardware re-test of the
  CURRENT ProductionPage build, and Phase 1 modifies exactly that surface. This branch lands
  only after that re-test verdict is in, so the acceptance target does not silently move.
- Deferred by design (documented, not built): sport-specific controllers, external data
  providers (Liquipedia, YouTube/Twitch, X, Sheets, webhooks — the future-connector doctrine
  stays `docs/CLOUD_PLAYOUT.md` §7: connectors become producers into the one log, feeding the
  Data Hub, never controlling output directly), scoreboard hardware, game telemetry, multiple
  contestants, contestant answer devices, audience image/video uploads, automatic moderation,
  unmoderated chat overlays, and any visual state/node editor beyond the shipped MachineGraph.
