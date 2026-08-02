// What the AI actually cost, and who is being refused.
//
// The bar chart is deliberately CSS rather than a charting library: the admin bundle should
// not carry one, and a day-by-day bar is the one shape this page needs. Every number is read
// from the ledgers the reservation path already writes - nothing here is an estimate.

import { useState } from 'react';
import type { AdminActivityScope, AdminUsageOverview } from '../types';
import { ScopePicker } from '../ScopePicker';
import { AsyncState, SectionHeader, formatDate, formatUsd, relative, useAdminData } from '../ui';

export function UsageSection() {
  const [days, setDays] = useState(30);
  const [scope, setScope] = useState<AdminActivityScope>('external');
  const usage = useAdminData<AdminUsageOverview>(`usage?days=${days}&scope=${scope}`);

  if (!usage.data) {
    return (
      <section className="admin-section admin-section-wide">
        <SectionHeader title="Usage and cost" />
        {/* The scope control stays reachable while the numbers are not: switching scope is what
            RELOADS them, so hiding it behind a loaded response would strand a failed request in
            whichever scope produced it. */}
        <ScopePicker scope={scope} onScope={setScope} internalAccounts={0} />
        <AsyncState state={usage} />
      </section>
    );
  }

  const data = usage.data;
  const peak = Math.max(1, ...data.days.map((day) => day.generations));
  const ceiling = data.fleetSpendCeilingUsd;
  const spentToday = data.fleetSpendTodayUsd;
  const spentPercent = ceiling > 0 ? Math.min(100, (spentToday / ceiling) * 100) : 0;

  return (
    <section className="admin-section admin-section-wide">
      <SectionHeader
        title="Usage and cost"
        lede="Read from the generation ledger. Nothing here is sampled or estimated. Cost counts only generations that reached a provider, so it matches the overview rather than the reservation ceilings below."
        actions={
          <select value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Window">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        }
      />

      <ScopePicker scope={scope} onScope={setScope} internalAccounts={data.internalAccounts} />

      <dl className="admin-stats">
        <div>
          <dt>Generations</dt>
          <dd>{data.totals.generations}</dd>
        </div>
        <div>
          <dt>Provider cost</dt>
          <dd>{formatUsd(data.totals.costUsd)}</dd>
        </div>
        <div>
          <dt>Gateway requests</dt>
          <dd>{data.totals.gatewayRequests}</dd>
        </div>
        <div>
          <dt>Render jobs</dt>
          <dd>{data.totals.renderJobs}</dd>
        </div>
      </dl>

      <section className="admin-block">
        <h3>Today against the daily ceiling</h3>
        <div className="admin-meter" role="img" aria-label={`${formatUsd(spentToday)} of ${formatUsd(ceiling)} spent today`}>
          <div
            className={spentPercent > 80 ? 'admin-meter-fill admin-meter-hot' : 'admin-meter-fill'}
            style={{ width: `${spentPercent}%` }}
          />
        </div>
        <p className="admin-muted">
          {formatUsd(spentToday)} of {formatUsd(ceiling)}. This is the ceiling the reservation path enforces, so
          reaching it refuses new generations rather than overspending. It counts every reservation at its cost
          ceiling, which is what admission compares against - so it reads higher than the spend above, on purpose.
        </p>
      </section>

      <section className="admin-block">
        <h3>By day</h3>
        {data.days.length === 0 ? (
          <p className="admin-muted">No generations in this window.</p>
        ) : (
          <ol className="admin-bars">
            {data.days.map((day) => (
              <li key={day.day}>
                <span className="admin-bar-label">{day.day.slice(5)}</span>
                <span className="admin-bar-track">
                  <span
                    className="admin-bar-fill"
                    style={{ width: `${(day.generations / peak) * 100}%` }}
                    title={`${day.generations} started, ${day.successes} delivered, ${day.failures} failed, ${day.declined} declined as out of scope`}
                  />
                </span>
                <span className="admin-bar-value">
                  {day.generations}
                  {day.failures > 0 ? <em className="admin-bar-fail"> · {day.failures} failed</em> : null}
                  {day.declined > 0 ? <em className="admin-muted"> · {day.declined} declined</em> : null}
                </span>
                <span className="admin-bar-cost">{formatUsd(day.costUsd)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="admin-two-up">
        <section className="admin-block">
          <h3>Why generations broke</h3>
          {data.failureReasons.length === 0 ? (
            <p className="admin-muted">Nothing broke in this window.</p>
          ) : (
            <table className="admin-table">
              <tbody>
                {data.failureReasons.map((entry) => (
                  <tr key={entry.reason}>
                    <td className="admin-mono">{entry.reason}</td>
                    <td className="admin-num">{entry.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3>Why briefs were declined</h3>
          <p className="admin-note">
            Out of scope for Lite, refused on purpose. Not failures - a rising count here is people asking for
            something Lite cannot do yet.
          </p>
          {data.declineReasons.length === 0 ? (
            <p className="admin-muted">Nothing was declined in this window.</p>
          ) : (
            <table className="admin-table">
              <tbody>
                {data.declineReasons.map((entry) => (
                  <tr key={entry.reason}>
                    <td className="admin-mono">{entry.reason}</td>
                    <td className="admin-num">{entry.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="admin-block">
          <h3>Accounts hitting a limit</h3>
          {data.pinched.length === 0 ? (
            <p className="admin-muted">Nobody is being limited.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="admin-num">Refusals</th>
                  <th>Last</th>
                </tr>
              </thead>
              <tbody>
                {data.pinched.map((entry) => (
                  <tr key={entry.userId}>
                    <td>{entry.email || entry.userId}</td>
                    <td className="admin-num">{entry.refusals}</td>
                    <td title={formatDate(entry.lastAt)}>{relative(entry.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </section>
  );
}
