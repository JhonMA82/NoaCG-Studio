# Project formats

NoaCG uses a hybrid authored-format and output-format model.

## Authored project format

Every new SPX graphic and video project chooses these settings before template assembly,
AI generation, artwork placement, or animation authoring:

- authored aspect ratio
- canvas resolution
- project frame rate

`src/model/projectFormat.ts` is the single registry. It owns stable preset IDs, labels,
dimensions, aspect groups, frame-rate labels, graphics and video defaults, validation,
and package/hosted-media capability notes. `SpxTemplate.resolution` and `SpxTemplate.fps`
remain canonical. Video projects remain canonical through `width`, `height`, `fps`, and
`authoredFor`.

Supported creation presets:

| ID | Aspect | Canvas |
|---|---:|---:|
| `landscape-720p` | 16:9 | 1280×720 |
| `landscape-1080p` | 16:9 | 1920×1080 |
| `landscape-2160p` | 16:9 | 3840×2160 |
| `vertical-720p` | 9:16 | 720×1280 |
| `vertical-1080p` | 9:16 | 1080×1920 |
| `square-1080p` | 1:1 | 1080×1080 |

Project frame rates are 25, 30, 50, and 60 fps. Graphics default to 1080p25. Video
projects default to 1080p30.

Changing aspect ratio selects a valid resolution from the destination aspect. It never
stretches the previous aspect. Existing saved projects are not normalized to the registry.
An older or custom video format is shown and preserved until the user explicitly chooses
a registered preset.

## Existing HTML and SPX imports

Package exports include:

```html
<meta name="noacg-project-format" content="width=1920;height=1080;fps=25" />
```

Round-trip imports read this metadata exactly. Foreign imports may be detected from one
unambiguous root-canvas declaration and an explicit FPS declaration. SPX has no universal
frame-rate field, so a missing FPS is reported as uncertain. Opening or AI conversion stays
disabled until the user explicitly confirms the shared picker selection. Confirmation
changes only NoaCG's project metadata - it does not rewrite imported HTML, CSS, or JS.

## Output format

SPX, HTML overlay, CasparCG, H2R, OGraf, and LiveOS packages preserve the authored canvas
and timing metadata. They do not perform hidden reflow, stretching, or cropping.

Rendered video and images have a separate output scale. Scaling changes the number of output
pixels, not the authored layout. HTML measurement and native capture still run against the
authored canvas. A 4K project can therefore be rendered at native 4K where the active tier
allows it, or explicitly scaled to 1080p without pretending the layout was reauthored.

HTML graphic media renders may choose a supported output frame rate because the virtual-clock
runtime snaps cues and samples the same seconds-based animation at that rate. Video-project
media follows the project FPS: its code may contain frame-based decisions, and `authoredFor`
drift must be resolved before claiming it was authored for another rate.

## Deferred presets

- 24 fps is not exposed yet. It is an integer and the core render contract can represent it,
  but it has not passed every catalog, video-engine, preview, cue-snap, and hosted-render path.
- 23.976, 29.97, and 59.94 fps are not exposed. Current creation and managed-AI contracts
  intentionally validate the integer registry, while video duration and frame counts use
  integer frames. No label aliases or silent rounding are allowed.
- 7680×4320 is not exposed. It is a 33.2 megapixel live HTML canvas, exceeds current hosted
  native render limits, and has not met the editor, runtime-bench, catalog-sweep, and native
  capture performance bar required for a normal preset. Package formats are not the blocker;
  usable authoring and validation are.

These are registry changes only after the full path is proven. Existing imported projects
that truthfully declare another format remain preserved; preservation is not preset exposure.
