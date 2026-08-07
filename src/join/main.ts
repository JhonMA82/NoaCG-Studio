// The /join entry (docs/INTERACTIVE_PLAYOUT_PLAN.md, Phase 5). Three jobs and nothing else:
// read the capability out of the URL, build the Supabase audience provider from it, and mount
// the shared join surface. Every decision about what a viewer may see lives in
// `src/audience/joinSurface.ts` and in migration 0035's RPCs — this file is the door.
//
// TWO URL SHAPES, one entry:
//   /join/<name>      the readable vanity form an operator reads out on air
//   /join?p=<slug>    the random form a production is published with
//   /join?pv=<slug>   the PRESENTER's own read-only view (its own slug, its own capability)

import { isBackendConfigured } from '../backend/config';
import { createSupabaseAudience, presenterBySlug } from '../audience/audienceData';
import { deviceToken } from '../audience/deviceToken';
import { mountJoinSurface } from '../audience/joinSurface';

const root = document.getElementById('join');

/** A slug is URL-safe base64 or a claimed vanity name; anything else never reaches the server. */
const SLUG = /^[A-Za-z0-9_-]{3,40}$/;

function readSlug(): { join: string | null; presenter: string | null } {
  const params = new URLSearchParams(window.location.search);
  const presenter = params.get('pv');
  const fromQuery = params.get('p');
  // /join/<name> — the path form. `cleanUrls` serves this entry for it (vercel.json rewrite),
  // and the dev/preview server does the same through the app-clean-url plugin.
  const fromPath = decodeURIComponent(window.location.pathname.replace(/^\/join\/?/, '').replace(/\/$/, ''));
  const join = fromQuery || fromPath || null;
  return {
    join: join && SLUG.test(join) ? join : null,
    presenter: presenter && SLUG.test(presenter) ? presenter : null,
  };
}

/** One message for every reason there is nothing to show. A page that distinguished "no such
 *  production" from "not published" from "switched off" would be a probe for anyone holding a
 *  guessed link. */
function nothing(message = 'This link is not open right now.'): void {
  if (!root) return;
  root.className = 'nj';
  root.textContent = '';
  const p = document.createElement('p');
  p.className = 'nj-waiting';
  p.textContent = message;
  root.appendChild(p);
}

async function showPresenter(slug: string): Promise<void> {
  if (!root) return;
  const paint = async () => {
    const view = await presenterBySlug(slug);
    if (!view) {
      nothing();
      return;
    }
    root.className = 'nj';
    root.textContent = '';
    const title = document.createElement('p');
    title.className = 'nj-title';
    title.textContent = view.productionName;
    root.appendChild(title);
    // Two items, in the words that would go on air. No inbox, no counts, no controls: a
    // presenter's tablet is a read-only window onto what the operator has lined up.
    for (const [label, item] of [
      ['On air next', view.current],
      ['After that', view.next],
    ] as const) {
      const card = document.createElement('div');
      card.className = 'nj-card';
      const heading = document.createElement('p');
      heading.className = 'nj-label';
      heading.textContent = label;
      const body = document.createElement('p');
      body.className = 'nj-prompt';
      body.style.margin = '0';
      body.textContent = item?.body || '—';
      card.append(heading, body);
      if (item?.author) {
        const who = document.createElement('p');
        who.className = 'nj-note';
        who.textContent = item.author;
        card.appendChild(who);
      }
      root.appendChild(card);
    }
  };
  await paint();
  // The presenter view is a monitor, so it refreshes on the same cadence as the join page and
  // stops asking while the tablet is asleep in a pocket.
  window.setInterval(() => {
    if (document.visibilityState !== 'hidden') void paint();
  }, 5_000);
}

function boot(): void {
  if (!root) return;
  // An offline / self-hosted build has no audience plane at all. Say so plainly here rather
  // than showing a form that could never send anything.
  if (!isBackendConfigured()) {
    nothing('Audience participation needs the cloud backend. This build runs offline.');
    return;
  }
  const { join, presenter } = readSlug();
  if (presenter) {
    void showPresenter(presenter);
    return;
  }
  if (!join) {
    nothing();
    return;
  }
  const backend = createSupabaseAudience({ joinSlug: join });
  const device = deviceToken();
  mountJoinSurface(root, {
    load: () => backend.joinView(device),
    submit: (author, body) => backend.submit(device, author, body),
    vote: (roundId, option) => backend.vote(device, roundId, option),
  });
}

boot();
