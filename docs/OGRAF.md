# OGraf export (EBU Open Graphics, v1)

NoaCG Studio exports any graphic as an **OGraf v1 Graphic** - the EBU's open standard for
web-based broadcast graphics. This page is for the engineer who has to load one of our packages
into their renderer: what we emit, what maps to what, and where the limits are.

- Specification: <https://ograf.ebu.io/v1/specification/docs/Specification.html>
- Manifest schema: <https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json>
- Spec version targeted: **v1**. There is no vendor dialect - a package is plain OGraf.

The same package is also the **LiveOS (NetOn.Live)** export; that target is this package with
NetOn.Live install steps in its README, because the LiveOS HTML5 graphics engine is
OGraf-compliant.

## What is in the package

```
<graphic>/
  <graphic>.ograf.json     the manifest (the entry point)
  graphic.mjs              default-exports the Graphic Web Component class
  lib/gsap.min.js          bundled GSAP (no CDN, ever)
  lib/lottie.min.js        only when the graphic uses a Lottie animation
  fonts/*.woff2            every face the CSS references
  images/*                 the graphic's own assets, at the paths its markup uses
  FIELDS.md                the data contract: id -> field -> type -> default
  FONT_LICENSES.md         OFL 1.1 + the per-font copyright notices
  README.md                how to load it
```

Everything is referenced relatively and nothing is fetched from the network at runtime. The
package is validated before it is written: an invalid manifest, or a manifest naming a file the
package does not contain, fails the export rather than shipping.

## The manifest

| Field | What we emit |
| --- | --- |
| `$schema` | the exact OGraf v1 schema URL |
| `id` | the graphic's slug (never contains `/`) |
| `version` | `"1.0.0"` |
| `name` / `description` | the graphic's name and its SPX template description |
| `main` | `"graphic.mjs"` |
| `supportsRealTime` | `true` unless the export was made post-production-only |
| `supportsNonRealTime` | `true` when the export declares post-production intent (see below) |
| `stepCount` | the number of steps on the graphic's default path |
| `schema` | one property per data field, keyed by its SPX id (`f0`, `f1`, …) |
| `customActions` | one action per operator event the graphic's state machine declares |
| `actionDurations` | play/stop/update durations in ms, read off the graphic's own timeline |
| `renderRequirements` | the authored resolution and frame rate, as `ideal` constraints |

**`schema`** is the public state model. Each property carries `type` (`string`, `number` or
`boolean`, from the field type), `title` (the operator-facing label), a `default` typed to match,
`enum` for a dropdown, and `hidden: true` for an SPX hidden field. The keys are ids, not labels -
`FIELDS.md` in the package is the table that translates them.

**`renderRequirements`** states the canvas the graphic was designed for as `ideal`, never `exact`.
It is a declaration, not a refusal: the graphic scales, and an exact constraint would tell a
1080p renderer to reject a 4K-authored graphic that would have rendered fine.

**`actionDurations`** are measured, not estimated. Our timeline is data (`NOACG_ANIM`), so the
entrance, each step, and the exit all have a known length; the value is speed-corrected into
milliseconds. Custom actions are declared `-1` (dynamic) because how long one takes depends on
which state the machine is in when it fires. A graphic whose motion is hand-written GSAP that we
cannot read emits no `actionDurations` at all - the spec's answer to "unknown" is silence, not a
guess.

## The Graphic Web Component

`graphic.mjs` default-exports a class extending `HTMLElement`. It embeds the graphic's own
runtime unchanged - the same `play()` / `stop()` / `update()` / `next()` an SPX host would call -
and maps the OGraf actions onto it.

| OGraf | What happens |
| --- | --- |
| `load({data, renderType, renderCharacteristics})` | injects the CSS + markup into the element (light DOM), loads GSAP, runs the graphic's own script, applies `data`. Resolves when the graphic is ready for actions. |
| `playAction({goto, delta, skipAnimation})` | first call plays the entrance (step 0); further calls walk the default path with `next()`. Returns `currentStep`, or `undefined` once the graphic has gone to the end. |
| `stopAction({skipAnimation})` | plays the exit. |
| `updateAction({data, skipAnimation})` | writes the changed fields. Data never causes a state change - that is a house rule and an OGraf one. |
| `customAction({id, payload, skipAnimation})` | fires that operator event through the graphic's own serial event queue. An unknown id answers `400`. |
| `dispose()` | kills tweens, clears the element. |
| `goToTime({timestamp})` | non-real-time only - see below. |
| `setActionsSchedule({schedule})` | non-real-time only - see below. |

Contract details worth knowing:

- **Every method returns a `ReturnPayload`** - `{statusCode, statusMessage?, currentStep?}` -
  and never rejects. An action before `load()` resolves, or after `dispose()`, answers `409`; an
  internal failure answers `500` with the message. A renderer can log a status code; it cannot
  log an unhandled promise rejection.
- **Concurrent calls are honoured, in arrival order.** The spec requires a Graphic to accept an
  action while a previous one is still pending. All actions run through one internal chain, so
  two updates issued back to back land in the order they were sent rather than racing.
- **`skipAnimation` lands the action instantly.** The action still happens; it just arrives at
  its settled frame with no tween. The graphic's own runtime does this natively (it composes any
  state's pose with animation callbacks suppressed), so a skipped play is pixel-identical to a
  finished one.
- **Steps are our default path.** A NoaCG graphic is a state machine whose main group has an
  ordered walk; step `i` of that walk owns timeline `i`. That walk *is* the OGraf step model, and
  it is the same ordered walk SPX and CasparCG drive with Continue - one contract, three hosts.
  A graphic with a branching machine still degrades to that walk: an operator who only ever
  presses play/next/stop gets a coherent graphic.
- **Custom actions are structurally guarded.** An event only fires if the author drew that arrow
  from the state the graphic is currently in. An illegal event is dropped along with its payload;
  the action still answers `200`, because "the operator pressed a button that does nothing right
  now" is not a transport error. The returned `currentStep` tells you where the graphic actually
  is.

## Non-real-time (offline) rendering

Export the graphic with post-production intent and the manifest advertises
`supportsNonRealTime: true`, which obliges `goToTime()` and `setActionsSchedule()`. Seeks are
deterministic: each one rebuilds an isolated document and replays the schedule against a virtual
clock, so asking for 5.6 s, then 0.12 s, then 5.6 s again gives the identical frame all three
times.

That mode is gated by a conservative compatibility check, and the export is refused with the
reason if the graphic uses anything a virtual clock cannot own: wall-clock CSS animations,
`Math.random()`, Web Animations API calls, `<video>`/`<audio>`, a live network dependency, or a
timeline we cannot read. Better a refusal at export than a render farm producing frames that
disagree with each other.

## Known limits

- **No `thumbnails`.** The spec allows a preview image per Graphic; we do not rasterise one at
  export time, so hosts that show a preview tile will show a placeholder.
- **No `author`.** A graphic in NoaCG has no author field to fill it from; adding the tool's own
  name there would misdescribe what the field means.
- **`id` is the graphic's slug**, not a reverse-DNS name. The spec only *recommends* reverse-DNS,
  and the slug is what SPX, CasparCG and the file name already use, so one graphic reads the same
  in every rundown. Uniqueness is per package folder.
- **Custom action durations are `-1`.** Honest rather than wrong: the length depends on the
  machine's current state.
- **Light DOM, not shadow DOM.** The graphic's markup is injected into the element directly so
  its own `getElementById` lookups behave exactly as under SPX. Host page CSS that targets bare
  element selectors could therefore reach into a graphic; our own CSS is class-scoped per graphic.
- **One instance of a given Graphic per document.** The embedded runtime addresses its elements
  with document-wide selectors, exactly as it does under SPX, where a template owns its page. Two
  instances of the *same* design mounted into one document would write over each other. Renderers
  that give each Graphic its own document or frame - the normal arrangement - are unaffected, and
  different designs never collide because each carries its own class prefix.
- **`graphic.mjs` is an ES module**, so a renderer must load the package over `http(s)` - browsers
  refuse module imports over `file://`. Our single-file targets (CasparCG, OBS/vMix, H2R) are the
  ones that run from a bare file on disk.

## How conformance is checked

Not by review. `src/export/targets/ografSchema.ts` transcribes the published JSON Schema (all
seven files of it) into a validator, and it runs on every OGraf and LiveOS export before the
manifest is written. `e2e/ograf-conformance.spec.ts` then proves three things on every CI run:

1. every graphic in the catalog produces a manifest with zero violations, in all three export
   intents;
2. the validator actually refuses the mistakes the spec is strict about (an un-prefixed vendor
   field, a `default` typed against its property, a duplicate action id, a duration for an action
   that does not exist, a `main` the package does not contain);
3. a real exported package, served over HTTP and driven like a renderer would drive it, honours
   the lifecycle - including `skipAnimation`, concurrent calls, and the status codes for calling
   an action too early or after `dispose()`.
