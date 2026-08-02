// Beta feedback: the satisfaction picture, then the inbox.
//
// This is the one admin section that shows what a PERSON wrote. Everything else on this surface
// counts rows the product wrote about itself, and the separation is deliberate all the way down
// to the schema (`user_feedback`, migration 0028) so the generation ledger and the overview
// aggregates keep their promise that no free text can reach them.
//
// IT IS EVIDENCE, NOT A VERDICT, and the section says so above the breakdowns. A model or a
// chassis attracting complaints is a reason to go and look; only a NoaCG benchmark can say a
// model is worse (docs/AI_LITE_PROMOTION.md), and the Models section still refuses to rank.
// There is no score here, no league table, and nothing that reads as a recommendation - the
// per-model split answers "where do I look first", which is a different question from "which
// is best".
//
// Ordering follows the same rule everywhere: MOST NEGATIVE FIRST. This is an inbox, and three
// complaints must not be buried under thirty compliments.

import { useMemo, useState } from 'react';
import { FEEDBACK_REASON_LABELS } from '../../feedback/contract';
import type {
  AdminActivityScope,
  AdminFeedbackBreakdown,
  AdminFeedbackItem,
  AdminFeedbackOverview,
} from '../types';
import { ScopePicker } from '../ScopePicker';
import { adminPost } from '../client';
import { AsyncState, Pill, SectionHeader, formatDateTime, relative, useAdminData } from '../ui';

type StatusFilter = 'unresolved' | 'new' | 'all';
type KindFilter = 'all' | 'generation' | 'beta';
type SentimentFilter = 'all' | 'negative' | 'positive';

function Satisfaction({ totals }: { totals: AdminFeedbackOverview['totals'] }) {
  const rated = totals.positive + totals.negative;
  // No percentage below a handful of ratings. At n=3 one thumb moves the figure by 33 points,
  // and a dashboard that says "67% satisfied" off three clicks invites a decision nobody has
  // the evidence for - the same reason the overview reports absolute changes, not percentages.
  const share = rated >= 8 ? Math.round((totals.positive / rated) * 100) : null;
  // The same `.admin-stats` grid Usage and Output quality already use - a fourth kind of number
  // tile on one surface would be three too many.
  return (
    <dl className="admin-stats" data-testid="feedback-satisfaction">
      <div>
        <dt>Positive</dt>
        <dd>
          {share === null ? '—' : `${share}%`}
          {share === null && (
            <span className="admin-muted"> {rated} rating{rated === 1 ? '' : 's'} — too few to put a number on</span>
          )}
        </dd>
      </div>
      <div>
        <dt>👍 / 👎</dt>
        <dd>{totals.positive} / {totals.negative}</dd>
      </div>
      <div>
        <dt>Still open</dt>
        <dd>{totals.unresolved}</dd>
      </div>
      <div>
        <dt>Wrote something</dt>
        <dd>{totals.withMessage}</dd>
      </div>
      <div>
        <dt>Ratings / beta notes</dt>
        <dd>{totals.generationRatings} / {totals.betaNotes}</dd>
      </div>
    </dl>
  );
}

function Breakdown({ title, rows, empty }: { title: string; rows: AdminFeedbackBreakdown[]; empty: string }) {
  if (rows.length === 0) return null;
  return (
    <section className="admin-block">
      <h3>{title}</h3>
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">{empty}</th>
            <th scope="col" className="admin-num">👎</th>
            <th scope="col" className="admin-num">👍</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row"><span className="admin-mono">{row.key}</span></th>
              <td className="admin-num">{row.negative || '—'}</td>
              <td className="admin-num">{row.positive || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Item({ item, canTriage, onChanged }: {
  item: AdminFeedbackItem;
  canTriage: boolean;
  onChanged: () => void;
}) {
  const [note, setNote] = useState(item.adminNote);
  const [busy, setBusy] = useState(false);

  const send = async (body: { status?: string; note?: string }) => {
    setBusy(true);
    try {
      await adminPost('feedback', { id: item.id, ...body });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  // Everything needed to go and reproduce it, and nothing more. The prompt, the brief and any
  // uploaded artwork are not here and cannot be - they never reach the table.
  const context = [
    item.tier && `tier ${item.tier}`,
    item.model && `model ${item.model}`,
    item.variantId && `chassis ${item.variantId}`,
    item.intentKind && `intent ${item.intentKind}`,
    item.promptVersion && `prompt ${item.promptVersion}`,
    item.area && `in ${item.area}`,
  ].filter(Boolean) as string[];

  return (
    <article className={`admin-feedback-item ${item.status}`} data-testid="feedback-item">
      <header className="admin-row">
        <Pill tone={item.sentiment === 'positive' ? 'ok' : 'danger'}>
          {item.sentiment === 'positive' ? '👍 positive' : '👎 negative'}
        </Pill>
        <Pill tone="muted">{item.kind === 'generation' ? 'generation' : 'beta note'}</Pill>
        {item.status !== 'new' && <Pill tone={item.status === 'resolved' ? 'ok' : 'warn'}>{item.status}</Pill>}
        {item.internal && <Pill tone="muted">internal account</Pill>}
        <span className="spacer" />
        <span className="admin-muted" title={formatDateTime(item.createdAt)}>{relative(item.createdAt)}</span>
      </header>

      {item.reasons.length > 0 && (
        <p className="admin-feedback-reasons">
          {item.reasons.map((reason) => (
            <Pill key={reason} tone="warn">{FEEDBACK_REASON_LABELS[reason] ?? reason}</Pill>
          ))}
        </p>
      )}

      {item.message ? (
        // The person's own words, rendered as text. React escapes it; nothing here interpolates
        // markup, and the column is length-bounded at the database.
        <blockquote className="admin-feedback-message">{item.message}</blockquote>
      ) : (
        <p className="admin-muted">Rated without explaining — which is the flow working as intended.</p>
      )}

      <p className="admin-muted admin-feedback-context">
        {item.email || (item.userId ? item.userId : 'no account')}
        {item.visitorId && !item.userId && <> · browser <span className="admin-mono">{item.visitorId.slice(0, 8)}</span></>}
        {context.length > 0 && <> · {context.join(' · ')}</>}
        {item.generationId && <> · generation <span className="admin-mono">{item.generationId.slice(0, 8)}</span></>}
      </p>

      {canTriage && (
        <div className="admin-row">
          <button type="button" disabled={busy || item.status === 'reviewed'} onClick={() => void send({ status: 'reviewed' })}>
            Mark reviewed
          </button>
          <button type="button" disabled={busy || item.status === 'resolved'} onClick={() => void send({ status: 'resolved' })}>
            Mark resolved
          </button>
          {item.status !== 'new' && (
            <button type="button" disabled={busy} onClick={() => void send({ status: 'new' })}>
              Reopen
            </button>
          )}
          <input
            type="text"
            value={note}
            placeholder="Internal note (only you see this)"
            onChange={(event) => setNote(event.target.value)}
          />
          <button type="button" disabled={busy || note === item.adminNote} onClick={() => void send({ note })}>
            Save note
          </button>
        </div>
      )}
      {!canTriage && item.adminNote && <p className="admin-muted">Note: {item.adminNote}</p>}
    </article>
  );
}

export function FeedbackSection({ canTriage }: { canTriage: boolean }) {
  const [scope, setScope] = useState<AdminActivityScope>('external');
  const [days, setDays] = useState(90);
  const [status, setStatus] = useState<StatusFilter>('unresolved');
  const [kind, setKind] = useState<KindFilter>('all');
  const [sentiment, setSentiment] = useState<SentimentFilter>('all');

  const state = useAdminData<AdminFeedbackOverview>(`feedback?scope=${scope}&days=${days}`);
  const data = state.data;

  const items = useMemo(() => {
    const all = data?.items ?? [];
    return all.filter((item) => {
      if (status === 'unresolved' && item.status === 'resolved') return false;
      if (status === 'new' && item.status !== 'new') return false;
      if (kind !== 'all' && item.kind !== kind) return false;
      if (sentiment !== 'all' && item.sentiment !== sentiment) return false;
      return true;
    });
  }, [data, status, kind, sentiment]);

  return (
    <section className="admin-section admin-section-wide">
      <SectionHeader
        title="Feedback"
        lede="What people said about the beta, and how the generated graphics landed."
      />

      <ScopePicker scope={scope} onScope={setScope} internalAccounts={data?.internalAccounts ?? 0} />

      <p className="admin-note">
        <strong>This is evidence, not a verdict.</strong> A model or a design attracting complaints is a
        reason to go and look at it — never a reason to change a route. Quality on this project is
        established by the NoaCG benchmarks and by nothing else, and nothing here is a score.
      </p>

      <div className="admin-row">
        {[30, 90, 365].map((option) => (
          <button key={option} type="button" className={option === days ? 'primary' : ''} onClick={() => setDays(option)}>
            {option === 365 ? 'Last year' : `Last ${option} days`}
          </button>
        ))}
      </div>

      {data && <Satisfaction totals={data.totals} />}

      {data && data.truncated && (
        <p className="admin-problem">
          More feedback than one page can hold, so every figure above is a floor rather than a total.
        </p>
      )}

      {data && data.reasons.length > 0 && (
        <section className="admin-block">
          <h3>What people say is wrong</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Reason</th>
                <th scope="col" className="admin-num">Times given</th>
              </tr>
            </thead>
            <tbody>
              {data.reasons.map((row) => (
                <tr key={row.reason}>
                  <th scope="row">{FEEDBACK_REASON_LABELS[row.reason] ?? row.reason}</th>
                  <td className="admin-num">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data && (
        <>
          <Breakdown title="By model" rows={data.byModel} empty="Route" />
          <Breakdown title="By tier" rows={data.byTier} empty="Tier" />
          <Breakdown title="By design" rows={data.byVariant} empty="Chassis" />
          <Breakdown title="By part of the app" rows={data.byArea} empty="Area" />
        </>
      )}

      <div className="admin-row">
        {(['unresolved', 'new', 'all'] as StatusFilter[]).map((option) => (
          <button key={option} type="button" className={option === status ? 'primary' : ''} onClick={() => setStatus(option)}>
            {option === 'unresolved' ? 'Still open' : option === 'new' ? 'Not yet read' : 'Everything'}
          </button>
        ))}
        <span className="spacer" />
        {(['all', 'negative', 'positive'] as SentimentFilter[]).map((option) => (
          <button key={option} type="button" className={option === sentiment ? 'primary' : ''} onClick={() => setSentiment(option)}>
            {option === 'all' ? 'Both' : option === 'negative' ? '👎 only' : '👍 only'}
          </button>
        ))}
        {(['all', 'generation', 'beta'] as KindFilter[]).map((option) => (
          <button key={option} type="button" className={option === kind ? 'primary' : ''} onClick={() => setKind(option)}>
            {option === 'all' ? 'Both kinds' : option === 'generation' ? 'Ratings' : 'Beta notes'}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <AsyncState state={state} empty="No feedback matches this filter." />
      ) : (
        <div className="admin-feedback-list">
          {items.map((item) => (
            <Item key={item.id} item={item} canTriage={canTriage} onChanged={state.reload} />
          ))}
        </div>
      )}
    </section>
  );
}
