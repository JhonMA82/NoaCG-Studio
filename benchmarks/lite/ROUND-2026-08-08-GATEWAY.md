# Lite round 2026-08-08 — first round on Vercel AI Gateway

The round that established NoaCG Lite serves at all on the new transport. Its value is
**"does the pipeline work end to end"**, not a quality verdict: it is one run of one route,
and nothing here is a promotion.

- Candidate label `gateway-v7`, prompt/schema version `lite-lower-third-v7`.
- Route: `vercel:google/gemini-2.5-flash-lite` primary, `vercel:openai/gpt-oss-20b` fallback.
- Fixture bank `ai-lite-lower-third-fixtures.mjs` v2, all 30.
- Retention: `zeroDataRetention: true` + `disallowPromptTraining: true`, providers restricted
  to `google,vertex,bedrock`.

## Result

| | |
|---|---|
| Calls | 31 |
| Machine-usable | **27 / 30** |
| Failed | 3 |
| Provider cost | **$0.0096** total, ~$0.00032 per generation |
| Chassis spread | lt02 ×7, lt11 ×6, lt05 ×5, lt15 ×3, lt25 ×3, lt32 ×3 |

Cost is not a constraint and has not become one on the gateway: the previous transport
measured ~$0.0003/generation and this measures ~$0.00032. Route choice remains a quality
decision, not a budget one.

**The chassis spread is the encouraging number.** Six designs across 27 results, none taking
more than a quarter — the "same layout, different colours" failure the diversity doctrine
names is not happening on this route.

## The three failures

| Fixture | Code | Reading |
|---|---|---|
| `team-identity` | `generation_failed` | Server semantic validation rejected the decision - the model returned a spec whose roles did not satisfy the brief. |
| `call-to-action` | `generation_failed` | Same class. Both are the fail-closed path working, not a crash. |
| `multilingual` | `malformed_response` | The emit did not match the schema after the bounded repair. Worth one look before the next round: this fixture is the one most likely to expose a tokenizer or non-ASCII interaction. |

Two of three are the platform correctly refusing a bad answer rather than shipping it. None
is a compile or bench failure, which is the part the transport change could have broken.

## Warnings on otherwise usable results

`bench-line-wrap` ×2 — `organization-identity` (lt02) and `long-name` (lt11). Both are
identity lines wrapping to a second line. `long-name` is a deliberately brutal fixture
("Maximiliano Hernández de la Cruz"); `organization-identity` is not, and is the one to look
at first.

This is the open thread the previous handoff already named, and it connects to a defect this
round did NOT measure: `designAdjust.ts` clamps a supporting line to a hard 14px while
`scripts/type-floor.mjs` holds a lower third to 20px, and **nothing re-measures the ADJUSTED
result** — the catalog gates certify a design as authored, not as the AI tuned it. Until the
type floor runs inside `productionSpxValidator`, a wrap warning and an under-floor line are
both invisible to every gate that is supposed to catch them.

## What this round does not establish

Quality. There is no comparison arm, no blind review, and no judge pass. A round with one
route measures that the route works. The next round that wants to say anything about how
GOOD Lite is needs a second arm and human review (`docs/AI_LITE_PROMOTION.md`).

Media: 108 lifecycle frames + 27 clips under `lite-eval-out/` (gitignored), `review.html`
alongside them.

## Follow-up 2026-08-08: the three failures, diagnosed

Investigated after the round. The headline: **only one of the three was what it looked like.**

**`multilingual` was not a Cyrillic bug.** Replayed three times against a faithful copy of the
rig's request (the rig sends only prompt/resolution/fps - no generationSpec): 3 of 3 succeeded
with the Ukrainian copy intact. The schema carries no ASCII-assuming constraint; the only
`pattern` in it is the hex-colour one. It was a stochastic miss on the primary.

**What made a stochastic miss fatal was the FALLBACK.** Lite runs `retryLimit: 0`, so a
retryable `malformed_response` does not re-roll the primary - it hands straight to the second
route. Pointed at the same briefs as a primary, `openai/gpt-oss-20b` produced the Lite
contract **2 times in 4**, failing `multilingual` with the identical error. It was chosen the
night before on price and catalog-approval alone, and never measured against the contract it
exists to satisfy.

**`alibaba/qwen3.7-flash` was tried as a replacement and REJECTED.** Cheapest text route on
the gateway (0.03/0.13) with a 991k context - and it cannot serve Lite at all: its endpoint
downgrades `response_format: json_schema` to `json_object` and then refuses
("'messages' must contain the word 'json'"). 0 of 6. Price and context are not capability.

**A second, self-inflicted fault surfaced while testing it.** The first six attempts failed
before reaching any model, because `AI_LITE_GATEWAY_PROVIDERS=google,vertex,bedrock` - set the
night before, and in production - names nobody who serves an Alibaba model. The gateway answers
`No available providers match the 'only' filter`, which the error mapping reported as the
generic "the AI provider rejected the request". That reads as the model refusing when nothing
was ever asked, and it sent this investigation down the wrong path once. It now has its own
code, `route_not_permitted`.

**The fix.** The second attempt goes to the primary again rather than to a weaker model. Two
rolls of a model that produced the contract 27 times in 30 beat one roll each of that and a
coin flip; the trade is provider-outage resilience, which has not been observed here, against
the schema miss, which has. Verified after the change: `multilingual` passes, and
`call-to-action` - the round's other `generation_failed` - now passes **on attempt 2**, which
is the retry doing exactly the job the old fallback could not.

`team-identity` still fails, and is a different class: server semantic validation refusing a
spec whose roles do not satisfy the brief. Fail-closed working, not a transport or schema
fault. Left open.
