// The landing section: what is happening right now, and who you are while you change it.
//
// It leads with identity on purpose. An operator about to suspend an account should be able
// to confirm which account they are acting AS before they act, and that confirmation is worth
// the top of the page rather than a corner of the topbar.

import type { AdminSessionResponse, AdminSystemState, AdminUsageOverview } from '../types';
import { FEATURE_LABELS } from '../../entitlements/contract';
import { Pill, SectionHeader, formatUsd, useAdminData } from '../ui';

const ROLE_MEANING: Record<AdminSessionResponse['role'], string> = {
  owner: 'Full access, including granting and removing admin roles.',
  admin: "Can change any user's access, plans and system controls.",
  support: 'Read-only across the admin surface.',
};

export function OverviewSection({ session }: { session: AdminSessionResponse }) {
  const usage = useAdminData<AdminUsageOverview>('usage?days=7');
  const system = useAdminData<AdminSystemState>('system');

  const spent = usage.data?.fleetSpendTodayUsd ?? 0;
  const ceiling = usage.data?.fleetSpendCeilingUsd ?? 0;
  const disabled = system.data?.disabledFeatures ?? [];
  const notice = system.data?.maintenanceNotice ?? null;

  return (
    <section className="admin-section admin-section-wide">
      <SectionHeader title="Overview" />

      <p className="admin-lede">
        You are signed in as <strong>{session.email || 'an account with no email on file'}</strong> with the{' '}
        <strong>{session.role}</strong> role. {ROLE_MEANING[session.role]}
      </p>

      {disabled.length > 0 ? (
        <p className="admin-problem">
          Switched off instance-wide: {disabled.map((key) => FEATURE_LABELS[key]).join(', ')}. This overrides every
          plan and every manual override.
        </p>
      ) : null}

      {notice ? (
        <p className="admin-problem">
          A {notice.level === 'warning' ? 'warning' : 'notice'} is published to every visitor: “{notice.message}”
        </p>
      ) : null}

      <dl className="admin-stats">
        <div>
          <dt>AI spend today</dt>
          <dd>
            {formatUsd(spent)}
            {ceiling > 0 ? <span className="admin-muted"> of {formatUsd(ceiling)}</span> : null}
          </dd>
        </div>
        <div>
          <dt>Generations (7 d)</dt>
          <dd>{usage.data?.totals.generations ?? '-'}</dd>
        </div>
        <div>
          <dt>Renders (7 d)</dt>
          <dd>{usage.data?.totals.renderJobs ?? '-'}</dd>
        </div>
        <div>
          <dt>Accounts hitting a limit</dt>
          <dd>{usage.data?.pinched.length ?? '-'}</dd>
        </div>
      </dl>

      {usage.data && usage.data.pinched.length > 0 ? (
        <section className="admin-block">
          <h3>Being refused right now</h3>
          <ul className="admin-idlist">
            {usage.data.pinched.slice(0, 5).map((entry) => (
              <li key={entry.userId}>
                <span>{entry.email || entry.userId}</span>
                <Pill tone="warn">{entry.refusals} refusals</Pill>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="admin-note">
        Every action taken here is recorded with your account, the time and a summary. The record cannot be edited
        or deleted from this page.
      </p>
    </section>
  );
}
