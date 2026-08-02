// The funnel client (docs/FUNNEL_EVENTS.md): five events, first-touch attribution, and a
// browser-minted visitor id. Everything here is best-effort and silent - analytics that
// can break a page, block one, or slow one down is not worth having.
//
// It is INERT unless a backend is configured, so a self-hosted clone with an empty .env
// reports nothing to anyone, exactly like the rest of the Era 5 surface (backend/config).
// It is also inert when the visitor has asked not to be tracked; see optedOut() below.

import { isBackendConfigured } from './config';
import { getAccessToken } from './auth';

export type FunnelEvent = 'visit' | 'return' | 'signup' | 'activation' | 'export';

const VISITOR_KEY = 'noacg.funnel.visitor';
const FIRST_TOUCH_KEY = 'noacg.funnel.firstTouch';
const LAST_SEEN_KEY = 'noacg.funnel.lastSeen';
const OPT_OUT_KEY = 'noacg.funnel.optOut';

/** A visit this long after the visitor's last one is a RETURN - the retention signal the
 *  growth plan steers on. A day rather than a session so a single evening of work counts
 *  once, however many times the tab is reloaded. */
const RETURN_AFTER_MS = 24 * 60 * 60 * 1000;

interface FirstTouch {
  source?: string;
  medium?: string;
  campaign?: string;
  referrerHost?: string;
}

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // Storage blocked (private mode, embedded frame) - stay silent.
  }
}

function read(key: string): string {
  return store()?.getItem(key) ?? '';
}

function write(key: string, value: string): void {
  try {
    store()?.setItem(key, value);
  } catch {
    /* quota or blocked - the event simply goes unattributed */
  }
}

/** Honour the browser's own do-not-track signals plus our explicit opt-out. Checked on
 *  every call rather than cached, so turning it on takes effect without a reload. */
function optedOut(): boolean {
  if (read(OPT_OUT_KEY) === '1') return true;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  if (nav.globalPrivacyControl === true) return true;
  const dnt = nav.doNotTrack ?? nav.msDoNotTrack ?? (window as { doNotTrack?: string }).doNotTrack;
  return dnt === '1' || dnt === 'yes';
}

/** The visitor's opt-out switch, for a settings surface to bind to. Opting out also drops
 *  the identifiers already stored - the promise is "stop knowing me", not "stop counting". */
export function setFunnelOptOut(optOut: boolean): void {
  if (!optOut) {
    try {
      store()?.removeItem(OPT_OUT_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  write(OPT_OUT_KEY, '1');
  try {
    for (const key of [VISITOR_KEY, FIRST_TOUCH_KEY, LAST_SEEN_KEY]) store()?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function funnelOptedOut(): boolean {
  return optedOut();
}

/** Random, first-party, and minted on demand - not derived from the account, the address,
 *  or anything the browser exposes about the device. */
function visitorId(): string {
  const existing = read(VISITOR_KEY);
  if (existing) return existing;
  const minted = crypto.randomUUID();
  write(VISITOR_KEY, minted);
  return minted;
}

/**
 * The visitor id this browser ALREADY has, or null.
 *
 * Deliberately different from `visitorId()` above in the one way that matters: it never mints.
 * Feedback is the only other thing that wants this id, and minting one there would create a
 * tracking identifier for somebody who has never had one - out of a click whose whole purpose
 * was to help us. Opting out answers null for the same reason: "stop knowing me" has to mean
 * this too, even when the person is being helpful.
 */
export function currentVisitorId(): string | null {
  return optedOut() ? null : read(VISITOR_KEY);
}

function hostOf(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host && host !== window.location.hostname ? host : undefined;
  } catch {
    return undefined;
  }
}

/** Captured ONCE, on the first page load this browser ever makes, and never overwritten:
 *  the campaign that brought someone in keeps credit for what they do later, and a visitor
 *  who arrives again through a different link does not silently rewrite their own history. */
function firstTouch(): FirstTouch {
  const stored = read(FIRST_TOUCH_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as FirstTouch;
    } catch {
      /* fall through and re-capture */
    }
  }
  const params = new URLSearchParams(window.location.search);
  const touch: FirstTouch = {
    source: params.get('utm_source') ?? undefined,
    medium: params.get('utm_medium') ?? undefined,
    campaign: params.get('utm_campaign') ?? undefined,
    referrerHost: document.referrer ? hostOf(document.referrer) : undefined,
  };
  write(FIRST_TOUCH_KEY, JSON.stringify(touch));
  return touch;
}

/** Report one funnel event. Never throws, never awaits anything the caller depends on, and
 *  never reports when the backend is absent or the visitor opted out. `detail` must be a
 *  short slug the server's allowlist accepts (an export target id, a creation route) -
 *  anything else is dropped server-side rather than stored. */
export function trackEvent(event: FunnelEvent, detail?: string): void {
  if (!isBackendConfigured() || optedOut()) return;
  try {
    const body = JSON.stringify({ event, visitorId: visitorId(), detail, ...firstTouch() });
    void send(body);
  } catch {
    /* analytics is never allowed to surface */
  }
}

async function send(body: string): Promise<void> {
  try {
    // A signed-in visitor's token lets the server attribute the row to the account; an
    // anonymous one simply has none. The token is read here, never stored in the payload.
    const token = await getAccessToken().catch(() => null);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    await fetch('/api/events', { method: 'POST', headers, body, keepalive: true });
  } catch {
    /* offline, blocked, or refused - the datapoint is simply lost */
  }
}

/** Called once per page load: reports the visit, and promotes it to a RETURN when this
 *  browser was last seen a day or more ago. Both carry the same first-touch attribution,
 *  so retention stays attributable to the channel that brought the visitor in. */
export function trackPageVisit(): void {
  if (!isBackendConfigured() || optedOut()) return;
  const previous = Number(read(LAST_SEEN_KEY)) || 0;
  const now = Date.now();
  write(LAST_SEEN_KEY, String(now));
  trackEvent(previous && now - previous >= RETURN_AFTER_MS ? 'return' : 'visit');
}
