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

The second is **`imported-graphic-analysis`** (plan §6): one server-owned vision call
over the user's downscaled artwork, proposal-only, behind
`AI_TASK_IMPORT_ANALYSIS_ENABLED` (default off). Endpoints
`/api/ai/tasks/import-analysis` (+ `/status`, `/outcome`), profile
`api/_lib/aiImportAnalysisProfile.ts`, browser harness `src/ai/importAnalysis/`
(contract + client + deterministic normalizer), UI = the Import Graphic Text step's
`AnalyzeProposalPanel` applying accepted suggestions as ordinary `DesignFieldSpec`s. Its
ledger rows ride `ai_generations` with `profile = 'import-analysis'` (migration 0015,
which makes usage counting and reservation PROFILE-SCOPED - one task's traffic never
consumes another's quotas or fleet budget). Quotas per ratified decision 3: 1 image
(downscaled to at most 1920x1080 client-side), 10 successful analyses/day, 100/month.
The launch route is settled by the vision benchmark (plan §8) before the flag turns on.

`taskConfigured(task)` is the fail-closed gate the Lite endpoints now call (generalizing
`liteProfileConfigured()`): every OpenRouter route needs a current price and a provider
endpoint allowlist, and every free/anonymous-tier route must be a catalog-approved entry
that is also **funded-eligible** (below). A misconfigured route refuses with
`profile_not_configured` - never a silent fallback.

Free and anonymous tiers are exactly the tiers NoaCG pays for, which is why they carry
both constraints; `byo` and `paid` spend the caller's own money on routes they chose, so
neither the catalog nor the price ceiling applies to them.

## The approved-route catalog (`api/_lib/aiModelCatalog.ts`)

Entries `{ route, openWeights, capabilities {vision, coding, structuredOutput,
contextWindow}, price, zdrAvailable, notes }`, audited by hand at promotion time
(`docs/AI_LITE_PROMOTION.md`). The catalog's price snapshot is the base of Lite's price
table (`approvedModelPrices()`), so catalog and policy cannot drift; `AI_LITE_PRICING_JSON`
may adjust a price but cannot approve a route.

**`openWeights` is promotion-time preference metadata, never a per-request gate**
(ratified decision, plan §15.1): at benchmark parity the open-weight candidate wins the
route, but a superior proprietary model is never excluded for closed weights alone.

**The funded-route rule IS a gate** (ratified decision, plan §15.5 - *who pays decides the
route*). A route NoaCG funds must go through `FUNDED_ROUTE_PROVIDER` (`openrouter`) and
price at or under `FUNDED_ROUTE_PRICE_CEILING` (1.00 in / 5.00 out per million). OpenAI
and Anthropic models are reachable only through a user's own sealed key, so they never
enter this catalog. Two layers enforce it:

- `fundedModelRoute(route, price?)` prices against the caller's **effective** table, not
  the audited snapshot, so an `AI_LITE_PRICING_JSON` override cannot move the free tier
  onto a route the project would not pay for.
- A catalog test refuses any entry that could never serve a funded route, so a
  non-OpenRouter or over-ceiling addition fails the build rather than only failing later
  at request time.

Raise the ceiling deliberately (it is one constant plus its test), not to admit a single
model that just missed. Revisit the whole rule when there is revenue.

Live provider listings (current prices, context windows, availability) come from the
discovery module `api/_lib/aiModelDiscovery.ts` (`GET /api/ai/models`) - discovery is a
listing, not an approval.

## Adding a task (the checklist the second consumer followed)

1. Register the task id and its `TaskProfile` derivation in `aiTaskRegistry.ts`.
2. Approve its routes in the catalog (benchmark first; open-weight preference at parity).
   A task with a free or anonymous tier can only be approved onto a funded-eligible
   route - cheap and OpenRouter-reachable.
3. If it writes `ai_generations` with a new `profile` value, ship the CHECK-constraint
   migration in the same commit (root AGENTS.md non-negotiable 6) - and keep older
   deployments working: Lite deliberately stays on its 0010-era RPC names so the code
   deploy never depends on the migration being applied first (`aiLiteStoreSupabase.ts`).
4. Rate-limit through `admitTaskIp(taskId, ipHash)` - per-task windows, pre-body, never
   an entitlement.
5. Gate the UI on the task's status endpoint (invisible offline and when disabled), on
   `needsSignIn`, and on the first-use disclosure notice (`useAiConsent`).
6. Pin the gate in `api/_lib/aiTaskRegistry.test.ts` (`scripts/run-ai-gateway-tests.mjs`,
   part of `npm run build`) and the UI's flag-off absence in a stub-first e2e spec.
