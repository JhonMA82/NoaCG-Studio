# Driving NoaCG from vMix's own Overlay buttons through NoaCG Bridge

## Problem and authority

A vMix operator's hands are on vMix: its input bar, its Overlay buttons, its shortcuts and
controllers. A NoaCG production already runs there, as a Web Browser input on the output URL kept
on one overlay channel all show (measured, `docs/VMIX_ON_A_REAL_HOST.md` §2), but every cue is
taken from NoaCG's own page or a phone, because vMix tells a browser page nothing and no vMix
function can call NoaCG (`docs/research/vmix-inside-vmix.md` §1). The one documented push vMix has
is the TCP API's `SUBSCRIBE ACTS`, which reports an overlay going on or off as it happens (measured,
`VMIX_ON_A_REAL_HOST.md` §3). NoaCG Bridge, already on the operator's machine, is what can hold
that subscription for a whole show.

Authority: `docs/GOALS.md` outcome 5 (one production workflow that plays out to every environment)
and [issue #760](https://github.com/NoaCG/NoaCG-Studio/issues/760), part 1 (P1, owner ask: 2026-09-29,
"be compatible with vMix in every way we can", before the vMix trial ends about 2026-11-28). The
setup is held to the CasparCG owner decisions of 2026-09-30 by analogy, as the OBS adapter is
(`docs/work-specs/bridge-obs-adapter/spec.md`): connecting may happen by itself, putting on air
never does, nothing is retyped. The route is the one `research/vmix-inside-vmix.md` §3 chose and the
walk of 2026-10-12 confirmed. The decisions below marked **derived** are this spec's, open to the
owner's overrule.

## Behaviour

### The route in one paragraph

The NoaCG output stays on one overlay channel for the whole show. Each cue of the production has a
small **cue input** in vMix: a transparent image named after the cue, which shows nothing even when
it is on an overlay. The Bridge subscribes to vMix's activators. A cue input going ON an overlay is
a Take of that cue through the production's command log, the same batch the hosted control page
sends; the graphic animates in inside the output input, which never left the air. The same cue
input going OFF is an Out of its layer, if that cue is still the one on air there. Everything in
vMix that can press an overlay (the button, a shortcut, MIDI or X-Keys, a trigger, the Web
Controller) therefore drives NoaCG, because the Bridge listens to the result, not to the control.

### Setup, one launch

The operator runs NoaCG Bridge on the computer that runs vMix and pairs as today. Nobody types a
host or a port:

1. The Bridge finds vMix on this computer at the TCP API's documented port, `127.0.0.1:8099`
   (vMix's [TCP API](https://www.vmix.com/help29/TCPAPI.html); no password exists for it). It
   needs no file of vMix's read. `noacg bridge --vmix-port <n>` names another port.
2. After pairing, the pairing page asks the Bridge for vMix (`/status` with target
   `{ adapter: 'vmix' }`). When vMix answers, the page says **Connected to vMix 29.0.0.49 on this
   computer** and saves vMix as a playout target. Connecting is the TCP greeting and one `XML`
   read and nothing else, so it happens by itself.
3. When it cannot connect, the page shows one sentence for the state the Bridge names (the
   error's `setup` field), with **Try again**, which is `/connect`:

| State | What the Bridge saw | What the page says |
|---|---|---|
| `not-running` | nothing listening on the port | vMix is not running on this computer. Start vMix. |
| `not-vmix` | the port accepts, but no `VERSION OK` greeting comes within 3 s | Something on port `<port>` is not vMix's TCP API. |

   A Basic HD edition connects like any other, with `overlays` 1: the page says **This vMix has
   one overlay channel and four inputs: the output runs on it, cues are taken from NoaCG**, offers
   Put on air, and disables Set up in vMix.

4. Per production: **Links > vMix > Set up in vMix**, **Put on air** and **Take off**, beside the
   CasparCG ones. **Settings > Playout** gets a vMix section: the connection line,
   **Connect**, and the overlay channel the output goes on (default `overlays`, the highest
   channel this vMix offers, so the graphics draw over the operator's own overlays: higher
   channels draw on top, measured). `overlays` is the count of channels the vMix UI offers, which
   the Bridge derives in one function from the XML's `version` and `edition`: 8 from vMix 29, 4
   before it, 1 on Basic HD; the XML's own `<overlay>` count (16 on vMix 29, measured) is not it.
   The page stores the choice app-wide as `PlayoutSettings.vmix = { overlay }`
   (`src/control/playoutLink.ts`); a missing `vmix` means vMix is not set up.
5. **Set up in vMix** (per production, once, and again after the rundown changes) hands the Bridge
   the production's link and the Bridge makes the inputs (below). The page then shows one line per
   NoaCG layer with the overlay channel it suggests for that layer's cue inputs: the channels
   below the output's, highest first, so a lower third and a bug never share a button. The
   adapter acts on a press on **any** channel; the suggestion keeps vMix's lit buttons true, it is
   not a condition.

With an older Bridge (no `vmix` in `/health` `adapters`) nothing about vMix is offered.

### The production link the Bridge holds

The Bridge today keeps its token and the servers the page connected to, each with its studio setup
(`docs/BRIDGE.md` §3). This adapter has it hold one more thing: a production's **control link**,
the take-capable capability the hosted control page uses (the Data API key cannot take, by design,
`docs/DATA_API.md`), because the press it hears must become a Take with no page open.

- `POST /vmix/link` (token) with `{ target, link: { slug, outputUrl, backend: { url, key } } }`:
  the control slug, the production's output URL and the backend the page itself speaks to (its
  REST address and public anon key, both already in every page load). The Bridge resolves the
  production through the slug the way the hosted page does (`control_show_resolve`, falling back
  to `control_show_by_slug`: the title, the output payload's cues and graphics, the staging
  buffer, the live cue map, and `seq` when the server has the sequence road), makes or updates
  its inputs, writes `vmix-links.json` beside its token and answers the production's title, id
  and cue count. Linking again updates: new cues get inputs, renamed cues are renamed, and the
  inputs the Bridge made for cues that no longer exist are removed (`RemoveInput`); an input the
  Bridge did not make is never removed.
- `POST /vmix/unlink { target, id }` forgets the link; the inputs stay for the operator to delete.
- `POST /vmix/links { target }` answers `[{ id, title, linkedAt, cues }]`, never a slug.
- The slug arrives over the paired channel only (token and origin checked), never in a URL, a
  command-line argument, a log line or a reply. Unlink forgets it. `noacg bridge` also takes a
  link on standard input (`--vmix-link-stdin`, one JSON line) for a machine with no page open.

**The inputs the Bridge makes**, all through vMix functions with the input's **key** (a GUID) as
`Input=`, never its number, since numbers are positions and move:

- the **output input**: `AddInput Value=Browser|<outputUrl>` (works, measured), then
  `SetInputName Value=NoaCG <production title>`; an input of that name already there is reused
  when it is a Browser input, and refused when it is another kind;
- one **cue input** per cue: `AddInput Value=Image|<path>` with a small fully transparent PNG the
  Bridge writes once into its config directory, then `SetInputName Value=NoaCG: <cue label>`
  (a second cue with the same label gets ` (2)`). A transparent image on an overlay leaves Program
  byte-identical (measured).

`vmix-links.json`: per production `{ id, title, slug, outputUrl, backend, output: { key }, cues: {
[cueId]: { key, title, graphic } }, linkedAt }`. A file that cannot be read is an empty list. A key
the XML no longer lists (whether a vMix restart keeps keys is a check) is re-found by the title the
Bridge gave the input, and the new key is written back.

### Target, slot and item (protocol v2, additive on the wire)

- target `{ adapter: 'vmix', port? }`; `port` overrides the default. Always `127.0.0.1`.
- slot `{ adapter: 'vmix', overlay }`: an overlay channel, 1 to 8.
- items: `url` (the production output, or any page), with the production's title as the item's
  `label`, which names the output input. `template` and `media` are refused. Take off and clear
  name the same item, since vMix's own Out and Off take whatever the channel holds.
- `/health` adds `vmix` to `adapters`, and `vmix-link` to `features` once the link routes exist. `/status` and `/connect` add
  `vmix: { version, edition, overlays, inputs }`. `capabilities` for vMix is `['state']`; lists
  nothing; thumbnails none; verbs `take`, `out`, `clear` for a url. Errors may carry `setup`.
- `/state` with `{ target }` answers `VmixStateReply`: `{ ok, session, observedAt, overlays:
  [{ overlay, input?: { key, number, title, type } }], linked: [{ id, output: { onOverlay? },
  live: [cueId] }] }`: what each channel holds, and for each linked production whether its
  output is on a channel and which cue inputs are up.

**The Bridge code this touches** (the protocol is mirrored at `src/control/playoutProtocol.ts`):
`AdapterId`, `Target` and `Slot` gain the vMix members; `readTarget` and the slot reader in
`cli/src/playout/server.ts` get a vMix branch; `targetKey` and `slotKey` in `slots.ts` key vMix by
port and by overlay; `adapters/vmix.ts` is new, with `vmixLinks.ts` beside `servers.ts`. The
senders and the value resolver the hosted page uses, `takeCueItems`, `clearCueItems` and
`hostedCueValues` (`src/control/hostedControl.ts`, which imports supabase-js and browser modules;
`resolveBindings` in `src/model/productionData.ts` for the bound data), move into a
dependency-free module mirrored into the CLI with a drift test, the way `protocol.ts` is.

### The verbs, as vMix TCP API commands

Every command goes over the one TCP connection (`FUNCTION <name> <params>`, `XML`,
`SUBSCRIBE ACTS`), the way vMix documents it, with the parameters URL-encoded, which vMix decodes
(measured). The HTTP API on 8088 is not used, so the Web
Controller's port and password do not matter. Where a function takes `Input=`, it is always a
key; `Out` and `Off` act on whatever the channel holds, so the Bridge reads the channel first and
never sends them over somebody else's input.

| Verb | Commands |
|---|---|
| connect | TCP `127.0.0.1:8099`; wait for `VERSION OK <version>`; `SUBSCRIBE ACTS` when a link exists |
| status | `XML` → `version`, `edition`, the `overlays` and the inputs by key, number, title, type |
| take url (Put on air) | `XML`; find the output input by key, else by name; none: `AddInput Value=Browser\|<url>` → `XML` → `SetInputName`; another kind of input holds the name: refused, nothing more sent. Then `OverlayInput<N>In Input=<key>`, and `XML` to see the channel hold it: vMix answers `FUNCTION OK Completed` to any function, even one it does not have or a key it does not know (measured) |
| out url (Take off) | `XML`; only when channel N holds the output's key: `OverlayInput<N>Out` (the channel's transition). Anything else on the channel, or nothing, is left alone: already off |
| clear url | the same read, then `OverlayInput<N>Off` (at once) |
| state | `XML` |
| take template or media, update, next, pause, resume, sequence, thumbnail | refused `unsupported` before anything is sent |

**The presses, as `ACTS` lines.** With a link held, the connection is kept open. `ACTS OK
Overlay<N> <input number> <0|1>` lines are collected for one **settle window** (50 ms, derived: a
replace sends the old input's `0` and the new input's `1` in the same millisecond, and `AllOff`
one `0` per channel at once, measured), then resolved to keys with **one** `XML` read for the
whole window (numbers are positions, measured, so none is ever cached; one read per burst, not per
line, keeps a preset's forty lines from forty reads) and handled in this order:

| Line | Input | The Bridge does |
|---|---|---|
| `… 0` | the output input | **clears every live layer** of that production (All out, `clearCueItems` per live layer, in batches of four), so putting the output back up brings nothing back with it. Every cue `0` of that production in the same window is dropped, and so is one that arrives while the clear is in flight. Nothing is sent to vMix |
| `… 1` | a cue input of a linked production | **Take** that cue: `update` with the values the hosted page's own Take would send (`hostedCueValues`: the published values under the shared staging buffer and the production's bound data), `play`, and its `cue` marker, one batch, `takeCueItems`. The Bridge records it as the last cue it took on that layer |
| `… 0` | a cue input | a `1` in the same window for another cue on the **same layer**: dropped, the Take replaces. The last cue the Bridge itself took on that layer is another one (a Take still in flight, or pressed on another channel): dropped. Otherwise it reads which cue is live on the layer (`live_cue`, which the send RPCs mirror onto `control_shows`); this cue: **Out** (`clearCueItems`: `stop`, `cue: null`); another, or none: nothing |
| `… 1` | the output input | nothing |
| any | an input of no linked production, or any other activator (`Input`, `InputPreview`, `InputPlaying`, `Fullscreen`, `MasterVolume` …) | nothing |

- A press is a press whatever pressed it: the button, a shortcut, a trigger, the Web Controller or
  the Bridge's own `OverlayInput<N>In` for the output. The adapter does not check that the output
  is on its overlay before a Take: the press means take, and the operator sees in vMix whether
  the output is up.
- **Opening a preset** sends a burst (`InputPlaying <n> 0` for every input, `Fullscreen 0`,
  `MasterVolume 1`, `MasterHeadphones 1`, measured). Overlay lines inside that burst are state,
  not presses, and air nothing. A preset saved with inputs on overlays does send them: `ACTS OK
  Overlay3 1 1` and `Overlay4 2 1` came about a second after the burst's first line, after
  `MasterHeadphones` and after the open's own `FUNCTION OK` (measured), so a 50 ms window does
  not hold them. The XML's `<preset>` names the file opened, which tells a new preset from a press.
- The take is **the hosted page's**: the same items, through the send RPC the resolve names
  (`control_send_seq` with a sender body when the production answers `seq`, else
  `control_send_many`), so the production page, a phone and the output's recovery see it as a
  take from one more operator surface. A send that fails airs nowhere and is logged once; a send
  whose answer never came (3 s) is not repeated.
- **Latency:** the line arrives about 2 ms after the press (measured); the send and the output's
  Realtime road are the rest. A take from the control page was drawing in vMix within about 0.4 s
  (measured); AC-7 measures the press.
- A toggle off or `OverlayInput<N>Out` reports its 0 when the channel's transition ends, about
  510 ms later with the default 500 ms (measured); `Off` and `AllOff` at once. The guide says:
  give the cue channels a Cut transition, so an Out starts at the press.

### Session, failure and reconnect

- **One connection, kept open** (derived; the subscription needs it). It is opened by the first
  request that needs it (a read that finds it closed opens a new one and reads again, since a read
  is safe to repeat) or, while a link exists, by the Bridge itself at start and after a loss,
  with a backoff of 1 s doubling to 10 s. This is the Bridge's first timer that contacts a server
  without the page asking; it exists only while a production is linked and sends `SUBSCRIBE ACTS`
  and nothing else.
- **Nothing airs by itself.** A reconnect subscribes and reads nothing back as a press: overlays
  pressed while vMix was closed or the Bridge was down are not replayed, and the Bridge's own
  state (`/state`) says what each channel holds so the operator can press again. No take, In or
  Out is ever repeated.
- A `FUNCTION` whose answer never came (3 s, or the connection dropped) is `uncertain` and never
  retried. Reads are `unreachable`. Each verb has one 7 s budget for all its commands.
- **vMix closes:** the connection ends, state reads `not-running`, and the next request or the
  backoff reconnects. The link survives; the inputs are vMix's to keep (they are in its preset).
- The generation and instance per slot are kept as `slots.ts` keeps them, so a reading taken
  before a Take never undoes it on screen.

### Security

- The control slug is a full operator capability that cannot be rotated (`docs/CLOUD_PLAYOUT.md`
  §7, migration 0040). It lives in `vmix-links.json` in the Bridge's per-user config directory
  beside the token, arrives over the paired channel or standard input, and appears in no reply,
  log line, URL or argument. Unlink forgets it. The owner may prefer the alternative recorded in
  `research/vmix-inside-vmix.md` §3: the Bridge only reports presses and a paired page sends the
  take, which keeps the capability out of the Bridge but makes every press depend on a page
  staying open and awake.
- vMix's TCP API has no authentication; whether it listens beyond loopback is vMix's setting. The
  Bridge connects to `127.0.0.1` only.
- The backend address and anon key the page hands over are the public ones every page load
  carries; they let the Bridge call the same RPCs with the same checks.
- The Bridge's own properties (loopback, token, origin allowlist, no DNS rebinding) are unchanged.

Preserved: every CasparCG, OGraf and OBS route and reply; the output URL in vMix with no Bridge
behaves exactly as today; taking cues from the production page, the control link or a phone keeps
working with the Bridge linked, and vMix's buttons then simply do not follow (non-goal below).

Non-goals: mirroring NoaCG's state back onto vMix's buttons (slice 3 in #760: a take from a phone
lights its cue input; needs the Bridge to follow the log and to ignore its own echoes); vMix on
another computer; Update, Next or text edits from vMix (text is edited in NoaCG); the exported
overlay or show package in vMix, triggers and `BrowserReload`; VB.NET scripts; vMix's own titles or
clips as rundown cues; Basic HD cue inputs (one channel, four inputs); the hosted control page as
a Web Browser input (a guide paragraph, measured to render); Companion and Stream Deck
([issue #809](https://github.com/NoaCG/NoaCG-Studio/issues/809)); setting the output input's size by API.

### Decisions (derived)

1. The Bridge holds the production's control link, received over the paired channel, so a press
   becomes a take with no page open; the alternative stands recorded above.
2. One kept TCP connection with a bounded reconnect while a link exists; the HTTP API is not used.
3. Cue inputs are transparent images the Bridge makes and names, mapped by vMix input key and
   re-found by the name it gave them when a key is gone; the adapter never removes an input it
   did not make.
4. Lines are handled per 50 ms window from one `XML` read. A cue input's 0 is an Out only when its
   cue is still live on its layer and the Bridge itself took no other cue there since; a 0 with a
   1 for the same layer in its window is a replace; the output's 0 clears every layer once and
   drops the cue 0s that come with it.
5. Put on air is `OverlayInput<N>In` of the output input on the channel in Settings and nothing
   else; Take off and clear act only when that channel holds the output; the adapter never changes
   Program, Preview, a transition or any vMix setting.
6. A press on any channel counts; the per-layer channel suggestion is guidance for the tally.

### AC-1: The Bridge finds vMix on this computer

Against a fake vMix TCP server in `cli/test` (greeting, `XML` with version, edition, overlays and
inputs, `FUNCTION` answers, `ACTS` lines): `/status` for `{ adapter: 'vmix' }` reports the version
and edition; nothing listening is `not-running`, a port that greets wrongly is `not-vmix` within
3 s; `overlays` is 8 for a vMix 29, 4 for a 28 and 1 for Basic HD; `--vmix-port` is honoured;
`/health` lists `vmix`.

### AC-2: Pairing connects to vMix by itself

After pairing with vMix running, the pairing page says it is connected to that vMix version with no
further press and Settings > Playout shows the vMix section with the output's overlay channel
defaulting to the highest one; with vMix closed it says the `not-running` sentence and connects on
**Try again** once vMix is started.

### AC-3: Put on air and Take off drive the output input

Put on air creates `NoaCG <title>` as a Browser input on the output URL (or reuses one of that
name) and puts it on the chosen overlay by key; Take off takes it off with the channel's
transition, and sends nothing when the channel holds another input or none; a name held by
another kind of input is refused with nothing changed; Program and Preview are never addressed;
every function that takes an input names it by key.

### AC-4: Set up in vMix links the production and makes its cue inputs

`/vmix/link` resolves the production, adds one transparent image input per cue named after it,
adds or reuses the output input, writes the link beside the token and answers title, id and cue
count; linking again adds, renames and removes only the Bridge's own inputs; `/vmix/links` and the
log never carry the slug; `/vmix/unlink` forgets it and removes nothing; a link on standard input
works with no page; `/health` lists `vmix-link`.

### AC-5: An overlay press takes its cue and the next press plays it out

Against the fake vMix server and the local stack (an e2e spec beside `e2e/bridge-ograf.spec.ts`):
a `1` on a cue input puts that cue on air on the production's output page with the published
values; its `0` takes it out; a `0` and a `1` for two cues of one layer in the same millisecond
replace without an Out; a `0` for a cue another cue has replaced, from any surface or by the
Bridge's own Take still in flight, changes nothing; the output input's `0` with every cue's `0`
at once (`AllOff`) clears each live layer exactly once and its `1` nothing; a burst of lines costs
one `XML` read; lines for unlinked inputs, other activators and the preset-open burst air nothing.

### AC-6: Failure and reconnect never air anything

A dropped connection mid-send answers `uncertain` and nothing is resent; the reconnect sends
`SUBSCRIBE ACTS` and no function; overlays changed while disconnected are not replayed; a send the
backend refuses airs nothing and is logged once; vMix closing reads `not-running` until it is
back; `update`, `next`, `template`, `media`, `pause`, `resume` and `thumbnail` are refused before
anything is sent; one connection serves every `/state` and every press.

### AC-7: A real vMix round

On the trial's vMix 29, the built Bridge, linked from the production page, makes the inputs; the
output goes on air from the page; pressing Overlay on a cue input animates that cue in inside the
output, measured from the press to the first changed frame over five presses; pressing it again
animates it out; pressing another cue of the same layer replaces it; `OverlayInputAllOff` clears,
and putting the output back brings nothing back. The checks below are answered in
`docs/VMIX_ON_A_REAL_HOST.md`.

### AC-8: A Bridge release carries it

`cli/package.json` and `cli/BRIDGE_CHANGELOG.md` name the release; `docs/BRIDGE.md` has the vMix
adapter table, the kept connection and the link in §3's "Nearly stateless" row;
`docs/PLAYOUT_INTEGRATION.md` §5 and the website's vMix guide describe the overlay-press route,
the Cut transition for cue channels and the channel plan; the release workflow publishes the exe.

## Measured so far, and what still needs a real vMix

**Measured on vMix 29.0.0.49 on 2026-10-12** (`docs/VMIX_ON_A_REAL_HOST.md` §3, and the first
slice's own runs, `evidence/slice-1.md`): `SUBSCRIBE ACTS`
reports `ACTS OK Overlay2 <input number> 1` about 2 ms after the press; a replace on the same
channel sends the old input's `0` and the new input's `1` in the same millisecond; a toggle off or
`OverlayInput<N>Out` reports `0` about 510 ms later, when the 500 ms transition ends, `Off` and
`AllOff` at once; inputs are reported by number, not key; keys survive `SavePreset` and
`OpenPreset` within one vMix session; a transparent PNG image on an overlay leaves Program
byte-identical; higher overlay channels draw on top (8 over 2 over 1); `AddInput Value=Browser|<url>`
makes a Web Browser input; the state XML on vMix 29 lists 16 `<overlay>` elements; opening a preset
sends the `InputPlaying`, `Fullscreen`, `MasterVolume` and `MasterHeadphones` burst; the engine is
Chrome 115; the hosted control page renders in a Web Browser input. Over the TCP API: the greeting
`VERSION OK 29.0.0.49` about 20 ms after connecting; `XML <n>` where `n` counts the body's UTF-8
bytes, the body ending in `\r\n`; `ACTS` lines arrive between replies, before or after the
`FUNCTION OK` of the call that caused them, never inside an XML body; `FUNCTION OK Completed` for an
unknown function and for a key no input has; an unknown command is `<COMMAND> ER Unknown Command`;
`OverlayInput<N>Out` and `Off` ignore an `Input=` and take what the channel holds; keys survive a
preset saved in one vMix session and opened in the next; a Web Browser input is type `Browser` and
loads the whole URL, `&name=` included, when the value is URL-encoded; a blank session's two `Blank`
inputs are replaced by the first inputs added.

**Still needs a real vMix**, each kept behind a small function so the answer changes one place:

1. Answered (above): the greeting.
2. Answered (above): the answers, the length prefix, and `ACTS` lines between replies.
3. Answered for a preset saved in one session and opened in the next: the keys stayed. A vMix
   restart opens a blank session, so the keys after it are those of the preset the operator opens.
4. A Cut (0 ms) overlay transition reports its `0` at the press.
5. Answered (above): it does, about a second after the burst.
6. Answered (above), but for the cue input's thumbnail in the input bar.
7. Enhanced security on with a Web Controller password: the TCP API still answers a local client.
8. The `edition` string in the XML for Basic HD, and that vMix 28 offers four channels and 29
   eight, which the `overlays` function encodes.
9. The Browser input's size when the production's resolution differs from vMix's output.
10. Press-to-animation delay through the Bridge (AC-7).
