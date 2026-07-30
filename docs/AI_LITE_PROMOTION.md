# NoaCG Lite - promotion policy

Written BEFORE the first candidate run, as the benchmark contract requires. The benchmark
recommends; **only the product owner promotes**, by changing the server route env config
(`AI_LITE_PRIMARY_PROVIDER` / `AI_LITE_PRIMARY_MODEL`, prices, provider pinning) - nothing
is ever applied automatically.

Threshold values marked TODO are the owner's to set; until they are set, no promotion
recommendation may be issued (a gate with an unset threshold counts as NOT met).

## Before spending: the free preflight (required)

```bash
npm run bench:preflight -- <model,model,...>
```

A round is only worth paying for if each arm serves the model it is reported as. Run this
first, every time. It is free, reaches no network, and refuses a plan whose arms are
overridden by a saved route, missing from the approved-route catalog, unconfigured
(no provider allowlist, no price, not funded-eligible), or **not pairwise distinct**.

That last one is why this exists rather than being left to care at run time. `/api/ai/lite/
status` does not expose the model id - deliberately - so the paid runner cannot ask the
server which candidate it is serving; the injected env IS the evidence. A failed injection
therefore looks exactly like a real run, and a comparison whose arms all resolve to one
model still produces DIFFERENT numbers, because sampling noise between identical models
reads as model character. The result set looks like findings and means nothing. Every
failure the preflight checks for consumed a real round at least once
(`api/_lib/aiBenchPreflight.ts` carries the catalogue).

A green preflight says the comparison is well-formed and attributable. It says nothing about
model QUALITY - that is what the paid round measures, and what the gates below judge.

## Eligibility gates (all must hold, measured on core + hidden holdout)

| Gate | Threshold |
|---|---|
| All critical machine gates pass after permitted repair (schema, semantics, compile, static + runtime validation, safety, export) | 100% of accepted results |
| Machine-usable rate | TODO (owner) - suggested starting point ≥ 90% |
| Human acceptance (yes + yes-after-minor-edits), blind review | TODO (owner) |
| Mean visual score (1-5), blind review | TODO (owner) |
| No serious regression in any supported category vs the incumbent | required |
| Cost per accepted result | ≤ $0.01 (the Lite ceiling), with margin |
| Provider privacy (ZDR) + endpoint stability | required (recorded in the candidate manifest) |
| Manual broadcast verification | flagged if incomplete - see checklist below |

## Ranking (after eligibility)

cost per accepted graphic → machine-usable rate → human acceptance → category consistency
→ latency → variance.

## Promotion recommendation requires

- every eligibility gate met;
- no material regression in machine usability, no major category regression;
- a meaningful improvement in at least one of: cost per accepted result, human score,
  latency, variance ("meaningful" must exceed the reviewer's measured self-consistency
  noise - see bench:report's repeat-item agreement);
- identical pipeline identity between incumbent and challenger runs
  (`pipelineIdentityMatches`) - a mixed-mode comparison is void.

Output: a recommendation section in the run report plus the PROPOSED env change, e.g.
`AI_LITE_PRIMARY_MODEL=<id>` with the supporting run id, prompt version, and rollback route
(the previous primary). Candidate identity is always model id + provider endpoint +
revision + parameters + reasoning configuration + max output tokens + prompt version -
results from a different endpoint are not interchangeable because the public name matches.
Disable uncontrolled provider fallback during comparison runs
(`allowProviderFallbacks: false` is already the Lite OpenRouter policy).

## Manual broadcast verification checklist

Automated browser checks do not prove production behaviour. Before a promoted route is
called *broadcast-approved*, verify a sample of its accepted graphics on real targets:

- **SPX**: template loads, definition fields appear, play/next/stop/update behave, `out`
  timing honoured.
- **CasparCG**: transparency/keying correct over content, font loading from the package,
  long-running stability.
- **OBS Browser Source** and **vMix Web Browser**: transparent background contract, update
  without full re-entry, performance at target resolution/frame rate.
- **Export package integrity**: relative paths only, fonts and assets present, works over
  `file://`.
- **Browser/CEF differences**: check the playout host's engine version, not only desktop
  Chrome.

Record the outcome beside the recommendation (run summary `manualVerification:
'pending' | 'passed' | 'failed'`). Until passed, the strongest allowed claim is
*recommended for manual broadcast verification*.
