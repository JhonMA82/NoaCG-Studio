// Small shared pieces for the admin sections. Deliberately plain: this surface is for reading
// numbers carefully and changing other people's access, so it gets tables and labels, not
// cards and motion.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AdminUnavailable, adminFetch } from './client';

// ── loading one thing ──────────────────────────────────────────────────────────────────

export interface Async<T> {
  data: T | null;
  loading: boolean;
  /** True when the load failed. There is no error MESSAGE by design - every admin failure is
   *  the same 404, so a message would be an invention. */
  failed: boolean;
  reload: () => void;
}

/** Fetch an admin endpoint, reloading when `path` changes or `reload()` is called. A null
 *  path is idle - nothing loaded, nothing failed - which is what a detail view wants while
 *  no row is selected. */
export function useAdminData<T>(path: string | null): Async<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; failed: boolean }>({
    data: null,
    loading: path !== null,
    failed: false,
  });
  const [nonce, setNonce] = useState(0);
  // A stale response from a previous path must not overwrite a newer one - the search box
  // fires a request per keystroke and they do not come back in order.
  const latest = useRef(0);

  useEffect(() => {
    const ticket = ++latest.current;
    if (path === null) {
      setState({ data: null, loading: false, failed: false });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    adminFetch<T>(path)
      .then((data) => {
        if (ticket === latest.current) setState({ data, loading: false, failed: false });
      })
      .catch((error: unknown) => {
        if (ticket === latest.current) setState({ data: null, loading: false, failed: true });
        if (!(error instanceof AdminUnavailable)) console.error(error);
      });
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/** Debounce a value so a search box does not fire a request per keystroke. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

// ── formatting ─────────────────────────────────────────────────────────────────────────

export function formatDate(value: string | null): string {
  if (!value) return '-';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '-';
  return new Date(parsed).toISOString().slice(0, 10);
}

export function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '-';
  return new Date(parsed).toISOString().replace('T', ' ').slice(0, 16);
}

/** USD with enough precision to see a sub-cent generation cost, which is the scale that
 *  matters here - rounding to cents would show most of this ledger as zero. */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '$0';
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'kB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log10(value) / 3));
  return `${(value / 1000 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function relative(value: string | null): string {
  if (!value) return 'never';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'never';
  const seconds = Math.round((Date.now() - parsed) / 1000);
  if (seconds < 90) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

// ── presentational ─────────────────────────────────────────────────────────────────────

export function SectionHeader({ title, lede, actions }: { title: string; lede?: string; actions?: ReactNode }) {
  return (
    <header className="admin-section-head">
      <div>
        <h1>{title}</h1>
        {lede ? <p className="admin-lede">{lede}</p> : null}
      </div>
      {actions ? <div className="admin-section-actions">{actions}</div> : null}
    </header>
  );
}

/** The three states every list can be in, in one place, so no section invents its own
 *  wording for "nothing here" versus "could not load". */
export function AsyncState({ state, empty }: { state: Async<unknown>; empty?: string }) {
  if (state.loading) return <p className="admin-muted">Loading…</p>;
  if (state.failed) return <p className="admin-muted">Could not load this.</p>;
  return <p className="admin-muted">{empty ?? 'Nothing here yet.'}</p>;
}

export function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'danger' | 'muted'; children: ReactNode }) {
  return <span className={`admin-pill admin-pill-${tone}`}>{children}</span>;
}

/** A labelled form row. Keeping the label, the control and the hint together stops the
 *  sections drifting into six different form layouts. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="admin-field">
      <span className="admin-field-label">{label}</span>
      {children}
      {hint ? <span className="admin-field-hint">{hint}</span> : null}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="admin-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        {label}
        {hint ? <em>{hint}</em> : null}
      </span>
    </label>
  );
}
