# Remote MCP connector: adapt and assemble from a chat client

**Status: runnable with `/plan-run remote-mcp`.** Owner, 2026-10-12: build every phase now, in one
plan run; the connector stays **off in production**, and turning it on is the owner's (the
"Owner's steps" below). Evidence and the alternatives weighed:
[research/2026-10-12-remote-app-mcp.md](research/2026-10-12-remote-app-mcp.md). Narrows the first
slice of [issue #843](https://github.com/NoaCG/NoaCG-Studio/issues/843).

## Why

The agent door reaches people who run a coding agent with a shell. Most NoaCG users (churches,
schools, student productions, small teams) work in Claude.ai or ChatGPT, where the local CLI cannot
run. A connector they add by signing in lets them ask for a show's graphics and rundown in the chat
and press Install on Home, which is scenario 2 of the North Star with the least friction.

## Goal

From a chat client, a signed-in user can have an agent look at their library, brands and
productions, pick catalog designs or their own graphics, fill them from a run sheet, apply a brand,
and send the package with its rundown to Home, where one Install opens the production.

## Non-goals

- New graphic code from the agent, in either form: a draft the agent never saw, or server-side
  rendering. Revisit with evidence (research section 5).
- Editing anything that already exists: no library edits, no production replacement, no
  `productions:attach`. The connector only creates waiting packages.
- Take, Update, Next, Out, publish, delete, CasparCG or Bridge access, AI generation.
- A Supabase Edge Function, `@supabase/server` as a requirement, Supabase Compute.
- CIMD before Supabase supports it; a domain namespace in the MCP Registry.
- Any change to the hosted projects' Auth configuration (production or staging), a `remotes`
  entry in `cli/server.json`, or a directory submission. Those are the owner's steps.

## Key decisions

1. **Route:** `POST <deployment>/mcp`, rewritten to a handler in the `api/me` catch-all (no new
   function slot), stateless Streamable HTTP, answering both the 2026-07-28 request metadata and
   the 2025-11-25 `initialize` handshake. Protected resource metadata at
   `/.well-known/oauth-protected-resource/mcp`; 401 with `WWW-Authenticate` when unauthenticated.
   While the deployment's Supabase Auth has no OAuth server (production today), every connector
   path answers 503 `connector_disabled` and nothing else changes.
2. **Sign-in:** the Supabase Auth OAuth server with dynamic client registration, declared in
   `supabase/config.toml` so a local stack and a self-hoster get it. NoaCG's consent page (a query
   route beside `?agent=`) names the client and lists NoaCG permissions.
3. **Permissions:** OAuth scopes stay identity-only (Supabase allows no others). Consent writes a
   `connector_grants` row with `graphics:read` and `graphics:create`; `resolvePrincipal` maps a
   token with `client_id` to `kind: 'connector'` with that row's permissions, and `permits()` runs
   as for keys. Missing or revoked grant: anonymous. `NEVER_ON_AGENT_KEYS` applies to grants.
4. **Connector tokens have no direct database rights.** Preferred: a Custom Access Token Hook gives
   tokens carrying `client_id` a role with no grants. Fallback: restrictive policies on
   `client_id is null` (live-path, waits for a quiet window). Phase 1 decides and records it.
5. **Server never runs graphic code.** A package entry is a catalog recipe (type, design, palette,
   font or brand id, logo, field values) or a library graphic id whose sources the server copies as
   data. The recipe is an additive optional entry kind in `noacg-pack` v1; `installPack` realizes
   it with the studio's scaffold and `applyLookToTemplate`, then validates as today.
6. **Four tools**, each with `title` and explicit `readOnlyHint`, `destructiveHint`,
   `openWorldHint`: `noacg_catalog`, `noacg_library`, `noacg_send_package`, `noacg_guide`
   (dropped if tool descriptions suffice). Total schema under 1,000 tokens, pinned by a test.
7. **Catalog index** generated at build from the type registry, served as a static file the tool
   reads.
8. **Revocation and audit:** Settings → Agent access lists connectors beside keys; Revoke marks the
   grant and calls Supabase `revokeGrant`. `last_used_at` on the grant, `origin` on each package.

## Acceptance criteria

All are proven on a **local Supabase stack** (`supabase start`, Docker) with the OAuth server and
asymmetric keys enabled from `supabase/config.toml`, a dev server, and two local test accounts the
run creates. A scripted MCP client (`@modelcontextprotocol/sdk`, the CLI's dependency) stands in
for Claude.ai; the real Claude.ai connection is the owner's step after the switch-on.

### AC-1: The local stack issues connector tokens, and the token boundary is decided

`config.toml` enables the OAuth server with dynamic registration and asymmetric signing keys; a
local stack starts with the CLI version the repo then pins. A script registers a client, runs the
authorization code flow with PKCE as one test account, and receives an access token carrying
`client_id`. The phase records which form of decision 4 works, with the evidence, and whether a
port-agnostic loopback redirect is accepted.

### AC-2: Consent, grant, revocation and the closed database

Unauthenticated `/mcp` answers 401 with the metadata pointer, and the metadata names the local
authorization server. The consent page shows the client's name and exactly the two permission
labels; Deny leaves no grant. After Allow, a tool call resolves to a `connector` principal. With
the connector's token, a raw PostgREST read and write on every `public` table, `storage.objects`
and an RPC that takes a capability slug is refused. Revoke in Settings makes the next tool call
fail and the refresh fail. A build with no OAuth server answers 503 `connector_disabled`.

### AC-3: Read tools

`tools/list` returns the read tools with title and all three hints, under the schema ceiling.
`noacg_catalog` finds designs by category and words and returns ids, names, fields, palettes and
fonts from the build-time index. `noacg_library` returns test account A's graphics, brands and
productions, and those of a team A belongs to, never account B's, and never template sources.

### AC-4: Send a package

`noacg_send_package` with three catalog recipes, one copy of A's own graphic, a brand, field
values from a run sheet and rundown cues creates one waiting package on A's Home and returns its
link. Install opens a production whose graphics carry those values and the brand, pass the gate,
and play in a browser source. Over the waiting cap, over the rate limit, an unknown id or a
malformed recipe each get an actionable error and store nothing. A pack file with a recipe entry
installs through Import the same way.

### AC-5: Ready to switch on, and still off

A written owner's runbook (in this file) turns the connector on for staging and then production
with exact commands, and says how to turn it off again. The skill's reference text gains the chat
path (connector: assemble; CLI: also make). With production's configuration unchanged, a request
to `https://noacg.studio/mcp` on the deployed site answers 503 `connector_disabled`. The whole of
AC-1 to AC-4 passes again in one scripted run on a fresh local stack.

## Phases

1. **Local OAuth spike**: AC-1.
2. **Sign-in, grants and the closed database**: AC-2.
3. **Read tools**: AC-3.
4. **Send**: AC-4.
5. **Ready, and off in production**: AC-5.

Each phase keeps the earlier phases' criteria passing.

## How a phase is checked

On current `main`, in the checker's own worktree: start Docker Desktop if it is not running
(`%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`), `supabase start` with the pinned CLI
(`npx supabase@<pin>`), the checkout's dev server, then run the phase's scripted acceptance the
way a chat client would: register, consent through the real page in a browser, call the tools,
open the result in the studio as the test user. Drive the consent page and the studio with the
built-in test accounts only, on localhost only. The user outcome is "a chat user gets a package
on Home that installs into a working production", so the checker says in plain words whether that
now holds as far as the phase reaches. Run `supabase stop` at the end; another session may need
the ports.

## Traps known before the run

- `npm run db:push` fails closed on a statement shape it does not know; a `create role` or an auth
  hook function may be refused after landing. That is a refusal for the owner (a `needs owner`
  issue), not a reason to reshape the migration; the build gate (`scripts/db-push.test.mjs`) says
  so first.
- Supabase CLI 2.112.0 is installed globally and cannot push; use `npx supabase@<pin>` and leave
  the global install alone.
- A Custom Access Token Hook on production would run for every sign-in. It is declared in
  `config.toml` and created by migration, but enabling it on a hosted project is the owner's step.
- `api/` must not gain a routed file (thirteen today against the Hobby cap of twelve).

## Owner's steps (after the run)

Filled in by phase 5: enable the OAuth server and the hook on staging, connect Claude.ai to a
staging deployment once, then the same on production; add `remotes` to `cli/server.json` on the
next CLI release; the directory submissions.

## Phase notes

Each phase's pull request adds what the next phase must allow for: decisions, traps, and the
check's findings.
