# Graphics packs — downloadable, finished, ready to operate

A **graphics pack** is one downloadable file (`<name>.noacgpack.json`) carrying several
FINISHED templates that install as one production: graphics pooled, playout layers set, a
prepared cue rundown seeded. Nothing needs the editor — import, publish (or export), operate.
It exists beside the wizard catalog, not inside it: a pack ships complete work, the catalog
ships starting points, and the two share no generator code.

## The format (v1)

```jsonc
{
  "format": "noacg-pack",        // the marker parsePack refuses without
  "version": 1,                  // newer versions are refused with an upgrade message
  "name": "Uutishuone",          // becomes the production's name
  "description": "…",
  "graphics": [
    {
      "name": "Uutishuone ticker",   // pool identity — unique within the pack
      "type": "ticker",              // a real TemplateType
      "layer": 10,                   // playout layer 1–100 (back = low)
      "html": "…", "css": "…", "js": "…",   // the complete template (definition inside the HTML)
      "assets": [{ "path": "images/x.png", "data": "data:…" }],  // optional, inlined
      "resolution": { "width": 1920, "height": 1080 },           // optional (default 1080p)
      "fps": 50,                                                 // optional
      "cues": [{ "label": "Avaus", "values": { "f0": "UUTISET" }, "note": "…" }]
    }
  ]
}
```

`fields`/`settings` are never carried separately — they are parsed from the
`SPXGCTemplateDefinition` inside the HTML, the same source-of-truth rule as everywhere else.
The first cue REPLACES the auto-seeded default cue; the rest append in order.

## The three pieces

- **`src/packs/graphicsPack.ts`** — the owner: `parsePack` (refuse-with-reason, never coerce),
  `validatePack` (every graphic through `validation/validateTemplate` — the ONE export gate),
  `installPack` (the shared `model/templateSet.ts` save path + layers + cues, every durable
  write claimed).
- **The door** — Home → Productions → the "Import a package" card: shipped packs listed from
  `public/packs/index.json` with one-click Install and a download link; any downloaded pack
  file imports through the same parser.
- **The shipped pack(s)** — sources as readable `.mjs` modules under `scripts/packs/<pack>/`,
  assembled by `scripts/build-news-pack.mjs` into `public/packs/` (git-tracked, served at
  `/packs/…`). The build refuses on: missing definition, missing SPX entry points, ES5
  violations in template JS (CasparCG 2.3 CEF), inline-hidden field holders, non-`fonts/`
  url() references. Edit a source, re-run the build, commit both.

## Uutishuone (the first pack)

Six graphics, one voice — a modern public-broadcaster news look (violet era; the palette,
mark and wording are our own), bundled Outfit, Finnish sample content:

| Graphic | Type | Layer | Notes |
|---|---|---|---|
| Uutishuone ticker | ticker | 10 | white bottom bar, rotating headlines (one textarea, one per line), live HH.MM clock; `next()` = skip |
| Uutishuone bug | bug | 20 | rounded-square mark + channel word + live clock, top right, always-on |
| Uutishuone name strap | lower-third | 30 | two-tier identifier; empty role collapses its tier |
| Uutishuone headline | lower-third | 31 | pill label (UUTISET / SÄÄ / SUORA…) docked on the headline container |
| Uutishuone endboard | fullscreen | 85 | full-frame close, manual out |
| Uutishuone opener | transition | 90 | full-frame stinger, clears ITSELF (own GSAP timer — the SPX `out` setting is not honoured by the cloud output) |

Rotator, not marquee, on purpose: a rotator survives live edits (`update()` re-reads the
list and holds its index — editing headlines on air never restarts the loop), and its
timers are killable GSAP calls the render clock can drive.

## Operating it (the demo walk)

1. Home → **Productions** → Import a package → **Install** Uutishuone → the production page
   opens with all ten cues.
2. Take the **bug** cue, then the **ticker** cue — both stay up (each graphic has its own
   layer). Take the **opener** — it plays and clears itself.
3. Walk the name straps and headlines with ↑/↓ + Take; each replaces the previous on its
   layer while ticker and bug stay on air.
4. Live edit: select the ticker cue, edit the headlines textarea or the label, press
   **✎ Update** — the bar re-reads in place, no re-animation.
5. On air for real: **Publish** (signed in) and load the production's output URL in
   CasparCG/OBS/vMix — or **Export** the production to any target, controller included.
