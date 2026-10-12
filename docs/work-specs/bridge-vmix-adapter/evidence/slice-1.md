# Slice 1: the Bridge finds vMix and drives the output input

Revision `670866b28e447006b31510a6af6928676db7f69e` (branch `claude/i-vmix-adapter-slice1`), reviewed by
the session that built it, 2026-10-12. vMix 29.0.0.49 (Trial) on the development laptop.

## What the slice is

`cli/src/playout/vmixTcp.ts` (the TCP API wire: one kept connection per port, the greeting, `XML`
by byte length, `FUNCTION` replies, `ACTS` lines kept out of replies) and
`cli/src/playout/adapters/vmix.ts` (status, `/state` overlays, Put on air, Take off and Clear),
wired into `noacg bridge` with `--vmix-port`. The protocol gains the vmix target and slot, an
item's `label`, a clear's `item`, an error's `setup`, `/status`'s `vmix` and `VmixStateReply`.

## AC-1: pass

- `cd cli && npm run build && node --test test/vmix.test.mjs` against the fake vMix TCP API
  (`cli/test/_fakeVmix.mjs`, answering as 29.0.0.49 did): 21 of 21 pass. The AC-1 tests: `/status`
  reports version, edition, `overlays` 8 and the input count, `/health` lists `vmix` (and not
  `vmix-link`, which the spec now puts in AC-4); nothing listening is `not-running`; a port that
  never greets is `not-vmix` after 3 s and one that greets with `HTTP/1.1 400` at once, with
  nothing sent to either; vMix 28 reads 4 channels and Basic HD 1; the adapter's own port (what
  `--vmix-port` sets) is used unless the target names one.
- Real: the built `noacg bridge --no-open` with vMix closed answered `/status` with `setup:
  "not-running"`; with vMix started, `/status` (the page's Try again) answered `VERSION OK
  29.0.0.49; Trial, 8 overlay channels, 2 inputs` and `vmix: { version: "29.0.0.49", edition:
  "Trial", overlays: 8, inputs: 2 }`; `/health` listed `["casparcg","ograf","vmix"]`.
- Not checked on a real host: a wrongly greeting port (only the fake), vMix 28 and Basic HD.

## AC-3: pass (the Bridge; the page's buttons come with AC-2)

- Fake: Put on air sends exactly `AddInput Value=Browser|<url>`, `SetInputName
  Input=<key>&Value=NoaCG <title>`, `OverlayInput8In Input=<key>`; every `Input=` is a key; again
  reuses the input; an input added a moment after vMix's OK is waited for; two productions put on
  air at once each get their own input; an Image input holding the name is refused after one read
  with no function; Take off and Clear send `OverlayInput8Out` / `Off` only when channel 8 holds
  the output and nothing when it holds another input or none; no function outside AddInput,
  SetInputName and OverlayInput<N>In/Out/Off is ever sent.
- Real (log of the built Bridge, run twice, the second time on this revision's code but for one refusal's wording): Put on air
  added "NoaCG Real Run ÄÖ & co" as type `Browser`, a watching TCP client saw `ACTS OK Overlay8 1
  1`, and the page server saw `/output?production=probe&name=vMix`, the whole address; a second
  Put on air reused the key; Take off sent `OverlayInput8Out` and the `0` came 510 ms later; a
  second Take off answered `already off: overlay 8 holds nothing`; Clear sent `OverlayInput8Off`;
  with an Image input on Overlay 8, Take off and Clear answered `already off: overlay 8 holds
  "NoaCG Collision"` and it stayed; Put on air under a name an Image input held was refused with
  the input count 2 before and after.
- Limit: the output input is found by its name only until the link (AC-4) keeps its key, so a
  production renamed while on air, or two productions with one title, are matched by name.

## AC-6: unverified (part of it built)

Built and tested: every verb vMix cannot honour (`update`, `next`, `pause`, `resume`, `sequence`,
`ending`, a template or media take, a list, a thumbnail) is refused with no connection made; a
connection dropped mid-function answers `uncertain`, the function is not resent and the next
request reconnects; a function with no answer is `uncertain` after the reply wait; `FUNCTION ER`
is `refused`; one connection served every `/state`, `/status` and `/act` with `ACTS` lines
between replies. Real: vMix force-closed under the running Bridge read `not-running` at once, and
the first request after vMix started again connected.

Left for the press slice: the reconnect's `SUBSCRIBE ACTS`, overlays changed while disconnected,
a send the backend refuses.

## Real vMix checks answered

Points 1, 2, 3 (a preset across sessions), 5 and 6 (but the thumbnail) of the spec's list, written
into the spec and `docs/VMIX_ON_A_REAL_HOST.md` §7. Open: 4 (Cut transition), 7 (enhanced
security), 8 (other editions), 9 (Browser input size), 10 (press to animation, AC-7).

## How vMix was left

Six starts, each with `%APPDATA%\last.vmix` and its `user.config` backed up first and restored
after a forced close (SHA-256 as before). The background service was untouched. Nothing of the
runs is left running.

## AC-2, AC-4, AC-5, AC-7, AC-8: unverified

Not built in this slice: the pairing page and Settings (AC-2), the production link and cue inputs
(AC-4), overlay presses as takes (AC-5), the press-to-animation round (AC-7) and the release (AC-8).
They stay listed on issue #760.
