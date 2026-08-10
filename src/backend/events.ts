// The opt-in product-improvement funnel (docs/FUNNEL_EVENTS.md): five content-free
// milestones and a browser-minted visitor id. Everything is best-effort and silent.
// Nothing is stored or sent until the visitor explicitly accepts analytics.

import { isBackendConfigured } from './config';
import { getAccessToken } from './auth';

export type FunnelEvent = 'visit' | 'return' | 'signup' | 'activation' | 'export';
export type AnalyticsConsent = 'undecided' | 'accepted' | 'declined';

const VISITOR_KEY = 'noacg.funnel.visitor';
const LAST_SEEN_KEY = 'noacg.funnel.lastSeen';
const LEGACY_FIRST_TOUCH_KEY = 'noacg.funnel.firstTouch';
const LEGACY_OPT_OUT_KEY = 'noacg.funnel.optOut';
const CONSENT_KEY = 'noacg.analytics.consent';
const ACCEPTED = 'accepted-v1';
const DECLINED = 'declined-v1';
export const ANALYTICS_CONSENT_EVENT = 'noacg-analytics-consent';

/** A visit this long after the visitor's last one is a RETURN. */
const RETURN_AFTER_MS = 24 * 60 * 60 * 1000;

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(key: string): string {
  return store()?.getItem(key) ?? '';
}

function write(key: string, value: string): void {
  try {
    store()?.setItem(key, value);
  } catch {
    /* blocked storage leaves analytics unattributed and silent */
  }
}

function removeTrackingState(): void {
  try {
    for (const key of [VISITOR_KEY, LAST_SEEN_KEY, LEGACY_FIRST_TOUCH_KEY]) {
      store()?.removeItem(key);
    }
  } catch {
    /* ignore blocked storage */
  }
}

/** Browser-level privacy signals always override a stored acceptance. */
export function analyticsBlockedByBrowser(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  if (nav.globalPrivacyControl === true) return true;
  const dnt = nav.doNotTrack ?? nav.msDoNotTrack ?? (window as { doNotTrack?: string }).doNotTrack;
  return dnt === '1' || dnt === 'yes';
}

export function analyticsConsent(): AnalyticsConsent {
  if (analyticsBlockedByBrowser()) return 'declined';
  const value = read(CONSENT_KEY);
  if (value === ACCEPTED) return 'accepted';
  if (value === DECLINED || read(LEGACY_OPT_OUT_KEY) === '1') return 'declined';
  return 'undecided';
}

function notifyConsentChanged(): void {
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT));
}

/**
 * Store the optional analytics choice. Acceptance starts with a new identifier so data
 * created before consent can never be attached to the opted-in history. Withdrawal asks
 * the server to erase associated rows before dropping the local identifier.
 */
export function setAnalyticsConsent(allowed: boolean): void {
  const previous = analyticsConsent();
  if (allowed && !analyticsBlockedByBrowser()) {
    if (previous !== 'accepted') removeTrackingState();
    try {
      store()?.removeItem(LEGACY_OPT_OUT_KEY);
    } catch {
      /* ignore */
    }
    write(CONSENT_KEY, ACCEPTED);
    notifyConsentChanged();
    trackPageVisit();
    return;
  }

  const visitorId = read(VISITOR_KEY);
  if (visitorId) void withdraw(visitorId);
  removeTrackingState();
  write(CONSENT_KEY, DECLINED);
  notifyConsentChanged();
}

/** Feedback may reuse an existing opted-in id, but must never mint one. */
export function currentVisitorId(): string | null {
  return analyticsConsent() === 'accepted' ? read(VISITOR_KEY) || null : null;
}

function visitorId(): string {
  const existing = read(VISITOR_KEY);
  if (existing) return existing;
  const minted = crypto.randomUUID();
  write(VISITOR_KEY, minted);
  return minted;
}

/** Report one allowlisted milestone only after explicit acceptance. */
export function trackEvent(event: FunnelEvent, detail?: string): void {
  if (!isBackendConfigured() || analyticsConsent() !== 'accepted') return;
  try {
    void send(JSON.stringify({ event, visitorId: visitorId(), detail }));
  } catch {
    /* analytics is never allowed to surface */
  }
}

async function headers(): Promise<Record<string, string>> {
  const token = await getAccessToken().catch(() => null);
  return {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

async function send(body: string): Promise<void> {
  try {
    await fetch('/api/events', { method: 'POST', headers: await headers(), body, keepalive: true });
  } catch {
    /* offline, blocked, or refused - the datapoint is simply lost */
  }
}

async function withdraw(visitorId: string): Promise<void> {
  if (!isBackendConfigured()) return;
  try {
    await fetch('/api/events', {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({ action: 'withdraw', visitorId }),
      keepalive: true,
    });
  } catch {
    /* the 90-day server retention limit remains the fallback */
  }
}

/** One page-load milestone. Calling this before a choice is intentionally a no-op. */
export function trackPageVisit(): void {
  if (!isBackendConfigured() || analyticsConsent() !== 'accepted') return;
  const previous = Number(read(LAST_SEEN_KEY)) || 0;
  const now = Date.now();
  write(LAST_SEEN_KEY, String(now));
  trackEvent(previous && now - previous >= RETURN_AFTER_MS ? 'return' : 'visit');
}
