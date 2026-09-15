# A control panel for any graphic - the plan

**Status: a PLAN, written 2026-09-15 from the weekly alignment of the same day. P2 is at DESIGN,
so this builds nothing; it says what the one approach is, proves it on paper against the
2026-10-20 case, and separates what must exist by that date from what waits.**

The brief: one control-panel approach that fits ANY graphic we have - catalog templates,
imported SVGs, graphics a coding agent makes through the NoaCG CLI, and later a stranger's OGraf
package. The proof case is Elämäni biisi on Yle, 2026-10-20: five people vote on who performs
each song, one graphic shows each person's vote for the current song, another keeps a running
total of how many songs each person has guessed right. The owner wants to prompt it in Claude
Code, save it with the CLI, and run it from the playout dashboard within minutes, in front of the
producer and director.

Binding background, none of it repeated here: `docs/CONTROL_LAYER.md` (the one generator and its
five renderers, and the 2026-09-03 clarification that there is no fixed control vocabulary),
`docs/CONTROL_PANEL_ROAD.md` (the road, the production control profile in §3, the agent door in
§9), `docs/STATE_MACHINE_SCHEMA.md` (what a machine is), `docs/OGRAF_STATE_IN_FIELDS.md` (what a
foreign host can and cannot learn), `docs/SVG_BEHAVIOUR_PLAN.md` (recipes, the 14 in
`src/templates/behaviours/registry.ts`), `docs/AGENT_CLI.md` (the door the proof case walks).

---

## 0. The answer in one paragraph

**There is already one approach, and it is the control contract: a graphic declares its fields,
its machine and its controls inside its own code, and every surface generates the panel from
that declaration.** Nothing in this plan adds a second one. What the proof case needs is the
agent door being allowed to WRITE the contract it already reads: today the skill
tells a coding agent that authoring its own machine "is a later capability", while the runtime,
the validator, the bench and all five renderers already accept one, and the owner blessed it on
2026-08-27 under three gates. So the recommendation is to teach and gate the contract on the
agent road before 2026-10-20, walk the proof case through it once ourselves, and hold everything
else - phones, the production control profile, self-sorting rows on the SVG road, OGraf legality -
until a real show asks for it. The reasons follow.

---

## 1. What already exists - one contract, four fillers, five renderers

The generator reads three things out of a template and nothing else: the SPX definition's
DataFields (inputs), `NOACG_ANIM.machine` (buttons, greying, what » Next does) and the additive
`machine.controls` metadata (labels, sections, order, `payload`, `adjust`, `set`, `add`, `remove`,
`destructive`). No category is consulted, ever (`docs/CONTROL_LAYER.md`). Four roads fill that
contract today, and each fills the same three slots:

| Road | Who writes the contract | How it gets there | Panel today |
|---|---|---|---|
| Catalog type | an expert, in `src/templates/types/<id>.ts` | `attachMachine` at create | complete, proven on five types (`docs/CONTROL_PANEL_PARITY.md`) |
| Imported SVG | a recipe compiled from the artwork's roles | the same `attachMachine`, through `importedDesign/behaviour.ts` | complete for the 14 recipes in the registry, switches and choices among them |
| Agent or hand-written | the author, directly in the template's code | the template IS the contract | complete for whatever is declared - the 2026-08-22 round's five novel briefs each authored a working machine from scratch, and the control layer rendered them |
| Foreign OGraf package | the package's manifest | `control/ografContract.ts` reads `schema` + `customActions` + `stepCount` | complete minus what OGraf cannot say: every button live, no sections, no adjusts |

Five renderers draw the result and are measured not to diverge: the in-app Control tab, the
exported `controlpanel.html`, the hosted control page, the editor's Rehearse strip, and the
exported production controller. The production dashboard adds what a show needs above one
graphic: cues, layers, ⟳ Take, ± live numbers, the ⚡ actions block with sections, the snap
recovery picker. A graphic that declares nothing still gets the honest panel - fields plus
Take/Update/Next/Out - because the derived machine is a machine.

So "graphics that bring their own control panel" is not a feature to design. It is the property
the generator has had since Phase 5, and the third road is the one where nobody has yet been told
they may use all of it.

---

## 2. The recommendation, and why

**Recommendation: the control contract is the universal answer. Make it the thing the agent road
teaches, gates and proves, and add vocabulary only where a real graphic shows a hole.**

### 2a. What a graphic declares - the whole list

A graphic that brings its own panel declares five things, all in its own code, none of them UI:

1. **Fields, with kinds.** One DataField per thing an operator or a foreign host may change:
   text, lines, number, dropdown, toggle, colour, image. A `hidden` field is a holder the runtime
   reads and nobody draws (the countdown's minutes, the vote's status).
2. **A machine.** Groups, states, arrows. Operator arrows become buttons, timer arrows advance by
   themselves, the default path is what » Next and a dumb playout host walk. The structural guard
   is the whole guard - an event with no arrow from the current state is dropped, and the panel
   greys it for the same reason.
3. **Controls metadata.** Per event: the operator's word for it, its section, its order, what
   rides it (`payload`), what it moves (`adjust`), what it sets (`set`), what it appends
   (`add`/`remove`), whether it is destructive. This is what makes a goal one press and a reset
   red.
4. **Calls into the graphic's own runtime.** A state's timeline may `call` a function the
   template defines outside the marked region. That is where the graphic's own logic lives - a
   comparison, a sort, a paint - and it is legal there because it is the graphic's code, not a
   binding. The doctrine bans an expression language in the CONTRACT; it never banned a template
   from having JavaScript.
5. **Reported fields for anything a foreign host must reach.** `docs/OGRAF_STATE_IN_FIELDS.md`
   R1 and R2: if a controller that can only send data must be able to change it, it is a field
   the runtime reads back on `update()`, and the button that changes it `set`s the same field.
   That is what keeps "a generic OGraf host displays the graphic from standard data updates
   alone" true without a return channel.

What a graphic never declares: markup, layout, a panel. The panel is derived, on every surface,
with no per-graphic UI code. The owner's 2026-09-03 sentence is the fence on both sides - "no
bespoke panel UI code" and "the graphic can define whatever controls it needs" - and this list is
exactly what "whatever controls it needs" means today.

### 2b. Why this and not the alternatives, one line each

- **Per-graphic panel HTML, or a panel the agent writes.** Forks five-renderer parity, rots on
  every edit, and loses greying, recovery and the log for the graphic that has it. Rejected in
  `docs/CONTROL_PANEL_ROAD.md` §2 and rejected again here; Zero Density's declared-only custom
  actions are what a panel without a machine behind it looks like.
- **A control DSL or panel schema beside the machine.** A second store the code would have to
  agree with. The contract already carries everything a panel needs, and OGraf's `customActions`
  proves a flat declared action set is enough for the wire.
- **Wait for the production control profile.** The profile arranges controls a graphic already
  exposes; it cannot give a graphic controls it never declared. It is the second half of "just as
  the user needs it" and it is deferred on the road's own rule (first real demand shapes its
  vocabulary). The proof case may be that demand; §5 says where.
- **A recipe per show.** The SVG road's answer, and the right one for a drawn board. The proof
  case is prompted, not drawn, and a recipe for a five-person guessing panel would be a program
  written for one broadcast. The agent road exists so that nobody has to write it.

### 2c. What the third road is missing - the actual gap

The skill's own text (`cli/skill/noacg-graphic/references/contract.md` §5): *"Authoring your own
machine is a later capability."* Everything below that sentence already works. The road (§9)
recorded the owner retiring the 2026-08-08 rule on 2026-08-27 and naming three gates for an
authored machine: (1) `noacg validate` passes with machine checks, (2) the agent runs `noacg
inspect` and shows the user the derived panel so a human confirms the operator surface, (3) the
bench walks every operator arrow. Measured today: (1) exists - the `machine` finding is an error
and a stale interpreter is refused; (3) exists with a cap - `runtimeBench.ts` dispatches the
first eight authored operator events (`MAX_BENCH_EVENTS`) and checks the pose each produces, so a
graphic with more buttons than that has its ninth and later unwalked; (2) exists as a verb and as step 4 of the loop,
but the skill never tells the agent to author a machine, so the step is only ever reached with a
type's machine. `docs/GOALS.md` NEXT still carries "Agent-authored machines - the owner gate is
armed" as an open decision. The 2026-09-15 brief answers it: the proof case is an agent-authored
machine by definition.

---

## 3. The proof case, designed against today's vocabulary

Written out so the vocabulary is tested rather than assumed. Two graphics, one production, two
layers. Names are the operator's; the machine's ids are the agent's.

### 3a. The votes board - who did each person pick

- **Fields.** Song (text). Performer A, B, C, D (text; an empty row is not drawn). Panelist 1 to
  5 (text). Pick 1 to 5 (dropdown A/B/C/D, empty allowed). Correct (dropdown A/B/C/D). Shown
  (hidden, `votes`/`revealed`, the reported field for a foreign host).
- **Machine.** One group: `off` → `votes` (the entrance; names and picks on) → `revealed` (the
  correct performer lit, each pick marked right or wrong) → `out`. The default path is that walk,
  so ⟳ Take shows the votes, » Next reveals, ■ Out clears - and a playout host with nothing but
  `play`/`next`/`stop` drives the whole graphic, which is the dumb-playout contract.
- **Controls.** `reveal` labelled "Reveal performer", `payload: [correct]`, `set: { shown:
  'revealed' }`. The reveal is reachable two ways and they do not fight, the vote board's own
  pattern (`docs/OGRAF_STATE_IN_FIELDS.md` §4b): a NoaCG surface fires the arrow (» Next or the
  ⚡ button, and the button also writes Shown), while a data-only host writes Shown and the
  runtime reads it back on `update()` and paints the same look. Optionally one "Show pick 1..5"
  per row on a `set` per-row field, the survey board's pattern, if the producer wants the picks
  to land one by one.
- **Calls.** The `revealed` state calls `markGuesses()`, a function in the template's own JS that
  compares each pick to the correct answer and lights the marks. A comparison, in the graphic's
  runtime, invoked by name from a state - the exact shape `docs/SVG_BEHAVIOUR_PLAN.md` §8 reserves
  for "design-owned JS a professional or an agent writes".
- **Panel, derived.** Sixteen inputs, ▶/⟳/»/■, one ⚡ button that greys until the graphic is on
  air and after it has fired, a state chip reading Votes / Revealed, snap recovery. Over OGraf: a
  `schema` of sixteen properties, one custom action, `stepCount` 2. A stranger's renderer shows
  the picks from data and reveals on `playAction`.

This is the quiz board with five pickers instead of one. Nothing in it needs a word the
vocabulary lacks.

### 3b. The running total - who has guessed right so far

- **Fields.** Name 1 to 5 (text). Points 1 to 5 (number).
- **Machine.** `off` → `board` → `out`. A `flash` parallel group (`none`/`shown`) if the agent
  wants a scored row to pulse - the score recipe's shape.
- **Controls.** `+1` and `−1` per person, `adjust: { points3: 1 }`, section "Panelist 3". "New
  game" `set`s every points field to 0, destructive. Five people, ten small buttons and one red
  one - the shape `docs/SCORE_CONTROL_SURVEY.md` derived from every scoreboard console read.
- **Calls.** `update()` re-sorts the rows by points and animates them into place - GSAP moving
  the agent's own DOM on a data change. That is paint, not control, and it is the graphic's to
  do.
- **Panel, derived.** Ten inputs, the ± live numbers block (every operator-visible number
  field no ⚡ event carries as payload gets it, on air, partial updates), the ⚡ block in five
  sections, New game in red.

### 3c. The operator's minute on 2026-10-20

Before the song: type the song, the performers, the five picks and the correct letter into the
votes cue; ⟳ Take. After the performance: » Next (or ⚡ Reveal performer). Read the board, then
on the totals cue press +1 under each person who was right. That is two presses plus one per
correct guess per song, and every one of them is in today's dashboard. The totals graphic stays up on its own layer for
the whole show; the votes board is taken and cleared per song.

### 3d. What the walk on paper found

Three findings, none of them blocking, listed so the proof walk (§5 row 3) knows what to look
at:

1. **The bench walks eight buttons and the totals board declares eleven.** The cap in §2c
   meets `+1` and `−1` for five people plus New game, so gate 3 leaves three presses unwalked on
   this graphic. Either the cap rises for a machine that declares more, or the proof walk presses
   the rest by hand and says so. Not a doctrine question, a number.

   What the walk on paper did NOT find, recorded because the first draft of this plan claimed
   it: the cue editor's field bands. `control/cueFieldGroups.ts` already bands NUMBERED rows
   ("Panelist 3 / Pick 3", "Name 2 / Points 2") by the same mirror test the A/B sides use, the
   alphabet that arrived with the score tracker. Both proof-case graphics band on their own
   titles; the lettered performers and the song fall into the shared band, as they should.
2. **A control's section is a static word.** The totals board's buttons sit under "Panelist 3"
   while the field beside them says "Katri". An additive `sectionField` on a control, naming the
   field whose current value heads the section, would put the person's name on the buttons on
   every surface. Nice on 2026-10-20, not needed for it.
3. **"+1 to whoever was right" cannot be one press across two graphics, and should not be
   faked.** A graphic never reacts to another graphic, an `adjust` delta is static, and a total
   the graphic bumped internally would drift from the log and vanish on recovery - the drift the
   `adjust` mechanism exists to prevent. The honest answers are the operator's presses (today),
   then a combined control in the production control profile (Reveal plus the chosen +1s as one
   ordered batch of already-declared events, road §3), and only then the open design question
   `docs/SVG_BEHAVIOUR_PLAN.md` §13 already names - whether a DERIVED value can be a field. That
   question is not bent around here.

---

## 4. The three questions the brief asked

**How does an agent-made graphic declare its own panel?** In its code, as §2a: fields, machine,
controls metadata, calls into its own runtime, reported fields. The skill teaches it, `noacg
validate` gates it, `noacg inspect` prints the panel it will get, the bench presses its buttons
(the first eight today, §3d.1),
and `noacg save` puts it in the library exactly as a typed graphic. The OGraf manifest the
package carries states the same contract as `schema`, `customActions` and `stepCount`, with the
sections and adjusts riding `v_noacg`. Nothing is added to any format.

**Do the five votes come from an operator, or from the voters' phones through the audience join
page?** From the operator, for 2026-10-20 and as the standing default. The audience plane counts
anonymous votes per option: `audience_votes` is keyed by `(round, device)`, a device token is
never returned to an operator, and a tally is counts by option index. "Each person's vote" needs
five NAMED seats, which is a different round kind, not a setting. It is worth building only if
the production wants the panel to lock in from their phones, and it changes nothing about the
graphic: named picks would stage onto the same five Pick fields through the same road a poll
tally takes today (stage a cue, the operator takes it), so nothing viewer-written airs without a
press. Design it when Yle asks; do not build it for the demo.

**Does a running total need rows that reorder themselves, which no recipe does today?** No, and
the distinction is the useful part. Reordering is PAINT, and the control surface for a total is
names, numbers, `+1` per row and a reset - all shipped vocabulary. On the agent road the
graphic's own JS sorts on `update()`, and that is what the proof case does. On the SVG road a
drawn board cannot sort itself until the `arrange` paint mechanism exists (`docs/SVG_BEHAVIOUR_PLAN.md`
§2a, phase 5, waiting on its spike), and that stays parked: the proof case does not draw its
board. A recipe is the wrong tool for a graphic that is prompted rather than drawn.

---

## 5. What has to exist for 2026-10-20, and what waits

Ordered by what would sink the demo. Nothing before 2026-09-25 - the owner said both this and the
editor rebuild lead AFTER the 25th, and the early-October production needs only the scoreboards
and quiz boards that already exist.

| # | What | Why it is on this side of the line | Cost | Who |
|---|---|---|---|---|
| 1 | **The skill teaches the contract.** Retire "a later capability"; add §2a as a section of `references/contract.md` with a worked machine and controls block; make the three gates explicit steps of the loop - validate, inspect and SHOW the user the buttons, bench; teach the default-path contract and reported fields. One generated source, every shipped copy follows (`cli/scripts/build-skill.mjs`). | Without it the agent scaffolds a typeless graphic and ships state as fields - the measured failure mode of the 2026-08-22 round's free cells | one row; a CLI release after it (`npm run release:cli`, which a session may run) | one row, week of the 28th |
| 2 | **Close the open gate in GOALS.** "Agent-authored machines - the owner gate is armed" is answered by the brief; record it in `docs/OWNER_RULINGS.md` and move the GOALS line. | A doc that says the question is open will stop the next session | minutes | the same row |
| 3 | **Walk the proof case ourselves, once, end to end and timed.** Prompt Claude Code with the shipped skill, build both graphics, `save`, one production, publish, drive §3c from the dashboard, and file the owner-queue item with the route and the stopwatch. Fix what it finds; §3d says where to look first. | "Within minutes in front of the producer" is a number, and the only number we have is 24.8 s of tool time for the seven verbs plus an untimed last hop (`docs/DEMO_2026-09-25.md` §7 row 15) | a day, plus whatever it finds | one row, first week of October |
| 4 | **The bench's event cap** (§3d.1): raise `MAX_BENCH_EVENTS` for a machine that declares more, or have `validate` say which buttons it did not press. | Gate 3 has to mean what §2c says it means on the first real graphic that needs it | an hour, plus one bench run | one row, with row 3 |

Everything else waits, each with the thing that would pull it up:

- **Named-seat voting on `/join`** (§4, question 2) - when Yle asks for phones. Not the demo.
- **The production control profile** (road §3: arrange, hide, pin, combine) - when the producer
  says "one press". The proof case is the first plausible demand signal; treat it as one only if
  it is actually said.
- **`sectionField` on a control** (§3d.2) - cheap, additive, after row 3 says whether it matters.
- **`arrange` for the SVG road** - the ranking recipe's spike, unchanged in priority.
- **Derived-value-as-field** - the bracket's and the auto-+1's shared question; a design of its
  own, never a corner of this one.
- **OGraf legality vendor block, GDD array shape, foreign packages in the dashboard** - the OGraf
  ladder in `docs/GOALS.md` NEXT, in its own order. A stranger's package already gets the honest
  panel through `ografContract.ts`; what it lacks is what the standard lacks.

---

## 6. The constraints, checked

- **No expression language, ever.** The contract stays structural; the one comparison in the
  proof case lives in the graphic's own function, called by name from a state. No slot anywhere
  takes a condition.
- **The code is the truth; no hidden scene model.** Every declaration is in the template; the
  panel is a projection, never a store.
- **Controls are generated from the graphic's machine, never hand-built per graphic.** The agent
  writes a machine, not a panel; five renderers draw it.
- **A generic OGraf host displays the graphic from standard data updates alone.** Both graphics
  are fields plus a default path; the reveal mirrors into a reported field.
- **P2 is at DESIGN.** This file builds nothing. Rows 1 to 4 of §5 are P5 (the agent door) work,
  which is unparked; none of them touches an authoring surface.

On Zero Density, held as the brief asked: the pattern worth learning is that a declared action
set with typed payloads is enough for a wire (their `customActions`, our `machine.controls` and
the exporter agree); the pattern not to copy is a runtime that acknowledges an action and runs
nothing. No code is read from it; it is AGPL and its runtime rides in every export.

---

## 7. Decisions made here, and what is his

Made here, recorded so they can be reverted rather than adjudicated:

1. The control contract is the one approach; no second declaration format is reserved.
2. Authoring a machine on the agent road is taught and gated; today it is only accepted.
3. The five picks are operator-entered by default; named-seat phones are a later round kind.
4. Reordering is paint; the agent road sorts in its own JS; the SVG road waits for `arrange`.
5. "+1 to whoever was right" is presses now, a profile macro later, and never an internal bump.
6. Nothing here starts before 2026-09-25.

**Needs him (needs: alignment), and only if he disagrees:** whether the production control
profile should be built for 2026-10-20 on the strength of the "one press" case in §3d.3 rather
than waiting for the producer to ask. The plan says wait.
