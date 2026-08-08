# Q2 - can Pro generate custom backend fields and a working state machine?

The question that decides whether Pro deserves to exist. A graphic NoaCG does not ship - a match
clock combined with a scoreboard - needs its own `DataFields` and its own state machine,
generated, and must then be operable on `#/control/<id>` like anything else, because
`docs/CONTROL_LAYER.md` builds the control page FROM the machine: every operator transition
becomes a button, every field an input.

The brief used throughout:

> A combined match clock and scoreboard for a live floorball broadcast: the two team names with
> their scores, a running match clock, and the period number. The operator needs to start and
> stop the clock, add a goal to either team, and advance the period, while the graphic stays on
> air the whole time.

That last clause is the point. A lower third's whole life is play → next → stop. A scoreboard
lives on air for an hour while its state changes underneath it - which is what a state machine is
for, and what the default path alone cannot express.

---

## 1. NoaCG Pro, as it ships: no, and not for a model reason

This half needs no tokens to answer, because it is fixed in the contract rather than decided by a
model.

**Fields.** `ProBrief` (`src/ai/pro/contract.ts`) is:

```ts
export interface ProBrief {
  brief: string;
  name: string;      // the first text line
  title: string;     // the second text line
  includeLogo: boolean;
}
```

Two text lines and an optional logo slot. `standardProBrief` (`src/ai/pro/brief.ts`) maps the
shared Create-with-AI brief onto it by taking `textFields[0]` and `textFields[1]` and **discarding
the rest**. A user who asks for six fields through the "More control" panel gets two. The scores,
the clock, and the period cannot be requested, because there is nowhere in the brief to put them.

**Machine.** There is no `machine` key anywhere in the Pro path. `compileProPlan` builds on
`IMPORTED_DESIGN.create()`, which emits `steps: '1'` - a single-step graphic - and a `design-*`
in/out preset. The resulting NOACG_ANIM block has `steps` and no `machine`, so what the editor and
the control generator see is the IMPLICIT machine derived on read
(`docs/STATE_MACHINE_SCHEMA.md` §4): a synthesized pose-only `off`, one waypoint, an `out`, and
the two lifecycle edges.

**Therefore the generated control page carries:** ▶ Play, ■ Stop, » Next, and two text inputs.
No "Start clock", no "Goal - home", no "Next period". `eventButtons()` has nothing to build them
from, because `machineControls` reads `machine.controls` and there is no machine.

The verdict is not "the image model could not design a scoreboard". It is that **Pro v1 is a
two-field lower-third compiler**, stated as such in the plan (§11: "No non-lower-third graphic
types"), and a clock-plus-scoreboard is outside it by construction. `PRO_GRAPHIC_TYPES` is
`['lower-third', 'other']` and the compile refuses `other` rather than mis-building it.

## 2. So the real question is whether the PLATFORM can generate one at all

Pro's reconstruction path is not the only generative path. The free-form CUSTOM CODER
(`claudeProvider`, `fit: 'custom'`) writes complete HTML/CSS/JS and does mint its own
`DataFields` - so it can, in principle, produce both halves. Two arms were run against the same
brief on the same pinned route, differing in one thing:

- **`plain`** - the production custom coder exactly as it ships. What a user gets today.
- **`taught`** - the same model, same route, with the state-machine contract from
  `docs/STATE_MACHINE_SCHEMA.md` appended to the BRIEF. The shipped `coderSystemPrompt` is the
  frozen benchmark control (`src/ai/AGENTS.md`) and was not touched, so the arms differ in what
  the model was ASKED, never in what the platform is.

The separation matters because the two possible answers need different work: "the platform never
asks for a machine" is a prompt-and-contract problem, and "the model cannot write one" is a
capability problem.

### The finding that needs no measurement

**Nothing in the shipped generation harness ever mentions the state machine.** `coderSystemPrompt`
teaches the SPX contract, the structure spine, the house style contracts, the ANIMATION region in
its authoring shape, layout safety and motion doctrine - and says nothing about `machine`,
`groups`, `transitions`, operator events, or `machine.controls`. Neither does the design-spec
prompt. `grep -rn "machine" src/ai/*.ts` finds it in `spec/categories.ts` (a graphic TYPE's
machine hint, for catalog-linked categories) and nowhere in any prompt that reaches the coder.

So the production answer for **every** tier today - Lite, Pro, custom, raw - is the derived linear
machine. The platform has a full state-machine engine, a node editor, and a control generator
built on it, and **no generation path asks a model to use it**. That is a gap in the harness, not
in the models, and it is the single most actionable finding in this round.

## 3. Measured results

Route: `vercel:alibaba/qwen3-coder-next` (the approved coding route on the managed gateway).
Artifacts: `machine/report.json`, `machine/taught.*` (the emitted code), `machine/control-*.png`.

| | `plain` | `taught` |
|---|---|---|
| Route taken | custom coder | custom coder |
| Valid | **no** | **yes** |
| Custom DataFields | **5** (Team A, Score A, Score B, Match Clock, Period) | **6** (Home Team, Score Home, Away Team, Score Away, Clock - Seconds, Period) |
| Field types | textfield + 4 number | 3 textfield + 3 number |
| `machine` in the emitted code | **no** | **no** |
| Timeline steps | 0 (unreadable region) | 2 |
| Control buttons beyond the built-ins | **0** | **0** |

**Custom fields: YES, and well.** Both arms invented a sensible field set for a graphic the
catalog does not ship, with correct types - scores and the clock came back as `number`, which is
what puts +/- steppers on the operator's panel. This half of Q2 is answered positively and was
never really in doubt once the free-form coder is in play.

**State machine: NO, in both arms.** The `taught` arm was handed the format-2 shape, the
positional binding, the parallel-group rule and the `machine.controls` convention, and still
emitted a data block with `steps` and no `machine`.

`plain` additionally shipped **broken**: a syntax error in the emitted JS (`Invalid or unexpected
token`), `play()` and `stop()` both throwing `TypeError: Cannot set properties of undefined`, and
an unreadable animation region. The validator caught all of it (`valid: false`), which is the
system working - but it means the production path produced nothing usable for this brief on the
first two attempts.

### Why the teaching could not have worked - the seam does not exist

This is the finding that matters, and it is structural rather than statistical.

The custom coder is taught to write the **legacy GSAP authoring shape** - `buildInTimeline()` /
`buildOutTimeline()` - and the platform converts every emit deterministically through
`convertEmittedRegion` → `importAnimData` (`src/ai/AGENTS.md`, pipeline item 5). And:

```
$ grep -c "machine" src/blocks/animImport.ts
0
```

`importAnimData` returns `{ version: 2, root, speed, steps: [enter, ...middles, out] }` and
nothing else. **A machine a model writes is discarded by the conversion, by construction** - so
the model was being asked, through the brief, for something the pipeline behind it cannot carry.
The `taught` arm resolving the conflict in favour of the system prompt's worked example is the
correct behaviour, not a failure.

This reframes Q2's second half. It is not "can a model author a state machine" - that is untested
and remains open. It is: **there is no path from a model to `machine`, in any tier.** Building one
means either teaching the data-block shape and letting a machine-bearing emit through the
converter untouched, or (cheaper and more in keeping with the harness doctrine) a small structured
MACHINE stage that emits the graph as data and has the platform splice it in deterministically -
the way `designSpec` already works.

### What the model DID write - the right idea in an invented vocabulary

This is the part worth reading the emitted code for (`machine/taught.template.js`). The model did
not ignore the machine; it built one, in names that do not exist:

```js
function noacgSendEvent(event) {
  if (event === 'goalHome') handleGoal('home');
  else if (event === 'goalAway') handleGoal('away');
  else if (event === 'nextPeriod') handleNextPeriod();
  else if (event === 'clockStart') startMatchClock();
  else if (event === 'clockStop') stopMatchClock();
  else if (event === 'clockReset') resetMatchClock();
}

function noacgMachineState() {
  var clockRunning = matchClockTimer !== null;
  return { groups: { main: onAir ? 'on' : 'off', clock: clockRunning ? 'running' : 'stopped' } };
}
```

It reached for exactly the right concepts - named operator events, a separate parallel `clock`
group with `running`/`stopped`, state reporting - and got every interface wrong:

1. **`noacgSendEvent` is not a thing.** The real global is `noacgDispatch`. No receiver, no control
   surface, no export target calls the invented name, so all six events are dead code.
2. **Its `noacgMachineState()` is silently overridden.** The platform's interpreter declares its
   own `noacgMachineState` *later in the same file* (line 1056 against the model's line 170), and
   the last function declaration wins. The model's two-group report - the one that would have told
   an operator whether the clock was running - never executes. That is why the control page's chip
   reads `enter` (the platform's derived states) and not `running`/`stopped`.
3. **The duplicate declaration passed every gate.** `validateTemplate` returned `ok: true` and the
   runtime bench passed, because neither parses the emitted JS for redeclaration. `eslint` flags it
   instantly - which is worth noting as an available, free check that the generated-code gate does
   not currently make.
4. **The clock uses `setInterval`.** `docs/STATE_MACHINE_SCHEMA.md` requires `gsap.delayedCall`
   armed by a `tl.call`, precisely so the runtime bench can accelerate timers and the render
   pipeline's virtual clock can drive them deterministically. A `setInterval` clock is invisible to
   both and renders wrong.

So the model understood the brief and had no way to express it in the platform's vocabulary,
because nothing told it the vocabulary exists - and where it guessed, the platform overwrote the
guess without a word. **A model inventing the right abstraction under the wrong name is the
signature of a missing contract, not a weak model.**

## 4. End to end: the graphic, saved, on `#/control/<id>`

`scripts/pro-machine-drive.mjs` puts the `taught` graphic in the library and opens its generated
control page. Screenshots in `machine/`.

**What works:**

- The page renders, the graphic loads, the ON AIR chip lights, the state chip reads `enter`.
- Every generated field is a real operator input, correctly labelled and typed: *Home Team*,
  *Score Home* (with −/+ steppers), *Away Team*, *Score Away*, *Clock - Seconds*, *Period*.
- ▶ Play, ⟳ Update, » Next, ■ Stop all work; entries, staging and `controlpanel.html` export are
  all there. An operator really can run this scoreboard by typing scores and pressing Update.

**Where it breaks, exactly:**

1. **There is no way to start or stop the clock.** The engine exists in the code and no surface
   can reach it. For a graphic whose whole purpose is to sit on air while its state changes, this
   is the feature, and it is missing.
2. **There is no "Goal - home" / "Goal - away" / "Next period" button.** Scoring is done by typing
   a new number into a field and pressing ⟳ Update - two actions and a keyboard, during live play,
   where the atomic single-press event the machine exists to provide is the entire point.
3. **The field inputs only appear once an ENTRY is added.** An operator opening a fresh graphic's
   control page sees the four verbs and an empty Entries panel. That is the saved-content model
   working as designed, but for a scoreboard - which has one long-lived state rather than a
   rundown of cues - it reads as an empty page.
4. **The design is poor.** The compiled scoreboard is a narrow vertical stack with the scores
   overlapping the team names and a red diagonal through it (`machine/control-taught-played.png`).
   The custom coder passed every gate and produced something no broadcaster would air. Consistent
   with `docs/GOALS.md`: cheap models cannot design unaided, which is why Lite is grounded in the
   catalog - and the custom path has no catalog to be grounded in.

**Verdict on Q2: no.** Custom fields yes; a working state machine no, in any tier, and Pro
specifically cannot even be asked. Nothing about this is Pro-shaped - the missing piece is a
generation seam that reaches `machine`, and it would serve every tier at once.
