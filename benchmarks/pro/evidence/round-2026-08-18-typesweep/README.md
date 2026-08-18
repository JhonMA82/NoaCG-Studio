# The custom-lane TYPE SWEEP - 2026-08-18

**No verdict is written here or anywhere in this folder.** The owner's blind read of the
49-item page is the verdict, and it had not happened when this was written.

## What was run

The iterate loop (src/ai/spike/iterate.ts + scripts/pro-iterate-spike.mjs - render, measure
every instrument, feed the findings back, max 4 iterations, `deliverable: false` first-class)
over SEVEN graphic types: lower-third, scoreboard, quiz-board, ticker, full-screen stat panel,
countdown, podium-score. 21 fresh briefs (benchmarks/pro/v1/custom/briefs.json, 3 per type),
six synthetic brands (benchmarks/pro/v1/custom/brands.json - the shipped four plus Pulse Arena
and Boreal, both new), pinned decoding, the same §21 protocol per cell.

    node scripts/pro-iterate-spike.mjs --generate --route=vercel:minimax/minimax-m2.7 \
      --no-vision --max-cost=2.00 --max-iterations=4 \
      --bank=benchmarks/pro/v1/custom/briefs.json --brands=benchmarks/pro/v1/custom/brands.json \
      --out=pro-iterate-out-minimax-m2.7-types
    node scripts/pro-iterate-spike.mjs --generate --route=vercel:google/gemini-3.7-flash \
      --max-cost=7.00 --max-iterations=4 [same bank/brands] \
      --out=pro-iterate-out-gemini-3.7-flash-types

Four instruments the §21.2 read asked for ran for the first time, all composed BEFORE the
paid rounds and proven on the free control (mutation checks + a known-good catalog cell per
type + a readability calibration against three shipped designs):

- **fieldPaints in the loop's validator** where its one-state read is the whole answer, and a
  sentinel step-walk for steppers and transform fields.
- **A readability floor** (18px painted supporting text at 1080p, 3:1 text/surface contrast),
  recalibrated DOWN from 22px on its first control run because lt27 ships a 20px line.
- **Step capture**: next() driven along the declared default path, each settled frame shot.
- **Per-type instrument thresholds** (PRO_GRAPHICS' own for countdown), with spacing and
  proportion findings on the five uncalibrated types fed as ADVISORY, never blocking.

The state-machine rule held throughout (owner 2026-08-17): the platform authors machines, the
model implements `window.next()` along a declared step order - no machine key was asked for
or emitted.

## What it produced (counts only - `machine-columns.md` has the full table)

- minimax-m2.7, findings-only: 21/21 cells, 10 delivered clean, $0.0328/graphic.
- gemini-3.7-flash, vision: 21/21 cells, 14 delivered clean, $0.1712/graphic.
- Both models: scoreboards 3/3 and stat panels 3/3 clean; podium 1/3 and 1/3; the models
  separate on tickers (0/3 vs 2/3) and countdowns (2/3 vs 3/3).
- **Control-drive proof through the SHIPPED control page** (scripts/custom-lane-drive-spike.mjs,
  drive-report.json in each out-dir): 5 of 6 quiz + scoreboard cells drivable in BOTH rounds -
  every scoreboard took two score bumps and a clock write through the panel's own Update, and
  the quizzes advanced their reveal walk on the panel's Next. The one refusal both rounds is
  qz-campus, whose next() genuinely does not advance the frame.
- One harness lesson recorded rather than hidden: the runner's step capture treated `next()`
  returning undefined as "does not advance", and the drive proof showed two quiz cells
  advancing the frame while returning nothing - a hand-written next() that does its work and
  returns no timeline. The step FRAMES were backfilled by pressing regardless of the return
  value (scripts/typesweep-stepframes-spike.mjs); the recorded findings stand as the loop saw
  them.

## Where the artifacts are

The out-dirs, the drive reports and the 49-item blind page (both rounds + one catalog anchor
per type through its real create(), per-type sections, hold + stress + step frames,
interleaved ids, no provenance shown) are archived outside the repo:

    C:/claude/noacg-lite-eval-archive/typesweep-{minimax,gemini,anchors,blind}-2026-08-18

`notes.md` beside this file is the blind-notes template - write notes against
`review.html` BEFORE generating `key.html` with `--reveal`.
