// PHASE 1 SPIKE - the GRAMMAR arm's lesson (docs/NOACG_PRO_PLAN.md §14 item 3).
//
// BENCH-ONLY, like the rest of this directory. Its only caller is scripts/pro-spike.mjs.
//
// WHAT THIS ARM EXISTS TO FALSIFY. The exemplar block costs ~34,500 tokens per call - about
// four times the whole no-exemplar generation - and the brand round produced the first
// measured reason to keep it: 12 of 12 exemplar-arm results came back with an EDITABLE
// timeline (`parseAnimData` accepts the region) against 0 of 18 without. If a few hundred
// tokens of lesson buys the same conversion, the block is paying for something a sentence
// could teach, and Phase 3 should not build retrieval on it.
//
// THE LESSON IS WRITTEN AGAINST WHAT THE MODELS ACTUALLY DID, not against a guess. Re-parsing
// the round's thirty saved templates showed the no-exemplar failure is specific and one thing:
// ten of the eighteen wrote a block SHAPED like `NOACG_ANIM` that the parser rejects. They had
// the shared system prompt's full grammar section in front of them the whole time. So the gap
// is not "the model does not know the region exists" - it knows, and reaches for the OUTPUT
// form it can see named in the contract instead of the AUTHORING form the platform converts.
// `convertEmittedRegion` cannot rescue that: its own parse fails, so it restores the model's
// code verbatim and the timeline ships read-only.
//
// WHERE IT GOES, AND WHY THAT SEAM. It rides the USER message, in the exact slot the exemplar
// block occupies - so the three arms differ in that block and in nothing else, which is what
// makes them comparable. It deliberately does NOT edit `coderSystemPrompt`: that prompt is the
// benchmark control and is frozen (src/ai/AGENTS.md), and a control that moves under an
// experiment measuring it is not a control.
//
// IT CARRIES NO CODE. The system prompt's neutral skeleton already shows one region in the
// authoring shape, both other arms see it too, and adding a second worked example here would
// make this arm "one more example" rather than "a lesson instead of examples" - a different
// experiment with the same name.

/**
 * The grammar-conformance lesson: what the ANIMATION region is FOR, the shape the converter
 * reads, and the one move that defeats it.
 *
 * Framed as inspection plus a reason, not a list of named failures (src/ai/AGENTS.md) - with
 * one explicit prohibition, because the behaviour it names is not a proxy for a defect, it IS
 * the defect, and it was measured on ten of eighteen results.
 */
export function grammarLesson(): string {
  return `## How the ANIMATION region becomes an editable timeline

Your marked ANIMATION region is not just code that runs. After you emit it, the platform runs
it through the same importer every built-in NoaCG design goes through, and what comes out is
the graphic's visual timeline - the surface a non-technical operator drags keyframes on. That
conversion is the difference between a graphic someone can adjust on the day and one they can
only re-commission.

The converter reads ONE shape: the authoring grammar the example in your instructions is
written in. Three knob variables, then \`buildInTimeline()\` and \`buildOutTimeline()\`, each
building and returning a single \`gsap.timeline()\`. Inside them, only \`tl.set\`, \`tl.to\` and
\`tl.fromTo\` with literal numbers and strings; durations and absolute positions written as
\`N / animSpeed\`; overlaps as \`'-=N'\`; the ease from the knob variables or one quoted GSAP
ease on a tween. Nothing measured from the DOM, no timeline nested inside a tween, no
conditionals or helper functions between the markers. Anything richer than that is code the
importer has to give up on.

**Do not write \`NOACG_ANIM\` yourself.** That data block is the converter's OUTPUT, not its
input - the platform generates it from your builders, and it is validated strictly. A
hand-written one that does not parse is worse than none at all: the importer's own read fails,
your original code is restored untouched, and the graphic ships with a timeline nobody can
edit. Write the builders and let the platform do the conversion.

Before you emit, read your own region back and ask it plainly: is every value in here a
literal a keyframe editor could show a number for, or did I reach for something the importer
cannot follow?`;
}
