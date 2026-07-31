// The reporting-window arithmetic, pinned offline.
//
// These are the numbers every headline on the admin overview is divided by, and the two ways
// they go wrong are both silent: a boundary computed in UTC puts early-morning Helsinki
// activity in the wrong day, and a DST change moves a boundary off midnight for half the year.
// Neither produces an error - just a number that is quietly a few hours out.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reportTimezone,
  reportingPeriods,
  startOfDay,
  startOfMonth,
  startOfWeek,
  zonedParts,
} from './periods.js';

const HELSINKI = 'Europe/Helsinki';

/** The wall clock a boundary lands on, in the reporting zone. Every assertion below is about
 *  this rather than about the UTC instant, because midnight-local is the actual contract. */
function wall(at: Date, timeZone = HELSINKI): string {
  const parts = zonedParts(at, timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

test('the reporting timezone defaults to Helsinki and refuses an unusable override', () => {
  const previous = process.env.ADMIN_REPORT_TIMEZONE;
  try {
    delete process.env.ADMIN_REPORT_TIMEZONE;
    assert.equal(reportTimezone(), 'Europe/Helsinki');
    process.env.ADMIN_REPORT_TIMEZONE = 'America/New_York';
    assert.equal(reportTimezone(), 'America/New_York');
    // A typo must not take the admin page down; it falls back to the default.
    process.env.ADMIN_REPORT_TIMEZONE = 'Mars/Olympus_Mons';
    assert.equal(reportTimezone(), 'Europe/Helsinki');
  } finally {
    if (previous === undefined) delete process.env.ADMIN_REPORT_TIMEZONE;
    else process.env.ADMIN_REPORT_TIMEZONE = previous;
  }
});

test('the day boundary is local midnight, not UTC midnight', () => {
  // 22:30 UTC on 14 July is already 01:30 on the 15th in Helsinki (UTC+3 in summer). A UTC
  // boundary would file this under the 14th - the exact bug this module exists to prevent.
  const at = new Date('2026-07-14T22:30:00Z');
  assert.equal(wall(at), '2026-07-15 01:30');
  assert.equal(wall(startOfDay(at, HELSINKI)), '2026-07-15 00:00');
  assert.equal(startOfDay(at, HELSINKI).toISOString(), '2026-07-14T21:00:00.000Z');

  // And the same instant in a zone behind UTC is a different day again, which is what makes
  // the timezone a real input rather than a formality.
  assert.equal(wall(startOfDay(at, 'America/New_York'), 'America/New_York'), '2026-07-14 00:00');
});

test('the week starts on Monday, and a Monday is its own week start', () => {
  // 2026-07-31 is a Friday.
  const friday = new Date('2026-07-31T09:00:00+03:00');
  assert.equal(zonedParts(friday, HELSINKI).weekday, 5);
  assert.equal(wall(startOfWeek(friday, HELSINKI)), '2026-07-27 00:00');

  const monday = new Date('2026-07-27T00:30:00+03:00');
  assert.equal(wall(startOfWeek(monday, HELSINKI)), '2026-07-27 00:00');

  // Sunday belongs to the week that has just ended, not the one about to start.
  const sunday = new Date('2026-08-02T23:00:00+03:00');
  assert.equal(zonedParts(sunday, HELSINKI).weekday, 7);
  assert.equal(wall(startOfWeek(sunday, HELSINKI)), '2026-07-27 00:00');
});

test('a week that contains a DST change still starts at local midnight', () => {
  // Helsinki moves to summer time on 29 March 2026 and back on 25 October. A week start
  // computed by subtracting 6 × 86 400 000 ms from midnight lands at 23:00 or 01:00 across
  // each of those, and every "this week" figure is then an hour wrong.
  const afterSpring = new Date('2026-04-02T12:00:00+03:00');
  assert.equal(wall(startOfWeek(afterSpring, HELSINKI)), '2026-03-30 00:00');

  const afterAutumn = new Date('2026-10-29T12:00:00+02:00');
  assert.equal(wall(startOfWeek(afterAutumn, HELSINKI)), '2026-10-26 00:00');

  // The day boundary either side of the change is midnight too, at both offsets.
  assert.equal(startOfDay(new Date('2026-03-30T05:00:00Z'), HELSINKI).toISOString(), '2026-03-29T21:00:00.000Z');
  assert.equal(startOfDay(new Date('2026-10-26T05:00:00Z'), HELSINKI).toISOString(), '2026-10-25T22:00:00.000Z');
});

test('the month boundary is the 1st at local midnight, across a year change', () => {
  assert.equal(wall(startOfMonth(new Date('2026-07-31T23:59:00+03:00'), HELSINKI)), '2026-07-01 00:00');
  assert.equal(wall(startOfMonth(new Date('2026-01-15T10:00:00+02:00'), HELSINKI)), '2026-01-01 00:00');
});

test('every window ends at now, so nothing counts time that has not happened', () => {
  const now = new Date('2026-07-31T09:00:00+03:00');
  for (const period of reportingPeriods(now, HELSINKI)) {
    assert.equal(period.to.getTime(), now.getTime(), `${period.id} must end at now`);
    assert.ok(period.from.getTime() <= now.getTime(), `${period.id} must start before now`);
  }
});

test('the comparison span is the same elapsed length, one period earlier', () => {
  const now = new Date('2026-07-03T12:00:00+03:00');
  const periods = new Map(reportingPeriods(now, HELSINKI).map((period) => [period.id, period]));

  const day = periods.get('day');
  assert.ok(day);
  assert.equal(wall(day.from), '2026-07-03 00:00');
  assert.equal(wall(day.previousFrom), '2026-07-02 00:00');
  // 12 hours in, so the comparison is the first 12 hours of yesterday - not all of it.
  assert.equal(day.previousTo.getTime() - day.previousFrom.getTime(), 12 * 3_600_000);

  const month = periods.get('month');
  assert.ok(month);
  assert.equal(wall(month.from), '2026-07-01 00:00');
  assert.equal(wall(month.previousFrom), '2026-06-01 00:00');
  // Two and a half days into July, so June contributes two and a half days, not thirty.
  assert.equal(month.previousTo.getTime() - month.previousFrom.getTime(), month.to.getTime() - month.from.getTime());
  assert.equal(wall(month.previousTo), '2026-06-03 12:00');
});

test('a comparison span never runs into the window it is being compared against', () => {
  // 31 March: the elapsed month-to-date is 30 days and a bit, but February 2026 has 28. Left
  // unclamped the comparison would reach into March itself and count the same rows twice.
  const now = new Date('2026-03-31T18:00:00+03:00');
  const month = reportingPeriods(now, HELSINKI).filter((period) => period.id === 'month')[0];
  assert.equal(wall(month.from), '2026-03-01 00:00');
  assert.equal(wall(month.previousFrom), '2026-02-01 00:00');
  assert.ok(month.previousTo.getTime() <= month.from.getTime());
  assert.equal(wall(month.previousTo), '2026-03-01 00:00');
});

test('January compares against December of the previous year', () => {
  const now = new Date('2026-01-05T08:00:00+02:00');
  const month = reportingPeriods(now, HELSINKI).filter((period) => period.id === 'month')[0];
  assert.equal(wall(month.previousFrom), '2025-12-01 00:00');
});

test('the windows nest: today sits inside this week sits inside this month', () => {
  // Not true in general - a week straddles two months - so this is asserted on a date where
  // it must hold, to catch a boundary function returning something wildly wrong.
  const now = new Date('2026-07-15T14:00:00+03:00');
  const periods = new Map(reportingPeriods(now, HELSINKI).map((period) => [period.id, period]));
  const day = periods.get('day');
  const week = periods.get('week');
  const month = periods.get('month');
  assert.ok(day && week && month);
  assert.ok(month.from.getTime() <= week.from.getTime());
  assert.ok(week.from.getTime() <= day.from.getTime());
});
