# AI task registry and approved-route model catalog

Stage 1 of `docs/AI_PLATFORM_PLAN.md` (§4, §7, §12). Two server-only modules; the browser
never sees either.

## The task registry (`api/_lib/aiTaskRegistry.ts`)

A typed map `taskId -> TaskProfile`. `TaskProfile` is `LiteProfile` generalized
LITERALLY - and nothing more (no capability negotiation until a third harness needs it,
plan §13):

| Field | Meaning |
| --- | --- |
| `schema` | The task's structured output contract - identity + version, never the schema itself. The schema stays owned by the task's harness. |
| `tiers` | Who may run it: `anonymous`, `free`, `byo`, `paid`. Lite is `['free']`. |
| `limits` | Token budgets plus `maxImages` / `maxImageResolution` for vision tasks (Lite: 0 / null - logos ride the deterministic browser pipeline). |
| `timeoutMs`, `maxAttempts`, `retryLimit` | The bounded execution policy handed to the gateway. |
| `routePolicy` | Primary + explicit fallbacks, prices, OpenRouter endpoint allowlist, ZDR requirement, structured mode, per-call cost ceiling. |
| `ledger` | Which ledger the task writes and the row discriminator (`ai_generations` pins its values with a CHECK constraint - a new value ships its migration in the same commit). |

The first registered task is **`lite-design-spec`**: a VIEW over `liteProfile()`, so the
`AI_LITE_*` environment stays single-sourced and the public `/api/ai/lite/*` endpoints
keep their URLs, request shapes, and behavior. Quotas, concurrency, fleet spend, and the
reservation ledger remain the policy layer (`aiLiteStore` + migrations 0010-0013); the
registry does not duplicate them.

`taskConfigured(task)` is the fail-closed gate the Lite endpoints now call (generalizing
`liteProfileConfigured()`): every OpenRouter route needs a current price and a provider
endpoint allowlist, and every free/anonymous-tier route must be a catalog-approved entry.
A misconfigured route refuses with `profile_not_configured` - never a silent fallback.

## The approved-route catalog (`api/_lib/aiModelCatalog.ts`)

Entries `{ route, openWeights, capabilities {vision, coding, structuredOutput,
contextWindow}, price, zdrAvailable, notes }`, audited by hand at promotion time
(`docs/AI_LITE_PROMOTION.md`). The catalog's price snapshot is the base of Lite's price
table (`approvedModelPrices()`), so catalog and policy cannot drift; `AI_LITE_PRICING_JSON`
may adjust a price but cannot approve a route.

**`openWeights` is promotion-time preference metadata, never a per-request gate**
(ratified decision, plan §15.1): at benchmark parity the open-weight candidate wins the
route, but a superior proprietary model is never excluded for closed weights alone.

Live provider listings (current prices, context windows, availability) come from the
discovery module `api/_lib/aiModelDiscovery.ts` (`GET /api/ai/models`) - discovery is a
listing, not an approval.

## Adding a task (the second consumer's checklist)

1. Register the task id and its `TaskProfile` derivation in `aiTaskRegistry.ts`.
2. Approve its routes in the catalog (benchmark first; open-weight preference at parity).
3. If it writes `ai_generations` with a new `profile` value, ship the CHECK-constraint
   migration in the same commit (root AGENTS.md non-negotiable 6).
4. Rate-limit through `admitTaskIp(taskId, ipHash)` - per-task windows, pre-body, never
   an entitlement.
5. Pin the gate in `api/_lib/aiTaskRegistry.test.ts` (`scripts/run-ai-gateway-tests.mjs`,
   part of `npm run build`).
