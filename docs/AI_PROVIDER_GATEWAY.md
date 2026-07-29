# AI provider gateway

NoaCG has one Creative AI system. `AIProvider` remains the product-level interface and the
existing harness remains responsible for DesignSpec routing, catalog assembly, validation,
runtime checks, repair, preferences, and graphic-type context. The gateway is only the model
transport beneath that system.

## Request path

1. The existing SPX or video harness calls `src/ai/modelGateway.ts`.
2. The browser sends a provider-neutral request to `POST /api/ai/generate`.
3. The server selects exactly the requested provider/model route.
4. `api/_lib/aiGateway.ts` adapts the request to Anthropic Messages, OpenAI Responses, or
   OpenRouter/Hugging Face OpenAI-compatible Chat Completions.
5. The server normalizes text or structured output, errors, token usage, route attempts, and
   optional estimated-cost metadata before returning it to the unchanged harness.

Structured output is re-validated server-side against the request's own JSON Schema
(`schemaAccepts`), because a provider's constrained decoding is a best effort, not a
guarantee. It honours `oneOf`/`anyOf`, `enum`, object `required`/`additionalProperties`,
array `minItems`/`maxItems`/`items`, string `minLength`/`maxLength`/`pattern`, and
`minimum`/`maximum` on both `number` AND `integer`. A violation is a RETRYABLE
`malformed_response`, so the bounded attempt budget re-rolls a stochastic miss instead of
handing the caller a shape it must reject after paying for the call. **A constraint the
validator does not implement is not enforced anywhere** - declare only what it reads.

There is no provider-specific branch in DesignSpec, validation, repair, preference learning,
or UI application logic.

`POST /api/ai/generate` sits behind a per-IP burst gate (`AI_GENERATE_RATE_WINDOW_SEC` /
`AI_GENERATE_RATE_MAX`, default 60 requests per 60 seconds, refused before the body is read).
BYO-key traffic spends the user's own key but passes the same gate - the platform is still the
egress. When Supabase server configuration is present, every gateway execution also writes one
content-free row to the server-write-only `ai_gateway_requests` ledger (migration
`0012_ai_gateway_requests.sql`): task `byo-generate`, user id when known, salted IP hash, key
source, route, normalized tokens, provider cost, and the outcome code. Prompts, messages,
images, generated output, provider bodies, and raw IPs never enter it, and a ledger failure
never fails the generation. It is deliberately separate from Lite's `ai_generations` ledger so
gateway traffic cannot consume Lite's fleet-spend and concurrency budgets.

Large provider catalogs are discovered server-side through `GET /api/ai/models`
(`api/_lib/aiModelDiscovery.ts`). OpenRouter's Models API and Hugging Face's Inference
Providers router supply ids, capabilities, limits, availability, and current prices.
`docs/VIDEO_MODEL_BENCHMARK.md` defines the video compatibility filter and repeatable
quality benchmark.

## Task registry and approved-route catalog

Managed free-tier tasks are declared in the server task registry
(`api/_lib/aiTaskRegistry.ts`): per task, the structured-contract reference and version,
allowed tiers, token/image limits, timeout/retry, route policy, and ledger kind. The first
task is `lite-design-spec` - NoaCG Lite re-expressed over the same `AI_LITE_*`
configuration with its public URLs and behavior unchanged.

Free-tier routes must additionally be entries in the server-only approved-route catalog
(`api/_lib/aiModelCatalog.ts`); the registry fails closed (`profile_not_configured`) on
any route outside it, including the Lite skin-judge route. The catalog's `openWeights`
flag is promotion-time preference metadata (open wins at benchmark parity), never a
per-request gate. BYO-key traffic is not catalog-constrained - the caller spends their own
key on an explicitly chosen route. Details: `docs/AI_TASK_REGISTRY.md`.

The second registered task is `imported-graphic-analysis`
(`POST /api/ai/tasks/import-analysis` + `/status` + `/outcome`, flag
`AI_TASK_IMPORT_ANALYSIS_ENABLED` default off): one vision call over the user's
client-side-downscaled artwork, proposal-only, same trust ladder as Lite (fail-closed
route, durable profile-scoped ledger - migration 0015 - burst gate, sign-in, cost
ceilings, atomic quota reservation). The image is analyzed and dropped, never stored.

## NoaCG Lite

NoaCG Lite is a server-owned product profile over the same gateway and harness. Its browser
client calls `POST /api/ai/lite/generations` with a typed brief, not an arbitrary system
prompt, provider, model, route, or fallback. The server builds a versioned compact catalog
prompt, enforces the fixed route policy, and returns either one allowlisted catalog
DesignSpec or an explicit unsupported decision. The existing browser harness then calls the
real `variant.create()` assembler, deterministic design adjustments, static validation, the
safety screen, and the live runtime bench. The result is an ordinary `SpxTemplate`.

Lite cannot enter raw generation, the custom coder, polish, import conversion, code
modification, code repair, or the three-alternative path. One focused structured-spec repair
or one fixed fallback may run, but both share a hard two-attempt session ceiling. A
deterministic compilation or runtime failure is recorded as a NoaCG platform failure and is
never sent to a model for code repair.

The optional skin vision judge (`POST /api/ai/lite/judge`, `AI_LITE_JUDGE_*` settings)
follows the same posture: server-owned route and prompt, fail-closed pricing and provider
allowlist, the same ZDR policy, cost capped per call and accounted on the generation's
ledger row. The submitted hold frame is judged and dropped - never stored.

The public status endpoint returns only availability, supported product categories, public
input limits, and remaining allowance. It never returns provider names, model ids, prices,
endpoint slugs, keys, or fallback rules. Primary and fallback routes, provider endpoints,
prices, prompt version, allowances, concurrency, fleet spend, timeouts, and the kill switch
are server configuration. Changing the selected Lite model needs no browser deployment.

The durable `ai_generations` ledger is server-write-only. It records ids, salted IP hashes,
profile and prompt version, status, resolved category, route accounting, normalized tokens,
provider cost, timing, and machine-readable rule codes. It does not store prompts,
conversations, images, fonts, DesignSpecs, templates, generated code, provider bodies, or
raw IP addresses. Successful validation and user acceptance are separate outcome events, so
cost per machine-usable and cost per accepted graphic can be measured without collecting
student content.

The first quality release is lower-third-only. Its DesignSpec carries a broad intent facet
and an explicit semantic role for each of its one or two lines, so the server can reject
missing requested names, roles, teams, headlines, or other field meanings before compilation.
Six audited chassis carry compact positive and negative routing guidance. Custom palettes
also receive deterministic primary and secondary text-contrast checks.

Migration `0011_ai_lite_quality_feedback.sql` adds only the resolved chassis id, broad intent
facet, and an enumerated discard reason to the server-only ledger. After a configurable
minimum sample count, accepted and discarded totals become a subtle chassis tie-breaker in
the trusted server prompt. The brief and semantic fit always outrank this aggregate prior,
and no prompt, template, screenshot, or generated artifact is retained.

## Disclosure and consent

Every AI action that sends content off the user's machine is gated by a first-use
disclosure notice (ratified decision 2, `docs/AI_PLATFORM_PLAN.md` §15): prompts and
uploaded images may be sent to an external AI provider; sensitive or confidential material
must not be uploaded; ZDR-capable routes are preferred where available but retention
across providers is not guaranteed. The wording and version live in
`src/ai/consentNotice.ts` - shared by the browser dialog and the server record, so they
cannot drift. Acceptance is stored client-side for anonymous users and server-side for
signed-in users (`POST /api/ai/consent`, table `ai_consents`, migration
`0014_ai_consent.sql` - timestamp + notice version, nothing else); bumping
`AI_NOTICE_VERSION` forces renewed acceptance everywhere. Offline/stub generations never
show the notice - nothing leaves the machine.

ZDR routing is the DEFAULT for every free-tier task route (`requireZdr` in the task
profile); turning it off is an explicit, audited, per-task server decision.

## Configuration

Browser-visible values are non-secret:

- `VITE_AI_PROVIDER`: `anthropic`, `openai`, `openrouter`, or `huggingface`.
- `VITE_AI_MODEL`: an opaque model id for the selected provider.
- `VITE_AI_FALLBACKS`: optional JSON array of ordered `{provider, model}` routes.

Managed keys are server-only:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- `HUGGINGFACE_API_KEY` (or the conventional `HF_TOKEN`)

Optional user-provided keys require `AI_KEY_ENCRYPTION_SECRET` with at least 32 characters.
The key is submitted once to `PUT /api/ai/credentials`, sealed with AES-256-GCM, and stored
in a SameSite=Strict, HttpOnly cookie scoped to `/api/ai`. Client JavaScript cannot read it.
The credential endpoint requires a same-origin mutation. Old raw keys found in the historical
`spx-gfx-ai` localStorage record are deleted and are never retransmitted automatically.

When Supabase server configuration is present, a managed key requires a valid signed-in user.
A user-provided key remains usable without an account because the browser owns the sealed
credential. A pure self-host with no Supabase configuration may expose its managed key to its
own users; operators are responsible for access control at that deployment boundary.

## Routing, retries, and cost

The primary route is the selected provider/model. Cross-route fallback happens only through
the explicit ordered `fallbacks` list. An empty list means the request never changes provider
or model, so the gateway cannot silently move work to a more expensive route.

Each route has a bounded timeout (`AI_TIMEOUT_MS`, default 120000, clamped to 5000-300000)
and retry limit (`AI_RETRY_LIMIT`, default 1, clamped to 0-2). Only transient network,
timeout, rate-limit, and provider-availability failures retry. After a route is exhausted,
an explicitly configured fallback may run.

Usage is normalized to input, output, and total tokens. OpenRouter provider-reported cost is
kept when present. Cached input and reasoning tokens are normalized when providers report
them. Other estimates are emitted only when the operator supplies current prices
through `AI_MODEL_PRICING_JSON`, keyed by `provider:model` with `inputPerMillion` and
`outputPerMillion`. Missing pricing produces no estimate rather than a stale claim.

Provider response bodies and credentials are never copied into errors or logs. User-facing
errors use stable gateway codes and sanitized messages.

For managed Lite OpenRouter calls the server also forces zero-data-retention routing,
denies provider data collection, requires parameter support, disables provider-selected
fallback, restricts routing to an audited endpoint allowlist, and applies a maximum input and
output token price. Lite fails closed when the endpoint allowlist or current price entry is
missing.

The `AI_LITE_*` settings documented in `.env.example` are private Vercel environment
variables. `AI_LITE_ENABLED` defaults off. Production enablement also requires Supabase
authentication, the `0010_ai_generations.sql` and `0011_ai_lite_quality_feedback.sql`
migrations, a Supabase secret key, both managed
route keys, an `IP_HASH_SALT` of at least 16 characters, and an audited OpenRouter endpoint
list where applicable. Lite stays unavailable instead of falling back to an in-memory quota
ledger or the development IP-hash salt when that durable configuration is incomplete.

`scripts/check-client-secrets.mjs` rejects provider key names with a public build prefix and
secret-looking values in client source and the final browser bundle. Real-token benchmark
scripts use the server gateway and never seed provider credentials into localStorage.

## Structured output

The established harness schemas are sent through:

- Anthropic forced tools.
- OpenAI Responses `text.format` JSON schema.
- OpenRouter OpenAI-compatible `response_format` JSON schema.

Every parsed result is validated again on the server against the same schema before it reaches
DesignSpec or template code. A missing field, wrong type, unknown field where
`additionalProperties` is false, or malformed JSON is a normalized `malformed_response`.

OpenRouter normally uses JSON Schema response formatting. An audited managed route may instead
use a forced function tool when the model supports tools but not response formatting. The tool
arguments pass through the same schema revalidation before reaching the harness.

The real-token Lite benchmark may use an explicitly enabled in-process ledger on a local
non-production server. Deployed Lite always requires the durable server ledger; the evaluation
override fails closed in production and on Vercel.

## Future adapters

Ollama, vLLM, and rented GPU inference are future `ProviderAdapter` implementations. They
must enter through the same server interface and normalized result contract. Local hosting,
model downloads, GPU lifecycle, queues, and worker orchestration are deliberately out of
scope for this phase. No local provider should create another Creative AI harness.
