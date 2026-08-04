# Getting NoaCG graphics on air

The setup guide for the playout side: **CasparCG**, **OBS Studio**, **vMix**, and **SPX
Graphics**. It is written for the person configuring the playout machine, not for someone
working on this codebase — the internal contracts live in `docs/CLOUD_PLAYOUT.md` (the browser
output), `docs/CONTROL_LAYER.md` (operator surfaces) and `docs/SPX_TEMPLATE_FORMAT.md` (the SPX
template contract).

Every route below renders the same graphics. Nothing here is a different product tier, and none
of it costs anything.

## 1. Pick a route

There are three ways a NoaCG graphic reaches a video mixer, and the honest way to choose between
them is "what does this venue's network look like?".

| Route | What you point the playout at | Use it when |
|---|---|---|
| **NoaCG Cloud Output** | one persistent URL, `…/output?production=<slug>` | The playout machine has internet. One URL, loaded once, for the whole production. Operators drive it from anywhere, including a phone. |
| **Self-hosted output** | your own copy of the exported package, served by you | You want the cloud operator workflow but the pages on your own hosting. |
| **Portable export** | a downloaded folder or single file, played from disk | Closed networks, archives, or anywhere you need the graphic to work with no network at all. |

The first two are the same production operated over the same command log; only where the page is
hosted differs. The third is a self-contained file — fonts, images, GSAP and all — that plays
from `file://`.

**A production is not the same thing as a graphic.** One graphic is one template; a *production*
is a pool of graphics plus a cue rundown, and it gives you **one output URL for all of them**.
Each graphic in the pool is its own layer, and several can be on air at once — a bug, a lower
third and a ticker together. If you only ever need one graphic on screen, a portable export is
simpler.

## 2. What every browser-based playout needs

These four apply to CasparCG, OBS and vMix alike.

- **Transparency.** Every NoaCG page is transparent by default; you do not need to set a chroma
  key, and you should not. If you see a black or white box behind the graphic, something in the
  host is forcing an opaque background — check its "custom CSS" / background settings first.
- **Match the resolution exactly.** Graphics are designed in real pixels (1920×1080 unless you
  chose otherwise). Set the browser source to the same numbers. The output page letterboxes
  itself into whatever size it is given, so a mismatch does not crop — but it does scale, and
  scaled text is softer than text rendered at its own size.
- **Do not scale the source afterwards.** Resize the *source*, never the resulting layer.
- **Frame rate.** Set the browser source's FPS to the channel's. Motion is authored in seconds,
  so it plays correctly at any rate, but a browser source running at 30 in a 50 Hz channel
  judders in a way that looks like the graphic's fault.

## 3. CasparCG

CasparCG plays a web page through its **HTML producer**.

### Which version you have matters

| Server | Bundled browser engine | Consequence |
|---|---|---|
| **2.3.x** (the common LTS / teaching install) | CEF from the Chromium 6x era | **Old.** It rejects JavaScript syntax that every current browser accepts. See below. |
| **2.4.x** | CEF 117 | Modern enough; nothing special to do. |
| **2.5.x** | CEF 142 | Current. |

**On 2.3.x, a page that is too modern does not degrade — it dies silently.** The layer goes on
air showing nothing, and the reason is a `SyntaxError` in a log you have to go looking for. We
hit exactly this on a real 2.3.2 server: the output page was rejected outright with
`Uncaught SyntaxError: Unexpected token ?`, because optional chaining (`?.`) needs Chromium 80.

NoaCG builds for that engine on purpose — the browser output page and everything it loads are
compiled down, and the page carries shims for the APIs 2.3.x lacks. **You do not have to do
anything about this**; it is recorded here because if you write your own template code, or edit
an exported one, the same bar applies to what you write.

If you can choose, run 2.4 or newer. If you cannot — 2.3.x is fully supported.

### Playing the cloud output URL

```
CG 1-20 ADD 1 "https://<your-noacg-host>/output?production=<slug>" 1
```

- `1-20` is channel 1, layer 20 — use whatever layer your rundown expects.
- The URL is a **capability**: anyone holding it can render the production, so treat it like a
  password. It does not let the holder operate the show.
- Load it **once**, at the start of the production, and leave it up. Graphics are cued by the
  operator over the command log, not by re-adding the layer.
- Add `&debug=1` while setting up to get a status readout on screen (connected, graphics
  loaded). Take it off before air — it draws over the picture.
- The page recovers by itself. If the machine loses the network, or you restart the layer, it
  rebuilds whatever was on air, without replaying the animations on screen.

### Playing an exported file

Export a graphic with the **CasparCG export** target and you get one self-contained `.html`.
Drop it into the server's `template` folder and load it as a normal HTML template:

```
CG 1-20 ADD 1 "<template-name>" 1 "<templateData>…</templateData>"
CG 1-20 PLAY
CG 1-20 NEXT
CG 1-20 STOP
```

Field data arrives through the usual `templateData` shim, in either JSON or XML form. The file
needs no network at all — fonts and images are inlined.

## 4. OBS Studio

1. **Sources → + → Browser**.
2. For the cloud output: paste the `…/output?production=<slug>` URL.
   For an exported overlay: tick **Local file** and pick the `.html`.
3. Set **Width** and **Height** to the graphic's own resolution (1920 × 1080 unless you chose
   otherwise), and **FPS** to your channel's.
4. Leave the background alone — the page is already transparent.

Two OBS-specific notes:

- **"Shutdown source when not visible"** will tear the page down every time you hide the scene,
  which throws away a cloud output's connection and forces a full rebuild on the way back. Leave
  it **off** for a production output.
- An exported overlay ships a `controlpanel.html` beside it. OBS can host that as a dock —
  **View → Docks → Custom Browser Docks…** — so the operator drives the graphic from inside OBS
  with no second machine.

## 5. vMix

1. **Add Input → More → Web Browser**.
2. URL: the cloud output URL, or the full local path to an exported file
   (`file:///C:/overlays/lower-third.html`).
3. Set the width and height to the graphic's resolution.
4. Use it as an overlay channel input.

## 6. SPX Graphics

SPX is the format NoaCG treats as canonical, so this is the most direct route of all.

1. Export with the **SPX export** target — you get a starter folder.
2. Extract it into SPX's `ASSETS/templates/` directory.
3. Add the template to a rundown. The operator's fields appear automatically; they come from the
   template's own definition.
4. **Play** airs the graphic, **Continue** walks its steps, **Stop** plays it out.

The number of Continue presses is one less than the template's `steps` count — a three-phase
graphic takes two presses before Continue stops doing anything. `docs/SPX_TEMPLATE_FORMAT.md` §2
explains the counting if a rundown disagrees with what you expect.

Fonts travel in the folder, so a machine without the typeface installed still renders correctly.

## 7. When it does not work

| What you see | Usually means | Do this |
|---|---|---|
| Layer is on air, nothing renders, no error anywhere | CasparCG 2.3.x rejected the page's JavaScript | Check the server log for `SyntaxError`. If it is your own template code, remove `?.` and `??`. Upgrading to 2.4+ removes the constraint. |
| Black or white box behind the graphic | The host is forcing an opaque background | Clear any custom CSS setting a background; do not add a chroma key. |
| Graphic looks soft, or is the wrong size | Source dimensions do not match the design | Set the browser source to the graphic's own resolution; resize the source, never the layer. |
| Motion judders | Browser-source FPS does not match the channel | Set the source's FPS to the channel's. |
| Output URL shows "not available" | Wrong slug, or the production was unpublished | Re-copy the URL from the production page. Unpublishing kills the URL on purpose. |
| Cloud output goes blank after a network drop | It is rebuilding | Wait — it recovers on its own, without replaying animations on screen. If it does not, reload the layer. |
| Operator takes a cue and nothing airs | The page is in **Rehearse**, not **Show** | Check the mode strip on the production page. Rehearsal drives a local copy on purpose. |
| Fonts wrong on the playout machine | An export that could not embed its font | Re-export; NoaCG fails the export rather than shipping a missing face, so this should not happen with a current build. |

## 8. What has actually been tested

Stated plainly, because an integration guide that implies more coverage than it has is worse
than one that admits the gaps.

- **Verified on real hardware** (2026-08-03): the cloud output URL playing in **OBS** and in
  **CasparCG 2.3.2**, at 1920×1080, transparent, surviving a refresh and a kill-and-reopen with
  commands issued while the renderer was down; the hosted control page driving it from a phone;
  two operators agreeing on which cue is live.
- **Verified by the test suite, not on hardware**: the exported packages open and play from
  `file://` with no network, fonts and images inlined.
- **Not yet verified on hardware**: a CasparCG channel restart under a live output URL; vMix;
  CasparCG 2.4/2.5 (the engine versions in §3 come from the CasparCG changelog, not from a
  machine we have run).

The maintainer's own acceptance checklist is `docs/ACCEPTANCE_SPX_CASPARCG.md`, and
`docs/CLOUD_PLAYOUT.md` §8 carries the live-verify steps for the browser output.
