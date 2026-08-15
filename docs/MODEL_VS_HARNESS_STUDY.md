# The model-vs-harness study

The experiment `docs/LOWER_THIRDS_REFERENCE_CORPUS.md` §7 designed and nobody had run: a
blind, identically-rendered four-arm gallery that separates "our checkpoint is too weak" from
"our harness selects for plainness". Runner: `scripts/model-vs-harness.mjs`. Spend authorized
2026-08-15, up to $4.

**Why now.** Both tiers failed in the same week for opposite reasons: Lite's cheap model lost
the blind value gate to a human with ten minutes (`docs/AI_LITE_BRAND_PLAN.md` §2.2), while
Pro's model output was judged good and the platform's reconstruction wrecked it
(`docs/NOACG_PRO_PLAN.md` §16). Until this experiment runs, every further hour on Lite or Pro
is spent without knowing whether a better model, a different harness, or neither is the fix.

## 1. The four arms

Exactly §7's 2x2, same briefs in every cell:

| | bare prompt, no harness | full NoaCG harness |
| --- | --- | --- |
| **frontier** | A (`bare-frontier`) | D (`harness-frontier`) |
| **open** | B (`bare-open`) | C (`harness-open`) |

- **Bare** is the product's own harness-off baseline: `RAW_SYSTEM` (`src/ai/claudeProvider.ts`,
  the exact prompt `generateRaw` serves - format basics so the result runs in playout, no
  taste teaching, no worked example), plus the brief and the f0/f1 field contract. One call,
  no repair loop, no region conversion - the emit renders verbatim. The field contract is
  stated because §7 requires all four arms to run under the SPX contract; without it the arm's
  output could not be rendered or driven at all, and the experiment would measure the viewing
  conditions.
- **Harness** is `runSpikeBrief`'s exemplar arm (`src/ai/spike/run.ts`): the shipped coder
  contract around the neutral skeleton, retrieval exemplars, deterministic grounding
  (`convertEmittedRegion`), the two-round repair loop and `productionSpxValidator` - the
  configuration every Pro Phase 0/1 round measures, and the one §6 of the corpus doc suspects
  of selecting for plainness.
- **Checkpoints:** open = `alibaba/qwen3-coder` (the ratified Pro checkpoint); frontier =
  `anthropic/claude-sonnet-5` (the one frontier arm on record, 2026-08-02). Both through the
  managed gateway, both proven by a real call before the round (`--probe`) - a curated model
  id that merely appears in a listing has 404ed before (`src/ai/AGENTS.md`).
- **Decoding** is pinned for all four arms: `benchmarks/pro/v1/spike/decoding.json`.
- **Briefs:** six from the Pro bank, no-logo ones only (this round carries no brand, and a
  broken-image mark would dominate the read with a defect class the mark contract already
  owns): `news-public`, `sports-live`, `entertainment`, `minimalist`, `long-name`,
  `multiline-title`.

## 2. The confound control

§7 names it: a graphic asked for in chat is judged as a picture - alone, at browser size, on
a background of its own choosing, with a short pleasant name. Ours is judged over live
footage, at broadcast distance, with real name lengths, under an SPX field contract. So all
four arms are rendered and shown IDENTICALLY:

- One capture rig for every item - `scripts/ai-lite-capture.mjs`, the same lifecycle loop the
  value gate used, filming entrance/hold/update/exit stills and a real-time clip at 1920x1080.
- One FOOTAGE BED behind every item: real graded broadcast-reel frames (three shots, slow
  push-in, hard cuts), identical for all 24 items. The reel's own graphics never leave a clean
  multi-second window, so the bed is built from clean frames with a synthetic push rather than
  a live clip - a compromise, recorded here; what the experiment needs is that it is REAL
  footage texture and IDENTICAL across arms, and it is both. Build commands are in this doc's
  appendix; the bed file rides in the round's out-dir, never the repo (licensed source).
- One data instrument: the brief's own names first, then the shared longer copy
  (`UPDATE_COPY`) swapped mid-clip - the same real-name-length test every Lite round uses.
- The blind sheet shuffles all items flat with neutral ids; the key joins them back only
  after the ballot (`mvh-key.json`, never opened before the verdict - a previous round was
  spoiled exactly that way).

A generation that crashes or fails to render stays IN the gallery as a "failed to render"
card: that is what an operator would have received, and hiding it would flatter the arm that
produced it.

## 3. The predeclared readings

Operationalized before the ballot exists; `--verdict` applies them mechanically and the
self-test in `--dry` pins them. Per brief with all four arms judged, arms compare by the
ballot's 1-5 quality score, strictly. For a pair (X, Y) with strict wins `wx`, `wy` over
`judged` briefs:

- **X >> Y** when `wx > judged/2` and `wy <= 1`
- **X ≈ Y** when `|wx - wy| <= 1`
- otherwise a **lean** - directional, not decisive; the honest answer is "run more briefs".

§7's four stated readings, verbatim, with their consequences:

- **A >> B** - it is the checkpoint. Route quality-critical work to frontier and price it.
- **A ≈ B** - it is not the checkpoint, and no model swap fixes anything.
- **A >> D** - it is the harness: the same model gets worse when constrained. Then the work
  is one ablation at a time, finding which constraint costs the most.
- **A ≈ D** - there is no gap, and the difference is the judging context.

Secondary reads (reported, not primary): C vs B (what the harness does to the open model -
the Lite-relevant cell), D vs C (the checkpoint question inside the harness), and per-arm
air rates.

## 4. Cost and record

**RAN 2026-08-15.** 24 of 24 generations captured, zero generation failures, one repair
round total (`long-name.harness-frontier`). The gateway reports **no cost at all for
anthropic routes** (a served call comes back $0.0000 - measured by `--probe`), so every
frontier row's cost is ESTIMATED locally at $3/$15 per Mtok and labeled `costSource:
"estimated"` in the ledger; open-route rows are gateway-reported.

| item | estimate | actual |
| --- | --- | --- |
| probes (2 runs, both routes) | ~$0.03 | ~$0.05 |
| bare-open (6 gens) | ~$0.05 | $0.010 |
| harness-open (6 gens) | ~$0.2 | $0.105 |
| bare-frontier (6 gens) | ~$0.6 | $0.256 (est) |
| harness-frontier (6 gens) | ~$1.5 | $2.068 (est) |
| reasoning capture (1 call, 13,558 out) | ~$0.3 | $0.206 (est) |
| **total (ceiling $4)** | **~$2.7** | **~$2.70** |

Archive: `C:\claude\noacg-lite-eval-archive\model-vs-harness-2026-08-15` (395 files,
copy verified). The out-dir is gitignored and dies with the worktree; the archive does not.

## 5. Outcome

_Pending the owner's ballot._ The blind sheet is `mvh-review.html` in the round's out-dir
(and the archive); the ballot comes back as `mvh-ballot.jsonl`; `--verdict` prints the
readings; the outcome lands here and in `docs/AI_ATTEMPTS.md`, with the consequence for
Lite and Pro spelled out against §7's four readings.

What the machine half already says (no visual claim in it): both harness arms came back
6/6 validation-clean with 6/6 editable timelines - including the frontier model, where
qwen's grammar-lesson rounds sat at 0-1/12, so the exemplar block converts the frontier
checkpoint's regions too. Both bare arms are 0/6 against the house editability contracts,
by construction: a bare emit follows no `:root` contract and no NOACG_ANIM region. That is
the product trade the gallery prices: the bare arms are what the graphic LOOKS like
unconstrained, the harness arms are what survives being editable, brandable and exportable.
One bare-frontier item never settles (an idle pulse loop) - recorded, captured honestly.

## 6. The frontier reasoning transcript, decomposed into stages

**CAPTURED 2026-08-15**: `claude-sonnet-5` on the `entertainment` brief, asked to narrate
its complete design process before the code (`reasoning-entertainment.md` in the round's
out-dir and the archive). It produced 14 numbered decisions in a stable order:

1. Resolve the brief's tone CONFLICT by assigning each adjective a carrier channel
   (playful → colour + shape; premium → motion + material) - and it states this split
   "governs every later choice".
2. Treat the two fields as UNEQUAL SHAPES, not two lines in one box - the role becomes a
   pill kicker overlapping a large-radius bar. This is the DEVICE - the per-design idea
   §6 of the corpus doc says our geometry instruments cannot see.
3. Reject one shape option to make the geometry a SYSTEM (full pill "too soft"; radius
   contrast rectangle-vs-pill "reads as intent").
4. Palette anchored dark where text sits; ONE brightest element (name white, kicker warm
   cream "so the two lines don't compete for brightest element").
5. A single continuous-motion budget: exactly one element may move on the hold (the
   accent pulse), "everything else is static once settled".
6. Material language (glass chip) ties the playful shape to the premium half.
7. A one-time entrance-only sheen - premium without ongoing clutter.
8. Typography compensates for fallback fonts with weight and tracking.
9. Long-text safety as a per-field auto-fit with explicit floors, run on every update().
10. The panel hugs content with a hard cap.
11. Broadcast-safe placement, right two-thirds deliberately left free.
12. Motion mechanics: reveal by clip-path (never scale - "scaling would squash the text"),
    staggered kicker, exit faster than entrance.
13. Operator semantics: next() becomes a re-cue attention bump.
14. Robustness: try/catch update, CSS-hidden initial state.

**The order is the finding.** The device decision (2-3) is made SECOND, right after brief
interpretation, and everything downstream - palette, motion budget, materials - serves it.
Our harness teaches contracts and taste criteria but never requires a device decision to
EXIST, and the safe answer to every contract is a correct plain panel - the §6 selection
effect. Decisions 9, 10, 11, 14 are things our platform or house contracts already own or
enforce: the frontier model spent tokens reinventing them, which is exactly the half a
harness SHOULD carry so the model's budget goes to 1-8.

Proposed stages, ranked by `docs/DESIGN_PRINCIPLES.md` (remove the decision > measure >
boundary > judgement). A stage is something the platform RUNS, not a prompt line asking
for the behaviour:

- **Remove the decision (level 1):**
  - The platform injects the proven AUTO-FIT (decision 9) into custom-path emits and the
    prompt stops asking for one - the model's hand-rolled fitters are the buggiest part of
    every bare emit, and the wizard already owns a correct one (`textFit`).
  - The platform SEATS placement (decision 11) on the custom path the way `fillBrandMark`
    seats a mark - zone and safe-area become platform writes, not model CSS.
- **Measure (level 2):**
  - DEVICE-EXISTS proxy (decisions 2-3): on the rendered frame, the two text containers'
    geometry must be DISTINGUISHABLE (shape, radius, fill or axis - not only font size).
    Reported per generation like the spacing instruments; a plain box scores 0 and that
    becomes visible instead of silently passing every gate.
  - ONE-BRIGHTEST-ELEMENT (decision 4): luminance ordering of painted text - the primary
    field's ink is the brightest text in the graphic, once.
  - IDLE-MOTION BUDGET (decision 5): the settle detector already finds idle loops; count
    independently-animating elements on the hold and report >1.
  - EXIT FASTER THAN ENTRANCE (decision 12): read both durations off the converted
    timeline; report inversions.
- **Boundary (level 3):**
  - Text-bearing elements never reveal by scale - clip/mask/slide only (decision 12's
    "squashed text", already half-present as the skew/rotation rule).
- **Stage the SEQUENCE itself:** force the device decision to exist as structured output
  BEFORE code (a `device` field naming the shape system and which container carries it),
  then check the emit against the level-2 device proxy. This is the piece a cheap model
  can be forced through: the point is not that qwen will invent sonnet's pill kicker, it
  is that "no device" stops being a silent default and becomes a visible, rejectable
  answer.
- **Stays prose (level 4 - deliberately NOT proposed as stages):** the tone-conflict
  channel split (1), material language (6), typography compensation (8). Prose taste has
  twice been measured to move nothing; these wait until the ballot says whether the
  harness suppresses what they produce.

None of this ships from this study: it is the ablation menu for the `A >> D` reading. If
the ballot reads `A ≈ B` instead, the checkpoint is not the bottleneck and the device
stage is the first experiment for the OPEN model inside the harness.

## Appendix: the footage bed

Built 2026-08-15 from `example-lowerthirds/lower-third-showreel.mp4` (licensed pack content -
the bed never enters the repo). Three graphic-free frames (pagoda 157.90s, coastal dusk
153.55s, balloon sky 109.55s), each with the reel's tiny transition overlay removed
(`delogo`), letterbox cropped (`crop=1568:882:176:98` inside the detected `1920:882:0:98`
active area), scaled to 1920x1080, and given a slow push (`zoompan` to 1.06x over 4 s at
30 fps); the three shots hard-cut into one 12 s loop, encoded VP9
(`-c:v libvpx-vp9 -crf 30`). Playwright's Chromium carries no H.264, hence webm.
