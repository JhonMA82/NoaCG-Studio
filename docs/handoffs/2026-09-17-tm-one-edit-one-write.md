# TM - one edit on the Data tab costs one write, not one per keystroke

Branch `claude/tm-one-edit-one-write`. Worktree `agent-af58adc85ca99f55b`.

## What landed

The claim was measured before anything was changed, which is the part worth keeping: a Playwright
probe wrapped `localStorage.setItem` and counted the writes to the production-data key while
twelve characters were typed into one value box. **Twelve.** Five characters into a clock field:
**five.** The finder's claim held exactly.

`src/components/home/useDeferredEdits.ts` (new) holds a box's text in the component and commits
when the edit is over - blur, Enter, 500 ms of quiet, the document hidden, the document torn down,
or the component going away. While a box holds an uncommitted edit, nothing the store says changes
what that box shows, and the box carries `data-dirty` and an amber border so that state is on
screen rather than a claim about internals. `ProductionDataPanel.tsx` puts both its value boxes
and its binding path boxes on it. Steppers, Apply JSON, Reset, Clear and Move numbers stay
immediate.

Three tests in `e2e/production-data.spec.ts` pin it, and the counting probe is the useful artefact:
`countPersists` / `resetPersists` / `persistedValue` / `expectOneEditOneWrite`. Route and
before/after are in `docs/acceptance/owner-queue/2026-09-17-tm-one-edit-one-write.md`. Closes
`docs/backlog/a-value-box-on-the-data-tab-writes-on-every-keystroke.md`.

## The prompt's step 4 was not a tail, and the answer is worth reading

The prompt allowed the revert hazard to be filed if it needed a bigger change. It did not, and the
reason is the useful finding: **the two halves of the bug want opposite homes.** Coalescing writes
inside `setLiveData` (ProductionPage) would fix the count for every caller in four lines. It cannot
fix the revert, because three independent paths replace `liveData` out from under a caret - the
cross-tab `storage` listener, the PATCH answer, and the failure handler's `refreshServerData()`
which pulls the *older* server tree back in - and nothing inside `setLiveData` can know which box a
person currently owns. So the deferral belongs at the box, and `setLiveData` now says in its own
doc block that it charges one write per call and that a caller firing at keystroke rate is the bug.

## Evidence and traps that are in no repo file

- **A test that races a debounce is a test about the machine, not the product.** The first
  mid-word test opened a second browser tab, waited for it to load and only then wrote the same
  path - seconds, against a 500 ms settle - so the edit under test had already committed and the
  box correctly showed the arriving value. It asserted a hazard that was no longer present. The
  fix is the shape to copy: the foreign write is one `evaluate` on a tab that is already open
  (no fronting, no focus change) run CONCURRENTLY with the rest of the word being typed, so
  nothing between two awaited steps has to be fast.
- **The count assertions must not pin the runner's speed either.** `expectOneEditOneWrite` allows
  one write plus one per settle window the typing actually spanned. On a healthy run that is
  exactly 1, which is the claim; on a stalled runner it relaxes by precisely as much as the stall
  justifies, and it can never reach the twelve a regression would cost.
- **`pagehide` is not a guarantee on a published production.** The commit there is an HTTP PATCH,
  and a fetch started as the tab is torn down can be cancelled. `visibilitychange` → hidden fires
  while the page is still alive and is the door that usually catches it; the settle timer is what
  makes the case rare. `patchProductionData` does not pass `keepalive`, and I did not add it -
  keepalive carries a 64 KB body cap and that call also carries Apply JSON pastes.
- **The list box could lose the caret.** Deferring made the element choice re-evaluate at commit
  time, so a two-line list typed down to one line lost its newline, the textarea became an input,
  the element unmounted and focus went to the body while the operator was idle. Which element a
  row uses is now decided by the value's TYPE, which a commit cannot change. A multi-line STRING
  can still swap - only when somebody deletes every newline in it - and that is pre-existing.

## Follow-ups, deliberately not grown into this change

Filed as `docs/backlog/the-data-workspace-still-writes-the-show-on-every-keystroke.md` rather than
left here, because the first two below are the ones that get lost:

- **The dataset cells on the Data workspace still write per character.**
  `ProductionDataWorkspace.tsx` (`renameShowDataset`, `renameDatasetColumn`, `updateDatasetRow`)
  each go through `patchShow`, a whole load-mutate-save of the shows store plus an `updatedAt`
  bump - which `productionState.ts`'s own header says ends in a conflict copy that unpublishes a
  two-operator production mid-show. Typing a 20-character column header is 20 of those. Shipping
  "one edit, one write" for the Data *panel* while the Data *workspace* two tabs over still does
  this is a half-kept promise, and it is now a five-line change per input.
- **The audience broadcast rows** (`ProductionAudienceWorkspace.tsx`) are a backend round trip per
  character, on text a producer is editing for air. Different budget, genuinely its own
  investigation.
- **The cue draft in `ProductionPage`** is a fourth copy of this idea at 300 ms, without the
  unload doors or the stale-closure guard. Rewiring it changes what reaches air, so it is its own
  change.
- **`DataLeaf` should carry the list/text distinction.** The panel now writes
  `Array.isArray(leaf.value) || leaf.text.includes('\n')` with a paragraph defending it; one
  `multiline` field computed in `flattenLeaves` would make the rule the model rather than a
  special case. `src/model/productionData.ts` is outside this branch's diff, so it stayed a report.
- **A binding row shows stale controls while its box is dirty.** `hits`, the live-value readout and
  the unbind ✕ all read the committed binding, so the "use `show.title`" suggestion sits beside a
  fully typed path for half a second, and pressing it costs two writes (the blur commits what was
  typed, then the click writes the suggestion). Correct, mildly untidy; not worth the flicker of
  recomputing `matchTitle` per keystroke.

## Nothing needs the owner

The settle delay and the amber border are decided and argued in the acceptance item, where he can
overrule things that exist. No account, money, identity, harness or alignment question.

## Verification

- **`npm run build` - exit 0**, read from its own exit code (`npm run build > log 2>&1; echo $?`),
  twice: once before the `/check` fixes and once over the final tree.
- **`node scripts/e2e-affected.mjs --focus`**, the 62-spec student-critical set, queued. Two runs:
  `j-1271` before the `/check` fixes, **558 passed**, and `j-1277` over the final tree with `main`
  taken in, **557 passed and 1 failed**.
- `e2e/production-data.spec.ts` alone: 24 tests, all passing, including the three new ones. The
  baseline run against the UNFIXED code is the measurement this row is about - 12 and 5.
- **Observed in the running app**, because a green build is not a person seeing it. This worktree's
  own server (`npm run dev:worktree`, port 5210 - `preview_start {name}` is refused in a linked
  worktree and says why), a seeded production, and the panel driven by hand:
  - twelve characters into a value box: **one** write, counted in the page by wrapping
    `localStorage.setItem`; the value persisted; the box amber while typing and plain after.
  - the amber is **distinguishable from focus**: the app's focus style is an `outline`
    (`rgb(238,238,238) auto 1px`) and this is `border-color: rgb(246,166,35)`, so a box that is
    both focused and unsaved says both. Worth knowing before anyone restyles either.
  - **the list case, which is the one that could have gone wrong**: a two-line list typed down to
    one line and then left alone through the settle stayed a `TEXTAREA`, kept the focus and the
    caret, kept its `list` type label, and persisted as `["Only story"]` for one write. Without
    the review fix that is where the element swapped to an `<input>` and focus went to the body.
- **`/check`**: review `delegated`, simplify `delegated`, verify `run`, taste `not applicable`
  (nothing here can move what a GRAPHIC looks like - no design file, template machinery, SVG
  import, fit or alignment code; the panel chrome above was looked at on its own terms). The review's scope was
  checked against `review-request.mjs` before a word of it was believed - branch
  `claude/tm-one-edit-one-write`, base `6ba34fd7`, four files - and matched exactly. Simplify ran
  as four BLOCKING subagents whose results returned into this conversation; nothing fanned out to
  a launcher. Six review findings and nine quality findings; the fixes are in `cba941e5`, the
  refusals are the follow-ups above.

### The one failure, and why it is not this branch's

`e2e/student-rehearsal.spec.ts:111` failed in `j-1277` at line 228: after clicking "Select answer",
`[data-noacg-role~="answer.selected/B"]` never gained `imported-design-on` (17 polls, same
element). Row TB hit the same spec tonight under the same conditions and called it a flake.
**That is not enough to wave it through on this branch specifically**, because this change defers
writes and the test clicks an operator action and then immediately asserts a class on air - a real
regression here would arrive wearing that flake's clothes. Both halves were checked:

1. **It passes alone on this tree.** `j-1278`, `e2e/student-rehearsal.spec.ts --workers 1`: 2
   passed in 28.3 s, the failing test itself in 16.3 s.
2. **The path cannot reach the change.** `useDeferredEdits` has exactly one consumer,
   `ProductionDataPanel`, which `ProductionPage` renders only under `sub === 'data'`. That spec
   never opens the Data tab - no `openWorkspace`, no `tab-data`, no `data-value-`/`bind-` testid
   appears anywhere in the file - so the component is never mounted and the hook is never
   constructed while those buttons are pressed.

A third data point agrees: the same spec passed inside `j-1271`, a 62-spec run that already
carried the deferral. So it is the known flake under a parallel run, not a regression - and the
spec is still worth someone's attention as a flake, which is TB's find and not re-filed here.
