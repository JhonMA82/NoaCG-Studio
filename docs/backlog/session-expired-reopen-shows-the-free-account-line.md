---
v: 2
source: derived
kind: finding
raised: 2026-09-16
state: unstarted
found: "the session-expired dialog reopens with the free-account sentence appended, even for somebody who has an account"
---
# The session-expired reopen shows the free-account line to somebody who has one

**Filed:** 2026-09-16, during the 2026-09-16 handoff drain (row TE), carried over from
`docs/handoffs/2026-09-16-si-what-an-account-is-for.md`, which named the fix but left it out of
that branch because it needs a file the branch did not own.

## Why

`App.tsx:357` opens the sign-in dialog with "Your session expired - sign in again to keep
syncing. Everything you made is safe on this device." and the dialog's door shape appends the
free-account sentence under it. That sentence is written for someone who has never signed in; a
person whose session merely expired already has an account and is told, at the exact moment their
token needs a refresh, about a thing they already possess.

## What it would take

A third `intent` on `openSignIn`, `'resume'`, that the dialog answers with the reason and the
no-wall line only - no free-account sentence. Touches `src/App.tsx:357` and
`src/components/auth/authUi.ts`.

## Evidence

`docs/handoffs/2026-09-16-si-what-an-account-is-for.md`, "Deferred, with the mechanism named" -
the row that wrote the current sign-in copy named this gap and left it for a session that touches
`App.tsx`, which it did not own that night.
