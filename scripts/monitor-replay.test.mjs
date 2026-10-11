// guards: src/control/outputRecovery.ts
//
// A PROGRAM MONITOR REOPENED STRAIGHT AFTER A PRESS SHOWS THE PICTURE AFTER IT (issue #762). A
// renderer reports 800 ms after its graphic's last change, so the report a reloaded page reads can
// predate the last press. The hosted control page and the in-app production page both rebuild from
// the report plus the log rows after its baseline, the renderer's own rule. Pure, run here in Node.

import test from 'node:test';
import assert from 'node:assert/strict';

const { airedAfter, monitorReplay, planOutputRecovery } = await import('../src/control/outputRecovery.ts');

/** The resolve a page reads 300 ms after the operator took question 2: the quiz's report still
 *  holds question 1, applied at row 40. */
const liveCue = { Quiz: 'cue-q2' };
const live = {
  Quiz: { data: { question: 'Q1' }, state: { groups: { reveal: 'shown' } }, event: 40 },
  Scorebug: { data: { home: '2' }, event: 44 },
};
const rows = [
  { id: 41, graphic: 'Quiz', msg: { t: 'update', data: { question: 'Q2' } } },
  { id: 42, graphic: 'Quiz', msg: { t: 'cue', cue: 'cue-q2' } },
  { id: 43, graphic: 'Quiz', msg: { t: 'staged', data: { question: 'Q3 draft' } } },
  { id: 44, graphic: 'Scorebug', msg: { t: 'update', data: { home: '2' } } },
  { id: 45, graphic: 'Quiz', msg: { t: 'event', event: 'lock', payload: { locked: 'B' } } },
  { id: 46, graphic: 'Quiz', msg: { t: 'live', data: { question: 'Q2' } } },
];

function boot() {
  const onAir = Object.keys(liveCue).filter((graphic) => liveCue[graphic]);
  const plan = planOutputRecovery(onAir, live);
  return { plan, replay: monitorReplay(onAir, plan.snapshotAt, rows.filter((r) => r.id > plan.followFrom)) };
}

test('the monitor replays the commands after the report, and only those', () => {
  const { plan, replay } = boot();
  assert.equal(plan.followFrom, 40);
  assert.deepEqual(replay.map((item) => item.msg.t), ['update', 'event']);
  // Off-air layers, typing, cue markers and reports are never replayed.
  assert.ok(replay.every((item) => item.graphic === 'Quiz'));
});

test('what air shows is the report moved on by those rows, not the report alone (the defect)', () => {
  const { replay } = boot();
  const fromReport = { Quiz: live.Quiz.data };
  assert.equal(fromReport.Quiz.question, 'Q1', 'rebuilt from the report alone, the monitor showed the previous question');
  const aired = replay.reduce((map, item) => airedAfter(map, item.graphic, item.msg), fromReport);
  assert.deepEqual(aired.Quiz, { question: 'Q2', locked: 'B' });
  assert.deepEqual(fromReport.Quiz, { question: 'Q1' }, 'the report itself is not mutated');
});

test('a row already inside a report is not replayed onto that graphic', () => {
  const onAir = ['Quiz', 'Scorebug'];
  const plan = planOutputRecovery(onAir, live);
  const replay = monitorReplay(onAir, plan.snapshotAt, rows.filter((r) => r.id > plan.followFrom));
  assert.deepEqual(replay.map((item) => `${item.graphic}:${item.msg.t}`), ['Quiz:update', 'Quiz:event']);
});

test('a graphic that never reported replays everything, entrance included', () => {
  const onAir = ['Lower'];
  const plan = planOutputRecovery(onAir, {});
  assert.equal(plan.followFrom, 0);
  const replay = monitorReplay(onAir, plan.snapshotAt, [
    { id: 3, graphic: 'Lower', msg: { t: 'update', data: { f0: 'Ada' } } },
    { id: 4, graphic: 'Lower', msg: { t: 'play' } },
  ]);
  assert.deepEqual(replay.map((item) => item.msg.t), ['update', 'play']);
});

test('airedAfter merges updates and event payloads, forgets a graphic taken off', () => {
  let aired = airedAfter({}, 'Lower', { t: 'update', data: { f0: 'Ada', f1: 'Host' } });
  aired = airedAfter(aired, 'Lower', { t: 'update', data: { f1: 'Guest' } });
  assert.deepEqual(aired.Lower, { f0: 'Ada', f1: 'Guest' });
  aired = airedAfter(aired, 'Lower', { t: 'event', event: 'goal', payload: { f2: '1' } });
  assert.deepEqual(aired.Lower, { f0: 'Ada', f1: 'Guest', f2: '1' });
  assert.equal(airedAfter(aired, 'Lower', { t: 'play' }), aired);
  assert.deepEqual(airedAfter(aired, 'Lower', { t: 'stop' }), {});
});
