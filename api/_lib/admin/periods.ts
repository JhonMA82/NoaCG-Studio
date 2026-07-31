// WHERE "TODAY" IS DECIDED, and the only place it is decided.
//
// Three clocks disagree on this instance: Postgres stores UTC, the Vercel function runs UTC,
// and the person reading the page is in Finland. A day boundary picked by any of them
// implicitly would put a graphic made at 01:00 Helsinki into yesterday, which is exactly the
// kind of quiet wrongness an operator never catches because the number still looks plausible.
//
// So the boundaries are computed HERE, in the reporting timezone, and passed to the database
// as explicit instants (supabase/migrations/0024_admin_overview.sql takes `from`/`to` and
// decides nothing). This module is pure - no Supabase, no environment reads beyond the one
// timezone lookup, no Date.now() except the `now` its callers hand in - so the whole thing is
// testable offline, which is what `periods.test.ts` does.
//
// THE PREVIOUS PERIOD IS ELAPSED-MATCHED, deliberately. On the 3rd of the month, "this month"
// is three days long; comparing it against a whole 31-day previous month would show a
// collapse every month and a recovery every month, and both would be artefacts. The
// comparison span is therefore the SAME NUMBER OF MILLISECONDS, one period earlier: the first
// three days of last month against the first three of this one.

/** The timezone every boundary on the admin overview is expressed in. Finland-local by
 *  default because that is where this instance is operated from; `ADMIN_REPORT_TIMEZONE`
 *  overrides it for a deployment run from somewhere else. An unusable value falls back
 *  rather than throwing - a bad env var must not take the admin page down. */
export function reportTimezone(): string {
  const configured = (process.env.ADMIN_REPORT_TIMEZONE ?? '').trim();
  if (!configured) return 'Europe/Helsinki';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: configured });
    return configured;
  } catch {
    return 'Europe/Helsinki';
  }
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 1 = Monday … 7 = Sunday. ISO, because the reporting week starts on Monday. */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function formatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
}

/** The wall-clock reading of `at` in `timeZone`. */
export function zonedParts(at: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(at);
  const found: Record<string, string> = {};
  for (const part of parts) found[part.type] = part.value;
  return {
    year: Number(found.year),
    month: Number(found.month),
    day: Number(found.day),
    // 24 at midnight is legal in the h23 cycle on some engines; normalize it to 0 so hour
    // arithmetic cannot land a day out.
    hour: Number(found.hour) % 24,
    minute: Number(found.minute),
    second: Number(found.second),
    weekday: WEEKDAYS[found.weekday] ?? 1,
  };
}

/** How far `timeZone` is ahead of UTC at instant `at`, in milliseconds. */
function offsetMs(at: Date, timeZone: string): number {
  const parts = zonedParts(at, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  // Seconds precision is all formatToParts gives, so compare like with like.
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The instant at which the given wall-clock time occurs in `timeZone`.
 *
 * Two passes, and the second one matters: the offset is looked up at a guessed instant, and
 * that guess can land on the wrong side of a DST change - which Helsinki has twice a year, so
 * "the last week" would silently be an hour short or long around each. Re-reading the offset
 * at the corrected instant fixes every case except the hour that does not exist in spring,
 * where either answer is a defensible reading of a time that never happened.
 */
export function zonedInstant(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour);
  const first = new Date(wall - offsetMs(new Date(wall), timeZone));
  const second = new Date(wall - offsetMs(first, timeZone));
  return second;
}

export function startOfDay(at: Date, timeZone: string): Date {
  const parts = zonedParts(at, timeZone);
  return zonedInstant(timeZone, parts.year, parts.month, parts.day);
}

/** Monday 00:00 local. ISO weeks, which is what a Finnish operator reads off a calendar. */
export function startOfWeek(at: Date, timeZone: string): Date {
  const parts = zonedParts(at, timeZone);
  const dayStart = zonedInstant(timeZone, parts.year, parts.month, parts.day);
  // Step back whole days through the calendar rather than subtracting 6 × 86 400 000 ms,
  // so a DST change inside the week cannot move the boundary off midnight.
  const back = zonedParts(new Date(dayStart.getTime() - (parts.weekday - 1) * 86_400_000), timeZone);
  return zonedInstant(timeZone, back.year, back.month, back.day);
}

export function startOfMonth(at: Date, timeZone: string): Date {
  const parts = zonedParts(at, timeZone);
  return zonedInstant(timeZone, parts.year, parts.month, 1);
}

export type PeriodId = 'day' | 'week' | 'month';

export interface Period {
  id: PeriodId;
  /** Inclusive lower bound. */
  from: Date;
  /** Exclusive upper bound - `now`, so every window ends at the same instant. */
  to: Date;
  /** The elapsed-matched span one period earlier, for comparison. */
  previousFrom: Date;
  previousTo: Date;
}

/**
 * The three reporting windows and their comparison spans.
 *
 * Every window ENDS AT `now` rather than at the end of the calendar period, so "this month"
 * means month-to-date and nothing is ever counted in a stretch of time that has not happened.
 */
export function reportingPeriods(now: Date, timeZone: string): Period[] {
  const starts: Record<PeriodId, Date> = {
    day: startOfDay(now, timeZone),
    week: startOfWeek(now, timeZone),
    month: startOfMonth(now, timeZone),
  };

  const previousStart = (id: PeriodId, from: Date): Date => {
    const parts = zonedParts(from, timeZone);
    if (id === 'day') {
      const back = zonedParts(new Date(from.getTime() - 86_400_000), timeZone);
      return zonedInstant(timeZone, back.year, back.month, back.day);
    }
    if (id === 'week') {
      const back = zonedParts(new Date(from.getTime() - 7 * 86_400_000), timeZone);
      return zonedInstant(timeZone, back.year, back.month, back.day);
    }
    // Calendar month arithmetic, so January's predecessor is December of the year before and
    // not "31 days ago", which would land on the 1st or the 2nd depending on the month.
    const month = parts.month === 1 ? 12 : parts.month - 1;
    const year = parts.month === 1 ? parts.year - 1 : parts.year;
    return zonedInstant(timeZone, year, month, 1);
  };

  return (['day', 'week', 'month'] as PeriodId[]).map((id) => {
    const from = starts[id];
    const elapsed = Math.max(0, now.getTime() - from.getTime());
    const previousFrom = previousStart(id, from);
    return {
      id,
      from,
      to: now,
      previousFrom,
      // Elapsed-matched, and never allowed to run into the current window: if a previous
      // month is shorter than the elapsed span (the 31st compared against February), the
      // comparison stops at that month's own end rather than double-counting days already
      // in `from`.
      previousTo: new Date(Math.min(previousFrom.getTime() + elapsed, from.getTime())),
    };
  });
}
