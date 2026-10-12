# Supabase scoped token for CI, 2026-10-12

## Status, 2026-10-12

The owner restricted the `production` environment to `main` and chose to keep the account-wide
token for now; the token swap waits for a quiet moment. Landed meanwhile: the advisors exit 2 on a
401 or 403, and `npm run check:owner-setup` reports the branch rule and the admin bypass. The rest of
"Follow-up changes" (`tokenFor`, the staging secret, the docs) belongs with the swap.

## Recommendation

Do it, and treat it as a security fix rather than a new capability. The premise that migrations
run "only on the maintainer's machine" is out of date: the `production` GitHub environment has held
`SUPABASE_ACCESS_TOKEN` since 2026-09-06, and every landing already pushes both projects and asks
the advisors from CI (post-land run 38216885707 on 2026-10-12: "Production holds all 86",
"Staging holds all 86", "No change against the baseline"). That token predates scoped tokens
(GA 2026-10-06) and reaches two organisations, so it is almost certainly the account-wide kind,
sitting in an environment with no protection rules in a public repository.

Replace it with two project-scoped tokens, one per project, and restrict the environment to
`main`. Then delete the account-wide token. Nothing in the repository needs account-wide access.

## What each script needs

Read from the scripts and from Supabase CLI 2.111.0 source (`internal/link/link.go`,
`internal/utils/flags/db_url.go`), mapped to the permission table on
https://supabase.com/docs/guides/platform/personal-access-tokens.

| Caller | Calls | Permission |
|---|---|---|
| `migration-drift.mjs` | `POST /v1/projects/{ref}/database/query`, a `select` on the ledger | Database: Read |
| `db-push.mjs` planning, snapshots, quiet window | same endpoint, `select` only | Database: Read |
| `supabase link` (fatal steps) | Get project; Get project API keys with `reveal=true` | Project Settings: Read; API Keys: Read; API Key Secrets: Read |
| `supabase link` (pooler) | Get pooler config | Connection Pooling: Read |
| `supabase db push --linked` | Create login role | Database: Read-write |
| `supabase-advisors.mjs` | `GET /v1/projects/{ref}/advisors/{security,performance}` | Advisors: Read |
| `owner-preflight.mjs` | none: it only checks via `gh` that the GitHub secret exists | none |

Notes that decide the recipe:

- **Connection Pooling is required, though the docs do not list it for `link`.** `link` treats the
  pooler lookup as non-fatal and only logs a failure. GitHub-hosted runners have no IPv6, so the
  CLI cannot reach `db.<ref>.supabase.co` directly and falls back to the pooler URL that `link`
  saved. Without the permission, `link` reports success and the push then fails with "IPv6 is not
  supported".
- **The other `link` lookups are optional.** Database Config, Network Restrictions, Data API
  Config, Auth Config and Storage Config failures are logged and ignored.
- **Network Bans are left out on purpose.** The CLI lists and deletes bans only after three failed
  pooler logins. Without the permission that path fails loudly, which is better than a CI job
  unbanning addresses.
- **No script calls `whoami`, or lists projects or organisations.** All take the ref from
  `VITE_SUPABASE_URL` or `scripts/supabase-projects.mjs`.
- **API Key Secrets is the uncomfortable one.** `link` reveals the `service_role` key. It adds
  little on top of Database read-write, which can already read and change every row, but it is why
  this token still deserves the "most dangerous value" warning.

## Recipe for the owner

Production and staging are in different organisations (`list_organizations` sees only `NoaCG` with
production; `supabase-projects.mjs` puts staging in a separate free org). A scoped token covers
either selected projects in one organisation, or all projects in selected organisations. So:

**Token 1: `noacg-ci-production`**
- Resources: project `kprolrchuldgfrzspthy` only (not "all projects in the organisation").
- Read-write: Database.
- Read: Project Settings, API Keys, API Key Secrets, Connection Pooling, Advisors.
- Everything else: none.
- Expiry: one year (the maximum). Write the date into `supabase/AGENTS.md`.
- Goes to: GitHub, environment `production`, secret `SUPABASE_ACCESS_TOKEN` (replacing the value).

**Token 2: `noacg-ci-staging`**
- Resources: project `garafohbzmsybtysxphb` only.
- Same permissions and expiry.
- Goes to: environment `production`, new secret `SUPABASE_STAGING_ACCESS_TOKEN`.

**Environment `production`:** Deployment branches and tags: "Selected branches and tags", rule
`main`. No required reviewers: they would park every post-land run, and migrations are a
mechanism, not a permission (`.github/workflows/post-land.yml` rule).

**Local `.env`:** the same two values, under the same two names. Then delete the account-wide token
in the dashboard.

One token per project, not one for both, because the projects sit in different organisations and
because a staging leak should not reach production data. No separate read-only token for drift and
advisors: they run in the same job as the push, with both secrets in scope, so splitting would add a
third secret and isolate nothing. A read-only token becomes worth it only if a read-only check is
ever run somewhere other than post-land.

## Risk if a token leaks

The account-wide token can enumerate, pause and delete every project in every organisation the
owner belongs to. A leaked scoped token cannot touch another project, billing, or project settings,
and expires within a year. It can still read every row in its project, including user accounts and
documents, drop or rewrite any table, and reveal the `service_role` key. That is the residual risk,
and the reason the branch rule matters.

How it could leak, checked on 2026-10-12:

- **Fork pull requests:** no exposure. No workflow uses `pull_request_target` or `workflow_run`, and
  secrets are not passed to fork `pull_request` runs.
- **Any branch:** the open path today. `gh api .../environments/production` returns
  `protection_rules: []` and `deployment_branch_policy: null`, so a workflow on any pushed branch,
  including one written by an agent or the bot App (Contents write), can declare
  `environment: production` and read the secret. The `main` branch rule closes this; `main` is
  written only by the merge queue.
- **Code that lands on `main`:** runs with the secret by design. Review and the queue are the guard.
- **Expiry:** the access is fixed at creation and expires. An expired token makes `db-push.mjs`
  throw on its first query, so post-land goes red, which is the right signal. The advisors step
  only warns on a 401 (exit 3); it should red (exit 2), because a dead credential is ours to fix.

## Follow-up changes, in one pull request after the tokens exist

- `scripts/supabase-projects.mjs`: a `tokenFor(ref, env)` that returns
  `SUPABASE_STAGING_ACCESS_TOKEN` for the staging ref when it is set, else `SUPABASE_ACCESS_TOKEN`.
  The fallback keeps a single account-wide or self-hoster token working.
- `scripts/migration-drift.mjs` and `scripts/db-push.mjs`: use `tokenFor`.
- `.github/workflows/post-land.yml`: pass `SUPABASE_STAGING_ACCESS_TOKEN` to the push step.
- `scripts/supabase-advisors.mjs`: 401 and 403 exit 2, not 3.
- `scripts/owner-preflight.mjs`: also check the staging secret and the `main` branch policy.
- Docs that still say the token is account-wide and never in CI: `supabase/AGENTS.md`,
  `.env.example`, `docs/VERIFICATION.md`, and the header of `scripts/migration-drift.mjs`.

## Test plan

Read-only first. Each step uses the new token in a shell variable, not in `.env`.

1. Production token: `GET /v1/projects/kprolrchuldgfrzspthy` returns 200. `GET /v1/projects` and
   `GET /v1/organizations` return 403 with `missing_permissions`, which proves it is not
   account-wide. `GET /v1/projects/garafohbzmsybtysxphb` is refused.
2. Staging token: the same, the other way round.
3. `node scripts/migration-drift.mjs` with each token reports "holds all N".
4. `node scripts/supabase-advisors.mjs` with the production token exits 0.
5. `npm run db:push -- --dry-run` and `npm run db:push -- --dry-run --ref garafohbzmsybtysxphb`.
   When nothing is pending this stops at "Nothing to push". The first step that writes anything is
   the CLI's temporary login role, created during a dry run only when a migration is pending.
6. Swap the GitHub secrets, add the branch rule, land the follow-up pull request, and read its
   post-land log: drift, both pushes and the advisors ran, none with a 401 or 403.
7. The next landing that carries a migration proves `link` and the login role on a runner. If it
   fails, the run goes red and the migration stays pending; the account-wide token is not needed to
   recover, because a local push with the same scoped token works.
8. Delete the account-wide token. The following post-land run stays green.

## `supabase config pull` as a drift check

Not now. `config pull` writes `config.toml`; the read-only twin is `supabase config diff
--exit-code` (exit 2 on drift), which calls `GET /v2/projects/{ref}/config`. That needs eight Read
permissions: Database Config, Database, SSL Enforcement, Network Restrictions, Auth Config, Data API
Config, Realtime Config and Storage Config. It ships in CLI 2.120.0, not in the 2.111.0 that
post-land pins.

It also does not fit this file. `supabase/config.toml` is the local, self-hostable configuration
and says so: `site_url` is localhost, and `config push` must never run against production. A diff
against production would report those deliberate differences on every run. A useful check would
record the diff output as a baseline and alarm when it changes, as the advisors gate does. That
catches dashboard edits to auth and storage, at the cost of a CLI upgrade, a baseline file and
broader read access. If wanted, add those permissions at the first rotation instead of now.

## Sources

- https://supabase.com/changelog/scoped-personal-access-tokens-ga
- https://supabase.com/docs/guides/platform/personal-access-tokens
- https://supabase.com/blog/select-2026-build-anything
- Supabase CLI v2.111.0 `apps/cli-go/internal/link/link.go`, `internal/utils/flags/db_url.go`;
  v2.120.0 `apps/cli/docs/supabase/config/{pull,diff}.md` and their `SIDE_EFFECTS.md`
- `gh secret list --env production`, `gh api repos/NoaCG/NoaCG-Studio/environments/production`,
  post-land run 38216885707
