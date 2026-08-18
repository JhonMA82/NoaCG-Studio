# Vision-critic calibration - binary rubric vs the owner's 49 blind verdicts

Run 2026-08-18, `vercel:google/gemini-3.7-flash`, 49 of 49 items judged, $0.247 spent (`scripts/design-rules-critic-calibrate.mjs`). Ground truth = the defect classes the owner's own notes name per item (the table in the script, disputable line by line).

| question | truth n | TP | FP | FN | precision | recall | verdict |
|---|---|---|---|---|---|---|---|
| lineOnText | 5 | 4 | 0 | 1 | 100% | 80% | WIRE (advisory) |
| logoBroken | 12 | 3 | 1 | 9 | 75% | 25% | WIRE (advisory) |
| tooSmall | 5 | 3 | 6 | 2 | 33% | 60% | stays out |
| textCutOff | 6 | 6 | 10 | 0 | 38% | 100% | stays out |
| emptyBroken | 4 | 4 | 2 | 0 | 67% | 100% | stays out |
| boxMisaligned | 3 | 1 | 5 | 2 | 17% | 33% | stays out |
| lowContrast | 2 | 1 | 6 | 1 | 14% | 50% | stays out |

False positives / misses per question (dispute against the frames):

- lineOnText: FP none · missed X-11
- logoBroken: FP X-20 · missed X-14, X-17, X-28, X-32, X-33, X-36, X-37, X-39, X-42
- tooSmall: FP X-01, X-06, X-10, X-34, X-35, X-47 · missed X-38, X-41
- textCutOff: FP X-09, X-21, X-23, X-32, X-33, X-34, X-36, X-42, X-45, X-47 · missed none
- emptyBroken: FP X-20, X-24 · missed none
- boxMisaligned: FP X-01, X-02, X-03, X-26, X-41 · missed X-09, X-45
- lowContrast: FP X-01, X-02, X-06, X-30, X-36, X-38 · missed X-21

The wiring rule (docs/DESIGN_RULES_PLAN.md §4): only strong-precision questions enter the
loop, as ADVISORY, and a question at chance stays out.

## The wiring decision

- **WIRED: `lineOnText`** (100% precision, 80% recall) - into the iterate loop as an ADVISORY
  finding on each round's hold frame (`--critic=lineOnText`, the default). Stated honestly: the
  deterministic `text-over-rule` blocker caught 7 owner-failed cells with zero false positives
  in the same audit, so the critic is a second opinion on the one class it is proven on, never
  the gate.
- **SKIPPED: `logoBroken`** despite 75% precision - 25% recall, and the R3 round runs no
  model-placed logos, so there is nothing for it to judge; re-audition when marks return.
- **SKIPPED at/near chance: `tooSmall` (33%), `textCutOff` (38%), `emptyBroken` (67%,
  4-item base), `boxMisaligned` (17%), `lowContrast` (14%)** - the Lite-judge lesson repeats
  on subjective-adjacent questions; the deterministic instruments own these classes.
