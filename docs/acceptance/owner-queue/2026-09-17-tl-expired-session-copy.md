---
kind: walk
date: 2026-09-17
because: taste
serves: now
---
# The session-expired dialog no longer offers a free account to somebody who has one

## Before

Open `/app` on a hosted build, sign in, then dispatch a session-expiry event (the app raises the
same one when a refresh token dies):

```js
window.dispatchEvent(new CustomEvent('spx-session-expired'))
```

The dialog opened with the reason line "Your session expired - sign in again to keep syncing.
Everything you made is safe on this device.", and under it, the free-account sentence: "A free
account keeps your work with you on any computer, adds AI, and puts a production online so you can
run it from your phone. Making and exporting graphics never needs one." That sentence is written
for someone who has never signed in - the person seeing it here already has an account and is
mid-refresh.

## After

The same event now opens the dialog with the reason line and only the no-wall half of the sentence:
"Making and exporting graphics never needs one." The free-account sentence is gone from this one
path; every other door that opens the dialog with a reason (Community, the shared-template link,
publishing) is unchanged and still shows both.

## Route (under a minute)

1. `npm run dev` against a configured backend (`VITE_SUPABASE_URL` set), or run the pinned test
   directly: `npx playwright test e2e/configured/anonymous.spec.ts -g "session-expiry reopen"`.
2. In the running app, open the browser console and run
   `window.dispatchEvent(new CustomEvent('spx-session-expired'))`.
3. Look at the dialog: the reason line names the expired session, and the line under it reads only
   "Making and exporting graphics never needs one." - no free-account sentence.

## What changed

`src/App.tsx` opens the dialog with a third `intent`, `'resume'`, instead of the default `'signin'`.
`src/components/auth/SignInDialog.tsx` answers that intent by skipping `ACCOUNT_IS_FOR` in the
sub-line. `src/components/auth/authUi.ts` names the new intent in its type. The test is pinned both
ways in `e2e/configured/anonymous.spec.ts`: the new "session-expiry reopen" test asserts the
sentence is absent, and the existing "account features prompt for sign-in" test (Community door)
still asserts it is present.
