# src/components/wizard - the creation wizard

Loaded alongside the root `AGENTS.md` and `src/components/AGENTS.md` when working in this
directory (Claude reads it via this directory's `CLAUDE.md` import; Codex reads it directly).
Keep it accurate.

Split out of `src/components/AGENTS.md` on 2026-08-08, which every session touching any
component loaded in full while a third of it described one directory. This chain now sits close
to `project_doc_max_bytes` and `npm run check:shared-instructions` refuses a careless addition:
add a RULE here, leave the reasoning in the code's own comments.

## Wizard (wizard/)

CreationWizard (Entry -> Browse -> Fields -> Style -> Animation -> **Finish**, persistent live
preview), draft.ts, WizardPreview, MiniPreview, steps/. Creating calls `variant.create(options)`
which generates the complete, commented template. THREE entry cards (template, Create with AI,
Import graphic) in a two-column grid, plus the separated video strip; Advanced mode adds blank.
An ODD LAST CARD spans the row (`.wz-entry-card:last-child:nth-child(odd)`) and sizes to its
OWN copy — the equal rows and the three-line hint reserve align cards SIDE BY SIDE, and a card
with no row-mate wearing them is two empty lines of padding. Create with AI is the ONE AI
door - NoaCG Pro is an execution TIER inside it, never a second card; there is no kit card
either — see the kit path below.

**THE ENTRY STEP'S CONTENT** (steps/EntryStep.tsx, handoff §2a; the reasoning is in that
file's comments). Hero = headline + two lines, no second brand mark and no SPX / CasparCG /
OGraf chip row (the targets belong in the SENTENCE; a row of small pills reads as filters or
status everywhere else here). Home = a full-width ROW whose Graphics / Productions shortcuts
are SIBLINGS of the body button, shown only when there is saved work. The video strip is ONE
LINE: a Beta side-door must not out-weigh a shipped mode.
**THREE DIVERGENCES ARE DELIBERATE**, pinned by `e2e/wizard-entry-fit.spec.ts`: no "Start from
a kit" card, cards act on CLICK not radio-plus-Continue, Blank stays behind Advanced mode.

**THE FEEDBACK DOOR IS ON THE WIZARD HEADER** (`BetaFeedbackButton area="wizard"`; Home carries
`area="home"`). It existed only in the editor shell — the surface the student release demotes —
so the release's own user could not send anything, and feedback is what the Lite prompt learns
from. Two dependencies: the header's push is a CHAIN (`.wz-stepcount ~ .fb-open`,
`.fb-open ~ .gallery-close`), since the step counter is absent on Entry and the button absent
offline and whichever exists first takes the auto margin; and the shell behind the wizard
mounts a SECOND button, so a locator meaning one says which via `data-area`.

**LAYOUT: rail | form column | preview** (handoff §2). The steps are a 216px vertical RAIL
(`.wz-rail`, still `.wz-dots`/`.wz-dot` so every spec still addresses them): number-or-green-
tick, title, and a second line naming the decision the step asks for. As header pills they had
room for six words and wrapped to four rows on a phone. The rail's foot reads the PROJECT
FORMAT back for the whole walk while the control stays in the step that owns it (Browse, AI,
blank) - one decision, one home. Under 768px the rail lies down as a scrolling chip strip and
that read-back stands down (it needed ~212px the row lacks). The FOOTER belongs to the form
column, so Next sits under the form it advances, not under the graphic beside it.

Two measured constraints:
- **The rail's 216px leaves the row before either pane sees it.** Where the left pane is a
  WORKING surface (`.wz-body-working`, the Import flow's Text step) the measure cap lifts and
  the preview clamps, or the placement canvas drops under the 700px floor
  `e2e/import-graphic.spec.ts` holds.
- **The Entry step's HEIGHT budget still binds** (`e2e/wizard-entry-fit.spec.ts`, 1366x768):
  cards share the column rather than wrapping the row, and the grid's 10px cost was taken off
  the hero's title margin. Grow one, pay from another.

**Deep-linked open** (`#/new/<variantId>`, docs/PRERENDER.md - a prerendered template page's
CTA): the router's `design` param rides through `openGallery(designId)` into templateStore's
`pendingDesignId`, which the wizard's open effect resolves via `variantById` and, on a hit,
applies the SAME patch `BrowseStep`'s card click does before jumping straight to Fields (mode
`'template'`, step 2) - never creating a project, since Finish is still the only door that does.
An id that does not resolve (unknown, retired, or `imported-design`) falls through to the
ordinary Entry-step open.

**Finish** (steps/FinishStep.tsx - the last step of every catalog-shaped mode, design included)
is the wizard's ONE branch. It carries the graphic's NAME (`draft.name`, applied inside
`buildDraftTemplate` so it reaches the topbar, the Save prefill and the export slug through one
path; blank falls back to the design's catalog name), a read-back of what was chosen, and two
doors:
- **Open in the editor** - the classic ending. Creates and hands over; saving stays the
  user's move.
- **Export it** - creates, SAVES to the library, closes onto `#/home/graphics`, and opens
  ExportWindow. The editor is never revealed. The save is not optional: a graphic that was
  configured, exported and dropped would cost every wizard choice to reproduce. A FAILED save
  deliberately stays in the editor instead, where the topbar's failed status is visible.
Both doors go through `applyDraftProject`, which is what keeps them byte-identical - the
editor path formats through Prettier (`applyGenerated`), so an export path skipping it would
ship different HTML for the same choices. The footer's quiet "Create project" shortcut stands
down ON Finish and works from every step before it. The graphic's name slugs the zip AND, for
the SPX and CasparCG targets, the template FOLDER inside it - the name the operator reads in
the playout server. Pinned by e2e/wizard-finish.spec.ts.

**A closed `<details>` needs an author rule here.** The UA hides a disclosure's non-summary
children with `display: none`, which ANY author rule setting `display` on those children beats
- and the Style step's disclosures wrap `.row`, which is `display: flex`, so they never
collapsed at all until styles.css grew `details:not([open]) > *:not(summary) { display: none }`.
`toBeVisible()` is blind to it, so specs assert measured HEIGHT is 0, never `open`.

**Browse** (steps/BrowseStep.tsx, mode 'template' only) is the FACETED template storefront
(docs/TEMPLATE_TAXONOMY_PROPOSAL.md §12 for the facets; re-design/handoff.md §2b and
src/templates/AGENTS.md for what they are drawn as) replacing the old Category -> Template
pair: search (alias-aware, src/templates/search.ts), optional programme family/format selects
(RANKING — "Best for X" / "Also works" sections, never exclusion), ONE graphic-type dropdown
with live counts, field-count buckets (range-intersection over the reachable visible range),
style-family chips, and the specialist facets (structure / capabilities / placement-motion)
behind the Filters disclosure. Filter state lives in
CreationWizard (`browseFilters`) so Back returns with filters intact; the setter is passed as
a REACT DISPATCH so chip toggles compose as functional updates (two clicks in one batch must
never overwrite each other). Zero results name no template dishonestly: the empty state
offers "remove the most limiting filter" (computed: the chip whose removal restores the most
results) and a Create-with-AI hand-off. Cards carry the strict info budget (category ·
subtype, top families, field summary from semantics, ≤3 capability badges, style family,
complexity), with everything the budget excludes - the full field schema, all formats,
structures, capabilities and motion - one ⓘ click away in the card's detail panel (a SIBLING
button of the card button, never nested; one panel open at a time). The footer's brand
toggle feeds `brandFamily` as browse CONTEXT, not a filter: the package's siblings rank
first, no chip appears, Clear-all leaves it alone, and a genuine programme match always
outranks it. MiniPreview mounts its iframe only when the card scrolls into view
(IntersectionObserver).

**IT SHOWS A PAGE, NOT THE CATALOG** (handoff §2b). `PAGE_SIZE` = 12 plus **"Show 12 more"**,
and the step states both numbers — `Showing 12 of 82`, `data-testid="wz-browse-count"`.
Unfiltered it used to render all 429 matches, 30,215px of scroll on the step whose only job is
picking one. Three rules:
`browseTemplates` still returns the WHOLE result and gains no limit argument (the total is what
the count line reports); the limit is spent on the RANKING and then split into the two sections,
so "Show more" walks "Best for" into "Also works"; and the page resets on any result change,
derived during render off a signature rather than in an effect — an effect paints one frame of
the old page against the new filter, a flash of the wrong designs on a grid of live iframes.
For SPECS: search for a named design (`pickDesign`, `e2e/_browse.ts`) and assert `resultTotal`,
never a `.wz-variant` count.

**THE KIT PATH — one door, at the top of Browse** (shape + the §18 reversal:
docs/PACK_TAXONOMY.md, "The wizard surface"). `.wz-buildmode` (ONE GRAPHIC / A WHOLE KIT) swaps the step body between the design
grid and **KitPicker** (genre preset, then checkboxes over `templates/kit.ts` `kitChoices`);
the format picker and the SEARCH sit above the branch — one box: designs on one side, shows and
the graphics a kit can hold on the other (facets stand down).
Filtering hides rows, never unticks them, and the count stays the whole SELECTION.
Picker state lives in CreationWizard like `browseFilters`. A kit then walks the SAME six steps
a single graphic does (`mode` stays `'template'`; `KitPlan`, wizard/kitPlan.ts, makes each step
one graphic OF A SET) plus **KitTray**, **KitLookStep** and **KitFinishStep**. What
they must not break: the tray is the second axis of progress, in the rail's vocabulary, its
done chips MiniPreview in `lazy` mode (its one caller), not navigation; the
look question is a bordered card, never a modal (it would cover the rail and tray, which are
what make it answerable), and its yes is a deterministic transform over the `:root` contract and
NOTHING else (`kitLookPatch` — the motion preset carries only where the target design DECLARES
it, and the brand toggle reaches every graphic of the set); both Finish doors SAVE
FIRST, every write claimed (see "Save + Home"), export asking the production page for its
dialog via templateStore's one-shot `pendingProductionExport` and NAMING the production it
packages, which is the whole pool; and the kit's last rail entry is not a jump
target (the graphic in hand was BUILT), while re-finishing the tone-setter re-propagates.

**ONE disclosure, EVERY width, closed by default** (`.wz-browse-drawer-btn` +
`.wz-browse-filters`, handoff §2b) — two nested ones cost a desktop reader five rows of facets
before the first design and a phone reader two clicks to reach one capability. LEADING the
step: search, the type select, the style families. Behind the toggle: programme, field counts,
structures, capabilities, motion — with the active count on it, so a narrowed catalog never
reads as an empty one. The LEAD ROW is a GRID of two lines (select + Filters, then the chips),
not one wrapping flex line: this step's column halves the moment a design is picked and the
preview takes its half, and a flex row degrades there into a 230px vertical stack of chips
beside a select in an empty half-row.

The shared PROJECT FORMAT picker (`ProjectFormatPicker`, aspect / resolution / FPS,
`.wz-browse-format`) is not a facet — `browseTemplates` never reads it — so it never sits
inside the filter drawer, where it asked a phone user to open "Filters" to make a decision that
filters nothing. On Browse it is three bare selects in ONE row, since the rail
captions and reads back the format and the options say what they are; each label's text is
hidden via `.project-format-label`, kept in the DOM for a screen reader. That span exists so a
surface can hide the WORDING without hiding the control the label wraps — every other caller
renders the picker unchanged. The same controlled picker appears before generation or
placement in AI/Lite, Import Graphic, blank, video AI, and the older import/catalog
continuation; draft selection survives route switches. Blank is a setup step, never an
immediate default-format create. The import-images
continuation (mode 'import') keeps the old ImportStep -> TemplateStep flow and indices; the
catalog flow's later steps sit one index earlier (`animStep`), and FINISH follows Animation
in every mode (`finishStep = animStep + 1`).

**Import graphic** (mode 'design': ImportDesignStep + PrepareDesignStep + PlaceFieldsStep +
the shared AnimationStep) is a SETUP flow, not a second editor:
Start -> Design (choose project format, then drop the image - any raster format the browser
decodes, rejecting only a file with no intrinsic pixel size, since every downstream number
comes from that measurement; live preview from the moment it lands; Create is available from
here on - every later step is an optional stop) -> Prepare -> Text -> Animation -> Create.
The **Text step** (PlaceFieldsStep) places editable fields ON the artwork: T = click point
text, ⬚ = drag a wrapping area box; move/resize/Delete; per-field name, preview text, and
typography (family / size / weight / color / align / line-height / tracking) with a live
styled render on the placement canvas. Specs live in `draft.designFields` (DESIGN px) and
become REAL placed fields at build - draft.ts `withDesignFieldSpecs` runs addPlacedLine +
setLineTextStyle + setLineFit, so wizard placement, editor, preview, and export agree by
construction (browser-verified pixel-exact). The **FontPicker** (wizard/FontPicker.tsx,
searchable) offers the bundled OFL library, upload (woff2/woff/ttf/otf -> CustomFont,
embedded in template.assets + every export), and - Chromium only, permission-gated - Local
Font Access, where a picked installed font is EMBEDDED exactly like an upload so playout
never depends on the machine's fonts. The **Animation step** is the standard one.
The **Prepare step** carries the two artwork decisions: ERASE baked-in text (source-px rects
drawn on DesignPrepCanvas -> assets/eraseRegion flat-fill; flat verdicts apply immediately,
non-flat holds behind "Use it anyway"). Marks ACCUMULATE into `draft.designErases`, each run
against the artwork as it stands; removing one REPLAYS the survivors from
draft.designOriginal, which is what keeps fills from compounding (a fill cannot be undone in
place). The erase MEASURES the ink it removes, split into LINES, and every line seeds a real
field at create from that line's own bounds, cap height, top, and the edge it was set from,
never from the loose rectangle the user drew. The SCALING MODE is fixed default / horizontal
9-slice stretch with draggable guides + a content-width demo slider that pushes sample text
through WizardPreview's demoText prop into the real emitted runtime; with stretch and no erase
the PREVIEW build adds one demo line that Create strips. The create hands off to the editor
with the Data tab revealed
(setActivePanel('data') + the store's panelRevealNonce). Fields, styling, and motion all live
in the editor: the Data tab's placed add, the canvas gestures, the Inspector's Style/Animations
tabs. FieldsStep/StyleStep carry NO imported-design branches any more - design mode never
reaches them. Contract: docs/IMPORT_MVP.md; E2E: e2e/import-graphic.spec.ts +
e2e/import-prepare.spec.ts + e2e/import-stretch.spec.ts.

The steps are driven by each variant's declared CAPABILITIES (model/wizard.ts): the Fields step
offers up to `maxLines` text lines plus the logo toggle + custom upload on a `logo: 'optional'`
design (built-in slots show it checked and locked); the Style step has TWO size knobs (Graphic
size -> --scale, Text size -> --type-scale); the Animation step renders the slide family as ONE
card with a direction-of-travel picker. WizardPreview cancels pending lifecycle-demo timers when
a debounced srcdoc commits (a stale stop() must never blank the fresh document), pushes field
values from a latest-template ref, and gates the auto-entrance on `document.fonts.ready`
(capped) so a font choice shows on the entrance itself. Pinned by e2e/wizard-preview.spec.ts,
wizard-logo.spec.ts, and wizard-filters.spec.ts.

**Create with AI** (Entry card -> steps/AiStep, mode 'ai') is the MERGED describe/import step.
One drop zone accepts images AND an existing .html/.zip template. A dropped template parses
deterministically (model/importTemplate.ts) into a card with two actions: **"Open as code (no
AI)"** — the byte-faithful import (applyTemplate + Export panel, exactly the old Import entry;
it renders OUTSIDE the `needsSignIn` gate and must stay there — only the AI actions are an
account feature) — or **Convert** (provider.convertImport, guided by the prompt). Each dropped
image becomes an **UploadCard** (steps/ai/UploadCard.tsx) carrying WHAT IT IS FOR - use it as
it is / make one like this / take the look and feel / make it work over this
(model/imagePurpose.ts, split into `images` + `references` by `splitByPurpose`). The purpose is
a property of the PICTURE, not of the gesture, which is why it lives on the card rather than
behind separate drop zones. `guessPurpose` preselects (visibly, one click to correct) and only
ever guesses mark-or-not. An as-is card adds the fixed/swappable choice; VIDEO passes
`showBinding={false}`, since a composition reaches a picture through a declared image input.
The as-is paths are handed to `productionSpxValidator` so the as-is screen rides the injected
validator. The "Design around these with a catalog template" escape takes only the as-is assets
and continues into the mode-'import' images -> category -> TemplateStep flow. The step
injects the harness's validator (`validateTemplate` + `benchTemplateRuntime` merged) into
every provider call, streams `onProgress` stages into the busy line, shows the route badge
(catalog design system / +flourish / custom) on the result card, and passes a grounded
result's `spec` back on refine so spec-level refinement re-assembles deterministically
(src/ai/AGENTS.md).

**"More control"** (steps/ai/MoreControlPanel.tsx) is the OPTIONAL structured setup beside
the prompt: an accordion editing ONE `GenerationSpec` (model/generationSpec.ts) - category
(src/ai/spec/categories.ts, or "Let AI decide" with the inferred pick surfaced editable on the
result card), data fields (suggested per category from the GraphicType's own declarations),
look (style/mood/avoid, exact brand colours, plus a READ-ONLY count of what is attached -
uploading happens once, in the drop zone), fonts (primary through the shared FontPicker,
secondary/numeric uploads), and animation (presets filtered to the category, intensity,
transition style, speed/easing/steps). Collapsed sections show summary chips and keep their
values; the spec persists as a cross-session draft and, on Create, lands on the store's
`aiSpec` (saved with the project). A prompt-only user never touches it - an empty spec injects
nothing (pinned by e2e/ai-more-control.spec.ts).

**The step has THREE execution tiers** (`AiSettings.tier`, picked under ⚙ AI settings - the
one panel every tier can reach): **NoaCG Lite**, **NoaCG Pro**, and **Custom provider**. The
default resolves to Lite when the server offers it, else Custom - exactly the pre-tier
behaviour. Lite and Pro are managed experiences of the SAME workflow (no model picking);
Custom is the deliberate advanced surface carrying the full `AiProviderSettings`.

The PIPELINES behind Lite and Pro are src/ai/AGENTS.md's contract (and docs/NOACG_PRO_PLAN.md
§7); what belongs here is what each tier does to this STEP.

**Lite** is the smallest managed surface: one result, included/free-user copy, remaining
allowance, at most two fields, no image/logo input, no style reference. Provider and model
settings, brainstorm, raw mode, three alternatives, "more like this", custom/import conversion
and code repair are all hidden; an unsupported response shows the server's explanation and one
simplification. Creating or exporting records acceptance by generation id, which is transient
and never enters the template or the saved graphic. Lite disabled = the BYO surface unchanged.

**Pro** shows the concept image with its provider-reported cost plus the per-region editability
report (`data-testid="pro-report"`, keyed to the template by WeakMap so a restored past result
shows its own concept). Its settings carry the AI Gateway key surface only
(`AiProviderSettings fixedProvider/showModel`) - a normal Pro user picks no models. Categories
clamp to lower-third/auto, spec-field findings demote to warnings (`demoteSpecFields`: fixed
contract, no repair loop), and refine/fix stand down because regenerate is the honest move.
With no gateway credential the tier says so and runs the offline stub, which is what keeps
e2e/pro.spec.ts token-free. The step passes the FIRST "use it as it is" upload in as
`logoMark`; the ordering that makes that safe is src/ai/AGENTS.md's.

The harness is ON BY DEFAULT, with the **"Use NoaCG harness (3 options)"** checkbox
(`AiSettings.useHarness`, default true — the benchmark showed it a clean win) still able to
turn it off. On → `generateAlternatives`: three directions rendered as `[data-alt]` PICKER
CARDS — a live **MiniPreview** of each built template plus its design words (density,
heading weight, alignment, panel) and a pass/fail mark, because the three differ in real
compositional decisions and a list of names showed none of them. Off → `generateRaw`
(one-shot, static validation only, no bench). Conversion of an imported template always runs
the validated conversion flow regardless of the checkbox. The default is pinned by
e2e/ai.spec.ts ("the harness checkbox is on by default").

AI settings use the shared `AiProviderSettings` surface for provider, opaque model id, and
user-key submission (laid out on the shared `.dlg-row` grid, so its Store-key button can never
wrap under the field). The component may hold a key only in its unsaved password-field state
and must submit it to `/api/ai/credentials`; it must never pass a key through `AiSettings`,
localStorage, query parameters, telemetry, logs, or rendered error detail. Model lists are
provider-scoped suggestions, not an application-wide allowlist.

The ⚙ button carries a one-line read-back of what will actually run (the tier, plus the model
on the tier where models are the user's own), so the common case needs no click. **The panel is
NOT a popover**, though the reference draws one: it opens ITSELF whenever nothing is configured
- which is exactly when Generate, Attach and More control are all live and waiting - so a
floating sheet covers the controls it exists to make work. Measured, as two Pro specs
deadlocking: Playwright will not dispatch a click through a covering element, so the press that
would dismiss it never arrives. Making it float means restructuring the step around it.

**The directions SURVIVE a refinement.** `alternatives` (the current state of each
direction) and `originals` (each as first generated) are parallel arrays; a refine replaces
only `alternatives[selected]`, so the other directions stay pickable and **↺ Undo
refinements** restores the proposed design without spending a generation. `stagePick` stages
the pick for src/ai/preferences.ts on selection AND after every refinement — CHOSEN facets
from the direction as it stands, SHOWN from the ORIGINALS, since that was the choice actually
faced; a lone result stages nothing (counting it would score every facet as picked 100% of the
times shown). CreationWizard's `createFromAi` COMMITS whatever is staged.

**The result names the PROVEN DESIGN it was adapted from, and shows what it was chosen
between** (docs/ADAPT_FIRST_PLAN.md §3 Stage U). "Adapted from a proven design" is a claim, so
the card carries the design's name (`data-testid="ai-adapted-from"`) and, under it, the
retrieved shortlist (`ai-shortlist`) as MiniPreview cards - the same card chassis as the three
directions and a Browse tile, because all three are "pick a design". Picking another one
REBUILDS on it deterministically: `assembleGroundedTemplate(spec, ctx, { keepChassisZone: true })`
with the same spec, no model call and no cost, so the user can overrule the AI's choice without
paying for a generation. No structural KIND check is needed on that swap - every design on the
shortlist satisfies the brief's anchor by construction (src/ai/retrieval.ts).
The card's caption is the NAME ALONE: a style-family tag beside it clipped "Scripture Reading"
on a 132px card to name something the live render above it already shows.

A failing non-Lite result carries **⟳ Fix these** (`data-testid="ai-fix"`): the exact validator
findings go back as the instruction, at CODE level (no spec — the findings are about emitted
code). It is a button, not an automatic loop: a grounded assembly failing its own bench is a
platform bug worth surfacing (src/ai/AGENTS.md), but leaving a non-technical user holding
raw findings is not a resolution. The per-card verdict uses `.wz-alt-mark.ok/.bad`, NOT
`.status-ok`/`.status-bad` — those name the verdict on the CURRENT result, and four
elements answering to the same words broke a spec the moment cards appeared.
Lite instead labels the same failure as a NoaCG platform defect and spends no code-repair
call.

An **example brief is armed before it replaces a brief the user wrote** (two-step, like every
other destructive click here); typing disarms it. Pinned by e2e/ai.spec.ts.

**ONE thread, ONE composer.** `turns` is a single transcript (`.ai-thread`): talk turns plus
`past` turns, which are earlier generations kept whole (their directions, their originals,
which one was picked) with **↩ Bring back**; restoring archives whatever it displaces, so
exploring a second idea never costs the first. The one textarea generates, talks (**🗨 Talk it
through**) or refines — the primary button follows the state, and the "Refine it…" placeholder
is retained so the composer answers to the same locator either way. `conversation()` feeds the
bounded transcript into `GenerateContext` (src/ai/AGENTS.md), **📎 Attach** adds images to the
turn, and **✦ 3 more like this** re-runs the design stage seeded with the picked direction's
spec.

**The conversation TRAVELS with the created project.** AiStep reports its talk turns up via
`onThread` on every change (so talk added AFTER the last result, before Create, is caught);
`createFromAi` commits it to the store's `aiThread`, which persists exactly like `aiSpec`
(SavedProject + GraphicDoc, additive optional, model/aiThread.ts). Only the talk turns travel -
the `past` generation snapshots are heavy and the editor has no surface for them. The editor's
**AIPromptPanel** shows the carried conversation read-only under a "Created from this
conversation" `<details>` (`data-testid="ai-origin"`, reusing the `.ai-msg` bubbles). Pinned by
the reload case in e2e/ai.spec.ts.

**The result card reports what was MEASURED, not a verdict.** `validation/readiness.ts` groups
existing findings into six operator-facing rows; it adds no checks, which is what lets a row
read "not played, so not tested" on the raw one-shot path rather than claiming a bench that
never ran. Rules no row claims are shown verbatim, never swallowed. Cost comes from
`ai/runStats.ts` over the telemetry ring: a median expectation before Generate (null below two
matching runs) and actuals after, recorded on a RUN and never in `showChange`, since re-picking
an alternative costs nothing. **No money is ever shown** — prices are not in this codebase and
a stale one would be believed — and zero tokens prints as silence, because "0 tokens" is a
measurement claim rather than the absence of one.

**Brand is PROPOSED, never applied.** The strip (`.ai-brand`) offers colours read out of the
first uploaded image — `src/assets/paletteExtract.ts`, deterministic arithmetic, no model call
— and the install's saved looks (`loadLooks()`). Both write `spec.brandColors`, the lock
`applySpecLocks` already honours over anything the AI picks. The pick stays the user's on
purpose: nothing can tell whether the red in a crest is the identity or the shirt behind it. A
filename chip uses **`.wz-file-chip`**, never `.wz-fid` — that one is the fixed 24px FIELD-ID
badge, and borrowing it crushed every filename onto two lines.

Two ordering rules the transcript depends on: **archive the current result BEFORE recording
the new request** (it is chronological — the standing result happened first), and **record
the request even when the box was empty** and the brief came from the talk, or a generation
leaves no trace of what it was asked to make. Both were wrong first and caught by looking at
the rendered thread, not by reading the code.

**Video mode** (Entry card "Video or animation with AI" -> steps/VideoStep): prompt + a
GENERATION-ENGINE picker (the VIDEO_ENGINES cards: Remotion preselected, HyperFrames tagged
Experimental) + duration/aspect/fps/transparency + asset upload -> an INSTANT create
(`createDefaultVideoProject`, the brief seeded as chat[0], the engine recorded on the
project); generation runs in the video shell's chat, not the wizard. Its reopen strip lists
saved videos plus a "Continue" chip for the autosaved current video project. Creating/opening a
video flips docKind to 'video'; every SPX create path flips it back to 'spx'.

**Sample data on create:** the wizard applies with
`applyTemplate(template, { resetSampleData: true })` so a new project starts from ITS field
defaults - plain applyTemplate (blocks, panels, AI) intentionally preserves typed sample values
for matching field ids. Don't drop the flag from the wizard path: the old template's values
would leak into the new graphic's fields.

