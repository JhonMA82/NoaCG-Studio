# Creative Mode - the frontier round, 2026-08-02

**Four of eight lower thirds from the staged CREATE path were judged usable.** No round before
this produced a usable graphic from the staged path at all.

Two platform bugs were found and fixed first. Both had been reported - by me - as evidence that
the model could not design.

## The two bugs, because they invalidate what came before

**1. The gateway refused structured output for being ENCODED, not wrong.** Anthropic tool use
returns a nested array as a JSON string, sometimes re-wrapping the whole tool envelope inside
the property (`{"concepts":"{\"concepts\":[…]}"}`). `schemaAccepts` saw a string where an array
belonged, called it `malformed_response`, retried to exhaustion. Seven of eight briefs died,
each with three usable design directions sitting in the rejected payload. Fixed by
`decodeStructuredOutput` running before validation (`api/_lib/aiGateway.ts`). **This broke every
user on their own Anthropic key, on every structured stage - it was never bench-only.**

**2. A style patch giving `.creative-box` `position: absolute` collapsed the root to 0x0.** The
root is absolutely positioned in its zone and sized by its content; the box is its only in-flow
child. Take the box out of flow and the root has nothing to size it. Sonnet did this in 8 of 8
stylesheets - blank frames. **qwen did it in 4 of 8 in the round the owner reviewed that same
evening**, where the content survived but re-anchored to the collapsed root and drifted to the
frame edge. The owner's own earlier note, "text far too close to the bottom edge", was this bug.
Fixed by `keepStructureInFlow` (`src/ai/creative/style.ts`).

**Every gate was green through both.** Structural completeness read 100% on runs whose frames
were empty, because a 0x0 box still contains its parts. The 2026-08-02 blind review's verdict -
reported here as a finding about the pipeline's design ability - was taken on frames of which
half carried bug 2, and the frames were on disk and unopened when that write-up was made.

## The round

`claude-sonnet-5`, arm C only, 8 lower thirds, **$0.7272**. Arm A stays on its frozen coder
route and is not re-run here.

| | qwen A (control) | qwen C | Sonnet C |
|---|---|---|---|
| engineering valid | 86% | 57% | **100%** |
| structurally complete | 43% | 86% | **100%** |
| style landed | - | 100% | 100% |
| concept diversity | - | 29% | 38% |
| repair rounds (8 briefs) | 3 | 10 | **1** |
| cost per attempt | $0.0076 | $0.0018 | $0.0732 |

Sonnet is ~40x the staged arm's price and needed one repair round across eight briefs to qwen's
ten.

## The human read

| # | brief | verdict |
|---|---|---|
| 1 | `lt-plain` | usable |
| 2 | `lt-plain-create` | usable |
| 3 | `lt-original-auto` | usable |
| 4 | `lt-explicit-adapt` | usable |
| 5 | `lt-busy-plate` | no - "text not on plate" |
| 6 | `lt-long-name-portrait` | no - "busy, not pretty" |
| 7 | `lt-mood-board` | no - "text overflows the plate" |
| 8 | `lt-three-line` | no - "too vertical, name should be on same row" |

**State the instrument honestly: this was an UNBLINDED read of one arm, not the blind pairwise
that decides the pilot.** The reviewer knew these were the frontier frames, there was no control
beside them, and the bar asked was "would you use it" rather than "which would you air". It
cannot be compared like-for-like with the 0-of-5 and 0-of-6 pairwise results. What it can carry
is the absolute claim, which is the one that matters here: four graphics the owner would use,
from a path that had produced none.

The blind pairwise on the same night's qwen round is still outstanding.

### The rejections are mostly ONE fault

Frames 5 and 7 are the same defect in different clothes: **the panel does not contain the words
it backs** - text hanging off the top of the plate in one, overflowing it in the other. Frame 8
is proportion (a stack where a row was wanted). Only frame 6 is taste with no mechanism behind
it.

That is the next platform floor, and it is the same blind-spot shape as every one before it:
`legibilityFloor` guarantees that a reading surface EXISTS ("a surface, or its own halo, never
neither"). It never asks whether the text is ON it. A panel painted beside the words satisfies
the floor exactly as well as a panel behind them, and the runtime bench measures overlap between
text boxes, not text against its own declared surface. Both rejected frames pass every check in
the repo.

## What this settles, and what it does not

**Settles:** the staged CREATE path can produce graphics the owner would use. Five rounds of
"the pipeline cannot design" were measuring a 3B-active model through a broken gateway and a
collapsing layout. The pipeline was never the only variable, and the model was never tested
until tonight.

**Does not settle:** cost. $0.073 a graphic against the cheap arm's $0.0018 is a fortieth of the
price for the difference between unusable and half usable, and the hosted tier's model policy is
cheap-routes-only. Whether that means Pro, BYO key, or a cheaper frontier route is a product
question this round does not answer.

**Does not settle:** whether qwen improves with the two fixes in place. Its round ran with both
and scored 57% engineering validity; its frames were correct, plain, and three of eight anchored
`bottom-center` and stopped reading as lower thirds. That gallery is unreviewed.

## Next

1. **The panel must contain its text.** Two of four rejections, deterministic, measurable in the
   runtime bench against the element the spec declared as the reading surface. Free.
2. **Derive `zone` from the category the way `fullFrame` already is.** A lower third that
   anchors bottom-centre has stopped being one; `templates/structuralAnchor.ts` already owns the
   coverage answer for the same reason. Free.
3. The blind qwen pairwise, when the owner gets to it.
4. Re-run Sonnet after 1 and 2 - the two fixes address half the rejections directly.

## Reproduction

```
node scripts/creative-pilot-bench.mjs --route=anthropic:claude-sonnet-5 \
  --arms=C --category=lower-third --out=<own dir> --max-cost=3.50
```

Artifacts: `C:\claude\noacg-bench-archive\creative-flow-2026-08-02\`.
