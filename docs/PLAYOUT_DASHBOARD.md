# The playout dashboard — one operator surface, three deployments

Binding design contract for the surface an operator drives a production from. Owner-specified
2026-08-05 (reference designs: `re-design/playout-example/playout-desktop.png` +
`playout-phone.png`). Three surfaces render it and **must not diverge**:

| Deployment | Code | Wire |
|---|---|---|
| In-app production page | `src/components/home/ProductionPage.tsx` | local (preview) + hosted log (air) |
| Hosted control page | `src/components/HostedControlPage.tsx` | hosted log |
| Exported controller | `src/control/productionControllerHtml.ts` | the bundled local relay |

Before this contract they were three different products: the exported one had PREVIEW/PROGRAM
monitors and a blue accent, the hosted one had no monitors at all and stacked one tall card per
graphic, the in-app one had a single preview and reordered layers with arrows. A student who
learned one could not operate another.

## 1. What the operator is doing (the 90% case)

**Choose a cue → look at it on PREVIEW → it is right → TAKE.** That is the job. Everything on
the surface serves it.

- **Selecting a cue in the rundown puts it on PREVIEW.** No separate "load" step: selection IS
  the preview gesture. Nothing about that touches air.
- **PREVIEW is a check of the graphic you are about to air**, not a viewport onto "the next
  item". It answers one question: is this the right graphic with the right words?
- **TAKE airs what is on preview.** It is the loudest control on the page and the only red one.
- Going straight to air is allowed (take without looking) — the gate is a courtesy, not a lock.
- Replacing a live graphic with a new one is the same gesture, which is why a rundown row can
  read ON AIR while another reads PVW.

## 2. Layout — desktop

Two columns, full height, nothing scrolls but the two lists.

```
┌ header ───────────────────────────────────────────────────────────────────────┐
│ ▤ Show name  ● SHOW  00:42:17        ● output connected · N layers            │
│                                         [Publish/links]  [Export…]  [■ All out]│
├───────────────────────────────── main ──────────────────┬─── cue rundown ─────┤
│  ● PREVIEW  <cue name>        ● PROGRAM — ON AIR   L1   │  ⣿ 1 Presenter strap │
│  ┌───────────────┐            ┌───────────────┐         │      after the intro │
│  │  amber frame  │            │   red frame   │         │             L1 ON AIR│
│  └───────────────┘            └───────────────┘         │  ⣿ 2 Topic card  PVW │
│  [→ Preview P] [⟳ TAKE SPACE] [✎ Update U] [» Next N]   │  …                   │
│  [■ Out 0]                          on air: ● <graphic> │                      │
│  ┌ EDITING PREVIEW CUE · <name> ─── switch to on-air ▾┐ │                      │
│  │ F0 · KICKER   F1 · TITLE   F2 · SUBTITLE           │ │                      │
│  │ [⚡ event] [⚡ event]                                │ │                      │
│  └────────────────────────────────────────────────────┘ ├── LAYERS ────────────┤
│  ▸ ACTIVITY  20:14:02  ⟳ Take · Presenter strap         │ [L3 Ticker][L1 Strap]│
└─────────────────────────────────────────────────────────┴──────────────────────┘
```

- **Monitors are 16:9 and sized by the column**, side by side, equal. PVW wears the amber frame,
  PGM the red one. PGM's header carries the layer badge of what is up.
- **The verb bar shows its keyboard shortcuts** as chips: Preview `P`, TAKE `SPACE`, Re-take `R`,
  Update `U`, Next `N`, Out `0`, and `↑`/`↓` walk the rundown. `■ All out` lives in the header,
  away from the others, because it is the panic control.
- **The TAKE control is a TOGGLE, and the button IS the key** (owner decision, acceptance pass
  2026-08-06 — "put something on and take takes it off; it should go in and out with space" —
  corrected 2026-08-07 after a production: `SPACE` took a live cue OFF while the button beside
  it RE-TOOK, so one surface had two behaviours and the label read wrong to a hand already on
  the key). Following SPX, one control turns a graphic on and off: it reads **⟳ TAKE `SPACE`**
  off air and **■ TAKE OFF `SPACE`** while that cue is live, and the click does exactly what the
  press does. `0` means Out from either state.
- **RE-TAKE is a SECONDARY control** — Take on a cue that is already live, which replays the
  entrance and is the graphic's own reset. Its own button and its own key (`R`), never the
  primary button's live state. Like every other verb it stays in place and greys out when it
  does not apply, so nothing on the bar moves sideways at the moment a cue goes live.
- **`↑`/`↓` walk the rundown**, selecting a cue exactly as clicking it does (to PREVIEW; nothing
  airs). With the toggle, that makes the whole surface operable from the keys alone — which is
  also what makes a **Stream Deck** work today, since one is a keyboard emulator by default. A
  dedicated plugin (WebSocket, live button state) is a separate project and is not started.
- **The editor edits the PREVIEW cue by default** and says so ("changes air on ⟳ Take"). A
  switch offers the ON-AIR cue instead, where ✎ Update pushes edits live.
- **An edit to the ON-AIR cue says it has not been sent.** Data never airs by itself — that is
  the staged-vs-take rule and it does not change — so the surface has to say when what is on
  screen is ahead of what is on air: the fate line names how many changes are waiting and ✎
  Update wears an amber dot. It compares against what was last SENT, never against the stored
  cue, since those legitimately differ.
- **Activity is one collapsed line** at the bottom; it expands.

## 3. Layout — phone

One column: header (name · mode · All out) → the two monitors side by side, small → the cue list
(large touch rows) → the editor for the selected cue → **a fixed bottom bar: ⟳ TAKE · » Next ·
■ Out**. The monitors stay side by side on a phone: seeing preview and air together is the whole
point of the surface, and stacking them would put air below the fold.

**No visible scrollbars anywhere, on any surface.** The lists scroll; the chrome does not show.
No horizontal scrollbar may ever appear — a surface that scrolls sideways is a layout bug, not a
scrolling affordance.

## 4. The cue rundown

One row per cue: drag handle, number, **bold label**, the operator note (or the graphic name)
under it, the **layer badge**, and the ON AIR / PVW tag. Full-width label — reorder, duplicate
and delete live behind the row's `⋯`, never as four permanent buttons that crush the name.

- **Every cue carries its own field values.** The same lower third is a different person at cue
  2 and cue 7; that is what a cue IS.
- **The cue's title is editable here**, in the operator surface — mislabelling "Guest lower
  third" as "Host lower third" is a live-show mistake and must be fixable without leaving.
- Reorder is a DRAG, not arrow buttons.

## 5. Layers — an explicit number, not an ordering game

**A pool graphic carries a layer NUMBER the operator types** (CasparCG layers 1–100), edited
beside the graphic's content, where the decision is actually made.

**They are DISTINCT by construction.** Counting starts at 20 — the first graphic is 20, the next
21, the next 22 — because two graphics on one layer replace each other on air and there is no
reason to begin from a state the operator then has to repair. Most productions never touch the
number; one that wants a particular stack just types it.

This replaces derived-from-pool-order layers and the ↑/↓ reorder buttons, which made the layer
an accident of ordering.

A duplicate can still be typed deliberately, so **the surface says when one exists** rather than
letting it be discovered live: the editor flags it inline with a one-click move to the next free
number, and the layer chip wears the warning colour.

## 6. What is NOT here

- **No Rehearse mode.** Preview is local and always available, published or not: choosing a cue
  shows it, ▶/■ drive it, and none of that reaches air. A separate rehearsal mode was a second
  way to do what the surface already does, and the one mistake it could cause — believing you
  were rehearsing while you were live — disappears with it.
- No per-graphic card stack. The editor follows the SELECTION.

## 7. Publishing and the links live here

If this surface replaces the production dashboard, it carries the dashboard's two jobs:
**Publish / republish**, and both capability links — the **output URL** (the browser source) and
the **control page URL** (to operate from another device). They belong in the header's menu, one
click from the operator, never on a page they have to navigate away to.

## 7b. The ⚡ GRAPHIC ACTIONS block, in the operator's words

Two of its controls were unreadable to their first real operator (acceptance pass, 2026-08-06),
so both explain themselves ON the surface — a control that needs a document read to be understood
is a control that will not be used.

- **The ⚡ buttons fire the graphic's own beats on the layer that is on air, immediately.** They
  are not cue verbs: nothing here waits for a Take. Where a beat needs data it carries values
  from the selected cue, so the field is typed above first — and each button's tooltip names
  that field by its OPERATOR TITLE, never as `f7`. That is what makes an action like the quiz's
  **Show audience result** legible: it airs the "Audience results" field you typed above (a
  hidden holder like "34 | 52 | 9 | 5"), painted as a chip on each answer row. The percentages
  are DATA the whole time; the state is only what shows them.
- **"Snap to state…" is the RECOVERY picker**, not a way to drive a graphic. It jumps the live
  graphic straight to a state with NO animation, and it rides with a re-send of the cue's values
  because recovery is two operations (`docs/STATE_MACHINE_SCHEMA.md`: reset the visual state and
  reset the data are never conflated, and a lone snap replays intermediate states with
  suppressed callbacks, so call-painted looks need the trailing data write). Use it when air and
  the dashboard have got out of step — a renderer restart, a missed press. Normal operation is
  the ⚡ actions and » Next.

## 8. Built to grow (interactive graphics)

The area under the monitors is deliberately not full. Interactive graphics — polls, Q&A, chat
highlights, audience questions — bring operator actions that are not "play this cue": approve a
question, push a poll result, promote a message. Those arrive as **modules under the verb bar,
scoped to the selected graphic**, alongside the state machine's own event buttons (which already
work this way — "graphic-specific actions travel with the graphic").

An **incoming feed** (the public submit page and the moderation page the owner is building next,
extending `src/community/showchat/`) lands in the same region: a module that shows what viewers
sent and puts approved items into a cue. Keep the region's height flexible and its contents
graphic-scoped; do not fill it with chrome.
