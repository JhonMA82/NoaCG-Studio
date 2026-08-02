// Model eligibility: which routes COULD carry NoaCG-funded traffic, and which already do.
//
// The section states its own limit at the top rather than in a footnote, because the mistake
// it is built to prevent is a reasonable one: a table of models sorted by price, with green
// ticks against capabilities, reads like a shortlist. It is not one. Nothing on this page has
// generated a single token, and cheap-and-capable is not the same as good - only a NoaCG
// benchmark can say that (docs/AI_LITE_PROMOTION.md).
//
// So: no score column, no ordering by merit, no "recommended". The DEFAULT sort is approved
// first, then newly discovered, then the rest alphabetically - which is an operator's reading
// order, not a ranking.
//
// Column sorting does not breach that. The rule forbids the PAGE holding an opinion about
// which model is better; an operator sorting by price to answer "what is cheapest here" is
// asking a question, not being handed an answer, and the arrangement is theirs and lasts until
// they change it. What stays banned is arriving pre-ranked - which is why sorting is never the
// initial state and there is still no score to sort BY.

import { useMemo, useState } from 'react';
import type {
  AdminImageModelRow,
  AdminImageModelsResponse,
  AdminModelRow,
  AdminModelsResponse,
  AdminRouteUse,
  ModelBlockCode,
} from '../types';
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

/** The columns an operator can reorder by. Every one is a stated FACT about the model - there
 *  is deliberately nothing here that scores it. */
type SortColumn = 'model' | 'inputPerMillion' | 'outputPerMillion' | 'contextLength';

const SORT_LABEL: Record<SortColumn, string> = {
  model: 'Route',
  inputPerMillion: 'In / M',
  outputPerMillion: 'Out / M',
  contextLength: 'Context',
};

interface Sort {
  column: SortColumn;
  direction: 'asc' | 'desc';
}

/** Missing values sort LAST in both directions. An unpriced model is unmeasured, not cheap,
 *  and floating it to the top of an ascending price sort would read as "the cheapest". */
function compareRows(a: AdminModelRow, b: AdminModelRow, sort: Sort): number {
  if (sort.column === 'model') {
    const byName = a.model.localeCompare(b.model);
    return sort.direction === 'asc' ? byName : -byName;
  }
  const left = a[sort.column];
  const right = b[sort.column];
  if (left === null && right === null) return a.model.localeCompare(b.model);
  if (left === null) return 1;
  if (right === null) return -1;
  if (left === right) return a.model.localeCompare(b.model);
  return sort.direction === 'asc' ? left - right : right - left;
}

function SortHeader({
  column,
  sort,
  onSort,
  numeric,
}: {
  column: SortColumn;
  sort: Sort | null;
  onSort: (column: SortColumn) => void;
  numeric?: boolean;
}) {
  const active = sort?.column === column;
  const ariaSort = active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th scope="col" className={numeric ? 'admin-num' : undefined} aria-sort={ariaSort}>
      <button type="button" className="admin-sort" onClick={() => onSort(column)}>
        {SORT_LABEL[column]}
        <span aria-hidden="true">{active ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}</span>
      </button>
    </th>
  );
}

/** `uses` is optional at RUNTIME even though the DTO requires it: a cached bundle can outlive
 *  the server that fed it, and a whole admin section going blank because one additive field is
 *  absent is a far worse answer than a row without a badge. */
function InUse({ uses }: { uses?: AdminRouteUse[] }) {
  if (!uses || uses.length === 0) return null;
  return (
    <>
      {uses.map((use) => (
        <Pill key={`${use.task}:${use.slot ?? 'only'}`} tone={use.slot === 'fallback' ? 'muted' : 'ok'}>
          {use.slot ? `${use.task} ${use.slot}` : use.task}
        </Pill>
      ))}
    </>
  );
}

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
  // null = the reading order below, which is what the section opens in. A column sort is only
  // ever something the operator asked for.
  const [sort, setSort] = useState<Sort | null>(null);
  const [showImages, setShowImages] = useState(false);

  const data = state.data;

  const onSort = (column: SortColumn) =>
    setSort((current) =>
      current?.column === column
        ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' },
    );

  const rows = useMemo(() => {
    const all = data?.models ?? [];
    const rank = (row: AdminModelRow) => (row.approved ? 0 : row.isNew ? 1 : row.verdict === 'eligible' ? 2 : 3);
    const filtered = all.filter((row) => matches(row, filter)).slice();
    return sort
      ? filtered.sort((a, b) => compareRows(a, b, sort))
      : filtered.sort((a, b) => rank(a) - rank(b) || a.model.localeCompare(b.model));
  }, [data, filter, sort]);

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

      {data && !data.discoveryFailed && !showImages ? (
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
              className={option === filter && !showImages ? 'primary' : ''}
              onClick={() => {
                setFilter(option);
                setShowImages(false);
              }}
            >
              {FILTER_LABEL[option]} ({counts[option]})
            </button>
          ))}
          <button type="button" className={showImages ? 'primary' : ''} onClick={() => setShowImages(true)}>
            Image models
          </button>
        </div>
      ) : null}

      {showImages ? <ImageModels /> : null}

      {showImages ? null : rows.length === 0 ? (
        <AsyncState state={state} empty={data?.discoveryFailed ? 'Nothing to show.' : 'No model matches this filter.'} />
      ) : (
        <table className="admin-table admin-models">
          <thead>
            <tr>
              <SortHeader column="model" sort={sort} onSort={onSort} />
              <th scope="col">Status</th>
              <SortHeader column="inputPerMillion" sort={sort} onSort={onSort} numeric />
              <SortHeader column="outputPerMillion" sort={sort} onSort={onSort} numeric />
              <SortHeader column="contextLength" sort={sort} onSort={onSort} numeric />
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
                  <InUse uses={row.usedBy} />
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

      {showImages ? null : (
        <p className="admin-note">
          Zero data retention is an <strong>audited</strong> fact here, not a discovered one. The provider listing
          carries no per-model retention flag — routing asks for it per request, and whether a given model can actually
          be served that way is checked by hand when a route is promoted. Anything outside the approved catalog
          therefore reads “not audited” rather than guessing, because a wrong yes would be a privacy claim nobody
          verified.
        </p>
      )}
    </section>
  );
}

/** Distinct from `price()` above only in what it says about ABSENCE: an image route with no
 *  published output price must read "not published", never the "-" that could be mistaken for
 *  a dash meaning zero on a money column. */
function imagePrice(value: number | null): string {
  if (value === null) return 'not published';
  if (value === 0) return 'free';
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

/**
 * The image listing, for NoaCG Pro's concept call. It carries NO verdict on purpose: the
 * funded-route rules are per-million TOKENS and say nothing about a model billed per image,
 * so applying them here would mark usable models ineligible against a rule nobody has written.
 * Until a per-image ceiling exists this is a menu, not a judgement.
 */
function ImageModels() {
  const state = useAdminData<AdminImageModelsResponse>('models?output=image');
  const [sortDesc, setSortDesc] = useState(false);
  const data = state.data;

  const rows = useMemo(() => {
    const all = [...(data?.models ?? [])];
    return all.sort((a: AdminImageModelRow, b: AdminImageModelRow) => {
      const left = a.imageOutputPerMillion;
      const right = b.imageOutputPerMillion;
      if (left === null && right === null) return a.model.localeCompare(b.model);
      if (left === null) return 1;
      if (right === null) return -1;
      if (left === right) return a.model.localeCompare(b.model);
      return sortDesc ? right - left : left - right;
    });
  }, [data, sortDesc]);

  return (
    <>
      <p className="admin-note">
        What the provider lists for <strong>image output</strong> — the call NoaCG Pro makes to draw a concept. The
        route the tier actually draws with is marked <em>in use</em>; it is pinned in the code
        (<span className="admin-mono">PRO_STANDARD_ROUTES</span>), not chosen per generation, so a Pro user never
        picks a model. <strong>No eligibility verdict is shown here</strong>: the funded-route ceiling was set against
        text generation, and no ceiling for image work has been decided, so there is nothing to check these against
        yet. Prices are per million <strong>output image tokens</strong>, as the provider publishes them; a price per
        image would need the token count one image costs, which varies by model and resolution and is not published,
        so it is not shown rather than estimated.
      </p>

      {data && data.discoveryFailed ? (
        <p className="admin-problem">The image listing could not be read. Only this tab is affected.</p>
      ) : null}

      {rows.length === 0 ? (
        <AsyncState state={state} empty="No image models listed." />
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Route</th>
              <th scope="col" className="admin-num" aria-sort={sortDesc ? 'descending' : 'ascending'}>
                <button type="button" className="admin-sort" onClick={() => setSortDesc((value) => !value)}>
                  Image out / M
                  <span aria-hidden="true">{sortDesc ? ' ▼' : ' ▲'}</span>
                </button>
              </th>
              <th scope="col" className="admin-num">
                In / M
              </th>
              <th scope="col">Zero data retention</th>
              <th scope="col">Available</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} data-model={row.model}>
                <th scope="row">
                  <span className="admin-mono">{row.model}</span>
                  <span className="admin-muted">
                    {row.name}
                    {row.isNew ? ' · new' : ''}
                  </span>
                  <InUse uses={row.usedBy} />
                </th>
                <td className="admin-num">{imagePrice(row.imageOutputPerMillion)}</td>
                <td className="admin-num">{price(row.inputPerMillion)}</td>
                <td>
                  {row.zdr === 'audited' ? (
                    <Pill tone={row.zdrAvailable ? 'ok' : 'danger'}>{row.zdrAvailable ? 'audited: yes' : 'audited: no'}</Pill>
                  ) : (
                    <Pill tone="muted">not audited</Pill>
                  )}
                </td>
                <td>
                  {row.available ? <Pill tone="ok">listed</Pill> : <Pill tone="warn">unavailable</Pill>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
