---
kind: walk
date: 2026-09-16
because: taste
serves: now
---
# Two Space modes: the checkbox you asked for on 2026-09-10

Changed: the playout dashboard has a checkbox in the verb bar, under the on-air chip, reading
**SPACE previews first**. Unticked is exactly what the dashboard did yesterday. Ticked is your
mixer cut: walking the rundown with the arrows previews nothing; SPACE puts the selected cue on
PREVIEW; SPACE again airs it; SPACE on a cue that is on air takes it off and leaves it on PREVIEW.
The TAKE button wears the same three faces the key runs, so it reads **→ PREVIEW** (amber) on a
fresh cue, **⟳ TAKE** on the previewed one, **■ TAKE OFF** on the live one. It is on the in-app
page, the hosted page and the exported controller, and it is remembered per browser.

**Route, under a minute.** Open any production with two or more cues on its production page (Home
› Productions › open one; or add a second cue with **+ Add cue** at the foot of the rundown). Tick
**SPACE previews first** under the verb buttons. Press **↓** and watch PREVIEW stay where it was
while the rundown cursor moves. Press **SPACE** three times: the cue goes to PREVIEW, then to air,
then off air and back to PREVIEW. Untick the box and press **↓**: PREVIEW follows the cursor again.

**What to look at.**

- Whether the amber **→ PREVIEW** face reads as "this is safe to press" beside the red **⟳ TAKE**,
  and whether the button changing face as the cursor moves is a help or a distraction.
- The one decision that is mine, not yours to re-derive: SPACE on a live cue takes it OFF in both
  modes, one press, and lands it on PREVIEW. The other reading of "like a cut button" would have
  put a second press between an operator and a clean screen. `docs/PLAYOUT_DASHBOARD.md` §2f says
  why; overrule it there if the mixer feel is wrong.
- The editor follows the cursor, the PREVIEW monitor follows SPACE. The kicker reads **EDITING
  SELECTED CUE** while they differ. Say if you would rather the editor waited for SPACE too.

Action needed: nothing. The hosted page's own walk in this mode runs in CI with a backend
(`e2e/configured/hosted-space-modes.spec.ts`); this branch could not run it from the worktree.
