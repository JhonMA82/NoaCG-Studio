# ARCHITECTURE.md section 5 counts now carry their own grep

Section 5's grandfathered-offenders paragraph named three files by line number and by a count
that had drifted from the code in both directions: `CanvasInteraction.tsx` was listed at 13
inline `applyTemplate` sites when it has 5, and `StepTimeline.tsx` and `Inspector.tsx` were each
listed with one named line when they have 6 and 4. The paragraph also pointed at the two timeline
files as if they sat directly under `components/`; they now live under
`src/components/timeline/`.

## What changed

- `docs/ARCHITECTURE.md` §5: replaced the three line-number anchors with full paths, stated the
  counting rule once (`grep -c 'applyTemplate({ *\.\.\.template' <file>`), and recorded the
  current counts - 5, 6, 4. The `components/wizard/draft/` row, the one row that was already
  correct, is untouched.
- `docs/backlog/architecture-debt-rows-are-unverifiable.md`: added a "Fixed 2026-09-16" note
  pointing at the doc change and left the rest of the file in place as the record of how the
  numbers went wrong. Step 3 of its "What it would take" section - a build gate that fails when a
  recorded count drifts from the measured one - is still open; it was explicitly out of scope for
  this row (a gate lands alone) and is the one piece of follow-up work left.
- Deleted two spent handoffs whose work has landed: `2026-09-15-et-acceptance-bookkeeping-freshness.md`
  and `2026-09-16-hi-bind-all-by-title.md`. Grepped the whole repo for both filenames and titles
  before deleting; the only hit was a branch-name mention in
  `docs/work-specs/browser-holder-recovery/evidence/et-freshness.md`, which cites the branch, not
  the handoff file, so nothing needed repointing.

## Verification

Re-ran the grep this session used to write the numbers, against `src/components/canvas/CanvasInteraction.tsx`,
`src/components/timeline/StepTimeline.tsx`, and `src/components/timeline/Inspector.tsx`: 5, 6, 4 -
matches what is now written in §5.

`npm run build` (its own exit code, not a pipe's): exit 0. `check:contract-freshness` passed
(905 contract files). This is a docs-only change - no product code touched, so no e2e run and no
visual taste review; `docs/acceptance/owner-queue/` gets no new item because nothing here is
observable in the product.

## Check

- `review: delegated` (0 findings; scope matched exactly - same 2 modified + 2 deleted files the
  review reported reading, against the same merge base).
- `simplify: inline` (the skill returned its standard 4-agent fan-out instructions, which counts
  as not run per the check workflow; done by hand instead - a five-line prose diff across two
  markdown files gave nothing to simplify on any of the four angles).
- `verify: inline` (`npm run build`, exit 0).
- `taste: not applicable` - nothing in this change can move what a graphic looks like.
- Stamp: `7b37305b` PASS.

## Pointer

Branch: `claude/qi-architecture-counts-with-their-grep`. Merge base: `16ed46e9`. Single commit
`7b37305b`.
