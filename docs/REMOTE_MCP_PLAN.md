# Remote MCP connector: adapt and assemble from a chat client

**Status: draft spec, not scheduled.** Evidence and the alternatives weighed:
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

## Key decisions

1. **Route:** `POST https://<deployment>/mcp`, rewritten to a handler in the `api/me` catch-all
   (no new function slot), stateless Streamable HTTP, answering both the 2026-07-28 request
   metadata and the 2025-11-25 `initialize` handshake. Protected resource metadata at
   `/.well-known/oauth-protected-resource/mcp`; 401 with `WWW-Authenticate` when unauthenticated.
2. **Sign-in:** the Supabase Auth OAuth server with dynamic client registration, on staging first.
   NoaCG's consent page at `/oauth/consent` names the client and lists NoaCG permissions.
3. **Permissions:** OAuth scopes stay identity-only (Supabase allows no others). Consent writes a
   `connector_grants` row with `graphics:read` and `graphics:create`; `resolvePrincipal` maps a
   token with `client_id` to `kind: 'connector'` with that row's permissions, and `permits()` runs
   as for keys. Missing or revoked grant: anonymous. `NEVER_ON_AGENT_KEYS` applies to grants.
4. **Connector tokens have no direct database rights.** Preferred: a Custom Access Token Hook gives
   tokens carrying `client_id` a role with no grants. Fallback: restrictive policies on
   `client_id is null` (live-path, waits for a quiet window). The first phase decides.
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
9. **Registry:** a `remotes` entry on the existing `io.github.NoaCG/noacg`.

## Phases

1. **Spike on staging (no user-visible change).** Enable the OAuth server on `noacg-staging`, a
   stub consent page and a stub `/mcp` with one read tool. Prove: Claude.ai connects through DCR;
   the token carries `client_id`; decision 4's hook works or the fallback is chosen; Claude Code's
   loopback is or is not accepted. Record the results in this file.
2. **Grants and the door.** Migration `connector_grants`, the consent page, the principal branch,
   the token restriction, the Settings list, `noacg_library` and `noacg_catalog`.
3. **Send.** The recipe entry, `installPack` support, `noacg_send_package`, rate limits.
4. **Ship.** Production OAuth config, `remotes` in `server.json`, the skill's chat path, then the
   directory submissions (owner's accounts).

## Acceptance criteria

- In ordinary Claude.ai chat on a free account, a user adds `https://noacg.studio/mcp`, signs in,
  and approves a consent page that lists exactly the two permissions.
- From a run sheet nobody prepared for the test, the agent sends a package of at least three
  catalog designs and one copy of the user's own graphic, with a brand applied and a rundown; Home
  shows it waiting; Install opens a production whose fields carry the run sheet's values and whose
  graphics pass the gate; it plays in a browser source.
- `noacg_library` returns the user's own and their teams' records and nothing of a second test
  account; a raw PostgREST call with the connector's token is refused on every table tried.
- Revoking in Settings makes the next tool call fail within one request, and the refresh fails.
- No tool can Take, Out, publish, delete or change an existing record; a test pins the tool list,
  the annotations and the schema size.
- The same flow works on a self-hosted instance with the OAuth server enabled and asymmetric keys,
  following the written setup.
