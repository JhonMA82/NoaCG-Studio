# Funnel events

The growth funnel: how many people arrive, how many make something, and how many come back.
It exists to answer ONE question the growth plan steers on (`docs/GROWTH_EXECUTION_PLAN.md`
§11) - *week-1 retention among activated users from target communities* - and deliberately
nothing more. It is not product analytics: there is no session replay, no click stream, no
per-feature usage, and no funnel of the editor's internals.

Backlog item 2 of the growth plan's build queue.

## The five events

| Event | Fired when | `detail` |
|---|---|---|
| `visit` | a page load, once per load | - |
| `return` | a page load 24 h or more after this browser's last one | - |
| `signup` | an email sign-up succeeds | - |
| `activation` | a graphic is created | the creation door (`template`, `design`, `ai`, `blank`, `import`) |
| `export` | an export zip reaches the disk | the export target id (`spx`, `casparcg`, …) |

`activation` is the one that matters: it is the difference between a visitor and a user.
It is recorded per create rather than once per visitor, so the same table answers both
"did they ever make something" and "how often" - take the first row per `visitor_id` for the
first, count them for the second.

`return` is derived in the browser rather than by querying history: a page load compares
against a `lastSeen` stamp in the same first-party storage as the visitor id. A day, not a
session, so an evening of work counts once however many times the tab is reloaded.

OAuth sign-ins are deliberately **not** counted as `signup`. Only the email path can tell a
new account from a returning one, and a wrong number is worse than a missing one.

## What is stored, and what is not

Table `public.funnel_events` (migration `0016`). One row per event:

`event`, `visitor_id`, `user_id` (null until signed in), first-touch `source` / `medium` /
`campaign` / `referrer_host`, `detail`, `created_at`.

Deliberately absent:

- **No raw IP.** The route hashes the caller's address for its burst-gate key and never
  writes it. `ai_gateway_requests` does store an `ip_hash`; this table does not, because the
  visitor id already identifies a browser and a second identifier would only widen what a
  leak would mean.
- **No user agent, screen size, or device fingerprint of any kind.**
- **No page URLs, titles, prompts, or template content.** `detail` is a slug from a fixed
  allowlist, not free text.
- **No cookies anywhere in the path.** `visitor_id` is a random uuid the browser mints for
  itself in `localStorage`, and clearing site data erases it.

The full referring URL is never stored - only its hostname, which is what channel
attribution actually needs.

## First-touch attribution

UTM parameters and the referrer host are captured **once**, on the browser's first ever page
load, and never overwritten. A campaign therefore keeps credit for the account it actually
brought in, and someone who returns later through a different link does not silently rewrite
their own history. The captured touch rides every subsequent event, so retention stays
attributable to the channel without a server-side join.

## Opting out

The client is inert - it reports nothing at all - when any of these hold:

- no Supabase backend is configured (every self-hosted clone with an empty `.env`);
- `navigator.globalPrivacyControl` is true, or the browser sends `DNT: 1`;
- the visitor set the explicit opt-out (`setFunnelOptOut(true)`), which also deletes the
  visitor id, the first-touch record, and the last-seen stamp already stored. The promise is
  "stop knowing me", not merely "stop counting".

## How it is wired

```
browser                                   server
─────────────────────────────────────     ──────────────────────────────────────────
src/backend/events.ts                     api/events.ts          POST, always 204
  trackPageVisit()  → visit | return        ↳ burst gate         api/_lib/rateLimit.ts
  trackEvent(event, detail)                 ↳ verifyUser(token)  api/_lib/auth.ts
  setFunnelOptOut(), funnelOptedOut()       ↳ funnelEventRow()   api/_lib/funnelEvents.ts
                                            ↳ recordFunnelEvent()  service_role insert
```

The browser has **no** RLS policy on the table, so this route is the only writer. That costs
one function call per event and buys two things worth more: the allowlist is enforced
somewhere the client cannot edit, and a scraped anon key cannot forge or read a funnel.

In development and self-hosting the same handler is mounted by `scripts/eventsDevPlugin.mjs`,
so the route behaves locally exactly as it does on Vercel - browser-verified: a valid event,
an invalid one and an oversized body are all indistinguishable 204s, and GET answers 405.

The route always answers `204`, including when nothing was written. Analytics must never
surface as an error in a user's console, and a response distinguishing "stored" from
"dropped" would be a probe oracle.

Reporting is best-effort throughout: `fetch` failures, blocked storage, and a missing
backend are all silent. Nothing on this path may ever break, block, or slow the page that
reported it.

### Call sites

| Where | Event |
|---|---|
| `src/main.tsx` | `trackPageVisit()`, before React mounts |
| `src/components/auth/SignInDialog.tsx` | `signup` |
| `src/components/wizard/CreationWizard.tsx` | `activation` (both `applyDraftProject` and the AI path) |
| `src/components/ExportSurface.tsx` | `export`, after the zip is saved |

`signup` fires from the dialog rather than `backend/auth.ts` so the funnel client keeps its
one-way dependency on auth (it reads the access token) instead of forming an import cycle.

## Rate limiting

`EVENTS_RATE_WINDOW_SEC` / `EVENTS_RATE_MAX` (default 60 per minute per IP hash). This is not
about protecting the function, which costs almost nothing per call - it is about the DATA. An
unthrottled endpoint lets one client manufacture a funnel, and an invented activation rate is
worse than a missing one.

## Tests

`api/_lib/funnelEvents.test.ts` (in `scripts/run-ai-gateway-tests.mjs`, part of
`npm run build`) pins the allowlist: only the five events store, a row without a usable
visitor id is dropped rather than stored anonymously, the account id comes from the token
and never from the body, and URLs / email addresses / prompts / over-long values in `detail`
and the attribution fields all land as null rather than being truncated into something that
still leaks.
