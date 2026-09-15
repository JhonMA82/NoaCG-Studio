# Rebuild the basic graphic editor around a dependable animation workflow

**Implementation plan, 2026-09-14. Requested by the owner after the Studio research.**
The immediate deliverable of this task is this plan. Product implementation has not started.
The owner rejects the current editor's practical quality despite its advertised capabilities.
That is the problem to solve. This is the next editor design direction within P7, not another
claim that the existing editor is complete or a commitment to rebuild the renderer.

## 1. Decision and outcome

**Owner clarification, 2026-09-15: Zero Density's OGraf Studio is the editor NoaCG must
match or beat, not merely an architectural reference.** Match or exceed its basic editing
quality: selection, canvas manipulation, property editing, keyframes, easing, timeline
navigation, responsiveness and visual polish. Beat it on NoaCG's core workflow: taking
imported artwork through editable fields, animation and behaviour into reliable production
with less friction. Being better than NoaCG's old editor is not sufficient. These are
completion requirements, not claims that either comparison has already been won.

Rebuild the editing experience around the proven visual conventions in Zero Density OGraf
Studio: a clear layer hierarchy, a stable canvas, a property inspector and a usable property
timeline. Keep NoaCG's readable source and runtime contracts underneath. Reuse existing engine
pieces only where they pass the new behavioural and visual tests; existing code is not an
acceptance criterion. Replacing interaction components is explicitly in scope.

The first deliverable is a complete, pleasant basic animation task: open a graphic, select a
layer, change its position, animate its entrance, adjust opacity independently, change timing
and easing, scrub it, undo, save, reopen and play the exported result. This must work equally
for a generated lower third and a supported imported SVG. A user must not need the state graph,
code editor or knowledge of the runtime to do it.

We are recreating Studio's useful behaviour and interaction structure, not importing its whole
application. The [pinned research](OGRAF_STUDIO_RESEARCH.md) records its AGPL-3.0-only packages,
embedded runtime and dependency caveats. No source code or assets are selected for copying in
this plan. A future exact-file reuse proposal must separately identify licence, notices,
dependency closure and emitted-output implications. The reference is Zero Density Studio;
Eyevinn remains the smaller secondary example.

### Use the open source implementation directly as evidence

[Zero Density OGraf Studio](https://github.com/zerodensity/ograf-studio) is open source.
Implementers must inspect how the relevant feature actually works before designing its
NoaCG counterpart. Do not guess from screenshots or recreate solved interaction mechanics
without reading the implementation. The pinned source inventory in the research report is
the starting point; record the exact upstream revision used for each implementation phase.

For selection, canvas handles, inspector/key creation, timeline gestures, easing, playback
and save/reopen, trace the UI event through the source mutation and preview/runtime update.
Read the associated tests and try the interaction in the reference editor. Each phase's
receipt must name the source files inspected, the behaviour to reproduce, what NoaCG reuses
or adapts, and any deliberate difference with its user-facing reason. Source availability
is a practical implementation resource throughout the rebuild, not just background research.
Inspecting and learning from it needs no further owner approval. Actual code reuse follows
the exact-file licence/dependency review above; that review does not block source inspection.

## 2. What the evidence says, and what it does not

Owner evidence, 2026-09-14: changing animations and using the keyframe timeline does not feel
good enough. This is a usability rejection, not a reproduced defect with a known cause.
The source was inspected at the research branch after `82614360`; no new browser observation
or performance measurement is claimed here. Phase 0 reproduces the actual editing tasks
before attributing failures or changing implementation.

| Area | Current source evidence | Rebuild implication |
|---|---|---|
| Property tracks | `src/blocks/animData.ts` already stores property-specific keys, incoming ease, per-track loops and step-local clocks | Do not invent independent tracks as a missing primitive; prove the existing representation can carry the chosen interactions |
| Timeline | `src/components/timeline/StepTimeline.tsx` already expands property rows and implements selection, zoom and scrubbing | Inspect discoverability, target size and feedback; replace interaction code where necessary |
| Inspector | `src/components/timeline/Inspector.tsx` distinguishes property/style/animation editing and derives armed properties | Make it obvious whether a change edits layout or animation; eliminate inconsistent gesture rules |
| Canvas | Existing interaction contracts distinguish root placement, placed artwork and animated layer manipulation | Users should understand the operation before dragging; do not make them infer it from element type |
| Source edits | `animEdit.ts`, `animEval.ts`, `timelineLens.ts` already provide useful transformation/evaluation seams | Consolidate on these seams and fix mismatches; do not create another authoritative scene |
| Preview | `PlayoutSimulator.tsx` owns real runtime scrubbing, lifecycle and settling | Diagnose rebuild/seek races and stale overlays before declaring an interaction reliable |
| Older completion claims | Timeline v2 is marked complete; WYSIWYG attempt one has a documented failure analysis | Preserve implementation history but stop treating it as proof of a satisfactory product |

The [previous failure analysis](WYSIWYG_PLAN.md) remains useful, but its statement that no owner
complained about how the editor felt is superseded by this feedback. Its old exclusion of a
gesture that is merely easier than the panel is also too restrictive for this task: making
ordinary editing feel good is now an explicit goal. Source authority, source preservation,
production safety and the requirement for real-user acceptance remain.

## 3. The workspace we will build

One persistent editing workspace, reachable by Edit from the graphic the user just created,
imported or opened. Exact route wiring is part of Phase 0; this is not a claim of a new route.

- Left: named layers with actual containment, selection, expand/collapse, search and canvas
  locking. Selection is shared with the canvas and timeline. Editor-only lock is visibly
  different from runtime visibility; do not change output by clicking an editor convenience.
- Centre: the graphic on a stable canvas, fit/zoom/pan, clear selected bounds and position,
  scale and rotation handles. Selection must survive edits and rebuilds without jumping.
- Right: the selected layer's relevant properties. Position, scale, rotation and opacity lead;
  text/fill controls appear only when supported. Show values at the displayed time, units,
  mixed values for multiple selections and clear unavailable explanations.
- Bottom: resizable timeline with ruler, playhead, layer/property rows, keyframes, snapping,
  zoom-to-fit and clear In / numbered steps / Out sections. The selected animated layer
  reveals its animated properties without a hunt. Collapsed diamonds are summaries; editing
  a summary must never silently alter unrelated property keys.

The code view remains available, but neither automatically takes focus after a visual edit
nor becomes required for basic tasks. Preserve change indicators and readable diffs. Keep
machine/behaviour tools available through their existing workflow, outside the default
animation task. This is not a removal of scoreboard or quiz behaviour.

Design and verify at 1366x768 and 1920x1080, including browser scaling. At the smaller size,
timeline expansion must keep canvas and inspector usable; panels scroll independently and
must not push essential controls off screen. Narrower layouts may use drawers. Do not promise
a full phone animation workspace in this milestone.

## 4. Explicit interaction decisions

These are proposed replacements for conflicting parts of the current interaction contract.
They are specified now so implementation does not accumulate competing gesture rules. Update
the binding interaction documentation and applicable rule sources in the same phase that
ships each change; a plan alone does not change current runtime behaviour.

### Layout and animation are deliberate operations

Provide a clear **Layout / Animate** context beside the editor transport. Layout is the
default when opening a graphic; choosing a keyframe, moving the timeline playhead or selecting
Animate enters animation editing. Retain the last animation position when returning to it.
This intentionally replaces implicit differences between canvas auto-key and inspector arming.

In Layout, drag and property changes affect supported base artwork/layout values, without
creating keyframes. Existing animation offsets remain unchanged. In Animate, canvas handles
and numeric changes write keys for the affected property at the parked time. There is no
additional hidden arming requirement. The diamond indicates a key at this time and explicitly
adds/removes that key; previous/next buttons navigate the same property.

On first animation of a property at time greater than zero, insert a start key containing the
pre-edit evaluated value and the requested key at the playhead. At zero, replace/add that
key only. Editing an existing track between keys inserts a key. Removing its last key
reveals the inherited/base value rather than baking an arbitrary current pose into layout.
First-animation behaviour and inheritance across steps need exact fixtures before UI coding.

For a target whose static layout cannot be safely patched, identify that limitation and retain
its animation/code route; never silently turn Layout into Animate. Root positioning retains
the existing anchor/zone policy. Its animation handles use the same explicit Animate context
where the transform contract supports them. Unsupported transforms remain honest limitations.

### Keyframes and timing

Click selects, Shift adds/toggles, marquee selects keys, empty click clears. Dragging a set
preserves relative times and values; Escape cancels. One completed gesture is one undo item.
Delete affects the focused selection, and text inputs retain ordinary text-editing shortcuts.
Copy/paste preserves property identity and relative timing within the selected segment.

Do not silently overwrite keys when dragging or pasting into occupied times. Reject the whole
operation with a short explanation and unchanged source; explicit replace can be added later.
Reject incompatible paste targets the same way. Dragging across cue boundaries is not an
implicit reassignment of behaviour. A later explicit move-to-step command can handle it.

Snap uses visual proximity to playhead, keys and segment edges; a pixel tolerance is converted
through zoom. Alt temporarily bypasses snapping. Time remains source seconds; a frame ruler
uses a verified document/output rate and never rewrites keys just because display units change.
Zoom anchors to the pointer or playhead, with Fit always available. No automatic re-fit after
the user deliberately zooms or pans.

Numeric time/value fields accompany dragging. Arrow keys nudge selected keys by one displayed
frame (or the documented seconds increment when no frame rate exists); Shift uses ten.
Properties retain their own key counts. Changing opacity must not create X/Y/scale keys.

### Easing, cue boundaries and loops

First ship a short easing menu with curve thumbnails and an immediate segment preview:
Linear, Ease in, Ease out, Ease in-out and Hold. Each choice edits the incoming segment to
the selected key; multi-key editing has an explicit scope. Hold must be implemented and
tested as a discontinuity, not approximated by a steep curve. Keep an existing custom ease
intact even when the basic menu cannot edit it.

Then add a focused cubic-Bezier editor with draggable handles, numeric values, reset and
runtime/sampler parity. This intentionally revises the old blanket exclusion of a graph
editor. It does not authorize expressions, arbitrary value graphs or a motion-path editor.

Keep the truthful broadcast clock: on-air waits have no fixed duration. A contiguous editing
ruler may concatenate segments, but Hold is a boundary, not a timed clip. Moving a boundary
changes the preceding segment duration without scaling keys by default; refuse a trim that
would discard keys/calls/dynamics. **Scale timing** is a separate explicit operation. Studio's
freely positioned stops inform the UI, but we do not replace the existing state machine with
a global playback clock just to imitate it.

Provide Play segment for animation work and Preview cues for In / Next / Out rehearsal.
Stop preview pauses editing playback; Out runs the graphic's exit. Distinct labels prevent
transport stop from being mistaken for on-air exit. Scrubbing never increments scores,
fires external effects or starts timers. Repeated seeks yield the same visual result.

Ambient loops follow after the basic keyframe workflow: selected property, repeat/yoyo,
period and activation explained visually. Prove finite-end/hold/exit/reset semantics using
the existing loop primitive before extending it. A paused editing pose and a moving live
hold must not fight for the same clock.

## 5. Architecture and replacement boundaries

| Boundary | Keep or change | Required proof |
|---|---|---|
| Canonical source | Keep `SpxTemplate` and readable `NOACG_ANIM` | Visual edit -> source diff -> save -> reopen -> identical editable values |
| Track schema | Start with current v2; independent tracks already exist | Unequal property keys, Hold/Bezier support, base inheritance, steps, loops and unknown values tested before proposing a schema extension |
| Transform layer | Reuse/refactor `animEdit`, layout transforms and `timelineLens` | Pure transaction commands for add/move/delete/paste/ease/resize; validation before atomic commit |
| Editor session | One selected target set, context, parked time, playback state and gesture transaction | No duplicate local authority that can disagree across panels; ephemeral gesture state is allowed |
| Runtime and sampler | Reuse `animRuntime`, `animEval` and real preview; consolidate ease semantics | Inspector values and preview/export pixels agree at sampled times; no unsupported interpolation presented as exact |
| Interaction components | Replace/refactor timeline, inspector and canvas coordination as necessary | Pointer capture, cancellation, focus, selection and live feedback work together |
| Preview bridge | Revision-tagged readiness and seek requests | A late reply from an older source revision cannot overwrite current time or selection |
| CLI/MCP | Keep shared deterministic source transforms | No separate editor-only file format; agent edits invalidate stale gestures safely |
| Existing saved graphics | Migrate only when a breaking schema change is demonstrated | Migration on read, current writes, unknown version read-only, preserve code/assets outside the supported region |

Document property ownership, units, pivot/transform composition and base-value evaluation
before the first canvas rewrite. CSS/SVG layout and animated transforms must compose rather
than overwrite one another. Unknown handwritten code is preserved and identified, never
regenerated just to make a visual control available.

Do not attempt a whole-editor replacement in one branch. Introduce the new interaction path
behind a temporary development switch using the same source document. Existing saved graphics
must open in both paths without format forks. Remove the old interaction path after acceptance;
do not leave two permanent competing editors or maintain two mutation libraries.

## 6. Ordered implementation phases

Each phase owns a bounded change and includes build/lint, appropriate mapped Playwright flows,
critical visual inspection and its own owner-queue route. Browser work uses `npm run queue`.
Do not declare a phase usable solely because automated checks pass.

| Phase | Deliverable and starting code | Exit criteria / dependency |
|---|---|---|
| 0. Reproduce and establish the reference | Walk current editor and pinned Studio using the same lower third and SVG scoreboard. Record exact actions, video, failures, clicks and timings. Review existing canvas/timeline specs and `EDITOR_RESEARCH.md` defect receipts. | Concrete baseline, reference screenshots at both viewport sizes, agreed expected task outcomes. An unreproduced defect stays labelled unreproduced; do not invent its cause. No feature rewrite before this receipt. |
| 1. Interaction and transaction foundation | Shared context/selection/time/gesture contract; layout-vs-animation transforms; readiness/revision handling. Work through existing store, canvas, `animEdit` and simulator seams. | Select a layer, move it in Layout, add two X keys in Animate, scrub, Escape and undo, with no unrelated edits. This is a working vertical slice, not a standalone design-system refactor. |
| 2. Basic editor replacement | Stable workspace, inspector values/diamonds, expanded property rows, independent opacity keys, numeric editing, reliable handles and transport. | Complete the primary task below from both supported source types. Save/reopen and exported playback agree. No graph editor or ambient-loop expansion before this passes. |
| 3. Timing and easing quality | Multi-key selection, copy/paste, snap/zoom/nudge, collision rules, easing thumbnails/Hold and then Bezier controls. | Retiming X leaves opacity untouched; all easing samples agree with runtime; keyboard/mouse/touchpad and undo behave consistently. Phase 2 first. |
| 4. Broadcast animation basics | Cue boundary editing, explicit scale timing, direct Out, finite-end loop authoring and update/behaviour coexistence. | A two-step reveal and looping scoreboard survive Next, data updates, exit during motion and replay. Preserve quiz/timer/dynamic-motion behaviour. Phase 3 first. |
| 5. Adoption and removal | Make accepted workspace the default, remove replaced interaction code and stale instructions, update capability claims. | Real-user tasks pass; legacy/handwritten templates preserve source; exported packages pass target checks. Retain rollback through version control, not a permanent second UI. |

The implementation can proceed through these phases without another research programme.
Within each phase, fix reproduced basics first. Existing green functionality should be kept
where it already meets the task; do not rewrite it for visual resemblance alone. Do not
parallelize changes to canonical tracks, source serialization and gesture transactions until
their shared contracts are settled.

## 7. Acceptance: what 'good enough' means

### Competitive completion gate: match the basics, beat the core workflow

NoaCG must meet both the absolute thresholds below and a direct comparison with Studio.
Phase 0 establishes the reference version and baseline; the adoption phase reruns the same
tasks in both editors on the same machine, browser and viewport with equivalent artwork
and output requirements. Record setup/import work as part of the end-to-end workflow rather
than hiding it outside the timed task. Refresh the reference revision at adoption and
document any upstream changes that affect the comparison.

Maintain a comparison row for each basic interaction listed in section 1 and for the full
import-to-production task. Record completion, time, errors, assistance, responsiveness,
visual defects and observed user preference. Counterbalance which editor participants use
first to reduce learning effects. The small user walk is practical acceptance evidence,
not a statistically representative market study.

The basic editor is not accepted while a material disadvantage to Studio remains in those
interactions. Resolve it and retest; do not offset poor timeline editing with an unrelated
NoaCG feature. The full workflow must show a concrete advantage in completion, fewer errors
or less effort without sacrificing output quality or reliability. Where Studio cannot
complete a workflow, record the missing step and any external/manual work honestly, rather
than assigning an invented timing. Unmeasured comparisons remain unverified.

Feature counts, a better internal architecture, automated passes and improvement over the
old NoaCG editor do not satisfy this gate. Incremental phases can land before the overall
gate passes, but the rebuild cannot be declared complete or adopted as accepted on that basis.

### Absolute task and quality thresholds

The following thresholds are proposed acceptance targets, not measurements of either editor.
Phase 0 records the machine/browser and dataset so later comparisons are meaningful.

**Primary task:** starting from the graphic's Edit action, select the title, move its base
position, animate X from -80 to 0 over one second, animate opacity from 0 to 1 over 0.3 seconds,
change X to Ease out, move its end key to 0.8 seconds, scrub forwards/backwards, undo/redo,
save and reopen. The result must match in preview and a clean exported-package host.

- A new user can move, resize, change text and retime one animation, each within one minute
  without instruction. Test with 2-3 first-time users using the existing student-walk format.
- After a short introduction to keyframes, each can complete the primary task within five
  minutes without code or assistance. Record each person's result; a repeated failure
  requires an interaction change, not a longer tooltip or another 'complete' label.
- Selection feedback target: within 100 ms. Continuous drag/scrub feedback target: at least
  30 visible updates/second on the recorded laptop for a 30-layer/300-key fixture, with no
  visible freeze over 100 ms. Pointer-up target: final pose within 150 ms. Measure separately
  from expensive source rebuilds; do not hide lag in averaged timings.
- No unexplained jumps, blank canvas, stale values, lost selection, accidental key insertion,
  unrelated property edits or multi-step undo for one drag. Escape restores exact pre-gesture
  source. Save/reopen preserves values, not necessarily temporary panel layout.
- Visual review covers alignment, typography, panel resizing, key hit areas, clipping,
  selection contrast, tooltip obstruction and focus at both target viewports. Diamond hit
  areas must be larger than the painted diamond; adjacent keys still need disambiguation.
- Regression fixtures include legacy source, unknown animation version, imported nested SVG,
  long text, parent transforms, root anchoring, loops, calls, measured motion and branch states.
  Scrubbing suppresses side effects while real cue playback retains them.
- Export comparison samples start, intermediate keys, midpoint easing, holds and exit. Then
  check the representative scoreboard/lower third through the existing CasparCG route.
  Browser-only success is not hardware acceptance; retain the actual environment receipt.

Keep a single task matrix of observed pass/fail/untested outcomes. Existing automated specs
remain regression evidence; rewrite tests that only pin the old interaction when the new
contract deliberately replaces it. Keep their underlying source/runtime safety assertions.

## 8. Scope and priority

The owner has explicitly asked for this editor plan despite prior parked research labels.
This plan completes that planning request and records the intended implementation sequence.
It does not start implementation in this task or move unrelated roadmap programmes forward.
CasparCG production reliability, working creation and SVG workflows remain immediate needs;
this rebuild directly serves them. No native renderer or Server API build is a prerequisite.

Basic text/shape/image editing and the imported SVG hierarchy belong in this editor. Full
illustration tools, nested compositions, expressions, AE conversion, advanced motion paths
and general collections authoring are later scope. Their absence must not postpone a good
keyframe editor. Conversely, reaching a large feature count must not excuse failing the
primary task.

References: [Studio case study](OGRAF_STUDIO_RESEARCH.md),
[full-stack plan](OGRAF_FULL_STACK_PLAN.md), [current interaction contract](TIMELINE_INTERACTION_MODEL.md),
[timeline implementation history](TIMELINE_V2_PLAN.md), [previous editor failure analysis](WYSIWYG_PLAN.md),
[SVG ambient direction](SVG_ANIMATION_DIRECTION.md), [state-machine schema](STATE_MACHINE_SCHEMA.md).
