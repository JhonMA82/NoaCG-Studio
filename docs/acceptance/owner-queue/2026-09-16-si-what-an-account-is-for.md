---
kind: walk
date: 2026-09-16
because: taste
serves: now
---
# What an account is for, said where we ask, and where a save goes in each state

Your two notes: *"I don't have a really good reason for people to be logged in"* (2026-09-04) and
*"we need to have a clear indication when we are logged in and when we are not"* (2026-09-10). The
first has one answer now, read off what a signed-in person actually gets, and it is said at the
moment we ask. The second has a second carrier beside the topbar word: the save dialog names where
the graphic is going, differently in each state.

**The sentence**, and it is the thing to judge here:

> A free account keeps your work with you on any computer, adds AI, and puts a production online
> so you can run it from your phone.

Under it, in every shape: *Making and exporting graphics never needs one.*

Those are the three things the code gives an account and nothing else: the library syncs to the
account and back to any browser you sign in on; every AI path on the hosted studio needs one; and
publishing a production, the control page a phone drives and the output link, needs one. Community,
teams, the CLI's `noacg save` and the ProRes render tier are real too and are left out on purpose,
because none of them is what a student two weeks before a show is deciding on. Nothing in the
sentence is a promise about the roadmap.

**Route (under a minute), on the hosted build, signed OUT:**

1. Open `/app`, close the wizard, click **Sign in** at the right end of the topbar. The card's
   first line is the sentence above, and the no-wall line sits under it.
2. Close it. Click **Community**. Now the card leads with why you were asked ("Sign in to browse
   the community gallery.") and the sentence follows it, so a reader who came for the gallery still
   learns what the account is for beyond the gallery.
3. Close it. Open the **AI** panel. The inline gate carries the same sentence under its own reason.
4. Make any graphic and click **Save**. The line under the name field reads: *Saved graphics live
   in your library on Home, on this computer only.*

**Signed IN:**

5. Sign in, make any graphic, click **Save**. The same line now reads: *Saved graphics live in your
   library on Home and follow you to any computer you sign in on.*

**What to look at:**

- Whether the sentence is one you believe. It was written from the code, so it is true; the
  question is whether it is the sentence you would say to a student. If a clause feels thin, the
  honest move is to cut it, not to add a promise.
- Whether the save line is the right amount. It is a fact with no button on it, and it is the
  same fact the topbar's "Not signed in" tooltip already carried, moved to the moment a student is
  actually looking. I rejected a hollow avatar in the signed-out topbar (a "you are missing
  something" shape, and width the bar was measured not to have), an amber Sign in button (an
  advertisement on a broadcast bar), and a "saved on this computer" chip beside "Not signed in"
  (two dim words saying one thing). The header is untouched.
- The same sentence also stands in **Settings, Account** when signed out, and is the topbar's
  Sign in tooltip, so there is one answer everywhere instead of three.

The pins: `e2e/configured/anonymous.spec.ts` (the dialog from the topbar, the dialog from a door,
the inline gate, the signed-out save line), `e2e/configured/signed-in-ux.spec.ts` (the signed-in
save line) and `e2e/auth.spec.ts` (an offline build says neither). The configured pair runs on the
landing and nightly, not on the pull request.
