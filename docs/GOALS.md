# Goals

The committed north star. **This file holds only what is NOT done.** A milestone that lands moves
to [`GOALS_ARCHIVE.md`](GOALS_ARCHIVE.md) verbatim - the full shipped record with dates and
rationale, so nothing is lost - and is deleted from here. When the direction changes, rewrite this
file; the archive keeps the history. Keep it under ~200 lines: a roadmap nobody can read in one
sitting steers nothing.

---

## North star

> **One link, live anywhere.**
> Pick a broadcast graphic, make it yours without touching code, and put it on air in five
> minutes - in CasparCG, SPX, OBS, vMix, or whatever the show runs on - from **one output URL**,
> driven by a **control panel inside NoaCG**.

That URL is the product. Everything else serves it: the wizard exists to fill it, the catalog
exists to make it look paid-for, the export adapters exist so it reaches any playout machine, the
control layer exists so a person can drive it live.

The first-named user is a **student or non-technical operator** who runs a real production without
ever seeing code; organizations, channels, streamers and universities follow. A **professional**
keeps full control through **Advanced mode** - the editor, one toggle away, never required. The
generated HTML/CSS/JS is the single source of truth and stays clean and readable; looking at it is
optional. Used in teaching, but it is a production tool, not a code tutorial.

**The binding deadline: students go live by 2026-08-21.** Work that does not serve that date is
not current work.

### What "done right" feels like
- **Fast** - open NoaCG, choose a design, make a production, paste the URL into CasparCG or OBS,
  live in under 5 minutes. No code, no install.
- **Tasteful** - every design looks like a paid MotionArray/Envato asset, not a tutorial demo.
- **Consistent** - graphics made together share one palette and type family across every
  category, usable in a real programme.
- **Yours** - custom colors and imported fonts are first-class; fonts embed in the export.
- **Smooth** - 60 fps, transform/opacity only, professional easing.
- **Reliable** - every export passes the validation gate and plugs straight in.
- **Editable** - a pro can open any generated file and extend it. Nobody has to.

### Anything-goes export (a platform, not an SPX generator)
Many environments - **SPX, CasparCG, OBS, vMix, OGraf**, more over time. SPX stays the canonical
*internal* format and the strictest validation target; every other target is an adapter off that
same source, so breadth costs no rework. Breadth across the live stack, plus automation and remote
control, is the long-term differentiator.

### Operating principles
- **Free forever for the core.** Creating, editing, exporting, controlling, self-hosting - always
  free. No paywall on the workflow.
- **One paid surface, later: hosted AI** for users who will not bring their own key (real compute
  cost). **Bring-your-own-key is always free.**
- **Users, not revenue.** Optimize for adoption and regular use. Money is a later consequence of a
  large, happy user base.
- **No sign-in for its own sake.** The studio - create, customize, export, self-host - never asks
  for an account. It is asked for only where it *buys* something the user wants: their graphics
  and productions saved to their own Home across devices, the persistent cloud output URL, and
  hosted AI allowance.

---

## NOW - students live in two weeks

### Student release - wizard to live broadcast

*Steps 1-9 shipped 2026-08-04/05; the full text of each is in the archive. Step numbering is cited
from ~80 places in the tree, so it never changes.*

- [x] **1.** Scope locked, one goal and one roadmap - **2.** the student-critical focus suite as
      the per-change gate - **3.** packages removed, Production is the only grouping - **4.**
      editor behind Advanced mode, full-screen wizard - **5.** deterministic customization with
      declared field expansion - **6.** wizard → production → publish → output, complete - **7.**
      two coherent production-ready packs (newsroom, talk-show) - **8.** Home simplified around
      Productions - **9.** account essentials (reset, change, sign out, expiry recovery).
- [ ] **10. Playout hardening + owner acceptance.** The agent half is done: the storage-full
      drill, the dangling-reference walk over all six export targets, and the consolidated owner
      checklist at **`docs/STUDENT_RELEASE_ACCEPTANCE.md`**. Round 1 (2026-08-04) failed the
      export door; round 2 (2026-08-05) passed the CasparCG production package on real hardware.
      All findings from both rounds are fixed and spec-pinned.
      **Remaining, owner + real hardware:** re-run checklist §1-§6 against a build carrying those
      fixes - CasparCG 2.3.x and OBS through both doors, including the launcher and exported
      controller path - plus the soak, the live recovery drills, one live-suite run, and the timed
      first-time-user walks. Run it against a production whose rundown includes a **scorebug cue**:
      this doubles as the first hardware sighting of the interactive-playout contextual controls.

### Two open risks for the deadline
- [ ] **Visual acceptance of the interactive playout plane.** Phases 0-6 of
      `docs/INTERACTIVE_PLAYOUT_PLAN.md` are merged - per-cue contextual controls, the shared data
      foundation, vote-to-air, presenter view, the audience join page - and **none of it has ever
      been looked at by a human**; geometry-only e2e coverage is not acceptance. A student-facing
      surface that has never been seen is the largest unmeasured risk in the release.
- [ ] **Decide which door the class runs on.** Two routes reach air and only one needs an account:
      **export** (files, local relay and controller on the playout machine - no sign-in, and the
      route round 2 proved on real hardware) and **cloud publish** (the persistent output URL and
      phone control - gated on sign-in). The north star sentence describes the second. Pick one for
      the two weeks; if it is cloud, the accounts exist before the class, not during it. Second
      accepted limitation: restyling after save means recreating in the wizard or Advanced mode.

---

## NEXT - AI that anyone can afford

Three execution tiers behind the one "Create with AI" door. They differ by **capability**, and the
funding model follows the capability - never the other way round. Detail lives in the plan docs;
these are the commitments.

| Tier | Who pays | What it is | State |
|---|---|---|---|
| **NoaCG Lite** | us, free to the user | Grounded in **our catalog**: the model picks a proven design and adapts it. It does not invent a layout. | built, **not yet good or cheap enough** |
| **NoaCG Pro** | user, a little | Image-generation models produce a great-looking frame; further steps rebuild it as real HTML with live fields. | direction only, unproven |
| **NoaCG Extreme** | subscription | The newest OpenAI and Anthropic frontier models designing directly. Expensive, technically the simplest. | not started, needs income first |

- [ ] **Lite: 100 generations for 1 EUR** (~€0.01 each), and genuinely usable. Cheap models cannot
      design a broadcast graphic unaided - a measured finding, not a guess - so Lite never asks
      them to. The catalog is the crutch AND the moat: adapt-first (`docs/ADAPT_FIRST_PLAN.md`) is
      that mechanism and is already built. What is open is quality and price at once. **This is
      the gate for every other AI goal** - one good graphic must be reliable before anything
      multiplies it.
- [ ] **Pro: find out whether it works at all.** Bounded experiments before any commitment -
      image-model concept → deterministic reconstruction, measured against Lite output on the same
      briefs. It may not be reachable at broadcast quality; that is an acceptable answer.
      `docs/NOACG_PRO_PLAN.md`.
- [ ] **Extreme: frontier models + the subscription that funds them.** After there are users.
      Standing cost rule until there is income: a NoaCG-funded route must be a cheap,
      OpenRouter-reachable model; OpenAI and Anthropic are reachable only through the user's own
      sealed key.
- [ ] **Bring your own key, always, for every tier.** The paid surface buys convenience, never
      capability.
- [ ] **A school account earns more AI.** A verified address on a configured school domain
      (`@arcada.fi` first) raises the allowance. No new concept needed: a domain match issues a
      **grant**, which already outranks the plan and carries its own reason and expiry
      (`src/entitlements/contract.ts`). The first honest reason to sign in that is not a paywall.

### Kits, not one graphic at a time
Nobody making a show wants to create graphics one by one. Say which graphics the programme needs,
get all of them in **one unified look**, landing together in one production.

- [ ] **Catalog kits from the wizard** - available now in principle: `TemplatePack.paletteId`
      already imposes one palette across a kit (newsroom, talk-show). Generalize it to a
      user-chosen set of categories. **No AI required, so this ships before the AI version.**
- [ ] **AI kits** - the same door, with Lite generating the set. Rides on Lite being good.

---

## THEN - the custom road (ordered, unscheduled)

Only after the north star is true for real users. Each step is a direct competitive answer.

1. [ ] **WYSIWYG canvas** - back to the editor: drag, place and restyle your own graphics
       visually, with code still the source of truth underneath. `docs/WYSIWYG_PLAN.md`.
2. [ ] **The node editor as a first-class surface** - state machines and logic drawn as a graph:
       which graphic goes where, on what event, under what guard. The engine and the graph editor
       already exist (`docs/STATE_MACHINE_SCHEMA.md`, `MachineGraph`); what is missing is making
       it a surface a non-programmer uses on purpose. **This is where we meet Loopic head-on, and
       where interactive graphics put us against Rive.**
3. [ ] **Singular.Live class** - professional, deeply customizable graphics for anything: live
       data, automation, multi-operator shows. The last frontier, and the reason the data hub and
       the export platform are built the way they are.

---

## Parking lot

Real work, deliberately not now. Each has a plan doc; none is current until it is pulled up.

- **Cloud playout stages 2-4** (`docs/CLOUD_PLAYOUT.md`): published/draft versions + rollback,
  operator sharing, rate caps; the **NoaCG Data Hub** (connectors writing `update` rows into the
  same command log - a CSV sheet driving a ticker, then a real provider); professional automation
  (real-time streams, sports/timing feeds, the local Bridge, public API, Companion/Stream Deck,
  redundant renderers). Stage 3 is the same goal as the old "data-driven/live content" line.
- **Migration 0034 is not yet applied to production** - the per-graphic `live_cue` map. Blocks the
  multi-layer wire half.
- **Adapt-first paid proofs** (`docs/ADAPT_FIRST_PLAN.md` §6.2/§6.3): shortlist-beats-digest, and
  folding Lite onto the platform placement rule. Both need explicit spend approval.
- **Managed funded AI tier** - quotas, credit weighting, an Auto route. Belongs with Extreme.
- **Payments/subscriptions** - long beta first; separate private repo, Stripe, metered generations.
- **Nightly auto-generated graphics library** (`docs/NIGHTLY_AUTOMATION_PLAN.md`) - committed
  direction, unscheduled.
- **Video/animation projects** - the parallel Beta shell stays where it is until the north star
  lands.
- **Google Fonts import, the dedicated preview channel, Home polish** - postponed by the student
  release, still wanted.

---

## Quality bar (always-on)

- `npm run build` green - the CI gate (typecheck, lint, workflow and instruction checks).
- Every new user-facing flow ships with a Playwright spec **and its entry in the affected-mapper**
  in the same commit, or it only ever runs at night.
- Catalog changes run their gates: `l3-sweep`, `type-floor`, `overflow-sweep`, `field-coverage`,
  `numerals`, `engine-floor`, and the calibration tripwire. The nightly runs them unconditionally.
- Observable behaviour is never called done on a green build alone - it is verified in a browser.
