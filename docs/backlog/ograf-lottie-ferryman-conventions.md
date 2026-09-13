# Speak Ferryman's conventions - an AE/Lottie import road inside the sealed-asset stance

**Filed:** 2026-08-29. **Source:** the OGraf ecosystem research round (`docs/OGRAF_ECOSYSTEM.md`
§1f).

## Why

Ferryman (AGPL-3.0, <https://github.com/Streamshapers/StreamShapers-Ferryman>) proved a pattern
designers love: the After Effects animation arrives as a **sealed Lottie artifact**, with
fidelity bounded by the Lottie renderer rather than guaranteed AE pixel parity. Editable fields
are **surgical replacements** of text/image data inside it
(layers named with an underscore prefix - `_headline`, `_image`), and **comp markers named
`start`/`stop`/`next`/`loop`/`update`** segment the timeline into in/steps/loop/out. NoaCG
already treats Lottie exactly as a sealed asset (`lottie_light`, injected on use), so "import a
Lottie whose `_layers` become fields and whose markers map onto the default path" is one
adapter inside the existing stance - an AE ingestion road at a fraction of Ferryman's surface,
compatible with their ecosystem's files. This is the one authoring-side capability the research
found that NoaCG lacks and users demonstrably use.

## What it would take

An import adapter: parse the Lottie JSON, surface `_named` text/image layers as `fN` fields
(writes patch the JSON's sourceData/asset path, replayed by the bundled player), map the marker
walk onto `steps`/`defaultPath` so play/next/stop behave; no marker vocabulary beyond
Ferryman's, no attempt to open the animation itself (it can never join `NOACG_ANIM` groups,
guards or snap - the honest ceiling, stated in the wizard). Embedding Ferryman's codebase is
refused (React/CRA/Electron, a second authoring model); only the conventions travel.

## Source refresh and acceptance (2026-09-13)

[Studio research](../OGRAF_STUDIO_RESEARCH.md) section 5 preserves Ferryman as the main
field/marker conversion reference: Studio's current Lottie layer does not expose marker control
or dynamic Lottie text binding. Pin the supported Lottie profile and marker-to-OGraf mapping;
use stable nested layer addresses and reject ambiguous underscore names rather than updating
the wrong precomposition. Keep assets local and retain source JSON plus an explicit loss report.

The inspected Ferryman wrapper has source-observed ReturnPayload and non-real-time method
differences; it is a fixture target, not the standard. Test load data, start/next-loop/stop/update,
missing/duplicate markers, long text, nested image replacement, replay and disposal. Compare
independent output to the original Lottie renderer; label unsupported AE features and do not
claim arbitrary motion has become editable HTML. Source reuse remains unselected; the runtime
player's MIT notice does not license the entire AGPL application/wrapper. No implementation
starts from this update.

## Evidence

`docs/OGRAF_ECOSYSTEM.md` §1f (model verified in source; fidelity limits; fixture value);
`docs/SVG_ANIMATION_DIRECTION.md` §10 (Lottie stays an asset - this item stays inside that
rule).
