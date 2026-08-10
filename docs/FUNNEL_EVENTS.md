# Product-improvement analytics

The hosted funnel answers whether people successfully create and export graphics and which
creation doors need improvement. It is optional, first-party, and deliberately smaller than
general product analytics: no click stream, session replay, page history, project content, or
prompts.

## Consent boundary

Analytics is inert until the visitor explicitly selects **Allow** in the non-blocking hosted
banner or enables it under Settings / Privacy. Undecided and declined visitors get no analytics
identifier, no analytics storage, and no `/api/events` request. Refusal never gates an account or
feature.

`navigator.globalPrivacyControl`, `DNT: 1`, and the legacy `noacg.funnel.optOut` preference all
override a stored acceptance. Withdrawal deletes the local identifier and timestamps, then posts
an opaque deletion request for that browser. If signed in, the server also deletes every funnel
row associated with that account.

## The five events

| Event | Fired when | `detail` |
|---|---|---|
| `visit` | the page load on which consent is accepted, then later page loads | - |
| `return` | a page load 24 hours or more after this browser's last one | - |
| `signup` | an email sign-up succeeds | - |
| `activation` | a graphic or video project is created | fixed creation door slug |
| `export` | an export zip reaches the disk | fixed export target slug |

OAuth sign-ins are not counted as signup because that path cannot distinguish a new account from
a returning one.

## What is stored

`public.funnel_events` stores one row per event:

`event`, random `visitor_id`, optional authenticated `user_id`, allowlisted `detail`, and
`created_at`.

The identifier is pseudonymous, not anonymous. It is random, first-party, browser-minted, and not
derived from an account, address, or device characteristic. The account id comes only from the
verified bearer token, never from the request body.

Deliberately absent:

- raw IP, IP hash, user agent, screen size, or device fingerprint;
- page URL, title, project data, prompt, uploaded media, or generated output;
- UTM campaign values, referrer hostname, or any other marketing attribution;
- free text: `detail` is a server-validated short slug.

The legacy nullable attribution columns remain temporarily for old rows because deployed admin SQL
functions still reference `referrer_host`. New clients and the server no longer populate them, and
the 90-day limit removes the final old values before those columns are dropped.

## Retention and deletion

Migration `0038_funnel_opt_in_retention.sql` removes rows already older than 90 days and schedules a
daily `pg_cron` deletion. This database rule is the retention boundary; it does not depend on a user
returning or another analytics request arriving.

Withdrawal uses the existing `POST /api/events` function with `{ action: "withdraw", visitorId }`,
so it does not consume another Vercel function. The response is always 204, including malformed or
unknown identifiers, to avoid creating a probe oracle. An anonymous deletion is scoped to its
unguessable visitor UUID. An authenticated deletion removes rows for either that browser or the
verified account.

## Wiring

```text
browser                                      server
src/backend/events.ts                        api/events.ts
  analyticsConsent / setAnalyticsConsent       rate limit + verify token
  trackPageVisit / trackEvent                  validate fixed event shape
  withdraw                                     insert or delete through service role

src/components/AnalyticsConsentBanner.tsx    public.funnel_events
src/components/SettingsDialog.tsx              daily 90-day pg_cron cleanup
```

The client and handler remain best-effort and silent. Analytics must never break, block, or slow the
page reporting it. An unconfigured backend makes the whole surface disappear and sends nothing.

## Verification

- `api/_lib/funnelEvents.test.ts` pins the event and withdrawal allowlists.
- `e2e/analytics.spec.ts` pins the offline zero-UI, zero-storage posture.
- `e2e/configured/analytics.spec.ts` pins undecided, accept, decline, withdrawal, DNT/GPC, and
  desktop/phone layouts against a configured client while intercepting every event request.
