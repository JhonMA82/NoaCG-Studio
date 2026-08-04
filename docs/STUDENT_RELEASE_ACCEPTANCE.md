# Student release — owner acceptance checklist

The final gate of the student release (docs/GOALS.md, step 10). The agent-automatable half is
DONE and named below so nothing is re-tested by hand that a spec already pins; what remains
needs real hardware, the real backend, and real people — the owner runs it, against this list,
and the release is accepted when every unchecked box is ticked (or consciously waived here,
in writing).

The Done-when sentence being accepted: *a first-time student can choose or create a supported
graphic, customize it without the editor or AI, prepare and manage cues in a Production,
export or publish it, and reliably operate Take / Update / Next / Out in CasparCG or OBS.*

## 0. What the automated suites already hold (do not re-test by hand)

- Wizard → production → cues → verbs (rehearsal), operator clarity, persistence across
  reload/reopen, stable slugs, republish hint: `e2e/productions.spec.ts`,
  `e2e/production-persistence.spec.ts`, `e2e/wizard-finish.spec.ts`, `e2e/wizard-kit.spec.ts`.
- Wrong take → Out / All out (per-layer, the frame clears): `e2e/productions.spec.ts`.
- Storage-full save fails loudly, last good copy intact, recovery after freeing space:
  `e2e/playout-drills.spec.ts`.
- Exported packages: every relative reference resolves inside its own zip (all 6 targets),
  fonts arrive and load over `file://`, the single-file overlay survives its own autoplay
  with inlined images, CasparCG XML payload drive, OGraf load/update/play contract:
  `e2e/exports.spec.ts`.
- Account essentials: password reset request, recovery dialog, password change round-trip,
  session-expiry prompt with local work intact: `e2e/auth.spec.ts` (offline posture) +
  `e2e/configured/account.spec.ts` (live suite — run it once against the real backend
  before acceptance: `npm run test:e2e:live`).

## 1. Cloud playout on real hardware (CasparCG 2.3.x + OBS)

Follow docs/CLOUD_PLAYOUT.md §8 steps 1-8 in order; the open items from earlier rounds are:

- [ ] §8.4 The verbs against the real output: Take / Update (no replay) / Next / per-layer
      Out / All out, with two graphics on air on separate layers.
- [ ] §8.4b Layer reorder → republish → the output repaints in the new order; a third cue on
      an already-live graphic REPLACES its layer rather than stacking.
- [ ] §8.5 Renderer reboot mid-show: kill the output tab/machine, reload — it snaps back to
      the pre-kill on-air state; commands sent while it was dead apply on reconnect, in order.
- [ ] §8.6 The `?control=` page from a phone (signed out) drives the same production; the
      live chip agrees on both surfaces.
- [ ] §8.7 CasparCG channel restart with the URL loaded (`CG 1-20 ADD 1 "<url>" 1`):
      transparent, correct scale at 1920×1080, recovers after `RESTART`.
- [ ] §8.8 Unpublish → both URLs go dead honestly; republish → the output URL is unchanged.
- [ ] Verbs under load: run the rundown at real operating tempo (stepper hammering included)
      and confirm the 50-commands-per-5-s cap is not hit by one operator + one renderer.

## 2. The export door on real hardware (the no-account path)

- [ ] CasparCG export: load the package from disk on the real server (the README's
      channel-layer-BEFORE-ADD incantation), fonts render, fields update, plays clean.
- [ ] SPX export: import into a real SPX rundown; play/continue/stop from SPX.
- [ ] The HTML overlay in OBS as a LOCAL browser source (`file://` path): transparent,
      fonts correct, `controlpanel.html` beside it drives it (BroadcastChannel needs both
      files opened from the same place — the README says so).
- [ ] Whole-production export: `show_controlpanel.html` drives every graphic of the package
      independently.

## 3. Production-length soak (one real show's length, hours)

- [ ] The output URL stays connected for the full length: heartbeat stays fresh, no visual
      degradation, memory stable in the browser source.
- [ ] The action log stays usable (200-row cap, 7-day prune) and the operator page stays
      responsive late in the show.
- [ ] A renderer reboot mid-soak recovers (the §8.5 drill, but hours in).

## 4. Recovery drills observed live (classroom failures, each SEEN handled)

- [ ] Operator browser refresh mid-show: the production page comes back knowing what is on
      air (per-layer chips) and the rundown selection survives.
- [ ] Edit a cue, republish mid-show: the output updates in place, nothing else replays.
- [ ] Expired session mid-show: the prompt names it, nothing local is lost, re-sign-in
      resumes (the automated twin is configured/account.spec.ts — observe it once for real).
- [ ] Wrong take on air → Out that layer / All out under pressure (the automated twin is
      productions.spec.ts — do it once on the real output).

## 5. People

- [ ] The owner walks the Done-when sentence end to end on real CasparCG AND OBS, through
      BOTH doors (publish and export), timed — under 5 minutes.
- [ ] A first-time user (never seen NoaCG) walks the same path, timed; every point of
      friction goes on a list, and blockers are fixed before acceptance.

## 6. Housekeeping before the verdict

- [ ] `supabase` advisors clean (or findings triaged in writing).
- [ ] The nightly suite green on the focus areas the morning after the soak.
- [ ] Waivers, if any, written into this file with a reason and an owner.
