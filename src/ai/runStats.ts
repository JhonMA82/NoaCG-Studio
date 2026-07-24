// What a generation actually costs, from the runs this browser has already done.
//
// `telemetry.ts` has recorded stage timings and token usage per run since the harness
// shipped, and nothing has ever shown it to the user. A BYO-key user pays per generation and
// picks between "three alternatives with a live bench" and "one quick draft" from a checkbox
// that says nothing about the difference between them.
//
// DELIBERATELY NO MONEY. Per-token prices are not in this codebase, they change, and a stale
// figure presented as cost is worse than no figure at all — it would be believed. Tokens and
// seconds are exactly what was measured, and a BYO-key user maps them to their own bill.

import { aiRunRecords, type AiRunKind, type AiRunRecord } from './telemetry';

export interface RunCost {
  ms: number;
  inputTokens: number;
  outputTokens: number;
}

export interface RunExpectation extends RunCost {
  /** How many past runs this is the median of — shown, so a guess from 2 runs says so. */
  runs: number;
}

/** Fewer past runs than this and there is nothing worth calling an expectation. */
const MIN_RUNS = 2;
/** Only the recent past: the model, the prompts and the machine all drift. */
const WINDOW = 8;

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

/** One run's totals: every stage's usage added up. */
export function runCost(record: AiRunRecord): RunCost {
  return {
    ms: record.totalMs,
    inputTokens: record.stages.reduce((sum, s) => sum + (s.usage?.inputTokens ?? 0), 0),
    outputTokens: record.stages.reduce((sum, s) => sum + (s.usage?.outputTokens ?? 0), 0),
  };
}

/** The most recent recorded run, whatever it was — the actuals for what just happened. */
export function lastRun(): AiRunRecord | null {
  const records = aiRunRecords();
  return records.length ? records[records.length - 1] : null;
}

/**
 * What a run like this one has cost lately: the median of up to the last `WINDOW` matching
 * runs. `harness` splits the two paths, because that IS the difference the user is choosing
 * between — three design directions and a live bench, or one draft.
 *
 * Returns null below `MIN_RUNS`: a first-time user gets no number rather than a made-up one.
 */
export function runExpectation(kind: AiRunKind, harness: boolean): RunExpectation | null {
  const matching = aiRunRecords()
    .filter((r) => r.kind === kind && r.ok !== false)
    // A run with no route recorded predates the split and cannot be attributed to either path.
    .filter((r) => (r.route ? (harness ? r.route !== 'raw' : r.route === 'raw') : false))
    .slice(-WINDOW);
  if (matching.length < MIN_RUNS) return null;
  const costs = matching.map(runCost);
  return {
    runs: matching.length,
    ms: median(costs.map((c) => c.ms)),
    inputTokens: median(costs.map((c) => c.inputTokens)),
    outputTokens: median(costs.map((c) => c.outputTokens)),
  };
}

/** "12.4k" / "840" — tokens at a glance, never a false precision. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
}

/** "28 s" / "1 m 12 s"; anything under a second is reported as such, never as "0 s". */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 1) return '<1 s';
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} m ${seconds % 60} s`;
}

/**
 * Whether token counts are worth showing at all. A run whose stages carried no `usage` block
 * (a provider that does not report it, the offline stub) totals zero — and "0 tokens" is a
 * measurement claim, not an absence of one. Report the time and say nothing about tokens.
 */
export const hasTokenCounts = (cost: RunCost): boolean => cost.inputTokens + cost.outputTokens > 0;
