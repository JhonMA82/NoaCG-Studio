// Model eligibility: which routes COULD carry NoaCG-funded traffic, and which already do.
//
// The section states its own limit at the top rather than in a footnote, because the mistake
// it is built to prevent is a reasonable one: a table of models sorted by price, with green
// ticks against capabilities, reads like a shortlist. It is not one. Nothing on this page has
// generated a single token, and cheap-and-capable is not the same as good - only a NoaCG
// benchmark can say that (docs/AI_LITE_PROMOTION.md).
//
// So: no score column, no ordering by merit, no "recommended". The sort is approved first,
// then newly discovered, then the rest alphabetically - which is an operator's reading order,
// not a ranking.

import { useMemo, useState } from 'react';
import type { AdminModelRow, AdminModelsResponse, ModelBlockCode } from '../types';
import { AsyncState, Pill, SectionHeader, formatDate, useAdminData } from '../ui';

const BLOCK_LABEL: Record<ModelBlockCode, string> = {
  'not-funded-provider': 'not reachable on the funded provider',
  'over-price-ceiling': 'over the funded price ceiling',
  'price-unknown': 'no published price',
  'no-structured-output': 'no structured output',
  unavailable: 'not currently available',
};

type Filter = 'all' | 'new' | 'eligible' | 'approved';

const FILTER_LABEL: Record<Filter, string> = {
  all: 'Everything listed',
  new: 'Newly discovered',
  eligible: 'Eligible, not approved',
  approved: 'Approved routes',
};

function price(value: number | null): string {
  if (value === null) return '-';
  if (value === 0) return 'free';
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

function context(value: number | null): string {
  if (value === null) return '-';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return `${Math.round(value / 1000)}k`;
}

function Verdict({ row }: { row: AdminModelRow }) {
  if (row.approved) return <Pill tone="ok">approved</Pill>;
  if (row.verdict === 'eligible') return <Pill tone="muted">eligible</Pill>;
  return <Pill tone="warn">ineligible</Pill>;
}

function matches(row: AdminModelRow, filter: Filter): boolean {
  if (filter === 'new') return row.isNew;
  if (filter === 'eligible') return row.verdict === 'eligible';
  if (filter === 'approved') return row.approved;
  return true;
}

export function ModelsSection() {
  const state = useAdminData<AdminModelsResponse>('models');
  const [filter, setFilter] = useState<Filter>('new');

  const data = state.data;

  const rows = useMemo(() => {
    const all = data?.models ?? [];
    const rank = (row: AdminModelRow) => (row.approved ? 0 : row.isNew ? 1 : row.verdict === 'eligible' ? 2 : 3);
    return all
      .filter((row) => matches(row, filter))
      .slice()
      .sort((a, b) => rank(a) - rank(b) || a.model.localeCompare(b.model));
  }, [data, filter]);

  const counts = useMemo(() => {
    const all = data?.models ?? [];
    return {
      all: all.length,
      new: all.filter((row) => row.isNew).length,
      eligible: all.filter((row) => row.verdict === 'eligible').length,
      approved: all.filter((row) => row.approved).length,
    };
  }, [data]);

  return (
    <section className="admin-section admin-section-wide">
      <SectionHeader
        title="Models"
        lede="What the funded provider currently lists, checked against the rules a NoaCG-funded route has to meet."
      />

      <p className="admin-note">
        <strong>This is eligibility, not quality.</strong> Nothing here has been benchmarked, and a model that clears
        every check can still produce unusable graphics. Only a NoaCG benchmark run can establish quality, and
        promoting a route stays a deliberate act against a bench result. Opening this page costs nothing — it reads a
        public listing and never starts a generation.
      </p>

      {data && !data.discoveryFailed ? (
        <p className="admin-muted">
          A funded route must be served by <strong>{data.rule.provider}</strong>, support structured output, be
          currently available, and cost no more than {price(data.rule.inputPerMillion)} per million input tokens and{' '}
          {price(data.rule.outputPerMillion)} per million output tokens. “Newly discovered” means the provider first
          listed it within {data.rule.newModelDays} days and nothing here has approved it.
          {data.syncedAt ? ` Listing read ${formatDate(data.syncedAt)}.` : ''}
        </p>
      ) : null}

      {data && data.discoveryFailed ? (
        <p className="admin-problem">
          The provider listing could not be read, so there is nothing to check. This affects only this section — every
          other part of the admin surface reads this instance&apos;s own data and is unaffected.
        </p>
      ) : null}

      {data && data.missingApproved.length > 0 ? (
        <p className="admin-problem">
          Approved but no longer listed by the provider: {data.missingApproved.join(', ')}. The free tier fails closed
          on a route it cannot reach, so it stops serving rather than falling back to an unapproved model.
        </p>
      ) : null}

      {data && !data.discoveryFailed ? (
        <div className="admin-row">
          {(['new', 'eligible', 'approved', 'all'] as Filter[]).map((option) => (
            <button
              key={option}
              type="button"
              className={option === filter ? 'primary' : ''}
              onClick={() => setFilter(option)}
            >
              {FILTER_LABEL[option]} ({counts[option]})
            </button>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <AsyncState state={state} empty={data?.discoveryFailed ? 'Nothing to show.' : 'No model matches this filter.'} />
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Route</th>
              <th scope="col">Status</th>
              <th scope="col" className="admin-num">
                In / M
              </th>
              <th scope="col" className="admin-num">
                Out / M
              </th>
              <th scope="col" className="admin-num">
                Context
              </th>
              <th scope="col">Zero data retention</th>
              <th scope="col">Why not</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} data-model={row.model}>
                <th scope="row">
                  <span className="admin-mono">{row.model}</span>
                  <span className="admin-muted">
                    {row.name}
                    {row.openWeight ? ' · open weights' : ''}
                    {row.vision ? ' · vision' : ''}
                    {row.isNew ? ' · new' : ''}
                  </span>
                </th>
                <td>
                  <Verdict row={row} />
                </td>
                <td className="admin-num">{price(row.inputPerMillion)}</td>
                <td className="admin-num">{price(row.outputPerMillion)}</td>
                <td className="admin-num">{context(row.contextLength)}</td>
                <td>
                  {row.zdr === 'audited' ? (
                    <Pill tone={row.zdrAvailable ? 'ok' : 'danger'}>{row.zdrAvailable ? 'audited: yes' : 'audited: no'}</Pill>
                  ) : (
                    <Pill tone="muted">not audited</Pill>
                  )}
                </td>
                <td className="admin-muted">
                  {row.blocks.length === 0 ? '—' : row.blocks.map((block) => BLOCK_LABEL[block] ?? block).join('; ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="admin-note">
        Zero data retention is an <strong>audited</strong> fact here, not a discovered one. The provider listing carries
        no per-model retention flag — routing asks for it per request, and whether a given model can actually be served
        that way is checked by hand when a route is promoted. Anything outside the approved catalog therefore reads
        “not audited” rather than guessing, because a wrong yes would be a privacy claim nobody verified.
      </p>
    </section>
  );
}
