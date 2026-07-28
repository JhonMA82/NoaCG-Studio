# Video model discovery and benchmark

NoaCG benchmarks model transports, not separate generators. Every selected model enters the
existing video harness and produces the same Motion Director plan plus either the Remotion or
HyperFrames source contract. The existing static validation, live player probe, two-round repair
limit, render service, and export path remain authoritative.

## Architecture

The browser stores only a provider id, opaque model id, and optional sampling settings. It calls
the same server-side `/api/ai/generate` gateway used by the SPX harness. Provider adapters live in
`api/_lib/aiGateway.ts`:

- OpenRouter uses its OpenAI-compatible chat-completions endpoint.
- Hugging Face uses its OpenAI-compatible Inference Providers router when a compatible hosted
  endpoint exists.
- Anthropic and OpenAI retain their existing adapters.

`GET /api/ai/models?provider=openrouter|huggingface` is read-only discovery. The server fetches and
normalizes:

- [OpenRouter Models API](https://openrouter.ai/docs/api/api-reference/models/get-models):
  model ids, modalities, structured-output/tool/seed support, context and output limits, pricing,
  revisions, and current expiry.
- [Hugging Face router and Hub model metadata](https://huggingface.co/docs/inference-providers/hub-api):
  open-weight model ids, live hosted providers, structured-output support, context, current
  pricing, and free status.

The response is cached in server memory for 15 minutes. No provider key is returned. If discovery
is unavailable, the model field remains editable and generation fails through the normal
sanitized gateway error path if that route is invalid or unavailable.

The product filters video suggestions to live text-output models that support structured output,
have at least 32K context when a limit is reported, and allow at least 16K output tokens when a
limit is reported. This is a compatibility filter, not a claim of quality. Quality comes from the
benchmark.

## Environment variables

All credentials are server-only and must never use a `VITE_` prefix:

- `OPENROUTER_API_KEY`
- `HUGGINGFACE_API_KEY`, or the conventional alias `HF_TOKEN`
- `AI_KEY_ENCRYPTION_SECRET` to accept an optional user key through the encrypted HttpOnly cookie
- `AI_TIMEOUT_MS` and `AI_RETRY_LIMIT` for bounded provider calls
- `AI_MODEL_PRICING_JSON` for configured estimates when a provider does not return cost
- `VIDEO_BENCH_MAX_COST_USD` for the benchmark spending ceiling
- `VIDEO_BENCH_MAX_CONCURRENCY` for the benchmark process ceiling

`VITE_AI_PROVIDER`, `VITE_AI_MODEL`, and `VITE_AI_FALLBACKS` contain only non-secret route
preferences. OpenRouter and Hugging Face keys are never sent to browser code, localStorage,
benchmark artifacts, provider errors, or generated compositions.

## Model catalog and matrix

Refresh the tracked discovery snapshot:

```bash
npm run video:models:sync
```

This writes `benchmarks/video/model-catalog.json`. It records the sync time and normalized source
metadata so a benchmark can retain the exact discovery state it used.

The small, reviewable benchmark matrix is
`benchmarks/video/v1/models.json`. Add a model by supplying:

- a stable local id;
- provider and exact provider model id;
- one or more classes: `premium`, `inexpensive`, `free`, or `open-weight`;
- whether it belongs in the cheap smoke set;
- a conservative maximum cost reservation per full video generation.

Do not copy the live catalog into application source or maintain a large allowlist. The matrix is
deliberately small because it defines an experiment, while the Models APIs define what is
currently selectable.

## Running the benchmark

Start the bench dev server on this checkout's reserved port:

```bash
npm run build:player-host
npm run dev:bench
```

In another terminal, run the free rig check first:

```bash
npm run video:bench:smoke -- --stub
```

Then run a paid smoke after reviewing the printed case count and reserved cost ceiling:

```bash
npm run video:bench:smoke -- --max-cost=1 --concurrency=1 --render
```

The complete versioned matrix is:

```bash
npm run video:bench:run -- --max-cost=20 --concurrency=1 --render
```

Useful selectors:

```bash
npm run video:bench:smoke -- --models=gemini-flash-lite,gemma-4-free
npm run video:bench:run -- --briefs=logo-reveal,layout-challenge
npm run video:bench:run -- --engines=remotion
```

The orchestrator never exceeds the smaller of `--concurrency` and
`VIDEO_BENCH_MAX_CONCURRENCY`. Before launching a case it reserves that model's declared
worst-case cost; cases outside `--max-cost` or `VIDEO_BENCH_MAX_COST_USD` are not started.
Provider-unavailable, rate-limited, and malformed responses become failed cases and do not erase
completed results.

The v1 brief bank covers logo reveal, promotional typography, editable social data, a multi-scene
broadcast package, and a difficult multilingual animation/layout task. Both engines receive the
same brief text, dimensions, duration, sampling values, and two-repair limit. The configured seed
is sent only by adapters that support it.

## Artifacts and scoring

Each run directory contains:

- `manifest.json` with benchmark, prompt, model-matrix, runtime commit, settings, and limits;
- `benchmark-results.json` with normalized case metrics;
- one case directory with the complete source, Motion Director plan, raw normalized model call
  outputs, errors, rejected repair sources, key frames, optional rendered still, token usage,
  provider cost, route attempts, and latency;
- `human-scores.json`, initially null;
- `leaderboard.json` and `leaderboard.html` after report generation.

Generate or refresh the report:

```bash
npm run video:bench:report -- --input=video-benchmark-out/<run>
```

Deterministic checks and human judgments stay separate.

Automated checks cover generation completion, structured schema/contract acceptance,
TypeScript or document validation, live runtime probing, runtime/readability errors, editable
data-field wiring, repair count, first-pass success, render success when requested, latency,
tokens, and estimated/provider-reported cost.

Human reviewers score 0-10 for:

- visual completeness;
- brief adherence;
- animation quality;
- typography and layout quality.

Until every case has human scores, the report clearly marks its quality ranking provisional and
uses the machine score only. After review, overall quality is 40% machine checks and 60% human
visual scoring. Separate rankings cover best quality, value, free model, Remotion,
HyperFrames, and first-pass reliability.

## Reproducibility limits

The artifact records the provider model revision or discovery date when available. Hosted
providers can still change weights or routing behind an unchanged id. A result is comparable only
when benchmark version, prompt version, runtime commit, provider/model id, discovery snapshot,
settings, and repair limit are all retained. Free endpoints and provider availability are
especially volatile, so an unavailable result is data, not grounds to silently substitute a
different model.
