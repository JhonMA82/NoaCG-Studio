# NoaCG Pro - feasibility round, 2026-08-08

The question `docs/GOALS.md` asks about Pro is "find out whether it works at all", and it says
plainly that "it may not be reachable at broadcast quality; that is an acceptable answer". This
round answers that with measurements rather than opinion, on the pinned standard routes
(`PRO_STANDARD_ROUTES`), and it answers two things:

1. **Can an image model design a usable broadcast graphic, and does the reconstruction keep the
   design AND produce editable fields?** Measured against NoaCG Lite on the same twelve briefs.
2. **Can Pro generate custom backend fields and a working state machine** - the capability that
   would justify the tier existing - and is the result then operable on a generated control page?

Everything here ran through the shipped pipelines with the production validator injected
(`productionSpxValidator`: static `validateTemplate` + the live runtime bench + the safety and
as-is screens). No result was scored by a model.

**Artifacts:** `pro/` (twelve concept images + twelve compiled hold frames + `results.json`),
`lite/` (twelve Lite hold frames + `results.json`), `machine/` (the Q2 generations, their code,
and the control-page evidence).

---

## The headline

**The image model can design. The reconstruction cannot keep what it designed, and no gate in
the tree can see the difference.** Concept quality was the strong half of the round; the
deterministic reconstruction shipped a visibly broken graphic in 5 of 12 briefs while reporting
11 of 12 passing.

Recommendation: **park the current reconstruction approach; keep the concept stage.** Detail and
the alternative in §6.

---

## 1. What was spent

| Item | Calls | Cost |
|---|---|---|
| Probe run (1 brief, route verification) | 1 concept + 1 interpretation | $0.077 |
| First full bank (12 briefs, pre-fix) | 12 concepts + 12 interpretations | ~$0.92 |
| Interpretation diagnosis (fixture concepts, no image calls) | 11 interpretations | ~$0.11 |
| Second full bank (12 briefs, post-fix) | 12 concepts + 12 interpretations | ~$0.92 |
| Lite on the same twelve briefs | 12 generations | ~$0.004 |
| Q2 machine generations (custom coder, 3 runs incl. 1 malformed emit) | ~3 generations + intent stages | ~$0.02 |
| **Total** | | **~$2.05** |

Against a €10 (~$11.60) ceiling - about a fifth of it. Concept costs are the provider's exact
reported numbers; interpretation costs are estimated at the measured $0.009-0.011 per call,
because the bench records them as `null` (below). The per-generation numbers matter more than the total:

- **A completed Pro generation costs ~$0.077**, not the ~$0.07-0.08 the plan documents - close,
  but the split is wrong. The plan says ~$0.067 concept + ~$0.002 interpretation; the measured
  interpretation is **$0.009-0.011**, five times its documented figure, because gemini-2.5-flash
  bills reasoning tokens and spends 2,400-3,900 of them per call (§3).
- **A Lite generation costs ~$0.0003.** Pro is **~250x** the price of Lite per graphic, and
  ~6-10x the wall clock (26-57 s against ~5 s).

**`scripts/pro-bench.mjs` under-reports its own spend.** `interpretCostUsd` came back `null` on
all 24 generations - it reads the cost off the telemetry ring's interpret stage, which does not
carry `estimatedCost` - so the `--max-cost` ceiling counts the image half only. A run ceilinged
at $1.20 can spend ~$1.35 without the ceiling noticing. That is a defect in a cost control, and
it is worth fixing before any further paid Pro work.

---

## 2. Q1a - can the image model design?

Yes, and this is not a marginal yes. Judged as pictures (`pro/<id>.concept.png`), 11 of the 12
concepts are credible broadcast lower thirds with real design decisions in them: the public-news
brief produced a calm deep-blue two-tone strap with a hairline rule; the sports brief produced an
angled dark panel with a vivid lime cut and condensed type that would not embarrass a real
broadcaster; the corporate brief produced the near-white panel over dark footage that was asked
for. Text inside the concepts renders cleanly and legibly, including the long hyphenated name.

The one failure is instructive rather than aesthetic. **`empty-optional` - the brief with an
empty prose field - came back with the concept prompt's own instruction lines drawn into the
graphic as content**: the delivered frame reads `- Name line: "Nora Lindqvist"` and
`- Title line: "Correspondent"`. With no brief text to design from, the model treated the
scaffolding of the prompt as the copy. Every gate passed it (`validationOk: true`), and the only
reason the bench marked it failed is that its own `nameCarried` check noticed the field values
did not match.

---

## 3. The harness bug this round found first

The first full bank came back **7 of 12**, with five briefs failing *after* their concept image
had been paid for - $0.34 of images bought and thrown away. Two error strings, both pointing at
the interpretation call.

It was not the model. Instrumenting the gateway showed every failure carrying
`finish_reason: length` with `completion_tokens` at 3,983-3,986 against the pipeline's hard-coded
`maxTokens: 4000`, of which **reasoning_tokens were 3,836-3,841**. The model spends ~96% of the
output budget thinking, so a busier concept - more regions to describe - truncated the JSON
mid-object. The successful calls ran 2,377-2,746 reasoning tokens and fit underneath.

Reproduced deterministically on a checked-in fixture concept (0/3 succeeded), then fixed by
raising the cap to 12,000 (`src/ai/pro/pipeline.ts`), then re-verified (3/3). The full bank went
**7/12 → 11/12**. The cap is not a price control - only tokens actually produced are billed - so
raising it costs nothing and removes a failure that was destroying paid work.

Generalise it the way this repo already generalises the Lite numeric-enum failure: **a token
budget sized before reasoning tokens existed is now a truncation trap, and truncation reads as a
model failure.** Every other call site with a hand-set `maxTokens` deserves the same check.

---

## 4. Q1b - does the reconstruction keep the design?

**No.** This is where Pro fails, and it fails silently.

The deterministic scoreboard says 11/12 pass, editability 1.00 on nine of them. Reading the
twelve compiled hold frames (`pro/<id>.png`) as a human says something else:

| Verdict | Count | Briefs |
|---|---|---|
| Broadcast-usable as delivered | 6 | news-public, corporate, long-name, multiline-title, high-contrast, gradient-accent |
| Marginal | 1 | non-latin (glyphs correct, but the unit sits mid-frame, not in the lower third) |
| **Visibly broken** | **5** | sports-live, entertainment, minimalist, portrait-logo, empty-optional |

What "broken" means, concretely:

- **`sports-live`** - the strongest concept in the bank became the worst reconstruction. The
  concept's baked text is still in the raster and shows *through* beside the rebuilt panel, so
  "Marcus Oyelaran" appears twice at two sizes; the rebuilt rectangles are misregistered against
  the angled originals; the live name and role sit in boxes that do not correspond to the design.
  `validationOk: true`, `editability: 1.00`, `pass: true`.
- **`entertainment`** - a giant ghost "Bianca Solari" from the raster protrudes above the rebuilt
  gradient panel.
- **`minimalist`** - the brief asked for no panel, so nothing covers the baked text; the delivered
  graphic is live text and 3x-scale raster text overlapping in a small corner box.
- **`portrait-logo`** - the panel geometry is wrong (a large empty white block), the unit sits
  mid-frame, and the crop peeks around it.
- **`empty-optional`** - the prompt-leak concept described in §2, faithfully reconstructed.

Two structural causes, both already named in `docs/NOACG_PRO_PLAN.md` §10 as known limitations,
now measured as the **common case rather than the residue**:

1. **The erase only runs on flat backgrounds.** Model-generated concepts have textured, gradient
   "dark and quiet" backdrops, so the flat-fill erase refuses, the baked text stays in the plate,
   and the compile ships it with a warning. The warning is honest; it is also not a fix, and the
   user is handed a broken graphic with a note attached.
2. **Nothing measures paint.** The runtime bench measures rectangles - binding, overlap, overflow
   - and a rebuilt panel that fails to cover the raster underneath it occupies exactly the right
   rectangle. §10 already recorded this after a paint-order bug; this round shows it is not one
   bug but the dimension in which Pro's whole failure mode lives.

The house rule from `src/ai/AGENTS.md` applies verbatim: *a deterministic gate cannot catch a
defect in a dimension it does not measure.* Pro's output quality lives entirely in that dimension.

### What it does get right

Editability is real. Every compiled template carries live SPX DataFields that the operator can
drive - name and role landed correctly in 11 of 12 (`nameCarried`/`titleCarried`), the panels are
CSS layers with canvas/timeline/Inspector presence, and the templates pass static validation and
export. The claim "the reconstruction produces editable fields" is TRUE. The claim "the
reconstruction keeps the design" is FALSE in 5 of 12.

---

## 5. Q1c - Pro against Lite on the same twelve briefs

Same briefs, same page, same validator, same hold frame, same operator values driven in
(`scripts/lite-on-pro-bank.mjs`, written for this round so the comparison is not assembled from
two rigs).

| | NoaCG Pro | NoaCG Lite |
|---|---|---|
| Valid templates | 11/12 (12/12 compiled) | 12/12 |
| **Broadcast-usable as delivered (human read)** | **6/12** | **12/12** |
| Cost per generation | ~$0.077 | ~$0.0003 |
| Wall clock | 26-57 s | ~5 s |
| Design distinctiveness | high in the CONCEPT, lost in reconstruction | low - 9 of 12 landed on the same chassis (lt11) |
| Placement | drifted mid-frame in 2 of 12 | broadcast-safe in 12/12 |
| Non-Latin glyphs | correct | correct |

Read the two weaknesses side by side, because they are not the same kind of problem:

- **Lite's weakness is sameness.** Nine of twelve briefs - news, corporate, portrait, long-name,
  multiline, empty, non-Latin, high-contrast, election - resolved to `lt11`. The sports and
  entertainment briefs did get their own chassis (`lt05`, `lt15`) and both are good. This is the
  named failure "same layout, different colours", and it is exactly what `docs/ADAPT_FIRST_PLAN.md`
  retrieval exists to attack. It is a **quality ceiling on a working product**.
- **Pro's weakness is correctness.** Half its output is broken in a way the platform reports as
  success. That is not a ceiling; it is a floor problem.

On the evidence of this round, **Lite delivers a better graphic than Pro on 6 of 12 briefs, an
equal one on 5, and a worse one on at most 1** (`sports-live`, where the Pro *concept* is clearly
the best design in the round and the Pro *reconstruction* is the worst output in the round).

One fairness caveat, recorded rather than hidden: the hold frame is photographed after `play()`
only, so a Lite design that reveals its role line in a later step shows one line here. Two lt11
frames (`news-public`, `long-name`) show the name without the role for that reason. Neither is a
correctness failure, and neither changes the ranking.

---

## 6. Q2 - custom fields and a working state machine

Full write-up in **`MACHINE.md`**. In one paragraph:

**Custom DataFields: yes. A working state machine: no, in any tier.** The clock-plus-scoreboard
brief produced six correctly-typed generated fields and an operable control page - and zero
operator events. Pro cannot even be asked: `ProBrief` is `{brief, name, title, includeLogo}` and
its compiled graphic carries two text fields, one step and no machine (measured free off a
compiled artifact: `machine/pro-control-readout.news-public.json`). The free-form coder does mint
its own fields, but a machine cannot survive its pipeline: every emit is converted through
`importAnimData`, which returns `{version, root, speed, steps}` and contains the string "machine"
zero times. Teaching the model the format-2 shape in the brief changed nothing, and could not
have. **No generation path in the repo asks a model for a state machine** - the only mention
anywhere in `src/ai` is Lite's refusal code `advanced-state-machine`.

What the operator gets on `#/control/<id>` for a generated scoreboard: correct field inputs with
steppers, ▶ Play / ⟳ Update / » Next / ■ Stop - and no way to start the clock the model actually
wrote (`startMatchClock()` exists in the emitted JS and nothing can call it), no "Goal - home",
no "Next period".

---

## 7. Recommendation

**Park the reconstruction. Keep the concept. Build the machine seam instead.**

Three separate calls, because they have different answers:

### 7.1 Pro's reconstruction: PARK IT

Do not spend more on `interpret → compile` as an approach. The evidence is not "it needs tuning":

- Half the output is broken, and **broken in the one dimension the platform cannot measure**. The
  fix for that is either a clean-plate image-edit capability (a whole new paid modality) or a
  vision judge over the rendered frame (deferred elsewhere for calibration reasons, and it would
  add cost to a tier already 250x Lite's price). Neither is a tweak.
- The failures are not random: they are exactly the briefs whose designs are worth having.
  `sports-live` produced the best concept in the round and the worst graphic in the round, because
  a distinctive design is an angled, textured, layered one, and those are precisely what a
  rectangle-rebuilding compiler cannot reproduce or erase behind. **The better the concept, the
  worse the reconstruction.** That inverse relationship is fatal to the approach, not incidental.
- Meanwhile Lite - grounded, catalog-adapted, ~$0.0003 - delivered a usable graphic on 12 of 12 of
  the same briefs.

If Pro ships as it stands, the honest product statement is "pay 250x for a graphic that is worse
half the time", and users would be right to reject it.

### 7.2 The concept stage: KEEP IT, repurpose it

The image model's actual measured skill is real and worth something. It designs credible broadcast
graphics. What it cannot do is hand that design to a compiler.

Two uses that do not require reconstruction to work:

- **A concept as a REFERENCE, not a source.** The harness already reads uploaded images as a design
  system (`model/imagePurpose.ts` `mood` / `layout`). A generated concept fed back in as a `layout`
  reference to the ADAPT path would let Lite's chassis selection and `designAdjust` parameters be
  driven by a designed frame instead of a text brief - image-guided grounding rather than
  image-guided reconstruction. That attacks Lite's real weakness (9 of 12 briefs on one chassis)
  with Pro's real strength, and it costs one image call on top of a $0.0003 generation.
- **Concepts as catalog input.** The nightly-library goal wants a large free catalog. A designer
  reviewing generated concepts and rebuilding the good ones as real catalog chassis converts image
  spend into permanent, correct, adapt-first assets. The model is doing what it is good at
  (proposing designs) and a human is doing what the compiler cannot (building them properly).

### 7.3 The state machine seam: BUILD IT - and it is not a Pro feature

The most valuable finding of this round is not about Pro at all. The platform has a complete
state-machine engine, a node editor, a control-page generator, a hosted command log and a
production cockpit - **all of it reachable only by hand-editing**. Every AI tier produces a linear
play/next/stop graphic.

That is the gap between "make a graphic" and "run a show", which `docs/GOALS.md` names as the last
frontier. A small structured MACHINE stage - a forced-tool call emitting the graph as data, spliced
in deterministically by the platform exactly the way `designSpec` works today, validated by the
`validateMachine` that already exists - would serve Lite, custom and any future tier at once. It
needs no image model and no new modality.

### 7.4 Fixes worth landing regardless of the above

1. **`maxTokens: 12000` on the Pro interpretation call** (done in this branch). Sweep every other
   hand-set `maxTokens` for the same reasoning-token trap.
2. **Make `pro-bench.mjs` count interpretation cost** so `--max-cost` is a real ceiling.
3. **Correct `docs/NOACG_PRO_PLAN.md` §7a's cost figures**: interpretation is $0.009-0.011, not
   ~$0.002, so a generation is ~$0.077 and a FAILED generation still costs ~$0.077.
4. **Save the concept image on an interpretation failure.** Five paid images were destroyed by an
   early return that carried the cost number out but not the picture.

### 7.5 What this round did NOT establish

Stated plainly so nobody reads more into it than it earned:

- **Whether a model can author a valid state machine** is untested. The `taught` arm proves only
  that the pipeline discards one; it does not measure the model.
- **Whether an image model can design NON-lower-third graphics** is untested - the contract accepts
  only `lower-third`, so all twelve briefs were straps.
- **The route pinning was not re-examined.** `PRO_STANDARD_ROUTES` was used as pinned; no
  alternative image model was measured, so "a better image model would fix the reconstruction" is
  neither supported nor refuted. It would not change §7.1, because the failure is in the compiler's
  reach, not the concept's quality.
- **No vision judge was run**, so "usable" here is one person reading twelve frames.
