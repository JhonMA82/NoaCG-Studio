# The bench reports one layout defect once per press, and the arrow walk tripled that

**Filed:** 2026-09-15. **Source:** code review of `claude/hc-bench-event-cap`, finding 4 of 7

## Why

`overlapIssues` and `overflowIssues` run once per measured frame and nothing collapses a defect
that appears in several of them. Because every arrow press now snaps the machine and replays the
main group's canonical route, the default-path elements are back on screen for every press - so a
single overlap between two default-path elements yields one finding per arrow. The arrow walk took
the worst case from 8 copies to 24 (`MAX_BENCH_ARROWS`), and the settled and stress phases add
their own.

It is a report-noise defect, not a correctness one, and it is bounded on the path that pays for
it: `normalizeFindings` (`src/ai/pro/harness/findings.ts`) drops duplicates by
`source:code:frame:locus` and caps each round at 16 blocking and 8 advisory, so a model never sees
the pile. What does see it is `noacg validate`'s own report, which an agent and a person read.

## What it is not

Not "dedupe the branch findings". The phase words are load-bearing - they say WHICH press produced
the pose, which is the diagnosis, and `e2e/lite-field-paint.spec.ts` reads them back as the only
honest record of what the bench pressed. A collapse has to keep every phase it merged, something
like *"... after the "plus1" event from flash/none (and in 21 other presses: ...)"*.

## Why it was not fixed with the arrow walk

The fix is a finding-collapse policy for the WHOLE bench - the settled and stress phases repeat
the same way, and a policy invented for one phase would be the wrong shape for the others. That
ripples well past the branch that noticed it, which is the line `.agent-workflows/check.md` draws
between an edit and a report.

## Where to start

`src/validation/runtimeBench.ts`: the three `issue(...)` sites in `overlapIssues` /
`overflowIssues` / `occlusionIssues` and every caller that remaps their rule. A collapse keyed on
`(rule, labelFor(a), labelFor(b))` with the phase list appended is the obvious shape; check it
against `e2e/lite-field-paint.spec.ts`'s phase-set assertions, which are the closest thing to a
specification of what the phase words are for.
