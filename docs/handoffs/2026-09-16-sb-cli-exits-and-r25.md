# SB - `noacg login` exits, and R2.5 gets a number

Branch `claude/sb-cli-exits-and-r25`. Worktree `agent-ad49480b8cece8dda`.

## Is 0.3.3 ready to release? Yes, and row SE should

`cli/package.json` is **0.3.3**, `npm --prefix cli run build` has stamped the six generated copies
(four plugin manifests, both root marketplace entries) and `cli/package-lock.json` carries the same
version, so `check:skill` and the release workflow's `git diff --exit-code` both pass. Nothing else
in `cli/` changed except `login.ts` and the tests. `npm run release:cli` was NOT run: the script
reads the version from `origin/main`, so it waits until this branch has landed. That is row SE's.

**Until it is published, the R2.1 route still hands a room the hang**, because it runs
`npx -y @noacg/cli`, which takes 0.3.2 from the registry. The demo document says so in the R2.1
cell; if the publish slips past the 25th, that sentence is the one that matters.

## What landed

**The login hang (§7 row 14's login half, R2.1, R2.4).** `login` minted the key, stored it, printed
its success line and then never exited - 923 s on 2026-09-10 until it was killed.

Reproduced first, and the backlog's stated mechanism is *nearly* right in a way that matters. It
said established keep-alive connections survive `server.close()`. They do not, on any Node since
19: `close()` closes connections that are IDLE in the HTTP sense, and a keep-alive socket that
finished its request is idle. My first reproduction attempt therefore exited in 303 ms and proved
nothing. What actually holds the loop is a connection with **no finished message on it** - a
browser's speculative/preconnect socket. It is not idle, so the close spares it, and nothing times
it out either, because closing the server also stops the interval enforcing `headersTimeout` and
`requestTimeout`. Probed all three states directly on Node 24: a completed keep-alive socket lets
the process exit, a bare TCP connection and a half-sent request both hold it open indefinitely.

With that socket held across the handoff the real CLI hung exactly as reported, and exited 100 ms
after the socket was released. The 923 s was the life of the consent tab.

`closeAllConnections()` beside `close()` on both paths is the fix (`cli/src/commands/login.ts`, one
`shutdown()` helper). The 300 s timeout was never implicated: `handoff.finally(clearTimeout)`
cancels it on success by design.

**Both exits are pinned** in `cli/test/unit.test.mjs` ("the login handoff exits"), and both were
confirmed RED against a build with the fix removed from `dist/` - the success test failed on
"login did not exit within 5000 ms", the giving-up test on 20000 ms. Green after: 0.65 s and 6.4 s
(the giving-up test waits 6 s by design, see below).
The tests drive the real binary against a stand-in deployment and hold a browser-shaped pair of
sockets open the whole time, so they fail again the day somebody drops the socket handling.

## The numbers

| what | measured | how |
|---|---|---|
| successful login exits | **0.3 s** after the code arrives, tab still open (0.65 s for the whole test) | `cli/test/unit.test.mjs`, loopback stand-in, Node 24 |
| the same login, unfixed | still running at the deadline; exits 100 ms after the socket is released | same rig, fix removed from `dist/` |
| giving-up login exits | **6.4 s** on `--wait 6`, exit 1, message on stdout | same rig |
| **interactive login against `noacg.studio`** | **1.5 - 5.1 s from Allow to exit 0** across seven runs (1.54, 1.83, 1.93, 2.36, 2.88, 3.07, 5.11), consent tab open every time | `scripts/save-to-air-bench.mjs`, jobs `j-1176` to `j-1198`, local 0.3.3 build |

That last line is the one worth keeping: the fix is not only green on a stand-in, it is measured
against the real deployment through the real consent page.

## R2.5, the last hop, measured

**7.4 s and 7.8 s from `noacg save` returning to the graphic READABLE on a production's public
output URL**, against `noacg.studio` with the E2E account, 2026-09-16 (`j-1198` and `j-1188`).
Segments from the last run: 2.5 s before the studio's own library shows the graphic, 0.2 s to make
the production, 0.1 s to add the graphic, 1.4 s to publish, 2.5 s to open the output URL cold and
wait out its 1.2 s boot settle, then 0.2 s from TAKE to the entrance and 0.7 s to a readable frame.
A warm take, on an output page already open and with the graphic PROVEN off air first: 0.2 s to the
entrance, 0.7 s readable.

Two things I would defend if challenged, and one I would concede. It is DRIVEN, so nobody's
thinking or typing is in the composite - the take numbers are the product's own. The output URL is
opened cold INSIDE the composite, where a real browser source is opened once and left there, which
makes the composite pessimistic by about 2 s. What I would concede is that it is one account, one
laptop, one network, twice.

**The instrument is `scripts/save-to-air-bench.mjs`.** Its name is what puts it inside the
`*bench*` family the browser-job guard already knows, so nothing lists it. Re-derive with
`node scripts/jobs.mjs add "node scripts/save-to-air-bench.mjs" --cost 0.5`. It needs `.env` with
`E2E_EMAIL` / `E2E_PASSWORD` in the checkout it runs from (a linked worktree has none - I copied
the primary checkout's `.env` into this one, and it is gitignored). It cleans the shared account
after itself: unpublish, delete the production, delete the graphic, revoke the key, and every run
did that correctly including the failures.

**It took eight queued jobs, not the one the row asked for**, four of which completed the walk.
Each was two or three minutes, and each failure taught something only the hosted app could: the
Control dock needs advanced mode, creating a production lands you ON its page rather than in a
list, the library picker is built from the library the page loaded with, and a credential store
inside the scaffold target makes `scaffold` refuse a directory that is "not empty".

**The measurement was wrong once, and the screenshot is what caught it.** The first version polled
the graphic's own opacity inside the output iframe and reported "on air" in 0.6 s - while the
screenshot beside it was black. A fresh output page replays the rows it missed with the whole STAGE
hidden (`stage.setVisible(false)`, 1200 ms settle, `src/output/main.ts`), so the graphic can be
played and opaque inside a frame nobody can see. The script now multiplies the two opacities, waits
for the page to settle before taking anything, and follows the team name until it stops moving,
which is the difference between "the entrance started" and "a person can read it".

**The deck carried the stale claim and now does not.** Slide 5 said "the hop from the library to
air is still untimed" and told the presenter to warn the room that the terminal goes quiet after
Allow. Both are false as of today, so `make-deck.mjs` was corrected and the deck rebuilt (§7 row
13, which says the owner has still not opened it). Nobody had hand-edited it since the 2026-09-10
rebuild, which is the only condition under which regenerating is safe.

## What the check found, since three of its findings were real

`review: delegated` (scope matched: base `6150d0ba`, this branch, the 19 files
`review-request.mjs` handed it), `simplify: inline` (the skill returned fan-out instructions,
which the workflow counts as not run), `verify: inline`, `taste: not applicable` - nothing here
can move what a graphic looks like.

The review was worth the wait. **It caught that the bench reached into the machine's real
credential store**: every CLI child inherited `process.env`, so `NOACG_AGENT_KEY` would have beaten
the key the walk had just minted (measuring a walk nobody made), and the `logout` in the cleanup
would have REVOKED that key on the server - for a CI key, killing it for everyone. The store is now
redirected into the run's own temp directory and the variable is dropped. **It also caught that the
warm second take could be fabricated**: `onAir()` is a level test, so pressing TAKE two seconds
after OUT without checking would have returned on the first poll and printed the click latency as
time-to-air. The script now proves the graphic is off air first - and the number survived, which is
the only reason the warm figure is still quoted. Third, **the test helper leaked its spawned CLI**
when setup threw, and the giving-up test's 2 s wait raced its own setup (the clock starts when the
listener opens, before the helper has read the consent URL). Both fixed; the wait is 6 s.

Two findings I fixed as written and one I reverted: the `SWEEP_SCRIPTS` entry I had added for the
bench was dead, because `[\w-]*bench[\w-]*` already matches it, so `scripts/command-match.mjs` is
untouched and the bench's name is what covers it.

**This machine's CLI credential store is empty**, and one of the earlier bench runs is the likely
reason: before the sandbox fix, each run's `login` overwrote the stored key for `noacg.studio` and
the cleanup revoked it. If `noacg whoami` says there is no key, `noacg login` mints a new one; no
key belonging to anyone else can have been revoked, because the account is the E2E one.

## Traps that are in no repo file

- **`server.close()` on Node >= 19 already closes idle keep-alive connections.** Anything written
  before that (including the backlog file this branch deletes) describes a Node that no longer
  exists. The socket that survives is the one that never finished a message.
- **A reproduction that uses `http.Agent({keepAlive:true})` does NOT reproduce a browser.** A real
  browser opens a speculative connection as well, and that is the one that holds the process. A
  repro without it exits cleanly and tells you the bug is fixed when it is not.
- **The consent page needs a signed-in session in the SAME browser context**, and
  `getByRole('button', { name: 'Allow' })` is ambiguous on the hosted app - the analytics consent
  banner has an Allow button too. Use `agent-consent-allow`.
- **The hosted build serves no `/src/**` modules**, so every `page.evaluate(() => import('/src/…'))`
  in `e2e/configured/_helpers.ts` fails against `noacg.studio`. Read what you need out of the UI
  instead: the output URL is `code.prod-url` in the links popover.
- **The library's Control dock is advanced-mode territory.** Without the `spx-gfx-prefs`
  `advancedMode` pref written before the first navigation, `dock-tab-control` never appears and a
  driver waits out its timeout on a page that looks perfectly healthy. The Home → Productions route
  needs no editor at all and is what `save` itself tells the user to do.

## What is left, and why

- **Publish 0.3.3** (row SE). Everything else in this branch is true today; that one is true only
  after the publish, and the R2.1 route runs `npx`.
- **Nobody has watched `noacg login` from a human terminal since the fix.** Four driven runs and
  two tests say it exits; the owner-queue item is a minute of his time to see the prompt come back.
- **The link `save` prints still lands on Home** - row SA's, untouched here. My probe walks around
  it by going to Home → Productions, which is what `save`'s own printed line tells the user to do.
- **The deck has still never been read cold** (§7 row 13). I changed two of its sentences and
  rebuilt it; that is not the same as somebody presenting from it.
- **R2.5 is two runs on one laptop.** If the number is going in front of a room, a third run on a
  different network would be cheap insurance: `node scripts/jobs.mjs add "node
  scripts/save-to-air-bench.mjs" --cost 0.5`.

## Pointers

- `cli/src/commands/login.ts` - `shutdown()` and the two call sites.
- `cli/test/unit.test.mjs` - "the login handoff exits", with `drivenLogin()`.
- `docs/AGENT_CLI.md` - the 0.3.3 entry in the version log.
- `docs/acceptance/owner-queue/2026-09-16-noacg-login-gives-the-terminal-back.md` - the owner's
  one-minute route to see the prompt come back.
- `scripts/save-to-air-bench.mjs` - the R2.5 instrument, covered by the `*bench*` family in
  `scripts/command-match.mjs` rather than by a list entry.
