// WHOSE ACTIVITY AM I LOOKING AT? The control, and the sentence that has to sit beside it.
//
// A filtered total that does not announce itself is more misleading than an unfiltered one -
// an operator reading "3 generations" has no way to know whether that is everybody or
// everybody-except-us. So this is never a quiet default: the control is always visible, the
// current scope is always stated in words, and the honest limit is stated with it.
//
// It also reports how many accounts carry the mark, because that is the difference between a
// filter that is working and one nobody has configured. Zero marked accounts under an external
// scope means the page is showing everything, and saying so is the whole point.

import { ADMIN_ACTIVITY_SCOPES, type AdminActivityScope } from './types';

const LABEL: Record<AdminActivityScope, string> = {
  external: 'Other people',
  internal: 'My own accounts',
  all: 'Everything',
};

const EXPLAIN: Record<AdminActivityScope, string> = {
  external:
    'Accounts marked internal — your development, testing and demo accounts — are excluded, '
    + 'along with the browsers they have signed in from.',
  internal:
    'ONLY accounts marked internal. This is the debugging view: it is the exact complement of '
    + '“Other people”, so the two always add up to “Everything”.',
  all: 'No filter at all — the numbers these sections reported before the internal mark existed.',
};

export function ScopePicker({
  scope,
  onScope,
  internalAccounts,
  /** Set on sections whose funnel-derived figures carry the browser-level caveat. The AI, render
   *  and account ledgers are all keyed on an account and filter exactly; the funnel is not. */
  funnelCaveat = false,
}: {
  scope: AdminActivityScope;
  onScope: (next: AdminActivityScope) => void;
  internalAccounts: number;
  funnelCaveat?: boolean;
}) {
  return (
    <div className="admin-scope" data-testid="admin-scope">
      <div className="admin-row">
        <span className="admin-field-label">Counting</span>
        {ADMIN_ACTIVITY_SCOPES.map((option) => (
          <button
            key={option}
            type="button"
            className={option === scope ? 'primary' : ''}
            data-testid={`admin-scope-${option}`}
            onClick={() => onScope(option)}
          >
            {LABEL[option]}
          </button>
        ))}
      </div>
      <p className="admin-muted">
        {EXPLAIN[scope]}{' '}
        {internalAccounts === 0 ? (
          <strong>
            No account is marked internal yet, so this filter is currently doing nothing — every
            scope shows the same numbers. Mark an account on its Users page.
          </strong>
        ) : (
          <>
            {internalAccounts} account{internalAccounts === 1 ? ' is' : 's are'} marked internal.
          </>
        )}
        {funnelCaveat && scope !== 'all' && (
          <>
            {' '}
            <strong>Visits and creates are an upper bound.</strong> Those rows identify a BROWSER,
            not an account, so a browser is only recognised as ours once it has signed in as an
            internal account at least once. Signed-out development traffic is indistinguishable
            from a stranger&apos;s and stays counted as external.
          </>
        )}
      </p>
    </div>
  );
}
