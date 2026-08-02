// The landing section: is anyone using this, is it working, and what is it costing.
//
// THE ONE RULE THE LAYOUT ENFORCES: a number's SHAPE is never left to the reader. Every row
// says what it counts - events, distinct browsers, accounts, money, a duration - in its own
// label column, and the four kinds never share a tile. A dashboard that renders "412 visits"
// and "38 people" as two identical big numbers is inviting somebody to add them.
//
// It also leads with what is WRONG rather than with what is big. An operator opening this
// page during an incident should not have to read past three healthy tiles to find the kill
// switch that is on, so the attention block is above the numbers and is absent entirely when
// there is nothing to say.
//
// Comparisons are ABSOLUTE differences against the same elapsed span one period earlier, not
// percentages: at this instance's volume a move from 2 to 3 is a 50% rise, and a page that
// says so is a page that cries wolf every morning.

import { useMemo, useState } from 'react';
import type {
  AdminActivityScope,
  AdminLedgerId,
  AdminOverviewMetrics,
  AdminOverviewResponse,
  AdminOverviewWindow,
  AdminSessionResponse,
  AdminSystemState,
} from '../types';
import { FEATURE_LABELS } from '../../entitlements/contract';
import { ScopePicker } from '../ScopePicker';
import { Pill, SectionHeader, formatUsd, useAdminData } from '../ui';

const ROLE_MEANING: Record<AdminSessionResponse['role'], string> = {
  owner: 'Full access, including granting and removing admin roles.',
  admin: "Can change any user's access, plans and system controls.",
  support: 'Read-only across the admin surface.',
};

type MetricKey = keyof AdminOverviewMetrics;
type Unit = 'events' | 'browsers' | 'accounts' | 'usd' | 'duration';

interface MetricRow {
  key: MetricKey;
  label: string;
  /** What one unit of this number IS. Rendered next to the label, because the difference
   *  between an event count and a unique-user count is the difference between two readings
   *  of the same dashboard. */
  unit: Unit;
  /** Which ledger it is counted from. REQUIRED, so a new metric cannot quietly inherit
   *  somebody else's history: it decides whether this row's comparison is trustworthy over a
   *  given span, and the ledgers here were switched on months apart. */
  ledger: AdminLedgerId;
  hint?: string;
}

const UNIT_WORD: Record<Unit, string> = {
  events: 'events',
  browsers: 'distinct browsers',
  accounts: 'accounts',
  usd: 'US dollars',
  duration: 'median duration',
};

const HEADLINE: MetricRow[] = [
  { key: 'newAccounts', label: 'New accounts', unit: 'accounts', ledger: 'accounts', hint: 'Registered in the period. Includes invitations, at the moment they were sent.' },
  { key: 'activeVisitors', label: 'Active visitors', unit: 'browsers', ledger: 'funnel', hint: 'One person on a phone and a laptop is two.' },
  { key: 'activeAccounts', label: 'Active signed-in accounts', unit: 'accounts', ledger: 'funnel', hint: 'The subset that carried a signed-in session.' },
  { key: 'visits', label: 'Page loads', unit: 'events', ledger: 'funnel' },
];

const CREATION: MetricRow[] = [
  { key: 'graphicsCreated', label: 'Graphics created', unit: 'events', ledger: 'funnel', hint: 'One per create, through any door.' },
  { key: 'videosCreated', label: 'Video projects created', unit: 'events', ledger: 'funnel', hint: 'Only counted from the release that added the event.' },
  { key: 'creatingVisitors', label: 'Visitors who created something', unit: 'browsers', ledger: 'funnel' },
  { key: 'firstTimeCreators', label: 'First-time creators', unit: 'browsers', ledger: 'funnel', hint: 'No earlier create anywhere in the ledger.' },
  { key: 'exports', label: 'Exports completed', unit: 'events', ledger: 'funnel', hint: 'Recorded after the package reaches the disk, so every row is a success.' },
  { key: 'exportingVisitors', label: 'Visitors who exported', unit: 'browsers', ledger: 'funnel' },
];

/** The free core, measured. The editor has no login wall, so what gets made WITHOUT an account
 *  is a product answer in its own right rather than a footnote on the creation table. */
const ANONYMOUS: MetricRow[] = [
  { key: 'anonymousGraphics', label: 'Graphics created without an account', unit: 'events', ledger: 'funnel', hint: 'Made while signed out. Graphics only, matching the split above.' },
  { key: 'anonymousCreators', label: 'People creating without an account', unit: 'browsers', ledger: 'funnel', hint: 'Distinct browsers, so one prolific visitor is not read as adoption.' },
  { key: 'anonymousExports', label: 'Exports completed without an account', unit: 'events', ledger: 'funnel' },
  { key: 'anonymousGatewayCalls', label: 'AI calls with no account at all', unit: 'events', ledger: 'gateway', hint: 'Independent of whose key paid — an anonymous caller can be on ours. Hosted generation always has an account behind it, so it never appears here.' },
];

const AI: MetricRow[] = [
  { key: 'aiGenerations', label: 'Lite generations started', unit: 'events', ledger: 'lite' },
  { key: 'aiSuccesses', label: 'Lite generations usable', unit: 'events', ledger: 'lite' },
  { key: 'aiFailures', label: 'Lite generations failed', unit: 'events', ledger: 'lite', hint: 'Broke. Started, usable, failed and declined do not sum: one still running is none of them.' },
  { key: 'aiDeclined', label: 'Lite briefs declined as out of scope', unit: 'events', ledger: 'lite', hint: 'The guardrail firing, not failing — multi-graphic, advanced state machine, too complex. A rising number means people want something Lite cannot do yet.' },
  { key: 'aiUsers', label: 'Accounts using Lite', unit: 'accounts', ledger: 'lite' },
  { key: 'aiCostUsd', label: 'Lite spend (ours)', unit: 'usd', ledger: 'lite', hint: 'Only generations that reached a provider: one that never chose a route still carries the reservation ceiling, not a real charge.' },
  { key: 'gatewayManaged', label: 'Gateway calls on our key', unit: 'events', ledger: 'gateway' },
  { key: 'gatewayManagedCostUsd', label: 'Gateway spend (ours)', unit: 'usd', ledger: 'gateway' },
  { key: 'gatewayByo', label: 'Gateway calls on a user key', unit: 'events', ledger: 'gateway', hint: "The user's own money. Never added to the figures above." },
  { key: 'gatewayFailures', label: 'Gateway calls that failed', unit: 'events', ledger: 'gateway' },
];

const RENDERS: MetricRow[] = [
  { key: 'rendersStarted', label: 'Cloud renders submitted', unit: 'events', ledger: 'render' },
  { key: 'rendersDelivered', label: 'Cloud renders delivered', unit: 'events', ledger: 'render', hint: 'Reached completion, whether or not the file still exists. Counted by submission time, so one finishing after the window is not here.' },
  { key: 'rendersFailed', label: 'Cloud renders failed', unit: 'events', ledger: 'render', hint: 'Actually failed — not cancelled, and not an expired output from a render that worked.' },
  { key: 'renderMedianMs', label: 'Render time', unit: 'duration', ledger: 'render', hint: 'Only renders whose output is still live: expiring a job overwrites the timestamp this is measured from.' },
];

const MIX_TITLES: Record<string, string> = {
  'creation-door': 'How graphics were created',
  'export-target': 'Export targets used',
  referrer: 'Where visitors came from',
  'ai-failure': 'Why Lite generations were rejected',
  'gateway-failure': 'Why gateway calls failed',
  'render-format': 'Render formats requested',
};

const PERIOD_LABEL: Record<string, string> = { day: 'Today', week: 'This week', month: 'This month' };

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 90_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

function formatValue(value: number | null, unit: Unit): string {
  if (value === null) return '-';
  if (unit === 'usd') return formatUsd(value);
  if (unit === 'duration') return formatDuration(value);
  return value.toLocaleString('en-US');
}

function clockTime(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

function localDate(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** The change against the elapsed-matched previous span. Deliberately not a percentage, and
 *  deliberately silent rather than "0" when there is no comparable span to measure against. */
function Delta({
  current,
  previous,
  unit,
  partial,
}: {
  current: number | null;
  previous: number | null;
  unit: Unit;
  partial: boolean;
}) {
  // The comparison span predates THIS METRIC'S ledger, so "last period" is partly a stretch of
  // time it was not recording. Reporting the difference would show growth that is really just
  // the start of counting. Other rows in the same column keep their comparison.
  if (partial) return <span className="admin-delta admin-delta-none">partial history</span>;
  if (current === null || previous === null) return <span className="admin-delta admin-delta-none">no comparison</span>;
  const change = current - previous;
  if (change === 0) return <span className="admin-delta admin-delta-flat">no change</span>;
  const sign = change > 0 ? '+' : '−';
  const magnitude = formatValue(Math.abs(change), unit === 'duration' ? 'duration' : unit);
  return (
    <span className={change > 0 ? 'admin-delta admin-delta-up' : 'admin-delta admin-delta-down'}>
      {sign}
      {magnitude}
    </span>
  );
}

function MetricTable({
  title,
  rows,
  windows,
  note,
}: {
  title: string;
  rows: MetricRow[];
  windows: AdminOverviewWindow[];
  note?: string;
}) {
  return (
    <section className="admin-block">
      <h3>{title}</h3>
      {note ? <p className="admin-muted admin-block-note">{note}</p> : null}
      <table className="admin-table admin-metrics">
        <thead>
          <tr>
            <th scope="col">Measure</th>
            {windows.map((window) => (
              <th key={window.id} scope="col" className="admin-num">
                {PERIOD_LABEL[window.id] ?? window.id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} data-metric={row.key}>
              <th scope="row">
                {row.label}
                <span className="admin-muted">
                  {UNIT_WORD[row.unit]}
                  {row.hint ? ` — ${row.hint}` : ''}
                </span>
              </th>
              {windows.map((window) => {
                const value = window.metrics[row.key];
                const previous = window.previous ? window.previous[row.key] : null;
                return (
                  <td key={window.id} className="admin-num">
                    {formatValue(value, row.unit)}
                    <Delta
                      current={value}
                      previous={previous}
                      unit={row.unit}
                      partial={window.previousPartialLedgers.indexOf(row.ledger) !== -1}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Bars({ title, entries }: { title: string; entries: { key: string; count: number }[] }) {
  const top = Math.max(1, ...entries.map((entry) => entry.count));
  return (
    <section className="admin-block">
      <h3>{title}</h3>
      <ul className="admin-bars">
        {entries.map((entry) => (
          <li key={entry.key}>
            <span className="admin-bar-label">{entry.key}</span>
            <span className="admin-bar-track">
              <span className="admin-bar-fill" style={{ width: `${(entry.count / top) * 100}%` }} />
            </span>
            <span className="admin-bar-value">{entry.count.toLocaleString('en-US')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OverviewSection({
  session,
  onNavigate,
}: {
  session: AdminSessionResponse;
  onNavigate?: (sectionId: string) => void;
}) {
  const [scope, setScope] = useState<AdminActivityScope>('external');
  const overview = useAdminData<AdminOverviewResponse>(`overview?scope=${scope}`);
  const system = useAdminData<AdminSystemState>('system');

  const data = overview.data;
  const windows = data?.windows ?? [];
  const month = windows.filter((window) => window.id === 'month')[0] ?? null;
  const state = data?.state ?? null;
  const disabled = system.data?.disabledFeatures ?? [];
  const notice = system.data?.maintenanceNotice ?? null;

  const mixByBucket = useMemo(() => {
    const grouped = new Map<string, { key: string; count: number }[]>();
    for (const entry of data?.mix ?? []) {
      const list = grouped.get(entry.bucket) ?? [];
      list.push({ key: entry.key, count: entry.count });
      grouped.set(entry.bucket, list);
    }
    return grouped;
  }, [data]);

  // What is WRONG, gathered before anything is rendered so the block can be absent rather
  // than present-and-empty. Each line is something an operator can act on today.
  const problems: { text: string; go?: string; tone: 'warn' | 'danger' }[] = [];
  if (disabled.length > 0) {
    problems.push({
      tone: 'danger',
      text: `Switched off instance-wide: ${disabled.map((key) => FEATURE_LABELS[key]).join(', ')}. This overrides every plan and every manual override.`,
      go: 'system',
    });
  }
  if (notice) {
    problems.push({
      tone: 'warn',
      text: `A ${notice.level === 'warning' ? 'warning' : 'notice'} is published to every visitor: “${notice.message}”`,
      go: 'system',
    });
  }
  if (data?.fleet && data.fleet.ceilingUsd > 0 && data.fleet.spendLast24hUsd >= data.fleet.ceilingUsd * 0.8) {
    problems.push({
      tone: 'danger',
      text: `AI spend in the last 24 hours is ${formatUsd(data.fleet.spendLast24hUsd)} against a ${formatUsd(data.fleet.ceilingUsd)} ceiling. New generations are refused once it is reached.`,
      go: 'usage',
    });
  }
  if (state && state.rendersOverdue > 0) {
    problems.push({
      tone: 'danger',
      text: `${state.rendersOverdue} cloud render${state.rendersOverdue === 1 ? ' is' : 's are'} past their deadline and still not finished. The sweep has not caught them.`,
    });
  }
  if (state && state.suspendedAccounts > 0) {
    problems.push({ tone: 'warn', text: `${state.suspendedAccounts} account${state.suspendedAccounts === 1 ? ' is' : 's are'} suspended.`, go: 'users' });
  }
  if (state && state.grantsExpiringSoon > 0) {
    problems.push({
      tone: 'warn',
      text: `${state.grantsExpiringSoon} temporary grant${state.grantsExpiringSoon === 1 ? '' : 's'} expire within seven days. Access narrows when they do.`,
      go: 'users',
    });
  }

  return (
    <section className="admin-section admin-section-wide">
      <SectionHeader title="Overview" />

      <ScopePicker
        scope={scope}
        onScope={setScope}
        internalAccounts={data?.internalAccounts ?? 0}
        funnelCaveat
      />

      <p className="admin-lede">
        You are signed in as <strong>{session.email || 'an account with no email on file'}</strong> with the{' '}
        <strong>{session.role}</strong> role. {ROLE_MEANING[session.role]}
      </p>

      {problems.length > 0 ? (
        <ul className="admin-attention">
          {problems.map((problem) => (
            <li key={problem.text} className={problem.tone === 'danger' ? 'admin-attention-danger' : ''}>
              <span>{problem.text}</span>
              {problem.go && onNavigate ? (
                <button type="button" onClick={() => onNavigate(problem.go as string)}>
                  Open
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {overview.loading ? <p className="admin-muted">Loading…</p> : null}
      {overview.failed ? <p className="admin-problem">The overview could not be loaded.</p> : null}
      {data && !data.available ? (
        <p className="admin-problem">
          The overview aggregation is not installed on this database, so no activity can be counted. Apply migration
          0024 and reload. Nothing below is a zero — it is an absence.
        </p>
      ) : null}

      {data && data.available ? (
        <>
          <p className="admin-note admin-boundary">
            Periods are local to <strong>{data.timezone}</strong>: today began at 00:00, the week on Monday, the month
            on the 1st. Each window ends at {clockTime(data.generatedAt, data.timezone)} — the moment this page was
            generated. A change is measured against <strong>the same elapsed span one period earlier</strong>, so a
            month three days old is compared with the first three days of the month before it.
          </p>

          <MetricTable title="People" rows={HEADLINE} windows={windows} />
          <MetricTable title="What people made" rows={CREATION} windows={windows} />
          <MetricTable
            title="Made without an account"
            rows={ANONYMOUS}
            windows={windows}
            note="The editor has no login wall, so this is a subset of the table above rather than a separate audience: how much of the product's value reaches people who never sign up. A zero here alongside real creates means everyone who made something was signed in."
          />

          {state ? (
            <section className="admin-block">
              <h3>Adoption</h3>
              <dl className="admin-stats">
                <div>
                  <dt>Accounts, all time</dt>
                  <dd>{state.totalAccounts.toLocaleString('en-US')}</dd>
                </div>
                <div>
                  <dt>Never created anything</dt>
                  <dd>
                    {state.accountsNeverCreated.toLocaleString('en-US')}
                    <span className="admin-muted"> of {state.totalAccounts.toLocaleString('en-US')}</span>
                  </dd>
                </div>
                <div>
                  <dt>First-time creators, this month</dt>
                  <dd>{month ? month.metrics.firstTimeCreators.toLocaleString('en-US') : '-'}</dd>
                </div>
                <div>
                  <dt>Returning creators, this month</dt>
                  <dd>
                    {month
                      ? Math.max(0, month.metrics.creatingVisitors - month.metrics.firstTimeCreators).toLocaleString('en-US')
                      : '-'}
                  </dd>
                </div>
                <div>
                  <dt>Created while signed out</dt>
                  <dd>
                    {month ? month.metrics.anonymousCreates.toLocaleString('en-US') : '-'}
                    <span className="admin-muted">
                      {' '}
                      of {month ? (month.metrics.anonymousCreates + month.metrics.signedInCreates).toLocaleString('en-US') : '-'}
                    </span>
                  </dd>
                </div>
              </dl>
              <p className="admin-muted">
                “Never created anything” counts creates <em>attributed</em> to an account, and attribution needs the
                person to have been signed in at the time. Somebody who built a graphic before registering is counted
                here, so read it as an upper bound rather than a fact. The editor needs no account, which is the whole
                reason that gap exists.
              </p>
            </section>
          ) : null}

          <MetricTable
            title="AI"
            rows={AI}
            windows={windows}
            note="Two ledgers, kept apart on purpose: Lite is the hosted free tier and every dollar of it is ours, while the gateway is split by whose key paid. Only the “ours” rows are money this project spends."
          />

          {data.fleet && data.fleet.ceilingUsd > 0 ? (
            <section className="admin-block">
              <h3>Daily AI budget</h3>
              <p className="admin-muted admin-block-note">
                A rolling 24 hours over the Lite ledger — measured exactly as the reservation function measures it, not
                as the calendar day above.
              </p>
              <span className="admin-meter">
                <span
                  className={
                    data.fleet.spendLast24hUsd >= data.fleet.ceilingUsd * 0.8
                      ? 'admin-meter-fill admin-meter-hot'
                      : 'admin-meter-fill'
                  }
                  style={{ width: `${Math.min(100, (data.fleet.spendLast24hUsd / data.fleet.ceilingUsd) * 100)}%` }}
                />
              </span>
              <p className="admin-muted">
                {formatUsd(data.fleet.spendLast24hUsd)} of {formatUsd(data.fleet.ceilingUsd)}. Generations are refused
                once the ceiling is reached.
              </p>
            </section>
          ) : null}

          <MetricTable title="Cloud rendering" rows={RENDERS} windows={windows} />

          {state ? (
            <section className="admin-block">
              <h3>Right now</h3>
              <dl className="admin-stats">
              <div>
                <dt>Renders in flight</dt>
                <dd>{state.rendersInFlight.toLocaleString('en-US')}</dd>
              </div>
              <div>
                <dt>Renders overdue</dt>
                <dd>{state.rendersOverdue.toLocaleString('en-US')}</dd>
              </div>
              <div>
                <dt>Active grants</dt>
                <dd>{state.activeGrants.toLocaleString('en-US')}</dd>
              </div>
              <div>
                <dt>Grants expiring in 7 days</dt>
                <dd>{state.grantsExpiringSoon.toLocaleString('en-US')}</dd>
              </div>
              <div>
                <dt>Suspended accounts</dt>
                <dd>{state.suspendedAccounts.toLocaleString('en-US')}</dd>
              </div>
              </dl>
            </section>
          ) : null}

          <div className="admin-two-up admin-mix">
            {[...mixByBucket.entries()].map(([bucket, entries]) => (
              <Bars key={bucket} title={MIX_TITLES[bucket] ?? bucket} entries={entries} />
            ))}
          </div>
          {mixByBucket.size > 0 ? (
            <p className="admin-muted">Distributions are over this month to date.</p>
          ) : null}

          {state ? (
            <p className="admin-note">
              History starts where each ledger does, and they were switched on months apart: accounts{' '}
              {state.accountsSince ? localDate(state.accountsSince, data.timezone) : 'never recorded'}, activity{' '}
              {state.funnelSince ? localDate(state.funnelSince, data.timezone) : 'never recorded'}, AI generations{' '}
              {state.generationsSince ? localDate(state.generationsSince, data.timezone) : 'never recorded'}, AI gateway{' '}
              {state.gatewaySince ? localDate(state.gatewaySince, data.timezone) : 'never recorded'}, cloud renders{' '}
              {state.rendersSince ? localDate(state.rendersSince, data.timezone) : 'never recorded'}. A period reaching
              back further than one of those reads as zero because nothing was counting yet, which is why a row whose
              own ledger is too young shows “partial history” instead of a change — and why the rows either side of it
              keep theirs.
            </p>
          ) : null}

          <section className="admin-block">
            <h3>Not tracked</h3>
            <ul className="admin-notracked">
              {data.notTracked.map((line) => (
                <li key={line}>
                  <Pill tone="muted">no data</Pill> {line}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      <p className="admin-note">
        Every action taken here is recorded with your account, the time and a summary. The record cannot be edited or
        deleted from this page.
      </p>
    </section>
  );
}
