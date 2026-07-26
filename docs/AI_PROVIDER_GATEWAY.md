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
   OpenRouter Chat Completions.
5. The server normalizes text or structured output, errors, token usage, route attempts, and
   optional estimated-cost metadata before returning it to the unchanged harness.

There is no provider-specific branch in DesignSpec, validation, repair, preference learning,
or UI application logic.

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

## Configuration

Browser-visible values are non-secret:

- `VITE_AI_PROVIDER`: `anthropic`, `openai`, or `openrouter`.
- `VITE_AI_MODEL`: an opaque model id for the selected provider.
- `VITE_AI_FALLBACKS`: optional JSON array of ordered `{provider, model}` routes.

Managed keys are server-only:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`

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
authentication, the `0010_ai_generations.sql` migration, a Supabase secret key, both managed
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

## Future adapters

Ollama, vLLM, and rented GPU inference are future `ProviderAdapter` implementations. They
must enter through the same server interface and normalized result contract. Local hosting,
model downloads, GPU lifecycle, queues, and worker orchestration are deliberately out of
scope for this phase. No local provider should create another Creative AI harness.
