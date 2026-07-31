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

### What actually enforces each dimension

A control that writes a row and changes nothing is worse than no control, so this is the map
from a plan/admin dimension to the code that reads it. **Handler paths are the FILES, not the
URLs:** the Vercel Hobby plan caps a deployment at twelve serverless functions, so each area
routes through one catch-all (`api/ai/lite/[...path].ts`, `api/ai/tasks/[...path].ts`,
`api/admin/[...path].ts`, `api/render/[...path].ts`) and the handlers themselves live under
`api/_lib/`, where they cost no function slot. The URLs are unchanged.

| Dimension | Enforced by |
|---|---|
| `ai.lite` | `api/_lib/lite/generations.ts`, `judge.ts`, and `status.ts` (so the panel cannot offer what the endpoint would refuse) |
| `ai.import-analysis` | `api/_lib/importAnalysis/analyze.ts` + its `status.ts` |
| `ai.byo-key` | `api/ai/generate.ts`, on the BYO branch only, and only when a token was presented - account-free BYO must keep working |
| `ai.video` | `api/ai/generate.ts`, on the `surface: 'video'` discriminator the video harness sets; the decision itself is `gatedFeature()` + `surfaceRefused()` in `api/_lib/entitlements.ts`, so it is testable without a verified token. It binds only a caller the server RECOGNISED - anonymous resolves defaults that carry no account feature, and account-free BYO video works today. See "Gating a surface on a shared endpoint" below for what the check can and cannot do |
| `render.cloud` | `api/render/start.ts` |
| `community.publish` | RLS: the two `community_templates_publish_*` gates + `community_assets_publish_insert` on the bucket (`0022`). Moderators are exempt on UPDATE, so a takedown still works while the switch is off |
| `control.hosted` | RLS: the two `control_shows_hosted_*` gates, plus the owner check inside `control_send`, `control_stage` and `control_report` (`0022`) - the RPCs are where an existing page actually costs something |
| `showchat` | RLS: the two `shows_showchat_*` gates and `chat_submissions_showchat_update`, plus the owner check inside `show_accepts` (what the anonymous send-in policy from `0003` already tests) and `show_by_slug`, so the page agrees with the policy (`0022`) |
| `sync.cloud` | **nothing, deliberately** - it would gate a user from saving their OWN work, there is no paid tier, and suspension already covers the real need. `ENFORCED_FEATURE_KEYS` keeps the System page honest about it |
| disabled model routes | `api/_lib/lite/generations.ts`, `judge.ts`, `importAnalysis/analyze.ts`, and the MANAGED branch of `api/ai/generate.ts`. Deliberately not the BYO branch: the switch exists to stop the platform's own spend, and a BYO caller spends their own money on a model they chose |
| AI allowances | `applyEntitlementToLiteProfile()` before the reservation RPC |
| render tier | `resolveTier(signedIn, entitlement.renderTier.value)` |
| render formats | `validateRenderRequest(m, tier, entitlement.renderFormats.value)` |
| template visibility | `api/_lib/templateVisibility.ts` -> `GET /api/me/entitlement` -> the wizard's Browse step and the community gallery |
| beta cohort | the same visibility resolver; membership is never sent to the browser |
| storage / projects | **nothing, deliberately** - observe-only, see above |
| `plans.billing` | **nothing** - stored for a future integration |

**A plan's `render_formats` REPLACES the tier's list** rather than intersecting it: "available
export formats" is a plan dimension in its own right, so a plan must be able to grant a format
its tier does not carry. The other caps stay orthogonal - granting ProRes does not also grant 4K
or five minutes. A plan naming only formats the build does not have falls back to the tier
instead of emptying the list, so a stale row costs one format rather than the feature.

### Gating a surface on a shared endpoint

`POST /api/ai/generate` is a general model proxy. The SPX harness, the brainstorm call, the
video harness and a bare prompt all arrive as the same shape, so "is this video" is not
something the server can read off the request - it has to be told. `AiGatewaySurface`
(`src/ai/modelTypes.ts`) is that telling: an optional, allowlisted `surface` field, stamped
onto every video call by `src/ai/video/videoGateway.ts` - the harness's one door to the
gateway, existing so a new video model call cannot forget the tag and silently stop being
gateable. An unrecognised value is REFUSED rather than dropped, because a dropped label reads
as "the general harness, which nothing gates".

That one-door rule is machine-enforced, in two kinds because neither guard covers the other's
ground. An eslint boundary (`eslint.config.js`, the `src/ai/video` regions) refuses a direct
`../modelGateway` import anywhere in the harness but `videoGateway.ts` itself - it binds call
sites nobody has written yet, which no test can. And the shared video mock (`e2e/_video.ts`)
asserts the tag on every gateway call it answers, with `e2e/video-surface-tag.spec.ts` naming
the contract and pinning the SPX side as untagged - which lint cannot, since the request
builder could drop the field with every import still legal. The failure mode both exist for is
silent: an untagged video call works perfectly and simply escapes the entitlement.

State the limit plainly rather than discovering it later: **the tag is client-supplied.** A
caller who omits it gets the ungated path, and no server-side signal can fix that - a proxy
that will run any prompt cannot know what the answer will be used for. What the check does
buy is real: suspension, a plan that withdraws video, and the instance-wide kill switch all
reach the product's actual video traffic, which is the difference between a switch and a row
nothing reads. A surface that needs enforcement stronger than this needs its own endpoint
with its own profile, the way `ai.lite` and `ai.import-analysis` have one.

### The four RLS-shaped keys: what SQL can and cannot enforce

`sync.cloud`, `community.publish`, `control.hosted` and `showchat` have no endpoint to gate.
Every one of them writes STRAIGHT FROM THE BROWSER through the Supabase client -
`backend/supabaseProvider.ts` (documents, assets), `community/communityData.ts`,
`control/hostedControl.ts`, `showchat/chatData.ts` - so RLS is the only thing in the path.
This section is the design decision for them, written before any migration exists.

**The rejected option is a resolver in SQL.** A `entitlement_allows(feature)` predicate reading
`user_accounts`, `user_plans`, `plans`, `user_grants` and `system_settings` is entirely
buildable - `0018` and `0020` prove the mechanics. It is rejected because it would be a SECOND
AUTHORITY on the one question this whole document exists to keep single: precedence, the
neutrality rule, both built-in plans, temporary-versus-permanent ranking and the
"a malformed date must never widen access" rule would all live twice, in two languages. And on
THIS project the drift could not be caught: the guard would be a differential test running the
SQL and `resolveEntitlement()` over the same matrix, which needs a live database, and there is
no database in CI - migrations are applied by hand with `supabase db push`. Unverifiable
duplication of an access rule is not a tradeoff, it is a defect with a schedule.

**Routing those writes through `api/` is rejected too**, and not on effort. Server code holds
the service key, which BYPASSES RLS - so it would replace a per-row guarantee the database
enforces with an application check that has to be right every time. It would also make every
document upsert a serverless round trip, rewriting the offline-first sync path for the sake of
a gate, and spend from the two remaining function slots.

**A cached resolved answer** - the server writing `(user, feature, allowed)` rows that RLS
reads - keeps one resolver but is a cache in front of access control. Nothing writes it when a
grant expires or a kill switch flips, and both fail modes are wrong: fail-closed locks people
out when a cache write fails, against the neutrality rule and the fail-open posture of
`api/_lib/entitlements.ts`; fail-open makes the gate decorative.

**What shipped (`0022`): only the PRECEDENCE-FREE ABSOLUTES are in SQL, and plan-level gating of
these keys plainly does not bite.** Four inputs win outright in the contract, so a policy testing
them can only ever deny what the resolver also denies:

1. suspension - already enforced, `is_suspended()`;
2. the instance-wide kill switch - `system_settings.disabled_features` contains the key;
3. a permanent manual override that DENIES - a `user_grants` row, `value` false, no `expires_at`,
   not revoked;
4. a TEMPORARY grant that denies, while it is in force (`0023`) - the same row shape with a live
   `expires_at`. It was excluded at first as precedence-bearing, since a temporary grant sits
   below a permanent override; `0021` is what made it safe, because with one active grant per key
   there can be no override sitting above it. Different reasoning from (3), the same conclusion,
   which is why one condition now expresses both.

Plans, defaults and every other use of expiry stay in TypeScript. That is the whole trick: the
part of an entitlement RLS can carry is the part with NO precedence to re-implement, and each
of the four is a single row test. The property that makes it sound is one-directional - the
SQL denial set is a strict subset of the contract's - so the two can never disagree in the
direction that matters, which is denying something the resolver allows.

**That subset property needed a precondition, and `0021` is it.** Two active grants for one key
used to resolve non-deterministically - the API inserted without checking, `user_grants` had no
uniqueness constraint, and `loadEntitlementRows` read the rows with no `ORDER BY` while the merge
is last-wins within a rank. Now the API refuses the clash with an actionable message, a partial
unique index makes the state unreachable, and the loader orders by `created_at` anyway so a
database that has not had `0021` applied still answers the same way twice. "A denying override
exists" and "the resolver denies" are the same statement again. **Note that `0021` must be
applied before any policy relies on it** - the index is the guarantee; the API check is only the
better error message.

**Scope, honestly.** Only three of the four are wired. `community.publish` and `showchat` are
moderation instruments - stopping an abusive account from publishing or collecting send-ins while
it keeps its own work, which is the surgical version of suspension. `control.hosted` costs server
resources and was cheap to wire beside them. `sync.cloud` gates a user from saving their OWN work;
there is no paid tier, the free core stays free (`docs/GOALS.md`), and the only real need is
already covered by suspension - so it stays deliberately unenforced rather than being wired
because the key exists.

**Each key has TWO doors, and gating only the first would have been decorative.** The browser's
own writes are RESTRICTIVE policies, in the additive shape `0018` established - the live ownership
rules are never edited, so a mistake can only deny too much and reverting is a `DROP POLICY`. But
the paths that actually cost something on an EXISTING show are the capability RPCs, which are
SECURITY DEFINER (so no policy applies to them) and are reached by anonymous callers holding an
unguessable slug (so the account being gated is the SHOW'S OWNER, not the caller). Those carry the
check inside the function instead: `show_accepts` - already the anonymous send-in policy's gate -
now also reads false for a denied owner (and `show_by_slug` reports the same, so the send-in page
renders its existing "submissions are closed" state instead of an open form that fails), and
`control_send` / `control_stage` / `control_report` refuse with 42501 before writing. Neither change exposes anything new: same signatures, same
grants, and both questions were already answerable by anyone holding the capability. The answers
only ever become more restrictive.

**Two exemptions and one non-effect, all deliberate.** MODERATORS are exempt from the
`community.publish` UPDATE gate, because otherwise flipping that switch off during an incident
would also freeze the takedowns that are the reason to reach for it. READS and DELETES are
untouched everywhere: a denied account still opens and exports its own work, an already-published
template stays up (a takedown is moderation, not an entitlement), and unpublishing or closing a
show down must never be the thing that gets blocked.

**The function split, and the disclosure it carries.** `feature_denied_for(uuid, text)` answers
about an arbitrary account, so it is revoked from every client role and never granted back - it is
reachable only from inside a SECURITY DEFINER function, where the definer's privileges apply. The
policies call the self-scoped `feature_denied(text)`, which must be granted to `authenticated`
(§7's constraint: a policy expression runs with the querying role's privileges). That grant means
a signed-in caller can ask about their OWN account and learn a denial is absolute rather than
plan-level. Two of the three branches are already public - `is_suspended()` is granted to
`authenticated`, `public_system_notice()` publishes the disabled list to everyone - so the only
new bit is "there is a denying override on my account", about a feature the caller can already
observe they do not have.

**The one edge where the subset property does NOT hold, stated rather than left to be found.** It
holds for every key these gates are pointed at, and would fail for an `ai.*` one: the legacy
`AI_LITE_OVERRIDE_USER_IDS` list widens a false back to true for `ai.` keys only (`contract.ts`,
the `envOverride` branch), so on such a key the contract could ALLOW where the predicate denies -
the single direction this design forbids. It costs nothing today, because the AI keys are gated at
their endpoints and no policy names one; `scripts/admin-security-migration.test.mjs` fails the
build if any gate is ever pointed at an `ai.*` key, so doing it would be a deliberate act rather
than an accident.

### The browser's own entitlement

`GET /api/me/entitlement` returns the caller's resolved answer, so the UI stops guessing from
"is there a user". Auth is optional (anonymous gets the anonymous defaults, not a 401), the
projection is FLAT - values without their sources, because "why" is an operator's question and
shipping it would tell every user which grants exist on their account - and it carries
`hiddenTemplates`, the keys THIS caller may not see.

It is a hide-list rather than a show-list on purpose: the catalog is code and already in the
bundle, so a show-list would enumerate hundreds of ids and would empty the catalog the moment
the endpoint failed. A hide-list degrades the safe way. `src/backend/myEntitlement.ts` caches it
keyed on the access token (signing in or out is exactly a token change, and keying avoids a
value cycle with `auth.ts`), and everything about it is UX - every gated path re-resolves
server-side.

## 3. Roles

`public.admin_users (user_id, role)` with roles `owner | admin | support`, ranked in that order.
`public.is_admin(min_role)` is the SECURITY DEFINER predicate for RLS; the API gate uses a
service-key lookup instead, so an RLS mistake cannot open an endpoint.

**Every predicate here is self-scoped: it answers about the caller, never about a named account.**
`is_admin` takes a minimum ROLE and resolves the subject from `auth.uid()`, and since `0020` so
does `is_suspended()`. Asking about someone else is a privileged question and lives in
`public.admin_user_suspended(user_id)`, which verifies `is_admin('support')` *before* it reads
anything and raises `42501` otherwise - the authorization is inside the function, so a future
mis-grant still cannot leak. `is_admin` and `admin_role_rank` are no longer executable by
`authenticated` at all: nothing called them, and PostgREST publishes every function a role may
execute as `/rest/v1/rpc/<name>`, so an unused one is standing surface that also confirms an
admin system exists.

**Before adding an admin-read policy, read this.** A policy expression is evaluated with the
privileges of the *querying* role, so a policy naming `public.is_admin(...)` requires that role to
hold EXECUTE on it - verified directly against a live database, where the failure is
`42501 permission denied for function`, not a quiet "no rows". Such a migration must re-grant
EXECUTE to `authenticated` in the same change. This is the same constraint that made `0020`
reshape `is_suspended` rather than simply revoke it: the nine suspension policies call it on
every write, so revoking it would have denied writes to every signed-in user.

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

One route sits outside the admin gate on purpose: **`GET /api/me/entitlement`** is public
(auth optional) and answers only about its own caller. It is what lets the editor stop guessing
at access; see "The browser's own entitlement" above.

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
| `0020_self_scoped_predicates` | `is_suspended()` loses its argument, the nine policies are repointed, `is_suspended(uuid)` is dropped, `admin_user_suspended()` replaces it for admins, `is_admin`/`admin_role_rank` come off the REST surface |
| `0021_one_active_grant` | pre-existing duplicate active grants are revoked (newest kept), then a PARTIAL UNIQUE index makes one active grant per `(user_id, kind, key)` unreachable |
| `0022_entitlement_absolutes` | `feature_denied_for(uuid, text)` (internal) + the self-scoped `feature_denied(text)`, eight RESTRICTIVE gates for `community.publish`, `showchat` and `control.hosted`, and the owner check inside `show_accepts`, `show_by_slug` and the three control write RPCs |
| `0023_temporary_deny_absolute` | the grant branch of `feature_denied_for` widens to cover a TEMPORARY denying grant while it is in force - safe only because `0021` guarantees no override can sit above it |

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

`0022` is the second risky one, for the same reason and with the same answer: it adds live write
gates to four more tables, one storage bucket and four SECURITY DEFINER functions. Its `DO` block
asserts the grant every gate depends on, that the cross-user predicate is off the REST surface,
that all eight gates exist AND are restrictive (a permissive policy of the same name would widen
access, since permissive policies are ORed), and then actually flips the kill switch against a
synthetic caller to prove the predicate denies - restoring the setting on the way out, and rolling
the whole transaction back if any assertion fires.

`0020` touches those same live policies, so it carries its own proof rather than asking to be
trusted: a `DO` block impersonates an ordinary authenticated caller and asserts that the
self-check still evaluates (the grant the policies depend on is intact), that `is_suspended(uuid)`
is gone, that `admin_user_suspended` refuses a non-admin, and that `is_admin` is unreachable. Any
failure aborts the migration, so an instance cannot end up half-locked-down. The source side is
pinned offline by `scripts/admin-security-migration.test.mjs` in the build gate; both halves were
mutation-tested (removing a statement makes the matching check fire).
