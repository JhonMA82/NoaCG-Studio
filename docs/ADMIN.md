# The admin surface and the entitlement system

The private operator surface for NoaCG Studio: who may use what, why, and what the owner can
change without a redeploy. This document is binding for `src/entitlements/`, `src/admin/`,
`api/admin/`, and migrations `0017` onward.

Two things ship together here and must not be confused:

- **Entitlements** answer *what may this user do*. One pure resolver, consulted everywhere.
- **The admin surface** is the private UI and API that edits the inputs to that resolver, plus
  operational controls and an audit trail.

## 1. Posture

**Security is server-side, on every request, without exception.** The admin page is unlinked
and lives at its own URL, but that is convenience, not a control. Anyone may fetch the admin
bundle; it contains no data, no secrets and no schema. Every byte of admin data comes from
`api/admin/*`, and every one of those handlers re-verifies the caller.

**Unauthorized means 404, never 403.** A distinct "forbidden" answer confirms that an admin
system exists and that the endpoint is real. Absent token, invalid token, valid token with no
admin row, suspended admin, and unconfigured backend all return the same generic
`404 { error: { code: 'not_found' } }`. The page renders a plain "Not found" body in that case,
so an unauthorized visitor cannot tell `/admin` from a typo.

**There is no sign-in at `/admin`.** A sign-in form would confirm to anyone who typed the URL
that there is something to sign in to. The owner signs in through the normal app on the same
origin and then opens the page, which reuses that session. With no session, `/admin` is a 404
and stays one. For the same reason the page does not pre-check locally for a backend or a
token before calling the server: a second place deciding "may I be here" is a second thing
that can disagree with the first.

**Offline and self-hosted instances have no admin surface at all.** With Supabase env unset,
`isBackendConfigured()` is false, every admin endpoint 404s, and the page never leaves its
not-found state. The open editor grows zero auth UI - that contract (root `AGENTS.md`, "Auth
posture") is unchanged by anything here.

**The free core stays free.** `FeatureKey` deliberately contains no key for the editor, the
catalog, local preview, or the six local export targets. There is no lever in this system that
can paywall them, and adding one would contradict `docs/GOALS.md`. Cloud rendering, cloud sync,
hosted control, community and managed AI are gateable because they cost someone money to run.

## 2. The entitlement resolver

`src/entitlements/contract.ts` is a PURE module - no DOM, no `import.meta`, no `process.env`,
no Supabase - held to the same discipline as the render purity trio. It is imported by the
browser, by `api/`, and by the tests. `api/_lib/entitlements.ts` loads the rows with the
service key and calls it; nothing else decides access.

### Precedence

```
default plan  <  assigned plan  <  temporary grant  <  manual override
```

A suspended account short-circuits all four: every feature resolves false. Its plan and limits
stay visible so the admin page can show what reactivation restores.

Every resolved value is an `EntitlementValue<T>`: the value, its `source`, a display label, and
an expiry. **"Why does this user have access" is not a second query** - it is the field the
resolver already returned, which is what stops the admin page from ever explaining access with
a different rule than the one that granted it.

### The neutrality rule

A numeric limit of `null` means *inherit whatever the server already used*: the `AI_LITE_*`
environment configuration for AI, unlimited for storage and projects. Both built-in plans set
every number to `null`, so an instance with no plans, no assignments and no grants resolves to
exactly the behaviour the product shipped with. `api/_lib/entitlements.test.ts` pins this. It
must stay true - introducing entitlements is not allowed to quietly restrict anybody.

### Observe-only limits

`storageBytes` and `projects` are **measured and displayed, never enforced** in this release.
Nothing in the product has ever counted a user's bytes or projects, so there is no baseline
from which to choose a safe number, and an invented one could lock a real person out of saving
their work. `enforceableLimit()` returns null for them regardless of the plan value, so no
server path can act on one by accident. Enforcement is its own later, deliberate change.

### Feature keys

`ai.lite`, `ai.import-analysis`, `ai.video`, `ai.byo-key`, `render.cloud`, `sync.cloud`,
`community.publish`, `control.hosted`, `showchat`, `templates.beta`, `templates.internal`.

Adding one means adding it to `FEATURE_KEYS`, `FEATURE_LABELS`, and both built-in plans - the
test fails otherwise, which is how an unlabelled or default-less key is kept out.

### Plans are data

`plans.key` is a free string. No code branches on a particular plan key, no plan name is
hard-coded anywhere, and a deployment can create, rename and archive plans without a release.
Exactly one plan row may carry `is_default`.

`plans.billing` (`{amount_cents, currency, interval, external_price_ref}`) exists so a future
payment integration has somewhere to land. **No code reads it.** Billing is not built here.

### Grants and overrides are one table

`user_grants` with `expires_at` set is a temporary access grant; with `expires_at` null it is a
permanent manual override. They differ only in whether they end, and collapsing them keeps the
precedence order short enough to state in one line. A revoked, future-dated, expired, or
malformed-timestamp grant does not apply - a bad date must never widen access.

## 3. Roles

`public.admin_users (user_id, role)` with roles `owner | admin | support`, ranked in that order.
`public.is_admin(min_role)` is the SECURITY DEFINER predicate for RLS; the API gate uses a
service-key lookup instead, so an RLS mistake cannot open an endpoint.

The table is RLS-on with **no policies**, the pattern proven by `public.moderators` in migration
`0004`: invisible to `anon` and `authenticated` alike. The existing community `moderators` role
is left alone - it is a different job (gallery takedowns) with its own live-verified policies.

Bootstrap is `node scripts/admin.mjs grant <email> owner` run from a trusted machine with the
service-role key in the environment, mirroring `scripts/allowlist.mjs`. There is no
self-promotion path and no first-run "claim this instance" flow.

## 4. The route structure

| Route | Purpose |
|---|---|
| `/admin` | the page (Vite MPA entry `admin.html`), unlinked and `noindex` |
| `GET /api/admin/session` | who am I, and may I be here |
| `GET/POST /api/admin/users` | search, invite |
| `GET/POST /api/admin/user` | detail; state, plan and allowance changes |
| `GET/POST /api/admin/plans` | create, update, archive |
| `GET/POST /api/admin/grants` | grant, revoke |
| `GET /api/admin/usage` | AI spend, failures, quota pressure |
| `GET/POST /api/admin/system` | model and feature toggles, maintenance notice |
| `GET/POST /api/admin/templates` | visibility, beta/internal marking, usage |
| `GET /api/admin/audit` | the log |

The page's sections mirror those endpoints: Overview, Users, Plans, Usage and cost, System,
Templates, Audit. A `support` role sees all of them read-only; the controls are simply absent
rather than present-and-disabled, because a button that cannot work is a worse answer than no
button.

Every handler is wrapped by `withAdmin(req, minRole)` in `api/_lib/adminAuth.ts`, which:

1. verifies the bearer JWT through the existing `verifyUser()`,
2. looks the caller up in `admin_users` with the service key,
3. answers 404 for every failure mode, identically,
4. re-checks on every request - the admin surface has no session of its own,
5. burst-limits per IP and per actor in front of the body read,
6. writes an `admin_audit_log` row for every mutating call, in the same request.

## 5. The audit log

`public.admin_audit_log` records actor, actor role, action, target type and id, a summary, a
structured detail object, an IP hash, and a timestamp. Service role holds `insert` and `select`
only - **no update or delete grant exists for any role**, so it is append-only by privilege
rather than by convention. It stays content-free of secrets in the same sense as the AI
ledgers: no tokens, no passwords, no prompt or template content.

## 6. Known limits, stated rather than papered over

- **Suspension is not instant for an already-issued access token.** A Supabase JWT stays valid
  until it expires (an hour by default). Three layers narrow the window: banning the user stops
  refresh, `is_suspended()` in the write RLS policies stops database writes immediately, and the
  API handlers check on every request. A suspended user holding a fresh token can still read
  their own rows for up to that hour. This is a property of stateless JWTs, not a bug to hide.
- **The admin bundle is public.** It must never contain user data, secrets, or a description of
  the schema. Reviewers should treat any such addition as a defect.
- **The user list pages the auth directory and aggregates in memory.** GoTrue has no search and
  no server-side filter, and the Supabase client cannot express a `GROUP BY`, so listing walks
  up to 2000 accounts and sums the 30-day ledger slice in JavaScript. That is the right trade at
  tens of accounts and the wrong one at ten thousand. The `truncated` flag in the response is the
  tripwire: when it starts coming back true, the fix is a database-side view, not a bigger page.
- **`AI_LITE_OVERRIDE_USER_IDS` is legacy.** It resolves as `env-override` and can only widen AI
  access, never remove it. It is removed one release after plans ship.

## 7. Migrations

| Migration | Contents |
|---|---|
| `0017_admin_roles` | `admin_users`, `is_admin()`, `admin_audit_log` |
| `0018_entitlements` | `user_accounts`, `is_suspended()`, suspension added to existing write policies, `plans`, `user_plans`, `user_grants` |
| `0019_system_and_templates` | `system_settings`, `public_system_notice()`, `template_admin` |

`0019` is also the one place the admin surface publishes OUTWARD. `public_system_notice()` is a
SECURITY DEFINER function granted to `anon` and `authenticated` that returns exactly two things:
the maintenance notice and the list of features currently switched off. Both are effects a
visitor already experiences, so publishing them lets the app explain itself instead of appearing
broken. Everything else in `system_settings` - beta cohorts, model routing - stays server-side.
The client reads it through `src/backend/systemNotice.ts` and renders `SystemNoticeBar`, which
returns null when there is nothing to say, no backend, or a failed lookup.

`0018` is the risky one: it edits live RLS policies on `documents` and `assets`. The change is
additive (`and not is_suspended(...)`), read access is untouched so a suspended user can still
export their own work, and a regression test covers the unaffected normal user.
