# Model route audits

The register of hand-performed audits behind `APPROVED_MODEL_CATALOG`
(`api/_lib/aiModelCatalog.ts`). `/admin` Models reports a route as **approved** only when it
has an entry in that catalog, and the catalog's `zdrAvailable` flag is an **audited fact, never
a discovered one** (`docs/ADMIN.md` §9) - the provider listing carries no per-model retention
flag. This file is where the "audited" part is written down, so a reader can check the claim
instead of trusting it.

One section per audit. An audit records what was measured, on what date, against what source,
and what it does **not** establish. Quality is never established here: only the NoaCG
benchmarks do that (`docs/AI_LITE_PROMOTION.md`).

## How a ZDR audit is performed

OpenRouter publishes two things this audit reads, both free public GETs that generate no
tokens:

| Source | What it answers |
|---|---|
| `GET /api/v1/models/<author>/<slug>/endpoints` | every endpoint serving the model, its price, context and supported parameters |
| `GET /api/v1/endpoints/zdr` | the subset of all endpoints that OpenRouter will serve under zero-data-retention routing |

A model is ZDR-servable when at least one of its endpoints appears in the second listing.
**Which endpoint that is matters**: `provider: { zdr: true }` narrows routing to the ZDR set,
so a model whose ZDR endpoint differs from its default endpoint behaves differently under the
flag - different context window, sometimes different supported parameters. An audit that reads
the default endpoint and then approves the ZDR flag has audited the wrong thing.

**A ZDR-servable model is not a ZDR-served model.** The routing directive has to be sent. It
is sent by the profile-owning surfaces (`api/_lib/aiLiteProfile.ts`,
`api/_lib/aiImportAnalysisProfile.ts`, which build a `GatewayExecutionPolicy` carrying
`zdr` and `data_collection`) and **not** by the generic `POST /api/ai/generate` proxy, which
calls `executeGatewayRequest(body, { keyFor })` with no policy argument at all. So for any
route reached through the generic gateway, "can it be served ZDR" and "is it being served ZDR"
are two separate questions and both belong in the audit.

---

## `google/gemini-3.1-flash-image` - NoaCG Pro concept route

**Audited 2026-08-02. Status: evidence complete, awaiting the owner's approval decision.**
Not yet in `APPROVED_MODEL_CATALOG`; `/admin` Models therefore shows it as *in use, eligible,
not audited*, which is the honest reading of the state before this file existed.

### What the route does and what it carries

`PRO_STANDARD_ROUTES.concept` (`src/ai/pro/contract.ts`). One image call per Pro generation,
on the NoaCG-managed key, tagged `surface: 'pro'` and gated on the `ai.pro` feature key.

What leaves the machine on this call is `proConceptPrompt(brief)`: the fixed design wording
plus **the graphic's two text lines and the user's free-text design brief**. On a real lower
third those two lines are a named person and their role - so this route carries third-party
personal data written by the operator, which is the reason retention is worth auditing rather
than assumed. Uploaded artwork does **not** reach this call (v1 sends text only); the
follow-on `interpret` call reads the *generated* concept image, downscaled.

### Measured evidence (2026-08-02, live listings)

`GET /api/v1/models/google/gemini-3.1-flash-image/endpoints` - two endpoints:

| Endpoint | Context | `prompt` /M | `completion` /M | `image_output` /M | On the ZDR list |
|---|---|---|---|---|---|
| **Google** (Vertex) | 131,072 | $0.50 | $3.00 | $60.00 | **yes** |
| Google AI Studio | 65,536 | $0.50 | $3.00 | $60.00 | no |

`GET /api/v1/endpoints/zdr` (703 endpoints on the day) contains
`Google | google/gemini-3.1-flash-image-20260528`.

So: **the model is ZDR-servable, on one of its two endpoints.** Asking for ZDR pins the call
to the Vertex endpoint and doubles the usable context; it does not change the price.

Supported parameters differ between the two, and the difference is worth stating because it is
exactly the trap the method section warns about: the **ZDR endpoint does not advertise
`structured_outputs`** (it lists `response_format`), while the non-ZDR AI Studio endpoint
advertises both. That does not block this route - the concept call asks for an image
(`expect: 'image'`, which sets `modalities: ['image','text']`) and requests no structured
output - but it means a catalog entry for this model must record
`capabilities.structuredOutput: false`, describing the endpoint ZDR routing would actually
select, not the one the default listing shows.

### Alternatives, for completeness

Image-output models with at least one ZDR endpoint on the same day: `google/gemini-2.5-flash-image`
($30.00/M image out), `google/gemini-3.1-flash-lite-image` ($30.00/M), `google/gemini-3.1-flash-image`
($60.00/M), `google/gemini-3-pro-image` ($120.00/M), plus `bytedance-seed/seedream-4.5`,
`microsoft/mai-image-2.5(-pro)` and three `krea/krea-2-*` endpoints. The current route is
therefore not the only ZDR option, and it is not the cheapest one - **which is a fact, not a
recommendation.** The route was chosen by the 2026-07-31 paid Pro round; nothing in this audit
re-opens that, and moving it needs `npm run bench:pro`, not a price table.

### Price ceiling

`FUNDED_ROUTE_PRICE_CEILING` is $1.00/M input and $5.00/M output. The text sides ($0.50 /
$3.00) clear it. **The $60.00/M image-output side is not measured against anything**, because
no ceiling for image work has been decided - the same gap `docs/ADMIN.md` §9 states for the
image tab. Approving this route does not close that gap and must not be read as having done
so. Observed Pro cost is ~$0.07-0.08 per generation end to end (`src/ai/AGENTS.md`), which is
the number that actually bounds the exposure today.

### The finding that changes the decision

**Pro traffic does not currently request ZDR, and cannot.** `api/ai/generate.ts` calls
`executeGatewayRequest(body, { keyFor })` with no `GatewayExecutionPolicy`, so no
`provider.zdr`, no `data_collection: 'deny'` and no endpoint pinning is sent on the concept or
the interpret call. `google/gemini-2.5-flash` - the interpret route, already in the catalog
with `zdrAvailable: true` - inherits the same gap: its flag was audited for the **Lite judge**
route, where `aiLiteProfile` does send the policy.

Recording `zdrAvailable: true` for the concept route while the requests go out without the
flag would put a privacy claim on the admin page that production does not honour. That is the
same defect shape §9 already forbids in the other direction ("it never reads *no*, which would
be an equally unfounded claim").

### Recommendation

**Approve, conditionally: catalog the route and wire the policy in the same change.**

1. Add `google/gemini-3.1-flash-image` to `APPROVED_MODEL_CATALOG` with
   `openWeights: false`, `capabilities: { vision: true, coding: false, structuredOutput: false,
   contextWindow: 131_072 }`, `price: { inputPerMillion: 0.50, outputPerMillion: 3.00 }`,
   `zdrAvailable: true`, and a note pointing here.
2. Give the Pro surface a managed route policy - `zdr: true`, `data_collection: 'deny'`,
   `allow_fallbacks: false` - applied server-side in `api/ai/generate.ts` for
   `surface: 'pro'` on the **managed** key only. Never on the BYO branch: a user spending their
   own key on their own chosen model is not ours to route.
3. Re-audit `google/gemini-2.5-flash` under the Pro surface at the same time - it is the same
   gap on a route that is already approved.

Rejecting step 2 while accepting step 1 is the one combination this audit advises against: it
is the state that produces a false claim on the operator's screen.

**Approval is the owner's.** Nothing above promotes anything; the catalog entry is written only
after an explicit yes.
