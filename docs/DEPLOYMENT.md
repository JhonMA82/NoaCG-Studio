# Deployment - CI, Vercel production, previews, and what to do when it stops

The runbook for the path from a `main` commit to the live product, and for every alarm on
that path. Binding: keep it updated when the pipeline changes.

## The pipeline

1. **CI (`.github/workflows/ci.yml`)** runs on every push to `main` and every PR (a branch
   pushed without an open PR runs nothing): Build (typecheck + lint +
   bundle), the offline E2E suite in eight shards, the factory gates, and a final **CI gate**
   job that requires all of them. On `main`, in-progress runs are never cancelled by a newer
   push (branches/PRs still cancel), so every `main` HEAD ends with a real verdict. A red
   gate names the failing job in an error annotation; Playwright's `github` reporter
   annotates the exact failing tests.
2. **Vercel** builds production from **`main` only** (project `noacg-studio`,
   team `miwcos-projects`, production URL <https://noacg-studio.vercel.app>). Every push to
   `main` triggers a production deployment via the Git integration; CI and Vercel run in
   parallel and do not gate each other (see "Known limits").
3. **`deploy-verify` (`.github/workflows/deploy-verify.yml`)** watches the deployment:
   - a **failed** production deployment becomes a red run on that commit;
   - a **successful** one is verified live: `https://noacg-studio.vercel.app/version.json`
     (written by `scripts/write-version.mjs` at the end of `npm run build`) must serve that
     commit (or a newer `main` commit containing it), and `/` and `/app` must answer;
   - a **drift check** four times a day alerts when production does not contain the newest
     `main` commit older than 90 minutes - the belt for "no deployment was even created".

## Alerting (rolling issues - one per failure class, no duplicates)

Three self-closing rolling issues, all following the weekly-audit pattern (one open issue,
one comment per newly failing commit, the same commit never alerts twice, auto-closed by
the next healthy state):

| Issue title | Raised by |
|---|---|
| `CI is red on main` | the CI gate, on a red `main` run |
| `Production is not running the latest main commit` | deploy-verify: failed deploy, failed live verification, or drift |
| `Weekly dependency audit is red` | weekly-audit (Mondays): a new high/critical advisory |

GitHub also emails the pusher on any failed run of their push (account notification
settings, on by default). **Drill:** to prove the alarm path works, push a `main` commit
with a deliberately broken test (or run the drift job via *Actions → deploy-verify → Run
workflow* while production is behind) and watch the rolling issue appear; revert and watch
it close.

## The serverless function budget (the >12 functions error)

The Vercel **Hobby plan caps a deployment at 12 serverless functions**. Every file under
`api/` that is not in `api/_lib/` (and not a `.test.ts`) becomes one function. In July 2026
the api/ tree grew to 29 files and **every production deploy failed for days while the repo
stayed green** - the wake-up call this runbook exists for.

The fix was consolidation to **10 functions** via one catch-all per area
(`api/admin/[...path].ts`, `api/ai/[...path].ts`, `api/ai/lite/[...path].ts`,
`api/ai/tasks/[...path].ts`, `api/render/[...path].ts`) plus the standalone entrypoints
that need their own runtime config in `vercel.json` (`api/ai/generate.ts`,
`api/render/start.ts`, `api/render/cleanup.ts`) and the small singles (`api/events.ts`,
`api/me/entitlement.ts`). **A new endpoint goes INSIDE an existing catch-all** (a new route
in its `_lib` router), never as a new top-level file, unless it genuinely needs its own
`functions` entry - and then check the count first.

## Traps that already cost days (check these FIRST on a failing Vercel build)

- **Vercel typechecks `api/` with the ROOT `tsconfig.json`, not `tsconfig.api.json`.** The
  root lib is pinned to ES2020 and `tsconfig.api.json`'s lib now matches it, so the local
  gate reproduces production. If a Vercel build dies with a TS error CI never saw (e.g.
  TS2550 on `.at()`), an api file is using a library surface newer than the root lib -
  fix the code, do not widen the lib.
- **The function count** (above): "No more than 12 Serverless Functions" in the build log.
- Build log access: `vercel.com/miwcos-projects/noacg-studio` → the deployment → Build Logs,
  or the Vercel MCP `get_deployment_build_logs`.

## Previews (opt-in, never production)

Production deploys **only from `main`**; a branch push can never replace production - it
would only ever create a Preview deployment. Since dozens of worktree branches are active
at once and CI already builds each of them, previews are **opt-in**:
`scripts/vercel-ignore-build.mjs` (wired as `ignoreCommand` in `vercel.json`) skips the
Vercel build for every non-`main` branch unless the head commit message contains
`[preview]`. `main` always builds - the script fails open (builds) on any error.

## Where to look when production stops updating

1. **The rolling issues** (above) - if the machinery works, the answer is already filed.
2. `gh run list --limit 15` - is `main` red (which gate?), or green but undeployed?
3. Vercel dashboard / MCP `list_deployments` - is there a production deployment for the
   commit at all (missing = webhook/ignoreCommand problem), and did it ERROR (open build
   logs; check the two traps above)?
4. `curl https://noacg-studio.vercel.app/version.json` - what commit is actually live?
5. E2E-red-without-a-code-fault has four known non-code causes (stale dev server, parallel
   sessions on one checkout, HMR ghost modules, offline pin vs a manual server) - reproduce
   locally with `npm run test:e2e -- <spec>` before assuming the code broke.

## Known limits (deliberate, revisit when they hurt)

- Vercel deploys `main` without waiting for CI: a bad merge can be live for the minutes
  until the gate reddens. The repo-side fix would be deploy-on-workflow-success (CI-driven
  `vercel deploy --prebuilt` or Vercel's "only deploy when checks pass" project setting);
  adopt it if a red-but-deployed `main` ever causes real damage. Today the safe-merge flow
  runs the full gate before anything lands, so `main` is red only when a merge race slips
  through - and both alarm classes above catch it within minutes.
- The drift check trusts `version.json`; if the endpoint is unreachable the check alerts
  rather than guessing.
