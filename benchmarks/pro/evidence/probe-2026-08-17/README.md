# The `gemini-3.7-flash` route probe - 2026-08-17

Run before the paid round, because a curated model id has 404'd on this gateway before
(`docs/AI_ATTEMPTS.md`) and because two published price sheets disagreed about what this
checkpoint bills. Both files here are the raw return of ONE forced `emit_design_language`
call through the app's own gateway client (`callModelDetailed`, surface `spike`), on the
round's pinned decoding (temperature 0.7, seed 20260811) and a one-line brief.

## 1. The route resolves, and it serves a forced tool call

`google/gemini-3.7-flash` is listed on the gateway (`GET /v1/models`, 329 models) and both of
its endpoints - `google` and `vertex` - carry `tool-use` in their tags and `tools` +
`tool_choice` in `supported_parameters`. That is the listing, and a listing is not an
entitlement, so the probe made the real call: **the forced tool call was served and the answer
normalized through `normalizeDesignLanguage` with an EMPTY fallback list** - every field was a
value the schema offered, so nothing degraded to the house language.

## 2. The price, settled

| | listed input / 1M | listed output / 1M |
| --- | --- | --- |
| Vercel's model page | $0.75 | $3.75 |
| OpenRouter | $0.375 | $1.875 |
| **the gateway listing** | **$0.75** | **$3.75** |

The listing is not the settlement either - what settles it is the BILLED amount on a real call,
which the gateway returns with `source: "provider"`:

    1113 input x $0.75/1M  = $0.00083475
    1168 output x $3.75/1M = $0.00438000
                             -----------
                             $0.00521475   <- exactly what the provider billed

**$0.75 / $3.75 is what this account pays.** OpenRouter's half-price sheet is a different
seller's number and does not describe this transport. Note also that `internal_reasoning` is
priced at 0 on both endpoints, which does NOT mean thinking is free: reasoning tokens are
counted inside `outputTokens` and billed at the completion rate, as the arithmetic above shows.

## 3. Reasoning tokens - what the budget is actually spent on

Same brief, same decoding, one call each:

| checkpoint | input | output | of which reasoning | reasoning share | billed |
| --- | --- | --- | --- | --- | --- |
| `google/gemini-2.5-flash` | 1035 | 1401 | 1286 | **92%** | $0.003813 |
| `google/gemini-3.7-flash` | 1113 | 1168 | 947 | **81%** | $0.00521475 |

A design language is roughly 200 tokens of enum values. **Four fifths of what either checkpoint
bills is thinking nobody reads**, and it is billed at the completion rate. 3.7-flash thinks
LESS in absolute tokens and still costs 1.37x more per generation, because its completion rate
is 1.5x higher.

A second 3.7-flash sample taken minutes earlier (not kept as a file) read 1113 / 1191 / 990
reasoning at $0.005301, so the spread across two samples is about 2% - the per-call figure is
stable enough to budget a round against.

## What it cost

Four probe calls, ~$0.019 in total. `GeneratedLanguage.usage` gained a `reasoning` field in
the same change, so the round's own ledger carries this per cell rather than needing a probe.
