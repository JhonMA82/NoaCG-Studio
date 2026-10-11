# NoaCG on a real vMix host

A record of a production walk in vMix 29 on 2026-10-12, and of what vMix's API offers the Bridge
adapter in [issue #760](https://github.com/NoaCG/NoaCG-Studio/issues/760). vMix was driven only
through its HTTP API (port 8088) and TCP API (port 8099). Every picture result below is vMix's
own Program snapshot (`Snapshot`) or input snapshot (`SnapshotInput`), looked at and not
committed; every event is a line vMix sent.

**Answers first.**

- **A NoaCG production runs in vMix.** The cloud output URL in a Web Browser input on an overlay
  channel aired a lower third, a clock bug and a ticker: taken, updated live, all three up at
  once, replaced on one layer, taken out one layer at a time and all out. Entrances and exits
  played, because the input stayed on its overlay throughout.
- **vMix 29's engine is Chrome 115** (`&debug=1` on the output, as on 2026-10-02 in
  `docs/work-specs/hardware-panel-control/evidence/players-casparcg-obs-vmix.md`). That is below
  NoaCG's floor of 117 and above the catalogue's ceiling of 111; nothing in the walk rendered
  wrong.
- **One NoaCG break, not a vMix one:** on the hosted control page, a value typed into one cue airs
  on every cue of the same graphic
  ([issue #1036](https://github.com/NoaCG/NoaCG-Studio/issues/1036)).
- **vMix's own overlay off removes the whole output** with no graphic exit: `OverlayInputNOut`
  after the channel's transition, `OverlayInputNOff` and `OverlayInputAllOff` at once.
- **For the Bridge adapter:** `SUBSCRIBE ACTS` reports an overlay going on at the press, a replace
  as an off and an on in the same millisecond, and an Out when its transition ends (§3).

## 1. The setup

- **vMix 29.0.0.49 (Trial)** on the development laptop, started with its blank session. Program
  was a Colour input; the NoaCG output was a Web Browser input added with
  `AddInput Value=Browser|<url>`, on Overlay 1. Its snapshot is 1920x1080.
- **The production:** three catalogue graphics, each on its own layer (Hairline lower third on 20,
  House Clock bug on 21, News Strip ticker on 22) and two cues on the lower third ("Hairline":
  Alexandra Riva, Chief Correspondent; "Ben, guest": Ben Guest, Second cue). Made and published
  from this branch's dev server on the E2E account against the production backend.
- **vMix loaded** `https://noacg.studio/output?production=<slug>&name=vMix`, the address a
  user pastes. **The operator** was the hosted control page on noacg.studio in a headless
  Chromium, the control link a second operator or a phone uses.

## 2. The walk

| Step | Pressed on the control page | vMix Program showed |
|---|---|---|
| 1 | Take "Hairline" | At about 0.4 s the lower third's accent bar was drawing in; at 3 s "Alexandra Riva / Chief Correspondent" |
| 2 | Name changed to "Mirko Walk", not yet sent | Byte-identical to step 1: typing does not reach air |
| 3 | Update | "Mirko Walk / Chief Correspondent" in place, no replayed entrance |
| 4 | Take "House Clock", then "News Strip" | All three up: the clock top left counting, the ticker scrolling, drawn over the lower third (layer 22 above 20; the two designs share the bottom band) |
| 5 | Take "Ben, guest" (the same layer as "Hairline") | The lower third replaced on its layer, but reading "Mirko Walk / Second cue": issue #1036 |
| 6 | Out on the lower third | It went; the clock and ticker stayed |
| 7 | All out | The plain colour, identical to the first snapshot; the output input still on Overlay 1, transparent |
| 8 | vMix `OverlayInput1Out`, then `OverlayInput1In` | The input left and came back; still the plain colour, nothing re-aired |

## 3. What vMix offers the Bridge adapter

The checks in `docs/research/vmix-inside-vmix.md` §5, by number. Two transparent PNG Image inputs
stood in for cue inputs, `NoaCG: Anna, host` (input 3) and `NoaCG: Ben, guest` (input 4).

1. **The `SUBSCRIBE ACTS` lines**, with the time after the function call:

   | Function | Line | When |
   |---|---|---|
   | `OverlayInput2In` Anna | `ACTS OK Overlay2 3 1` | 2 ms, at the press |
   | `OverlayInput2In` Ben while Anna is on | `ACTS OK Overlay2 3 0`, then `ACTS OK Overlay2 4 1` | both 8 ms, the same millisecond |
   | `OverlayInput2` Ben (the button, lit) | `ACTS OK Overlay2 4 0` | 510 ms, when the 500 ms transition ends |
   | `OverlayInputNOut` | `ACTS OK OverlayN <input> 0` | 515 to 517 ms |
   | `OverlayInput2Off`, `OverlayInputAllOff` | the `0` lines | 0 to 2 ms |

   The number is the input's position, not its key, so the adapter maps it through the XML.
   Opening a preset sends `InputPlaying <n> 0` for every input, `Fullscreen 0`, `MasterVolume 1`
   and `MasterHeadphones 1`.
2. **Input keys survived `SavePreset` and `OpenPreset`** in the same vMix: all eight keys the
   same. Across a vMix restart was not tried.
3. **A transparent PNG on an overlay shows nothing:** the Program snapshot was byte-identical with
   and without it. Its input-bar thumbnail was not looked at.
4. Enhanced security: not tried, as it is a setting on the owner's install.
5. Overlay press to animation through the Bridge: not measurable before the adapter exists. A take
   from the control page was drawing in vMix within about 0.4 s of the click.
6. **`AddInput Value=Browser|<url>` makes a Web Browser input**; setting its size by API was not
   tried.
7. **Higher channels draw on top:** Overlay 2 over Overlay 1, Overlay 8 over Overlay 2.
8. A cue input's Mouse Click Action: not tried (a settings dialog, no API).
9. **The hosted control page renders in a Web Browser input** at 1920x1080 on Chrome 115: rundown,
   both monitors, Take, Update, Next, Out. Clicking in it was not tried: there is no API for a
   click, and the walk did not use the screen.
10. **Chrome 115.**
11. A trigger calling `BrowserReload` on overlay in: not tried (triggers are set in a dialog).
12. Not tried.

The state XML lists 16 `<overlay>` elements on vMix 29, numbered 1 to 16.

## 4. What changed because of this walk

- `src/validation/engineSupport.ts` and `docs/PLAYOUT_COMPATIBILITY.md`: vMix 27+ is Chromium 115,
  measured.
- `docs/PLAYOUT_INTEGRATION.md` §5 and §8, and the vMix section of the website's guides
  (`docs.html`): keep the output on its overlay, the stacking order, what vMix's own Out does,
  the engine.
- The comment on `hostEngine` (`src/control/livePath.ts`) now says vMix was measured.

## 5. Not verified

- An exported HTML overlay or show package in vMix, and its relay.
- Typing or clicking inside a Web Browser input, keyboard mode, triggers, enhanced security and
  the Web Controller.
- Audio, a long show, and vMix editions other than the trial.
- OBS 33 (this machine has OBS 32.2.1), and which SPX route suits which setup, which
  `docs/SPX_ON_A_REAL_SERVER.md` §6 covers.

## 6. Left as found

- vMix's `SavePreset` and `OpenPreset` (check 2, into the session scratchpad) rewrote
  `%APPDATA%\last.vmix` and its `user.config`. Both were backed up before vMix started and put
  back byte for byte after it closed (SHA-256 as before, `last.vmix` keeps its 2026-10-01 time).
- vMix was force-closed without saving. Its background service was running before and is
  untouched.
- The walk's production was unpublished (its `control_shows` row deleted). Its document stays in
  the E2E account's library.
