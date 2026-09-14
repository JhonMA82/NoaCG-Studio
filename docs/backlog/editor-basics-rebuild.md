---
v: 2
source: owner
kind: ask
raised: 2026-09-14
state: advanced
note: Concrete rebuild plan delivered; baseline walk and product implementation remain unstarted.
asked: "Paraphrase: create a plan to rebuild our editor using the OGraf Studio research because basic animation and keyframe editing do not feel good enough, then implement it."
serves: P7
size: large
needs-owner: none
---

# Make the basic graphic editor dependable and pleasant

**Filed:** 2026-09-14. **Source:** owner's direct editor-quality feedback in the research task.

## Why

Implemented features and advertised keyframe support have not produced an acceptable editing
experience. The owner's request is to improve the basics using Studio as the reference, not
add another inventory of capabilities or wait for the full-stack renderer programme.

## What it would take

Execute [EDITOR_REBUILD_PLAN.md](../EDITOR_REBUILD_PLAN.md) in order: reproduce the current
tasks and reference experience, establish shared interaction/transaction semantics, ship a
complete basic editing slice, improve timing/easing, prove broadcast lifecycle and loops,
then adopt the accepted surface and remove replaced code. Keep canonical readable source.
Existing property tracks are implementation foundations to verify, not a missing feature.

## Acceptance

The plan defines the exact lower-third/SVG task, interaction rules, source/runtime parity,
visual review, performance targets and first-time-user walks. A green build does not satisfy
the ask. New product flows require mapped browser tests and individual human acceptance routes.
No Studio source is selected for copying; direct reuse requires an exact-file licence review.

## Evidence

[Primary source research](../OGRAF_STUDIO_RESEARCH.md),
[new implementation plan](../EDITOR_REBUILD_PLAN.md),
[previous failure analysis](../WYSIWYG_PLAN.md).
