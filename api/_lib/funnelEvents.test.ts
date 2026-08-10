import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FUNNEL_EVENTS,
  funnelEventRow,
  funnelWithdrawalVisitor,
  type FunnelEventInput,
} from './funnelEvents.js';

const VISITOR = '3f1c2b9a-4d5e-4f60-8a71-9b2c3d4e5f60';

test('a well-formed event normalizes to a row', () => {
  const row = funnelEventRow(
    {
      event: 'export',
      visitorId: VISITOR,
      detail: 'casparcg',
    },
    'user-1',
  );
  assert.ok(row);
  assert.equal(row.event, 'export');
  assert.equal(row.visitorId, VISITOR);
  assert.equal(row.userId, 'user-1');
  assert.equal(row.detail, 'casparcg');
});

test('only the five funnel events are storable', () => {
  for (const event of FUNNEL_EVENTS) {
    assert.ok(funnelEventRow({ event, visitorId: VISITOR }, null), `${event} is a funnel event`);
  }
  for (const bogus of ['pageview', 'EXPORT', '', null, 42, {}]) {
    assert.equal(funnelEventRow({ event: bogus, visitorId: VISITOR }, null), null);
  }
});

test('a row without a usable visitor id is dropped, not stored anonymously', () => {
  for (const id of ['', 'not-a-uuid', VISITOR.toUpperCase().slice(0, 20), null, 7]) {
    assert.equal(funnelEventRow({ event: 'visit', visitorId: id }, null), null);
  }
});

test('the identity on the row comes from the token, never the body', () => {
  // Parsed the way the route parses it, so the body really can carry a key the type does
  // not declare - a client claiming an account it holds no token for.
  const body = JSON.parse(
    JSON.stringify({ event: 'signup', visitorId: VISITOR, userId: 'someone-else' }),
  ) as FunnelEventInput;
  const row = funnelEventRow(body, null);
  assert.ok(row);
  assert.equal(row.userId, null);
});

test('free text cannot reach the table through detail', () => {
  const leaky = {
    event: 'activation',
    visitorId: VISITOR,
    detail: 'https://example.com/secret?token=abc',
  };
  const row = funnelEventRow(leaky, null);
  assert.ok(row);
  assert.equal(row.detail, null);
  // The event itself still counts - one bad detail must not cost the datapoint.
  assert.equal(row.event, 'activation');
});

test('withdrawal accepts only the explicit action and a valid visitor id', () => {
  assert.equal(funnelWithdrawalVisitor({ action: 'withdraw', visitorId: VISITOR }), VISITOR);
  assert.equal(funnelWithdrawalVisitor({ action: 'delete', visitorId: VISITOR }), null);
  assert.equal(funnelWithdrawalVisitor({ action: 'withdraw', visitorId: 'not-a-uuid' }), null);
});

test('a detail slug is bounded in length and charset', () => {
  assert.equal(funnelEventRow({ event: 'export', visitorId: VISITOR, detail: 'a'.repeat(40) }, null)?.detail?.length, 40);
  assert.equal(funnelEventRow({ event: 'export', visitorId: VISITOR, detail: 'a'.repeat(41) }, null)?.detail, null);
  assert.equal(funnelEventRow({ event: 'export', visitorId: VISITOR, detail: 'has space' }, null)?.detail, null);
  assert.equal(funnelEventRow({ event: 'export', visitorId: VISITOR, detail: 'UPPER' }, null)?.detail, 'upper');
});
