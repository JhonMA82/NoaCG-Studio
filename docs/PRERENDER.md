# Static prerender

`scripts/prerender.mjs`, run after `vite build` as part of `npm run build`. It writes real
HTML into `dist/` so the catalog is crawlable:

- `dist/templates/<slug>/index.html` - one page per catalog design (386 today)
- `dist/sitemap.xml` - landing + editor + every template page
- `dist/robots.txt` - allow-all plus the sitemap pointer

Growth-plan backlog item 4 (`docs/GROWTH_EXECUTION_PLAN.md` §2/§9). The problem it solves is
stated there: the app is a Vite SPA, so every crawler asking for a template gets the same
empty shell, and a shared link shows nothing until JavaScript runs.

## Where the content comes from

The app's own catalog, loaded through Vite's SSR module loader - never a hand-kept list
beside it. A design added to the catalog gets its page on the next build, and a page can
never describe a design that no longer exists.

It reads the **variant descriptors** (`variantsFor`), not the richer `templateMeta()`. That
is deliberate and worth not "fixing": `templateMeta()` derives its field schema by actually
BUILDING each template, which calls `DOMParser` and therefore needs a browser. The
alternatives were a DOM dependency (against root `AGENTS.md` non-negotiable 3) or a headless
browser inside the build. A marketing page needs neither - name, description, category,
style family, line capacity, logo support and default motion are all declared on the variant
already.

If a page ever needs the true built field schema, that is the moment to reconsider - and the
honest options are a browser step or a Node-safe metadata split, not a silent guess.

## Slugs are a public contract

A page's URL is the thing other sites link to, so slugs must be stable, not merely unique.
Base slug is the design name, hyphenated. A name collision appends the **variant id**
(`score-bug-lt02`), never a counter - so adding a design can never renumber, and therefore
never break, a URL that already shipped. `scripts/prerender.test.mjs` pins exactly that.

## The origin

Absolute URLs (canonical, `og:url`, sitemap) use `SITE_ORIGIN`, defaulting to
`https://noacg-studio.vercel.app`. Set the env var when the real domain lands (growth plan
W0: `noacg.studio`) - it is the only place the origin appears.

## Known gaps

- **No picture of the graphic.** The page describes a broadcast design in words only. For a
  visual product that is the biggest weakness of the surface, not a nicety - it is the same
  work as the OG images below, and both wait on rendering previews in CI.

- **No per-design deep link.** Every page's call to action opens `/app`, because the app has
  no `?design=<id>` route today - `App.tsx` handles only `?chat=` and `?control=`. Adding one
  is the single highest-value follow-up: it turns these pages from descriptions into
  entrances.
- **No per-template OG image.** Every page shares the landing screenshot. Real per-design
  images mean rendering 386 previews in CI - a separate slice with its own cost, and the
  same job as the missing on-page preview above.
- **The gallery is still signed-in only** (growth backlog item 3). These pages describe
  catalog designs, which need no account; community-published templates are not prerendered.

## Tests

`scripts/prerender.test.mjs` (in `npm run build`, also `npm run test:prerender`) covers the
things that fail SILENTLY - producing a file that looks fine and is worthless:

- the sitemap declares the `sitemaps.org` namespace (the plural; a crawler discards the
  whole file otherwise - this was wrong on the first run and is why the test exists);
- slugs stay readable and stable when a later design collides on name;
- catalog text is escaped everywhere it lands, including the attribute-valued `og:title`
  where a raw quote would break out of the markup;
- every page carries title, description, canonical, the OG trio and a link to the app;
- a data-driven design says so rather than claiming zero text lines.
