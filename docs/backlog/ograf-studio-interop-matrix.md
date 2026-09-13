---
v: 2
source: derived
kind: finding
raised: 2026-09-13
state: parked
note: Research specification only; extends the existing OGraf interop ladder without scheduling implementation.
found: Studio and the refreshed ecosystem expose missing independent fixture coverage.
serves: P6
size: standard
needs-owner: none
---

# Add Studio and Eyevinn to the independent OGraf fixture matrix

**Filed:** 2026-09-13. **Source:** [Studio research](../OGRAF_STUDIO_RESEARCH.md), sections 3-10.

## Why

Our exporter and its own host can agree while both miss a foreign renderer's failure. Studio's
font-export report and Ferryman's wrapper differences make independent positive and negative
fixtures necessary. This extends the existing interop work; it is not another product surface.

## What it would take

Own a test-only fixture manifest recording upstream revision, licence/notices, package hash,
expected capabilities, expected failures and data/action sequence. Use small original graphics:
text/embedded font, two-step reveal, independent X/opacity keys, step-local loop, nested GDD
table and self-contained Lottie. Keep source-bearing and runtime-only variants separately.
Do not redistribute unreviewed upstream artwork or an AGPL runtime under NoaCG's CLI licence.

Run NoaCG exports through EBU schema validation, ograf-devtool, ograf-server and the existing
CasparCG route. Run Studio/Eyevinn/Ferryman packages through NoaCG's current CLI host; production
hosting is a later dependent item. Unknown editor metadata must not be required to play.
Browser work goes through `npm run queue`; use established test/fixture paths and mappings.

## Acceptance and handoff

Record load data/readiness, all steps including past-end, negative/goto policy, skipAnimation,
rapid update/stop, dispose, replay, relative resources, two simultaneous instances and clean-host
fonts. For non-real-time only when declared, seek forward/backward/repeatedly with scheduled data.
Assert expected invalid fixtures fail for the intended reason. Retain action traces and frames
with tool/browser/schema/package versions. A known mismatch is a named result, never a skipped
green cell. No product code change is required for the initial fixture specification.

## Evidence

[Pinned sources and probe results](../research/ograf-2026-09-13.md),
[full-stack acceptance boundaries](../OGRAF_FULL_STACK_PLAN.md#9-decision-gates-and-validation-receipts).
