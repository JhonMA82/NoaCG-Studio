# Stack freshness — what rots, and what watches it

Everything this project depends on falls into one of two groups: things `npm` can see, and
things it cannot. The second group is the dangerous one, because nothing in the normal
development loop ever mentions it. This document is the register of both, and it names the
check that watches each — a list nobody runs is a list that goes stale itself.

The whole time-driven half runs in **`.github/workflows/weekly-audit.yml`** (Mondays 06:00
UTC, `workflow_dispatch` for an on-demand run) and files ONE rolling, self-closing issue.
Run it locally with:

```bash
npm run check:freshness
```

## The rule: report, never auto-upgrade

No automated dependency bumps, and no Dependabot. This is a deliberate call, not inertia:

- **Remotion is exact-pinned in three package files** (`package.json`, `render-worker/`,
  `player-host/`) and they must move together. The split exists so a source-available licence
  never enters the AGPL bundle.
- **`@vercel/sandbox` is exact-pinned** and runs the render worker. It is pinned to the version
  `@remotion/vercel` is built against, and **its peer range is not evidence of anything**:
  `@remotion/vercel` declares `@vercel/sandbox: ">=1.0.0"`, so npm will happily install a v2 that
  its own compiled code cannot call. v2 removed the `sandboxId` API entirely — sandboxes are
  addressed by `name` with session resume — while `@remotion/vercel@4.0.488`'s built output still
  calls `Sandbox.get({ sandboxId })` and reads `sandbox.sandboxId` (`dist/index.mjs`, three
  places). Our own three call sites in `api/_lib/executorSandbox.ts` fail typecheck, which is the
  visible half; the dependency's calls fail at RUNTIME on a real hosted render, where no local
  gate looks. **Checked 2026-08-03 against 2.9.2 and reverted.** It unblocks only on a
  `@remotion/vercel` release built against v2 — check its compiled code, not its peer range.
- **The Vite build target must stay `es2017`** while CasparCG 2.3.x is supported
  (docs/CLOUD_PLAYOUT.md §3). A 2.3.2 client embeds a ~Chromium 65 CEF that rejects `?.` and
  `??` outright — a dead layer with nothing in the log. No automated gate catches this class.

An auto-merged upgrade can satisfy every check in CI and still take playout off air. So the
machine's job is to notice; applying an upgrade stays a human step with the relevant
verification attached.

## Group 1 — npm can see it

| What | Watched by | Blocking? |
|---|---|---|
| Root dependencies, advisories | `npm audit --audit-level=high` | yes |
| Root dependencies, staleness | `npm outdated` | no — a new release is news, not a fault |
| `render-worker/`, `player-host/` | `npm --prefix … outdated` | no |
| Playwright browser binaries | follows the `@playwright/test` bump | n/a |

The audit threshold is `high` on purpose. Low and moderate advisories that have been read and
accepted (today: DOMPurify reached through `monaco-editor`) belong in the staleness report, not
in a weekly alarm — an alarm that cries about something you have consciously accepted trains
you to ignore it.

**Upgrading `monaco-editor` does not close the DOMPurify pair, whatever the release notes
suggest.** monaco pins dompurify EXACTLY, so its version moves only when monaco's does: 0.55.1
carried 3.2.7 and 0.56.0 carries 3.4.8, while the advisory covers `<=3.4.11` and the fix landed
in 3.4.12. `npm audit fix --force` "solves" it by DOWNGRADING monaco to 0.53.0. Closing the pair
therefore needs a `dompurify` override, which is a deliberate reversal of the acceptance above
rather than a version bump — decide it as one. Checked 2026-08-03 at monaco 0.56.0.

The threshold cuts the other way too, so read the severity rather than the count: on 2026-08-03 a
**high** undici advisory (response desynchronization; cross-user disclosure) sat in this list
unnoticed behind two moderates, which means the blocking gate was genuinely failing and not
merely reporting accepted noise. Both copies were fixable inside the ranges their parents already
declared.

Playwright gets no separate check. The actionable signal is the package bump, which `npm
outdated` already reports; the browser revision follows from it.

## Group 2 — npm cannot see it

This is why this document exists.

### Vendored libraries — `scripts/check-vendored-versions.mjs`

`src/assets/gsap.min.js` and `src/assets/lottie.min.js` are **committed files**, not
dependencies. They are bundled locally because a generated template must play offline with no
CDN reference (root AGENTS.md, principle 3) — which means they ship inside every graphic every
user exports, and no dependency tool has ever had an opinion about them.

The check reads each file's own version banner and compares it against the npm registry. It
reads the banner rather than a version recorded beside it, because a number kept separately
goes stale exactly when someone updates the library without updating the note.

When it fires, upgrading is a real piece of work, not a version bump: the new file has to be
re-minified into place, and its output re-checked against the es2017 floor above.

### Pinned model ids — `scripts/check-model-ids.mjs`

Every OpenRouter id hard-coded in `src/ai/` and `api/_lib/` (`PRO_STANDARD_ROUTES`, the Lite
profile, `aiModelCatalog`, the settings picker), checked against the live public listing.

**This is the only staleness in the stack that fails in production rather than in a build.**
Nothing references a *version* of a model id — the id IS the contract — so typecheck, lint,
the e2e suite and every gate stay green while a real user's generation returns a provider
error. Providers retire ids on their own schedule and nothing tells us.

It reads only literals in route position (`model: '…'` / `id: '…'`) in shipped source, never in
tests or comments, so a candidate discussed in a comment is not mistaken for one we route to.
The listing endpoint is public: no key, no tokens.

The video harness already syncs its own catalog (`npm run video:models:sync`); this covers the
SPX/Lite/Pro routes, which had nothing watching them.

**All four providers are covered, but only two without a key.** OpenRouter and Hugging Face are
public and always checked. OpenAI and Anthropic need a key, taken from the real environment or
from the checkout's `.env` through `scripts/read-dotenv.mjs` (the one definition of that, shared
with the advisor check); without one they are reported **NOT CHECKED** and never counted as ok — "could
not check" is not "clean" — but they do not fail the run, because the weekly workflow is keyless
by design and a permanent red there trains everyone to ignore it.

So the weekly job checks 12 of 16 ids; a local `npm run check:models` checks all 16.

This split exists because the gap bit once. The check began OpenRouter-only and caught
`openai/gpt-5.6`; the second dead id was one entry above it in the same file, on the direct-OpenAI
provider the check could not see, and only a manual listing call settled it.

Two things it took a mutation test to get right, both worth keeping in mind if you extend it:
the Hugging Face Hub answers an unauthenticated request for a nonexistent repo with **401, not
404** (it will not leak which private names are taken), so treating only 404 as missing reported
a dead id as UNCHECKED; and `settings.ts` must not also be scanned for slashed route literals,
because `openai/gpt-oss-120b` is a Hugging Face repo id in one entry and an OpenRouter route in
another — attributing every slashed id to OpenRouter would report a HF-only model as gone from a
listing it was never in.

### Things with no version at all — the `MANUAL_REVIEW` table

A woff2 carries no version string, and a Supabase platform upgrade is a dashboard action that
never appears in git. Neither can be checked; both can be *reviewed*. The table in
`scripts/check-vendored-versions.mjs` records only when someone last looked, and the check goes
red when the interval elapses.

Provenance for the bundled faces is deliberately NOT duplicated here — it already lives in one
place, `src/assets/OFL.txt`, which names every upstream project (src/export/AGENTS.md owns that
rule). Update `lastReviewed` when you actually check, not when the reminder fires.

### Node

`.nvmrc` and an `engines.node` field in all three package files pin Node 24, matching the
`node-version: 24` every workflow already hard-codes and giving Vercel an explicit runtime
rather than a default. There was no pin at all before, which is the same shape as the
`tsconfig.api.json` trap: local and deployed toolchains diverging with nothing saying so.

### Supabase advisors — `scripts/supabase-advisors.mjs` (`npm run check:advisors`)

Security and performance advisor findings, diffed against `supabase/advisor-baseline.json`.

Most of what the advisors report here is the project working as designed and will never clear:
~30 `SECURITY DEFINER` functions callable by `anon` (the capability-URL model — a CasparCG or OBS
client holding an output slug is unauthenticated by construction) and 16 tables with RLS enabled
and no policies (which is deny-all, the *stricter* posture; the linter cannot tell that from
"forgot to write policies"). A permanent wall of forty-plus warnings trains you to ignore the
report, and then a genuinely new one arrives into a list nobody reads.

So the baseline records what has been seen and accepted, and the check alarms only on what is
new — the same shape as `scripts/overflow-sweep.mjs`, for the same reason. The per-class reasons
live in `ACCEPTED_CLASSES` in the script.

**A new member of an accepted class still fails.** A new table with RLS and no policies is
exactly the case worth catching, so the reason explains the class without admitting its future
members. A finding that *disappears* is reported but never fails — good news must not be an
alarm — though it should be re-recorded, or the baseline decays into a list of things that no
longer exist.

Exit codes are three-valued: `0` clean, `1` new findings, **`2` could not check** (no token, or
no baseline yet). "Could not check" is deliberately not "clean".

The baseline is recorded: **70 findings** as of 2026-08-03 — 49 security (19 authenticated and 13
anon `SECURITY DEFINER` functions, 16 deny-all tables, leaked-password protection) and 21
performance (11 unindexed foreign keys, 8 unused indexes, 2 overlapping policies).

**The token comes from `.env` or the environment.** `SUPABASE_ACCESS_TOKEN=<token>` in the
checkout's `.env` is enough — the script reads it through `scripts/read-dotenv.mjs`, the same
shared reader the model check uses, and a real environment variable still overrides the file.
Create the token at <https://supabase.com/dashboard/account/tokens>. It reads `.env` rather than
only the environment because every other key here lives in that file: a check that reported "not
set, so nothing was checked" on a fully configured machine looked like a missing token instead of
a missing `export`, which is the most misleading answer it has.

Re-record after a deliberate change:

```bash
node scripts/supabase-advisors.mjs --update-baseline
```

Read the diff before committing it — recording accepts everything currently reported.

**The live fetch path was proved on 2026-08-03** and agrees with the baseline exactly: `70 advisor
findings; 70 accepted in the baseline. No change against the baseline.`, exit 0. That matters
because the baseline itself was first recorded through the Supabase MCP connector rather than the
Management API — same data and same `cache_key` identities, but a different door, so until that
run nothing had exercised the HTTP path. It now has, and the two doors agree. If a future run
disagrees, suspect the fetch before suspecting the database.

Errors in a baseline fail in the safe direction, which is why hand-assembling one was acceptable:
a missing entry makes its finding read as NEW and turns the run red, and a key that does not exist
shows up as "gone". Neither can silently accept something.

**Not in CI.** It needs a Management API personal access token and `weekly-audit.yml` is
secret-free on purpose. Whether it ever joins is a decision about putting a Supabase token in
Actions, and should be made deliberately rather than drifted into.
