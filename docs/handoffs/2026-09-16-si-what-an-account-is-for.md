# SI - what an account is for, said where we ask, and where a save goes in each state

**Branch:** `claude/si-what-an-account-is-for`, on merge base `6da34769`. **Date:** 2026-09-16.
**Model:** fable high.

The owner's two halves both have an answer now. What an account is FOR is one sentence, derived
from the code, said in the sign-in dialog, the inline gate, the topbar tooltip and Settings, with
the no-wall line under it. Which state you are in has a second carrier beside the topbar word: the
save dialog names where the graphic is going, differently signed in and signed out, and says
neither offline. `docs/backlog/signed-in-looks-identical-to-signed-out.md` is closed (deleted in
this change, citations repointed first). The owner-queue item is
`docs/acceptance/owner-queue/2026-09-16-si-what-an-account-is-for.md`, `because: taste`,
`serves: now`.

## The honest list - what a signed-in visitor gets today that a signed-out one does not

Read off `src/entitlements/contract.ts` FEATURE_KEYS and the gates that call `needsSignIn` or
`openSignIn`, not off any plan:

| feature | where the gate is | what it is, in the reader's terms |
|---|---|---|
| `sync.cloud` | `SyncStatus`, `backend/syncController.ts` | the library (graphics, productions, videos) follows the account to any browser you sign in on; signed out it is this browser's storage only |
| `ai.lite`, `ai.pro`, `ai.video`, `ai.import-analysis`, `ai.byo-key` | `AiStep`, `AIPromptPanel`, `VideoStep`, `VideoAiChatPanel`, `AnalyzeProposalPanel` | every AI path on the hosted studio, bring-your-own-key included (`docs/PROMISE_AUDIT.md` row 6) |
| `control.hosted` | `ProductionPage.publish` | a published production: the hosted control page a phone drives, the persistent output link; operating the page needs no account |
| `audience`, `showchat` | `ControlPanel`, the join page | audience send-in and votes, which need a published production |
| `community.publish` | `AppShell` community button, share links, the publish sheet | browse the gallery, publish to it, open a shared template |
| `render.cloud` above the anonymous tier | `RenderFormatPicker`, `render/limits.ts` | ProRes and image sequences; anonymous rendering is mp4/webm/png, 15 s, two jobs an hour |
| teams | `JoinTeamDialog`, `useTeamsAvailable` | join a team and hold a production together |
| agent access | `AgentAccessConsent` | `noacg save` from the CLI or MCP into your library |

The answer is not thin. What is thin is the student's share of it: community, teams, agent keys
and ProRes are real but are not what a student two weeks before a show decides on. So the sentence
carries the first three rows and nothing else:

> A free account keeps your work with you on any computer, adds AI, and puts a production online
> so you can run it from your phone.

with *Making and exporting graphics never needs one.* under it. Both live once, in
`src/components/auth/accountCopy.ts`, and the four surfaces import them. Before this the dialog,
the tooltip and Settings each listed a different three.

## What I decided in step 4, and what I rejected

**Decided: the save dialog names where the graphic goes.** Signed out: *Saved graphics live in
your library on Home, on this computer only.* Signed in: *... on Home and follow you to any
computer you sign in on.* Offline, and while the stored session is still being read, the sentence
is unchanged. The reasoning is that the topbar word is the quietest thing on the bar by design, and
the person the owner worries about is the one who never reads it; a save is the moment that person
is looking, and a file dialog naming its destination is a convention nobody reads as a nag. It is a
fact with no button on it. The header is untouched.

Rejected, with the reason each time:

- **A hollow avatar in the signed-out topbar**, so both states share a shape. It is a "you are
  missing something" shape, which is the nag the pillar refuses, and it costs 42px on a bar whose
  signed-out ladder was measured to 1240 without it (`src/styles/auth.css`).
- **An amber primary Sign in button.** Visible from across the room, and an advertisement on a
  broadcast bar during a show.
- **A "saved on this computer" chip in the sync slot signed out.** Two dim words beside each other
  saying one thing; the save dialog says it where it is read.
- **A state word in the wizard header.** The wizard covers the topbar on boot, which is a real
  gap, but the one wizard door where the state matters (AI) already says "needs a free NoaCG
  account" when clicked, and the wizard's header is about what you are making.

**The dialog's two shapes.** Opened from the topbar there is no door, so the account sentence is
the first line and the no-wall line the second. Opened from a door, the door's own reason leads
("Sign in to browse the community gallery.") and the account sentence moves under it with the
no-wall line, so a reader who came for the gallery still learns what the account buys beyond it.
Every gate's per-door reason is unchanged.

## Files outside the TOUCHES line, and why

- `src/components/auth/accountCopy.ts` (new): the one home for the two sentences.
- `src/components/SettingsDialog.tsx`: its Account section listed a third version of the answer.
  One line, now the constant.
- `src/components/save/SaveDialogs.tsx`: the state carrier from step 4. The prompt named
  `AppShell.tsx` as a possible site and I left it alone; the shell has nothing to say that the
  topbar does not already say.
- `scripts/copy-baseline.json`: re-recorded. `AuthStatus.tsx`, `SignInDialog.tsx` and
  `SaveDialogs.tsx` reached zero em-dashes and left the baseline; `SettingsDialog.tsx` went from
  five to four. The gate is exact in both directions, so the drop had to be recorded.
- `docs/acceptance/owner-queue/2026-09-05-you-can-see-whether-you-are-signed-in.md` and
  `docs/backlog/teams-invite-join-code-and-what-a-new-member-sees.md`: the two live citations of
  the closed backlog file, repointed to the new owner-queue item. In the 2026-09-05 item the
  repoint lives in the re-kind preamble only; the original text under it promises to be
  unchanged and still names the closed file, on purpose.
  `docs/metrics/2026-09-10-orchestrator-in-codex-plan.md` names the slug twice as that day's
  record and stays as history.
- From the review (below): `src/components/auth/AgentAccessConsent.tsx`, one reason string that
  opened with the same three words as the sentence now under it; `src/styles/auth.css`, the
  gate scrolls instead of clipping a card taller than a short window; `scripts/e2e-affected.mjs`,
  `SaveDialogs.tsx` now selects `auth.spec.ts` as well as `project.spec.ts`;
  `scripts/e2e-lists.mjs`, the four live-only surfaces are configured triggers so an affected
  run prints the "also run the live suite" line for them.

## Where the pins are, and the trap in the prompt's own line

The prompt said to pin both halves in `e2e/auth.spec.ts`. That spec runs the OFFLINE config, where
the app grows zero auth UI, so nothing in it can tell signed in from signed out. The pins that can
are in the configured suite:

- `e2e/configured/anonymous.spec.ts`: the dialog from the topbar (sentence first, no-wall line
  under it), the dialog from the Community door (reason first, sentence under it), the inline AI
  gate, and the signed-out save line.
- `e2e/configured/signed-in-ux.spec.ts`: the signed-in save line, inside the publish walk that was
  already saving a graphic.
- `e2e/auth.spec.ts`: the offline save line says neither.

**The configured suite runs on the landing and nightly (`configured-suite.yml`, push on main), not
on the pull request.** `scripts/e2e-affected.mjs` ignores `e2e/configured/**` on purpose. So the
two configured pins are first exercised minutes after this lands, on the rolling issue that
workflow owns, and the offline pin is the only one CI runs before. The verdict to read is that
workflow's run for this landing, not the PR's green.

**Red before green.** Every pin locates by a test id that did not exist at the merge base:
`git grep -e save-where -e auth-reason -e auth-account-for -e signin-prompt-for 6da34769 -- src e2e`
finds nothing, so each locator resolves to no element there and each `toHaveText` or
`toContainText` fails; the offline pin's `not.toContainText` sits behind a positive
`toContainText` on the same missing element for the same reason. The phrase "any computer you sign
in on" is absent from the whole base tree too. "On this computer only" is NOT: the topbar tooltip
and the agent consent card already say it, which is why the signed-out save pin is scoped to
`save-where` rather than to the page. I did not run the configured suite locally: a browser job
would have waited behind the five landings in the queue, and the prompt said not to.

## Verification

- `npm run build > si-build.log 2>&1; echo $?` twice, read from the build's own exit code:
  **EXIT=0** at `3a0196af`, and **EXIT=0** again over the tree with the review fixes in it, before
  the second commit. `check:copy`, `check:owner-queue`, `check:docs-index` and
  `check:contract-citations` are inside it.
- The three specs are in no tsconfig, so I type-checked them with a throwaway config extending
  `tsconfig.json`: every error reported is pre-existing in `e2e/_browse.ts`, `e2e/_create.ts`,
  `e2e/configured/_helpers.ts` (Vite-root `/src/...` imports inside `page.evaluate`) and one
  `offsetWidth` line in `signed-in-ux.spec.ts` I did not write; none is on a line this branch
  added, and both imports the branch added resolve.
- The offline pin, through the job queue rather than a local battery:
  `node scripts/jobs.mjs add 'npx playwright test e2e/auth.spec.ts -g "save dialog names no account"'`,
  job `j-1207`, **1 passed** in 12.7 s.
- Looked at, in this worktree's own dev server with a dummy backend in `.env.local` (deleted
  before the build), at 1366x768: the dialog from the topbar (sentence, then the no-wall line),
  the dialog from the Community door (reason, then both under it), the AI panel gate (reason,
  sentence, Sign in), and the save dialog signed out ("on Home, on this computer only"). The
  signed-in half cannot be seen without a real backend and is pinned in `signed-in-ux.spec.ts`
  for the landing run.
- Not run here: `npm run test:e2e:affected`. One browser-driving job runs per machine, two rows
  had live probes in the queue, and the prompt said CI runs the spec; `ci.yml` plans it from the
  changed files, and the `SaveDialogs.tsx` row now includes `auth.spec.ts`.

## The check

- `review: delegated`. The pass reported base `6da34769` on `claude/si-what-an-account-is-for`,
  and the file list it read is the 14 files `scripts/review-request.mjs` printed plus the one
  deletion; `git diff --name-only 6da34769..HEAD` plus `git status --porcelain=v1` (the untracked
  handoff) gave the same 15. Scope matched, so the pass stands. It returned ten findings; the
  ones confirmed against the code and fixed: the signed-in save clause now reads the SYNC phase
  rather than the session, so an account whose sync is in error is not promised its work follows
  it; the dialog's two shapes hang off one `throughDoor` test instead of two ternaries testing
  `reason` differently; the inert `signin-prompt-for` class is gone; the agent consent reason no
  longer opens with the words of the line under it; `.auth-gate` scrolls and `.auth-card` centres
  with `margin: auto`, so a tall signup card cannot hang its close row off the top; the 2026-09-05
  item's original text is back verbatim with the repoint in its preamble; the spec-selection maps
  reach the new pins; the copy assertions in `anonymous.spec.ts` ride the clicks the existing
  "account features prompt" test already makes instead of a second cold boot. Refuted or
  deferred, below.
- `simplify: inline`. The skill returned fan-out instructions, so the four angles were covered
  here: one reuse report (a `useSyncState()` hook would remove the two-line subscribe pattern
  `SaveDialogs` now shares with `SyncStatus`, and it ripples into unchanged code), nothing else.
- `verify:` the second build above, the queued offline pin, and the browser look.
- `taste: answered`. The sentence is read off the code and is the thing the owner-queue item hands
  him. The state carrier is a fact at the moment of saving, chosen over three louder options that
  are listed with their reasons in step 4 above.

## Deferred, with the mechanism named

- **The session-expired reopen shows the free-account sentence to somebody who has an account.**
  `App.tsx:330` opens the dialog with "Your session expired..." and the dialog's door shape
  appends the account sentence. The fix is a third `intent` on `openSignIn`, `'resume'`, that the
  dialog answers with the reason and the no-wall line only. It needs `App.tsx`, which row SA owns
  this wave, so it is not in this branch.
- **Each `useAuthState` consumer starts its own session read at `'loading'`**, so the save dialog
  paints the plain sentence for a tick before the clause arrives, and on a network that
  black-holes the auth host a signed-in user whose token needs a refresh could read the signed-out
  clause after the 6 s bound. The house pattern is per-consumer today (`AuthStatus`,
  `SettingsDialog`, `RenderFormatPicker` all do it); the deeper fix is one auth store, like
  `authUi`, that every consumer reads. That is its own change.
- **The no-wall line under an export gate** ("Sign in to export ProRes 4444." then "Making and
  exporting graphics never needs one.") is the same tension the dialog carried before this branch,
  with "Creating and exporting graphics never needs an account." The line is true of the six
  local export targets and false of a cloud render, and the honest fix is a gate reason that says
  "render" rather than "export". Not this row's copy.

## Traps in no repo file

- `.claude/launch.json` is generated by `scripts/dev-port.mjs` and a hook refuses a hand edit. To
  look at the signed-out state on a worktree with no `.env`, write `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` to a gitignored `.env.local` with any non-empty values: `getSession`
  reads the stored session without a network call, finds none, and the app renders signed out.
  Delete the file before `npm run build`, or `vite build` bakes the dummy backend into `dist/`.
- `e2e/` is in no tsconfig. `npm run build` lints the specs but does not type-check them; a wrong
  import path in a spec passes the build and fails in Playwright.

## Nothing here needs the owner before the day

The one thing that is his is the sentence, and it is on the walk item. If he cuts a clause, the
constant is the only place to edit and the anonymous spec's two `toMatch` lines say which words
it must keep.
