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
- **`@vercel/sandbox` is exact-pinned** and runs the render worker.
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

**It only sees OpenRouter.** Anthropic, direct-OpenAI and Hugging Face ids in `AI_MODELS` cannot
be listed without a key for each provider, and this check is deliberately keyless — so those
entries are unwatched, and a retirement there still fails the same silent way. Treat them as a
manual review when a provider announces a deprecation.

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

## Not covered here

**Supabase advisors** (RLS and `SECURITY DEFINER` findings) need an access token, and this
workflow is deliberately secret-free. Roughly 30 of the current findings are the capability-URL
design working as intended and will never clear, so the useful shape is a checked-in baseline
that fails only on something NEW — the pattern `scripts/overflow-sweep.mjs` already uses. That
is tracked separately; whether it ever joins CI is a decision about putting a Supabase token in
Actions, and should be made deliberately rather than drifted into.
