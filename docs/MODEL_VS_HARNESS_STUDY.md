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

| item | estimate | actual |
| --- | --- | --- |
| probe (both routes, tiny) | ~$0.03 | _pending_ |
| bare-open + harness-open (12 gens) | ~$0.25 | _pending_ |
| bare-frontier (6 gens) | ~$0.6 | _pending_ |
| harness-frontier (6 gens) | ~$1.5 | _pending_ |
| reasoning capture (1 call) | ~$0.3 | _pending_ |
| **total (ceiling $4)** | **~$2.7** | _pending_ |

Actual spend is recorded here and in `docs/AI_ATTEMPTS.md` when the round completes.

## 5. Outcome

_Pending the owner's ballot._ The gallery is built blind; the ballot comes back as
`mvh-ballot.jsonl`; `--verdict` prints the readings; the outcome lands here and in
`docs/AI_ATTEMPTS.md`, with the consequence for Lite and Pro spelled out against §7's four
readings.

## 6. The frontier reasoning transcript, decomposed into stages

_Pending the capture._ The owner's separate ask: one frontier call narrates its complete
design process for one creative brief (`--reasoning`, transcript in the round's out-dir and
excerpted here), then the discrete decisions and their ORDER are listed, and each is judged
against `docs/DESIGN_PRINCIPLES.md`'s ranking - remove the decision > measure > boundary >
judgement. A decision becomes a proposed harness STAGE only where the platform can RUN it
(level 1-3); a decision only expressible as prose taste stays a note, because prose has now
twice been measured to move nothing.

## Appendix: the footage bed

Built 2026-08-15 from `example-lowerthirds/lower-third-showreel.mp4` (licensed pack content -
the bed never enters the repo). Three graphic-free frames (pagoda 157.90s, coastal dusk
153.55s, balloon sky 109.55s), each with the reel's tiny transition overlay removed
(`delogo`), letterbox cropped (`crop=1568:882:176:98` inside the detected `1920:882:0:98`
active area), scaled to 1920x1080, and given a slow push (`zoompan` to 1.06x over 4 s at
30 fps); the three shots hard-cut into one 12 s loop, encoded VP9
(`-c:v libvpx-vp9 -crf 30`). Playwright's Chromium carries no H.264, hence webm.
