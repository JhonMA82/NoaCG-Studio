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
kept when present. Other estimates are emitted only when the operator supplies current prices
through `AI_MODEL_PRICING_JSON`, keyed by `provider:model` with `inputPerMillion` and
`outputPerMillion`. Missing pricing produces no estimate rather than a stale claim.

Provider response bodies and credentials are never copied into errors or logs. User-facing
errors use stable gateway codes and sanitized messages.

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
