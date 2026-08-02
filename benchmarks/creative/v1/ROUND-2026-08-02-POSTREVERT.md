# Creative Mode - the post-revert lower-third round, 2026-08-02

One paid round, **$0.0974**, arms A/C/D over the eight lower-third briefs, run to answer a
question the previous round could not: **do the platform fixes that landed after the human
review change the human verdict?** They had never been judged by eye - only by gates and by
recompiling archived specs.

## The prerequisite nobody had noticed

`225a894` shipped the proportion vocabulary as a deliberately reversible experiment. The
falsification round rejected it and `8cc873d` recorded the rejection - **in the document only.
The code stayed in.** Every generation from `225a894` onward, including anything that would
have been reviewed as "the platform fixes", was running the design the evidence had already
closed: engineering validity 63% -> 38%, one frame a single letter per line off the edge.

Reverted in `21ccf2f` before this round, so the numbers below measure the scaffold's own air.
The revert is the reason this round is worth anything; run without it, the $0.10 would have
re-measured a known-bad state and called it a successor.

## The gates

Against `lt3`, the round the reviewer last judged:

| | lt3 | this round |
|---|---|---|
| C engineering valid | 63% | 50% |
| C structurally complete | 63% | **100%** |
| C style landed | 75% | 63% |
| C concept diversity | 88% | 63% |
| D engineering valid | 13% | 38% |
| A engineering valid | - | 100% |
| A structurally complete | - | **13%** |

Not single-variable: the vocabulary removal arrives together with everything else that landed
after `lt3`. Read it as the current state, not as one change's effect.

**Every staged invalid in this round is `bench-overflow` + `bench-stress`.** No other
engineering fault appears anywhere in arms C or D. Content escaping its box is the last one
standing - and it is the capacity half of the proportion family the reviewer named, arriving
as a measurable rather than an opinion.

**The control inverts that:** arm A writes valid code on 8 of 8 and fails the structural check
on 7 of 8. It produces graphics that run and do not carry the fields they were asked for.

## The human read - blind pairwise, 17 items, same reviewer and rig

| | previous round | this round |
|---|---|---|
| neither arm airable | 11 of 16 | **10 of 16** |
| decisive pairs | 5 | 6 |
| staged wins (C or D over A) | 0 of 5 | **0 of 6** |
| test-retest repeat | consistent | **consistent** |

**The verdict did not move.** One pair's difference across sixteen is noise, the staged arms
won nothing again, and the reviewer's repeat agreed with itself again. Six platform fixes plus
the removal of a bad one changed nothing a person can see.

### The new finding: the control's airability is not stable

The control is FROZEN - same arm, same route, same briefs, nothing about it changed between
the rounds. Its airable set did:

| round | briefs where the control was airable |
|---|---|
| previous | `lt-plain`, `lt-plain-create`, `lt-mood-board` |
| this round | `lt-plain`, `lt-busy-plate`, `lt-three-line` |

One brief in common. Two frames previously judged airable are no longer, and two previously
not are now. Nothing changed except the generation.

That weakens a conclusion the previous report leaned on. "The control is usable on its three
easiest briefs" read as a property of those briefs; at n=3 per round with two-thirds turnover,
it is better read as **the control airs roughly three briefs out of eight and which three is
a coin flip.** The staged arms' 0 is not being measured against a reliable alternative - it is
being measured against something that succeeds occasionally and unpredictably.

It also puts a floor under how much any future round can prove: with 6 decisive pairs of 16
and the decisive set itself moving between runs, a single round cannot separate a real
improvement from a re-roll. The plan's 20-joined-item minimum is not bureaucratic here.

## What this settles

1. **The vocabulary revert is confirmed as correct and is not itself an improvement.** Validity
   recovered (D 13% -> 38%) and the human verdict did not move. Removing a bad change restored
   a state that was already not good enough.
2. **Correctness work is exhausted as a lever.** This is the fifth round in which every measured
   fault fixed was a correctness fault and the frames stayed unairable. The remaining engineering
   fault is overflow, which is capacity, which is proportion.
3. **Platform-derived proportion is now the only untested mechanism** with evidence pointing at
   it: overflow is the one fault left, and overflow is what a content-derived air computation
   is for. It asks the model for nothing, so the §4 anti-anchoring question still does not bear
   on it.
4. **The ADAPT-plus-reference position is closer than it was.** If the control airs three of
   eight at random and the staged path airs none, "CREATE's quality answer is ADAPT plus the
   user's own reference" is not a retreat from a working alternative - there is no working
   alternative in this bank.

## Reproduction

```
node scripts/creative-pilot-bench.mjs --route=openrouter:qwen/qwen3-30b-a3b-instruct-2507 \
  --coder-route=openrouter:qwen/qwen3-coder-next \
  --critique-route=openrouter:google/gemini-2.5-flash \
  --arms=A,C,D --category=lower-third --out=<own dir> --max-cost=0.35
node scripts/creative-gallery.mjs <out dir>
node scripts/creative-review-report.mjs creative-gallery
```

Artifacts: `C:\claude\noacg-bench-archive\creative-postrevert-2026-08-02\`.
