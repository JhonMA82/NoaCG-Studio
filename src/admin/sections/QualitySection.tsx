// What people keep, what they throw away, and what they said was wrong with it.
//
// The usage section answers what the AI cost. This one answers whether it was any good - the
// question the admin page could not answer at all, even though the ledger has been recording it
// and the generator has been quietly acting on it (see api/_lib/admin/quality.ts).
//
// The keep-rate bar is CSS for the same reason the usage chart is: the admin bundle should not
// carry a charting library for two tables.

import { useState } from 'react';
import type { AdminActivityScope, AdminQualityOverview, AdminQualityVariant } from '../types';
import { ScopePicker } from '../ScopePicker';
import { AsyncState, Pill, SectionHeader, useAdminData } from '../ui';

/** How the enumerated reasons read to a person. The set is fixed by a CHECK constraint in
 *  0011_ai_lite_quality_feedback.sql - an unlisted value falls back to the raw string rather
 *  than being hidden, so a new reason shipped without a label is visible, not invisible. */
const REASON_LABELS: Record<string, string> = {
  regenerated: 'Asked for another try',
  closed: 'Closed without using it',
  'wrong-style': 'Wrong style',
  'hard-to-read': 'Hard to read',
  'missing-information': 'Missing information',
  'wrong-layout': 'Wrong layout',
  'poor-motion': 'Poor motion',
  other: 'Other',
};

function keepRate(entry: AdminQualityVariant): number {
  const total = entry.accepted + entry.discarded;
  return total === 0 ? 0 : entry.accepted / total;
}

function VariantTable({ rows, empty }: { rows: AdminQualityVariant[]; empty: string }) {
  if (rows.length === 0) return <p className="admin-muted">{empty}</p>;
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Design</th>
          <th>Intent</th>
          <th className="admin-num">Kept</th>
          <th className="admin-num">Discarded</th>
          <th>Keep rate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((entry) => {
          const rate = keepRate(entry);
          const percent = Math.round(rate * 100);
          return (
            <tr key={`${entry.variantId} ${entry.intentKind}`}>
              <td className="admin-mono">{entry.variantId}</td>
              <td>{entry.intentKind}</td>
              <td className="admin-num">{entry.accepted}</td>
              <td className="admin-num">{entry.discarded}</td>
              <td>
                <span className="admin-meter admin-meter-inline" role="img" aria-label={`${percent}% kept`}>
                  <span
                    className={rate < 0.5 ? 'admin-meter-fill admin-meter-hot' : 'admin-meter-fill'}
                    style={{ width: `${percent}%` }}
                  />
                </span>
                <span className="admin-meter-value">{percent}%</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function QualitySection() {
  const [days, setDays] = useState(30);
  const [scope, setScope] = useState<AdminActivityScope>('external');
  const quality = useAdminData<AdminQualityOverview>(`quality?days=${days}&scope=${scope}`);

  if (!quality.data) {
    return (
      <section className="admin-section admin-section-wide">
        <SectionHeader title="Output quality" />
        <ScopePicker scope={scope} onScope={setScope} internalAccounts={0} />
        <AsyncState state={quality} />
      </section>
    );
  }

  const data = quality.data;

  return (
    <section className="admin-section admin-section-wide">
      <SectionHeader
        title="Output quality"
        lede="Read from the generation ledger: ids, counts and enumerated reasons only, never a brief, a prompt or a generated graphic."
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
          <dt>With a resolved design</dt>
          <dd>{data.totals.withVariant}</dd>
        </div>
        <div>
          <dt>With a stated reason</dt>
          <dd>{data.totals.withFeedback}</dd>
        </div>
      </dl>

      {data.truncated ? (
        <p className="admin-problem">
          This window hit the read cap, so every number below is a floor rather than a total. Narrow the window.
        </p>
      ) : null}

      <section className="admin-block">
        <h3>What the generator is being nudged by</h3>
        <p className="admin-muted">
          These exact rows go into the trusted system prompt as a tie-breaker on every Lite generation - last{' '}
          {data.priorWindowDays} days, minimum {data.priorMinSamples} samples. They never override a brief or the
          diversity rules; they break a tie. If this table looks wrong, the generator is already leaning on it.
        </p>
        <VariantTable
          rows={data.priors}
          empty={`No design has reached ${data.priorMinSamples} samples yet, so the prompt is being fed nothing.`}
        />
        {/* THIS TABLE IGNORES THE SCOPE, and it has to. It is literally the rows the generator is
            being handed, so showing a filtered version would describe a prompt that does not
            exist. What the scope CAN honestly say is how much of that evidence is our own
            testing - reported here rather than acted on, because excluding internal accounts
            from `ai_lite_variant_quality()` would change how the product generates, which is a
            deliberate decision and not a dashboard setting. */}
        <p className="admin-note">
          <strong>Not filtered by the scope above</strong> — these are the rows the prompt actually
          receives, and a filtered copy would describe a prompt nobody is running.
          {data.priorRows === 0 ? (
            <> Nothing in this window is eligible to become a prior yet.</>
          ) : data.internalPriorRows === data.priorRows ? (
            <>
              {' '}
              <strong>
                Every one of the {data.priorRows} eligible outcomes in this window came from an
                internal account
              </strong>
              , so any prior that crosses the floor is the generator learning from our own testing
              rather than from anyone using the product.
            </>
          ) : (
            <>
              {' '}
              {data.internalPriorRows} of {data.priorRows} eligible outcomes in this window came from
              internal accounts.
            </>
          )}
        </p>
      </section>

      <div className="admin-two-up">
        <section className="admin-block">
          <h3>Emerging signal</h3>
          <p className="admin-muted">
            The same arithmetic without the sample floor, worst keep rate first. Below the threshold, so the generator
            is NOT acting on any of it - this is where a bad design shows up before it counts.
          </p>
          <VariantTable rows={data.emerging} empty="Nothing was kept or explicitly discarded in this window." />
        </section>

        <section className="admin-block">
          <h3>Why people threw one away</h3>
          {data.reasons.length === 0 ? (
            <p className="admin-muted">Nobody gave a reason in this window.</p>
          ) : (
            <table className="admin-table">
              <tbody>
                {data.reasons.map((entry) => (
                  <tr key={entry.reason}>
                    <td>
                      {REASON_LABELS[entry.reason] ?? <span className="admin-mono">{entry.reason}</span>}
                      {REASON_LABELS[entry.reason] ? null : (
                        <>
                          {' '}
                          <Pill tone="warn">unlabelled</Pill>
                        </>
                      )}
                    </td>
                    <td className="admin-num">{entry.count}</td>
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
