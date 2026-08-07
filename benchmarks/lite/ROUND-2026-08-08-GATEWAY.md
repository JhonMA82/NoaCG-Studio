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
