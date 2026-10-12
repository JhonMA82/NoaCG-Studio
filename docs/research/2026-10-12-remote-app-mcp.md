# A remote NoaCG MCP server for chat clients

**Date:** 2026-10-12. **Asked by:** the owner, after Supabase Select's "Your app's MCP server"
(2026-10-02). **Status:** research and a recommendation. Nothing was built, configured or
deployed. The draft spec is [REMOTE_MCP_PLAN.md](../REMOTE_MCP_PLAN.md).

**Question.** Should NoaCG offer a remote MCP server that people add as a connector in
Claude.ai, ChatGPT and similar clients by signing in, with no CLI install? If so, what does it do?
The owner wants it to adapt and assemble existing work, and to make new graphics only if that is
shown to be worth it.

## Recommendation

**Yes, build a small one, and leave new graphics out of it.**

- **What it does.** It reads what the user has (library graphics, brands, productions), searches
  the catalog, and sends a package to Home. The package can hold catalog designs and copies of
  library graphics, each with field values, a brand, palette or font, a logo, and a rundown.
  Nothing becomes a production until the user presses Install, as with `noacg pack --save`
  today. That covers "adapt and assemble", including filling fields from a run sheet the user
  pastes into the chat.
- **It never runs graphic code on a server.** A package entry is either a recipe (type, design,
  options, values) that the studio realizes at Install with its own scaffold code, or a library
  graphic's sources copied as data. Validation runs in the user's browser at Install, as it does
  for every pack. This removes the hardest blocker in
  [issue #843](https://github.com/NoaCG/NoaCG-Studio/issues/843): hostile code rendered on a
  server.
- **Where it runs.** A route in the existing `api/me` catch-all on Vercel, at
  `https://noacg.studio/mcp`, not a Supabase Edge Function. It costs no function slot. Sign-in uses
  the Supabase Auth OAuth server, and NoaCG keeps its own permission vocabulary on top.
- **Permissions.** The OAuth token is treated as an identity only. NoaCG records what the user
  consented to (`graphics:read`, `graphics:create`) in its own grant row. OAuth tokens get no
  direct database rights, so a leaked token can do no more than the tools allow. No Take, Out,
  Advance, publish or production replacement.
- **New graphics: skip.** Option (a), a blind draft validated when opened, would put graphics the
  agent never saw into a non-technical user's Home. Option (b), server rendering, is real new
  infrastructure with open-ended running cost for a free product, and Supabase Compute is a
  private alpha that self-hosters cannot run. Revisit only with evidence (section 5).
- **Rank.** It is the agent door's next phase (GOALS rank 2), after the current phase's
  done-criteria: the CLI or plugin on a fresh machine and the novel-brief benchmark. The OAuth
  spike can run earlier on staging because it touches nothing users see.

Why it is worth doing at all: the CLI needs Node, a system Chrome and a terminal. The users in
GOALS (churches, schools, student productions, small teams) mostly live in a chat client.
Scenario 2 of the North Star ("need, agent, package in a production with its rundown, on air")
then works from the place they already are. The adapt-first measurement
([ADAPT_FIRST_PLAN.md](../ADAPT_FIRST_PLAN.md)) found that adapting proven catalog designs beats
inventing them. A connector built on adapting gets that quality without seeing a single frame.

There is no measured demand yet. No user has asked for it in an issue, and a connector's use is
unknown until it is listed. The cost is small enough (section 6) that a listing is the cheapest
way to find out.

## 1. What the clients require (October 2026)

| Client | Transport | OAuth client registration | Who can add it | Listing |
|---|---|---|---|---|
| Claude (web, Desktop, mobile, Cowork) | Streamable HTTP; HTTP+SSE deprecated | DCR or CIMD; uses CIMD only when the authorization server advertises it | Free (one connector), Pro, Max; Team and Enterprise owners | Directory: per-tool `title` and `readOnlyHint` or `destructiveHint`, read and write in separate tools, privacy policy, docs, support, icon, a populated test account. Listed as Community by default. |
| Claude Code | Streamable HTTP | its own CIMD, else DCR; loopback redirect on a random port | anyone | n/a |
| ChatGPT ("plugins", formerly apps) | Streamable HTTP | CIMD recommended, DCR supported; PRM required; RFC 8707 `resource` sent | **unverified**; one help snippet says full MCP with writes is Business, Enterprise and Edu, Pro read-only, possibly out of date | Verified individual or organization, domain verification, ToS and privacy URLs, test account without MFA, test cases, demo video, all three hints as explicit booleans. Write tools allowed. |
| Copilot Studio, Le Chat, Gemini web, Gemini CLI, VS Code, Cursor | Streamable HTTP | DCR everywhere; VS Code also CIMD; Cursor has reported DCR bugs | varies; Le Chat and Copilot need an admin; Gemini web is US-only | not assessed |

Common server duties: answer an unauthenticated call with 401 and
`WWW-Authenticate: Bearer resource_metadata=...` (Claude ignores the header on a 200), serve RFC
9728 protected resource metadata whose `resource` equals the URL the user typed, have the
authorization server publish discovery metadata with S256 PKCE, accept form-encoded token
requests, rotate refresh tokens, and answer a failed refresh with `invalid_grant`. Claude's
callbacks are `https://claude.ai/api/mcp/auth_callback` and loopback
`http://localhost/callback` / `http://127.0.0.1/callback` with any port. ChatGPT's is
`https://chatgpt.com/connector_platform_oauth_redirect` when the authorization server returns
RFC 9207 `iss`. Claude caps a tool result at about 150k characters and a call at 240 s.

**The MCP spec moved under this.** The current revision is 2026-07-28: CIMD is SHOULD, DCR is MAY
and deprecated, PRM is MUST, the server must check the token's audience, and the `initialize`
handshake is replaced by per-request version metadata. Claude's docs still list authorization up to
2025-11-25, so a server has to keep answering the older handshake for now.

**Supabase supports DCR but not CIMD** (no CIMD field in its discovery metadata, client ids are
UUIDs, `oauth_client.go`). Claude and ChatGPT both still accept DCR, so this works today. The
cost: every fresh connection registers a new client row, and DCR is the deprecated path. When
Supabase adds CIMD, turning it on is configuration, not a rebuild.

**Directory wording risk.** Claude's directory does not accept connectors that generate images,
video or audio with AI models. A NoaCG connector assembles HTML broadcast templates and generates
nothing with a model of its own; the listing text must say that plainly.

**MCP Registry.** One `server.json` may carry npm `packages` and a `streamable-http` entry in
`remotes`. The existing entry `io.github.NoaCG/noacg` (0.10.1, published 2026-10-09, npm
`@noacg/cli`, stdio) has no `remotes`, so adding the connector is a version bump of the same
entry. A domain namespace (`studio.noacg/...`) would need a DNS TXT record or a well-known file;
the GitHub namespace already works and needs nothing new.

Sources: claude.com/docs/connectors/building (index, authentication, submission, review-criteria,
mcp-apps), claude.com/docs/connectors/custom/remote-mcp, developers.openai.com/apps-sdk (auth,
deploy, submission, guidelines), learn.microsoft.com Copilot Studio MCP page (updated 2026-08-19),
docs.mistral.ai Le Chat connectors, geminicli.com MCP docs, modelcontextprotocol.io specification
2026-07-28 and registry docs, registry.modelcontextprotocol.io/v0/servers?search=noacg. Fetched
2026-10-12; most pages carry no date.

## 2. The Supabase claims, checked

| Claim in the brief | Finding |
|---|---|
| shadcn block installs `supabase/functions/mcp`, Deno | **True.** `npx shadcn@latest add @supabase/mcp`. |
| `@modelcontextprotocol/server` 2.0.0, `@supabase/server` and `@supabase/middleware` 0.x | **Partly wrong.** The block pins MCP server 2.0.0 (latest 2.3.1). `@supabase/server` is 1.x (1.6.0+ needed, 1.9.2 latest), `@supabase/middleware` 1.0.0 since 2026-09-30. |
| `registerTool` with a user-scoped client, no admin client | **True.** The block page also warns that any valid user token can call the function. |
| Supabase Auth OAuth server, consent page at `/oauth/consent`, optional DCR, RFC 9728 via `withOAuthProtectedResource` | **True.** The app builds the consent page. No CIMD. |
| Asymmetric signing keys required | **True.** Production already serves an ES256 key at `/auth/v1/.well-known/jwks.json` (checked 2026-10-12). |
| CLI 2.117+ (repo has 2.112) | **True.** 2.112.0 is installed here; it also cannot push (`supabase/AGENTS.md`). |
| OAuth scopes govern identity only | **True, and stricter than stated.** The list is `openid`, `profile`, `email`, `phone`, `offline_access`; any other scope is refused. NoaCG cannot express its permissions as OAuth scopes. Access tokens of an OAuth client carry a `client_id` claim and first-party sessions do not, which RLS and a Custom Access Token Hook can both read. |
| Pipeline form alpha, nested stable | **Wrong.** Middleware is stable from 1.0; pipeline is syntax over the same calls. |
| `@supabase/server` runs outside Edge Functions | **True with a caveat.** Off Edge Functions it needs explicit `resourceServer` and `authorizationServer`, and its framework adapters are deprecated on 2026-12-01. |
| Self-hostable | **True.** The OAuth server is in open-source GoTrue (`GOTRUE_OAUTH_SERVER_ENABLED` and friends). The self-host compose ships HS256 by default, so a self-hoster must set asymmetric keys. On hosted it is beta on every plan, Free included, at no extra charge. |
| Production state | The OAuth server is **off** on production: discovery answers `feature_disabled` (checked 2026-10-12). |
| Supabase Compute | **Private alpha, waitlist, no price.** Containers and always-on services with no wall-clock limit; headless browsers are not mentioned. |
| Revocation | `auth.oauth.listGrants()` and `revokeGrant({clientId})` for the user; revoking deletes that client's sessions and refresh tokens. An access token already issued stays valid until it expires (`jwt_expiry = 3600` here). No rate-limit guidance beyond Auth's own limits. |

Edge Function limits (for section 4): 2 s CPU per request, 150 s wall clock on Free, 256 MB,
500,000 invocations a month on Free. Whether a JSON-only (non-SSE) response works there is not
documented.

Sources: supabase.com/blog/select-2026-build-anything, supabase.com/library/docs/headless/mcp,
supabase.com/docs/guides/getting-started/byo-mcp, supabase.com/docs/guides/auth/oauth-server
(getting-started, token-security, mcp-authentication), supabase.com/docs/guides/functions/limits,
supabase.com/compute, supabase.com/pricing, supabase.com/changelog/supabase-middleware-1-0,
github.com/supabase/server, github.com/supabase/auth (`internal/models/oauth_scope.go`,
`oauth_client.go`), github.com/supabase/supabase `docker/CONFIG.md`, npm registry.

## 3. NoaCG today, and what constrains the design

- `noacg mcp` is one stdio tool with eight verbs; `caspar` is excluded on purpose. The schema is
  about 750 tokens. It validates and renders through headless Chrome on the user's machine
  ([AGENT_CLI.md](../AGENT_CLI.md)).
- Saving uses a scoped agent key that carries only `graphics:create`
  ([AGENT_SAVE.md](../AGENT_SAVE.md)). `src/entitlements/permissions.ts` already reserves
  `graphics:read`, `graphics:update`, `productions:attach` and `playout:operate`, and its comments
  name "a future OAuth access token" as one more branch of `resolvePrincipal`. The vocabulary was
  built for this.
- **The personal library is an offline-first last-writer-wins mirror** (`documents`, one row per
  graphic, brand or show, written by the user's devices). A server that edits an existing row
  races those devices and can lose a user's edit silently. That is why the save door only
  INSERTs, and why packages wait on Home (migration 0065) instead of becoming productions on the
  server (decided 2026-09-24). A remote connector must follow the same rule: create, never edit.
  Team productions use compare-and-swap (0054); that path is a later option, not a first one.
- **The server never executes template code** (`graphicSaveShape` is a pure shape guard; the
  definition parser uses `new Function` and must not run where the service key lives). Validation
  happens in the browser at Install (`installPack` runs `validateTemplate` per graphic).
- Brand application exists in the browser (`applyLookToTemplate`, `src/model/packets.ts`), as
  does scaffold from type, design, palette, font and field values (the CLI's `scaffold` flags).
  Applying a brand across a whole production is still unbuilt ([BRAND_PLAN.md](../BRAND_PLAN.md)).
- There is no static catalog index or thumbnail set; the catalog renders live in the browser.
- The audit log of migration 0030 records operator actions on other people's accounts. It is the
  wrong place for an agent's actions on the user's own account; the agent-key model (`last_used_at`
  on the credential, `origin` provenance on what it wrote) is the existing pattern.
- `api/` has thirteen routed files against a documented Hobby cap of twelve; whatever the exact
  count, there is no room for a new routed file. A route inside `api/me/[...path].ts` costs none.
- No Edge Function exists in the repo today.

## 4. Answers to the six questions

### Q1. Fit and demand

Technically every major client can use one Streamable HTTP endpoint with DCR against the Supabase
OAuth server. Claude.ai is the strongest target: it works on the Free plan, and it is where the
plugin bundle can pair the connector with the existing skill
([research/agent-toolkit-2026-10-03.md](agent-toolkit-2026-10-03.md) section 5, shape D).
ChatGPT's plan eligibility for write tools is unverified and may exclude Free and Plus; test before
promising it. Demand is unmeasured (above). Listing in the MCP Registry is a `remotes` entry on the
existing `io.github.NoaCG/noacg`.

### Q2. Tool set

Four tools. Separate tools rather than one tool with verbs, because both directories require a
read-only or destructive annotation per tool, and a single tool cannot be both. Each schema is
small, so the total should stay near the local tool's 750 tokens; the spec makes that a measured
ceiling.

| Tool | Hint | Permission | Does |
|---|---|---|---|
| `noacg_catalog` | read-only | none (public data) | Search catalog types and designs by need: id, name, category, fields, palettes, fonts. Reads a build-time index. |
| `noacg_library` | read-only | `graphics:read` | List the user's graphics, brands and productions (own and teams'): ids, names, types, fields, a production's graphics and cues. Never sources. |
| `noacg_send_package` | write, not destructive | `graphics:create` | Send a package to Home: entries are catalog recipes or library graphic ids, each with values, brand or palette and font, logo, layer; plus rundown cues. Returns the Home link. |
| `noacg_guide` | read-only | none | The short contract text: what a recipe, cue and field value look like. Could fold into tool descriptions; kept only if descriptions get too long. |

"Duplicate and adapt" is a library graphic id plus new values and a brand in `noacg_send_package`.
"Fill fields from a run sheet" is the model's own reading of what the user pasted, written as
cues; no tool is needed. "Assemble a production" is the package and Install. Updating an existing
production in place (`productions:attach`) is left out: it is the LWW race above.

### Q3. Permission model

The OAuth token proves who the user is. What the connector may do is NoaCG's own decision:

1. **Grant row.** The consent page (NoaCG's, required by Supabase anyway) names the client and
   lists NoaCG permissions with the existing `PERMISSION_LABELS`. Approving writes a
   `connector_grants` row (user, `client_id`, permissions, created, last used, revoked) and then
   approves the Supabase authorization. `resolvePrincipal` gains the branch it already promises: a
   token with `client_id` resolves to `kind: 'connector'` with the grant's permissions, and the
   same `permits()` runs downstream. No grant, or a revoked one, is anonymous: fail closed.
2. **No direct database rights for connector tokens.** The token is a real Supabase JWT, and the
   public anon key is in the web bundle, so without this step anyone holding the token could call
   PostgREST with the user's full RLS rights, including capability slugs that operate live output.
   Preferred: a Custom Access Token Hook that gives tokens carrying `client_id` a database role
   with no grants. Fallback if the hook cannot change the role: restrictive policies on
   `auth.jwt() ->> 'client_id' is null`, which touch live-path tables and wait for a quiet window.
   The spike decides; either way a two-tenant test proves a raw REST call with a connector token
   is refused.
3. **The tools read and write through the server**, as the save and package doors do: service role
   with the user id from the principal, never a client-supplied id. Reads are limited to the
   user's own rows and teams they belong to, proven by a two-tenant test.
4. **Revocation.** Settings → Agent access lists connectors beside keys. Revoke marks the grant row
   (effective on the next call, because every call reads it) and calls `revokeGrant` so the
   refresh token dies too.
5. **Rate limits.** The existing per-IP and per-principal limiter (`api/_lib/rateLimit.ts`), per
   tool, before any body is read. The 25-waiting-packages cap of the package door still applies.
6. **Audit.** `last_used_at` on the grant row, `origin {tool: 'noacg-connector', client}` on every
   package it sends. Not the admin audit log.
7. **Never granted to a connector:** `playout:operate`, publish, production replacement, delete.
   `NEVER_ON_AGENT_KEYS` extends to connector grants, pinned by a test like `mcp.test.mjs`'s
   `caspar` check.

### Q4. Where it runs

**A Vercel route, `https://noacg.studio/mcp`, served from `api/me`.**

| | Vercel `api/me` route | Supabase Edge Function |
|---|---|---|
| URL users type | `noacg.studio/mcp` | `<ref>.supabase.co/functions/v1/mcp` unless a paid custom domain |
| Function slots | none (catch-all) | outside the cap |
| Toolchain | the existing Node, TS, tests, `principal.ts`, `rateLimit.ts`, pack shape guard | first Deno code in the repo, a new deploy step in post-land, CLI 2.117 upgrade |
| The block's main gift | not needed: the user-scoped client is exactly what Q3 removes | the user-scoped client |
| Self-host | a self-hoster already deploys `api/` | `supabase functions deploy`, plus edge runtime on self-hosted Supabase |
| Limits | existing function limits | 2 s CPU per request |

Token verification on Vercel uses the project JWKS (or `auth.getUser`, as `api/_lib/auth.ts` does
today); `@supabase/server` is optional there, and its adapters are deprecated on 2026-12-01.

**Relation to `noacg mcp`.** Different tools for a different job: the local server authors code in
files and renders frames; the remote one adapts and assembles from the account. They share the
pack format (`noacg-pack` v1, plus the recipe entry), the package door's shape guard and limits,
the permission vocabulary and the catalog index. They do not share dispatch or verb grammar; the
reason for one tool with verbs locally (schema size in every coding session) does not outweigh
per-tool annotations remotely. The skill can teach both: with the connector, assemble; with the
CLI, also make.

### Q5. New graphics

| | (a) draft validated in the user's browser | (b) server rendering |
|---|---|---|
| Quality | The agent writes HTML, CSS and GSAP to the contract without seeing a frame. The CLI loop's strength is rendering every state and fixing it; that is gone. Graphics fail at Install, or pass and look wrong. | Same loop as the CLI: render, look, fix. |
| Cost | Near zero: the package door already accepts sources. | A browser per call. The repo already runs untrusted code in Vercel Sandbox for video renders (`docs/RENDER.md`); a validate-and-screenshot call is seconds of VM time each, with tiers and quotas to build, for a free product with unknown use. Supabase Compute: private alpha, no price. |
| Self-host | Free. | Vercel Sandbox is hosted-only; a self-hoster needs Chrome on their own server (LocalExecutor). Supabase Compute cannot be self-hosted. |
| Maintenance | Low code, high support: the bad first impression lands on non-technical users. | New infrastructure to run, isolate and pay for: issue #843's hostile-code fixtures, tenant isolation, CPU and byte limits. |

**Recommendation: skip both now.** Adapt-and-assemble covers the common requests from a catalog of
430 proven variants. The users who need a genuinely new design today are served by the CLI. Revisit
when the connector's own logs show requests the catalog cannot cover; then the first step is an
MCP App preview (the graphic rendered in the user's browser inside the chat, findings returned to
the model), which keeps (a)'s cost and gives back some of the loop. (b) stays the last resort.

### Q6. Cost and rank

- **Build:** the consent page, OAuth on staging then production, the token hook or policies, one
  migration (`connector_grants`), the MCP route with four tools, the recipe entry in the pack
  format and `installPack`, the catalog index at build, the Settings list, tests. About three to
  four wave rows. No new paid service.
- **Run:** a Vercel invocation per tool call and one Supabase row per DCR registration; OAuth
  logins count as ordinary MAU. Effectively nothing at current scale.
- **Maintain:** the MCP spec and two directories move every few months (2026-07-28 changed the
  handshake; CIMD will replace DCR), each listing needs its own review and test account, and the
  catalog index must track the registry. This is the real cost; it is moderate.
- **Rank:** inside the agent door (rank 2), as the phase after the current one. It does not
  advance the current done-criteria (fresh-machine CLI or plugin, novel-brief benchmark), and
  production and playout (rank 1) still come first. The spike (section 1 of the spec) is cheap and
  can run on staging now.

## 5. Open, and what would change the answer

- ChatGPT plan eligibility for write tools: test with a real account before any listing text names
  ChatGPT.
- Whether Supabase's redirect matching accepts Claude Code's port-agnostic loopback; if not,
  Claude Code users keep the CLI, which is the better fit for them anyway.
- Whether a Custom Access Token Hook can set the database role for OAuth client tokens (spike).
- Whether the type registry loads outside the browser for the catalog index, or the index has to be
  produced through the bridge at build.
- New graphics move up if the connector's logs show requests the catalog cannot meet, or if a
  client starts showing MCP App previews widely enough to give the agent a loop.

**Research receipt.** Read on `origin/main` at 4d5b5002d: `docs/GOALS.md`, `docs/AGENT_CLI.md`,
`docs/AGENT_SAVE.md`, `docs/ARCHITECTURE.md`, `docs/BRAND_PLAN.md`, `docs/ADAPT_FIRST_PLAN.md`,
`docs/RENDER.md`, `docs/research/agent-toolkit-2026-10-03.md`, issues #842 and #843,
`src/entitlements/permissions.ts`, `api/me/[...path].ts`, `api/_lib/auth.ts`, migrations 0030,
0050, 0054, 0065, `supabase/config.toml`, `cli/server.json`. Live checks: production JWKS (ES256)
and OAuth discovery (`feature_disabled`), the MCP Registry search. No account, listing, OAuth
client or configuration was changed.
