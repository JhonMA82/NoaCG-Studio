// The store's guard. What matters here is the LOCATION check: it decides whether a wave launches,
// so a false "outside the store" stops every wave and a false "inside" loses the week's record.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { inStore, main, openNightWave, openWave, openWaves, waveSessions, PLAN_SUFFIX, wavePlanFiles, wavePlanName, wavePlansDir, ensureWavePlansDir } from './wave-plan-store.mjs';

/** A throwaway job store, so nothing here can touch the machine's real one. */
function store() {
  const dir = mkdtempSync(path.join(tmpdir(), 'noacg-plan-store-'));
  mkdirSync(path.join(dir, 'wave-plans'), { recursive: true });
  return dir;
}

test('the store sits inside the job store, beside its logs and its relay', () => {
  assert.equal(wavePlansDir('/repo/.git/noacg-jobs'), path.join('/repo/.git/noacg-jobs', 'wave-plans'));
  assert.equal(wavePlansDir(null), null);
});

test('a plan filename is a date, a kind, and nothing else', () => {
  assert.equal(wavePlanName('2026-09-09', 'night'), `2026-09-09-night${PLAN_SUFFIX}`);
  assert.equal(wavePlanName('2026-09-09', 'day'), `2026-09-09-day${PLAN_SUFFIX}`);
  assert.throws(() => wavePlanName('9 Sep', 'day'), /YYYY-MM-DD/);
  assert.throws(() => wavePlanName('2026-09-09', 'evening'), /day, night or plan-/);
  assert.equal(wavePlanName('2026-10-09', 'plan-editor'), `2026-10-09-plan-editor${PLAN_SUFFIX}`);
  assert.throws(() => wavePlanName('2026-10-09', 'plan-../x'), /plan-/);
});

test('the location check accepts a plan in the store and refuses one in a checkout', () => {
  const dir = store();
  const inside = path.join(dir, 'wave-plans', wavePlanName('2026-09-09', 'night'));
  writeFileSync(inside, '# plan\n', 'utf8');
  assert.equal(inStore(inside, dir), true);
  // The shape that lost three days of routing: a plan in whatever worktree the session occupied.
  assert.equal(inStore('C:/repo/.claude/worktrees/agent-abc/docs/handoffs/2026-09-09-night-wave-plan.local.md', dir), false);
  // And a subdirectory of the store is not the store - basename equality alone must not pass it.
  assert.equal(inStore(path.join(dir, 'wave-plans', 'old', wavePlanName('2026-09-09', 'day')), dir), false);
  assert.equal(inStore(null, dir), false);
  assert.equal(inStore(inside, null), false);
});

test('the location check survives the separators and the casing Windows hands back', () => {
  const dir = store();
  const name = wavePlanName('2026-09-09', 'day');
  writeFileSync(path.join(dir, 'wave-plans', name), '# plan\n', 'utf8');
  const mixed = `${dir.replace(/\\/g, '/')}/wave-plans/${name}`;
  assert.equal(inStore(mixed, dir), true);
  assert.equal(inStore(path.join(dir, 'wave-plans', '.', name), dir), true);
});

test('the listing is newest first and ignores everything that is not a plan', () => {
  const dir = store();
  for (const name of [wavePlanName('2026-09-07', 'day'), wavePlanName('2026-09-09', 'night'), wavePlanName('2026-09-08', 'day')]) {
    writeFileSync(path.join(dir, 'wave-plans', name), '# plan\n', 'utf8');
  }
  writeFileSync(path.join(dir, 'wave-plans', 'notes.md'), 'not a plan\n', 'utf8');
  assert.deepEqual(wavePlanFiles(dir), [
    wavePlanName('2026-09-09', 'night'),
    wavePlanName('2026-09-08', 'day'),
    wavePlanName('2026-09-07', 'day'),
  ]);
});

test('the directory is created on demand, because the orchestrator writes the file by hand', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'noacg-plan-store-'));
  assert.deepEqual(wavePlanFiles(dir), []); // absent reads as empty rather than throwing
  const folder = ensureWavePlansDir(dir);
  assert.equal(folder, path.join(dir, 'wave-plans'));
  writeFileSync(path.join(folder, wavePlanName('2026-09-09', 'night')), '# plan\n', 'utf8');
  assert.deepEqual(wavePlanFiles(dir), [wavePlanName('2026-09-09', 'night')]);
});

// OPENING A WAVE is where two of the root boundaries become checks: one orchestrator at a time,
// and no unattended chain past 24 hours. Both used to be sentences.

/** Pin a file's modification time, so "written to recently" does not depend on today's date. */
function touch(file, ms) {
  const at = new Date(ms);
  utimesSync(file, at, at);
}

const NOW = Date.parse('2026-10-08T20:00:00Z');

test('opening a wave writes its window and refuses one past the 24-hour ceiling', () => {
  const opened = openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir: store(), now: NOW });
  assert.ok(opened.file, opened.refusal);
  const text = readFileSync(opened.file, 'utf8');
  assert.match(text, /^Window starts: 2026-10-08T20:00:00\.000Z$/m);
  assert.match(text, /^Window ends: 2026-10-09T06:00:00\+03:00$/m);
  assert.match(openWave({ date: '2026-10-09', kind: 'day', until: '2026-10-10T21:00:00+03:00', dir: store(), now: NOW }).refusal, /24 hours/);
  assert.match(openWave({ date: '2026-10-08', kind: 'day', until: '2026-10-08T06:00:00+03:00', dir: store(), now: NOW }).refusal, /passed/);
  assert.match(openWave({ date: '2026-10-08', kind: 'day', until: '06:00', dir: store(), now: NOW }).refusal, /offset/);
});

test('a second wave is refused while another has no report, and allowed once it has one', () => {
  const dir = store();
  const first = openWave({ date: '2026-10-08', kind: 'day', until: '2026-10-08T23:00:00+03:00', dir, now: NOW - 3_600_000 });
  touch(first.file, NOW - 3_600_000);
  const second = openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW });
  assert.match(second.refusal, /another wave or plan run is open/);
  writeFileSync(first.file, `${readFileSync(first.file, 'utf8')}\n## Report\n\nAll landed.\n`, 'utf8');
  touch(first.file, NOW - 600_000);
  assert.ok(openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW }).file);
});

test('reopening the same wave resumes it instead of refusing or overwriting it', () => {
  const dir = store();
  const first = openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW });
  writeFileSync(first.file, `${readFileSync(first.file, 'utf8')}\n- 23:10 launched A\n`, 'utf8');
  touch(first.file, NOW);
  const again = openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW + 600_000 });
  assert.equal(again.file, first.file);
  assert.match(readFileSync(again.file, 'utf8'), /launched A/);
});

test('a plan nobody has written to for a day no longer blocks a new wave', () => {
  const dir = store();
  const old = path.join(dir, 'wave-plans', wavePlanName('2026-10-01', 'night'));
  writeFileSync(old, '# plan with no report\n', 'utf8');
  touch(old, Date.parse('2026-10-02T06:00:00Z'));
  assert.ok(openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW }).file);
});

test('a restart keeps the window its file records, and a new --until is measured from its own start, CRLF or not', () => {
  const dir = store();
  const first = openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW });
  // A Windows editor may have rewritten the file with CRLF; the recorded lines must still be read and rewritten.
  writeFileSync(first.file, readFileSync(first.file, 'utf8').replace(/\n/g, '\r\n'), 'utf8');
  assert.deepEqual(openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW + 6 * 3_600_000 }), { file: first.file, window: 'resumed' });
  assert.match(readFileSync(first.file, 'utf8'), /^Window starts: 2026-10-08T20:00:00\.000Z\r$/m, 'a restart does not move the start');
  // 25 hours from now is refused even though the owner named it; 9 hours is a new window, 31 after the first start.
  const later = NOW + 22 * 3_600_000;
  assert.match(openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-10T22:00:00+03:00', dir, now: later }).refusal, /24 hours from now/);
  assert.equal(openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-10T06:00:00+03:00', dir, now: later }).window, 'new');
  assert.match(readFileSync(first.file, 'utf8'), /^Window starts: 2026-10-09T18:00:00\.000Z\r\nWindow ends: 2026-10-10T06:00:00\+03:00\r\n/m, 'rewritten in place, CRLF kept');
});

test('a wave nobody has written to for six hours stops blocking, and the refusal says how to resume', () => {
  const dir = store();
  const day = openWave({ date: '2026-10-08', kind: 'day', until: '2026-10-08T18:00:00+03:00', dir, now: NOW - 8 * 3_600_000 });
  touch(day.file, NOW - 5 * 3_600_000);
  assert.match(openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW }).refusal, /open it again with its own date and kind/);
  touch(day.file, NOW - 7 * 3_600_000);
  assert.ok(openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW }).file);
});

test('only an open night wave inside its window counts as unattended', () => {
  const dir = store();
  assert.equal(openNightWave(dir, NOW), null, 'no wave');
  const day = openWave({ date: '2026-10-08', kind: 'day', until: '2026-10-09T01:00:00+03:00', dir, now: NOW });
  touch(day.file, NOW);
  assert.equal(openNightWave(dir, NOW), null, 'a day wave has the owner near');
  writeFileSync(day.file, `${readFileSync(day.file, 'utf8')}\n## Report\n\nDone.\n`, 'utf8');
  touch(day.file, NOW);

  const night = openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW });
  touch(night.file, NOW);
  assert.equal(openNightWave(dir, NOW), night.file);
  // Written to at the very end, so only the window line can close it, not six quiet hours.
  const end = Date.parse('2026-10-09T06:00:00+03:00');
  touch(night.file, end);
  assert.equal(openNightWave(dir, end - 60_000), night.file, 'the last minute of the window');
  assert.equal(openNightWave(dir, end), null, 'the window has ended');
  touch(night.file, NOW);
  writeFileSync(night.file, `${readFileSync(night.file, 'utf8')}\n## Report\n\nDone.\n`, 'utf8');
  touch(night.file, NOW);
  assert.equal(openNightWave(dir, NOW), null, 'a reported wave is over');
  writeFileSync(night.file, '# Night wave 2026-10-08\n', 'utf8');
  touch(night.file, NOW);
  assert.equal(openNightWave(dir, NOW), night.file, 'no window line still counts as running');
});

test('opening a wave records the opening session once, and a resume after a restart adds the new one', () => {
  const dir = store();
  const until = '2026-10-09T06:00:00+03:00';
  const first = openWave({ date: '2026-10-08', kind: 'night', until, session: 'orch-1', dir, now: NOW });
  assert.deepEqual(waveSessions(first.file), ['orch-1']);
  openWave({ date: '2026-10-08', kind: 'night', until, session: 'orch-1', dir, now: NOW + 60_000 });
  assert.deepEqual(waveSessions(first.file), ['orch-1'], 'the same session is not written twice');
  // The log after the header may end without a newline, use CRLF, or quote a `Session:` line.
  const logged = `${readFileSync(first.file, 'utf8')}\nPrompt: Session: owner-9 asked about X\nSession: stray\n- 23:10 launched A`;
  writeFileSync(first.file, logged.replace(/\n/g, '\r\n'), 'utf8');
  assert.deepEqual(waveSessions(first.file), ['orch-1'], 'only the lines under the window count');
  openWave({ date: '2026-10-08', kind: 'night', until, session: 'orch-2', dir, now: NOW + 120_000 });
  assert.deepEqual(waveSessions(first.file), ['orch-1', 'orch-2']);
  assert.match(readFileSync(first.file, 'utf8'), /launched A$/);
  const anonymous = openWave({ date: '2026-10-08', kind: 'day', until, dir: store(), now: NOW });
  assert.deepEqual(waveSessions(anonymous.file), [], 'no session, no line');
});

test('the command line records the session it runs in', () => {
  const dir = store();
  const saved = { jobs: process.env.NOACG_JOBS_DIR, session: process.env.CLAUDE_CODE_SESSION_ID };
  const out = process.stdout.write;
  let printed = '';
  try {
    process.env.NOACG_JOBS_DIR = dir;
    process.env.CLAUDE_CODE_SESSION_ID = 'orch-cli';
    process.stdout.write = (chunk) => { printed += chunk; return true; };
    const until = new Date(Date.now() + 3_600_000).toISOString();
    assert.equal(main(['--open', until.slice(0, 10), 'night', '--until', until]), 0);
  } finally {
    process.stdout.write = out;
    for (const [key, value] of [['NOACG_JOBS_DIR', saved.jobs], ['CLAUDE_CODE_SESSION_ID', saved.session]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  assert.deepEqual(waveSessions(printed.trim()), ['orch-cli']);
});

// A PLAN RUN opens through the same store, so it and a wave exclude each other with one check.

test('a plan run and a wave refuse each other, and a plan run gets the same 24-hour ceiling', () => {
  const dir = store();
  const run = openWave({ date: '2026-10-08', kind: 'plan-editor', until: '2026-10-09T06:00:00+03:00', dir, now: NOW });
  assert.ok(run.file, run.refusal);
  assert.match(readFileSync(run.file, 'utf8'), /^# Plan run editor 2026-10-08$/m);
  assert.match(openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir, now: NOW }).refusal, /another wave or plan run is open/);

  const other = store();
  openWave({ date: '2026-10-08', kind: 'night', until: '2026-10-09T06:00:00+03:00', dir: other, now: NOW });
  assert.match(openWave({ date: '2026-10-08', kind: 'plan-editor', until: '2026-10-09T06:00:00+03:00', dir: other, now: NOW }).refusal, /another wave is open/);

  assert.match(openWave({ date: '2026-10-08', kind: 'plan-editor', until: '2026-10-10T00:00:00+03:00', dir: store(), now: NOW }).refusal, /24 hours/);
});

test('plan runs of different plans open side by side, and a wave is still refused beside them', () => {
  const dir = store();
  assert.ok(openWave({ date: '2026-10-08', kind: 'plan-editor', until: '2026-10-09T06:00:00+03:00', dir, now: NOW }).file);
  const second = openWave({ date: '2026-10-08', kind: 'plan-remote-mcp', until: '2026-10-09T06:00:00+03:00', dir, now: NOW });
  assert.ok(second.file, second.refusal);
  assert.equal(openWaves(dir, NOW).length, 2);
  assert.match(openWave({ date: '2026-10-08', kind: 'day', until: '2026-10-09T12:00:00+03:00', dir, now: NOW }).refusal, /wave or plan run is open/);
});

// A plan run's WINDOW: the owner names a new `--until` to authorise more time, and a restart repeats
// the old one. Measured 2026-10-11: the new one was ignored and `next` answered time-limit.

/** A plan run's ledger: `## Phases` for `phases` and the four events of every phase in `passed`. */
function ledger(phases, passed) {
  const steps = passed.flatMap((phase) => ['build', 'landed', 'check', 'pass'].map((event) => `- 2026-10-08T21:00:00.000Z phase ${phase} ${event}`));
  return `\n## Phases\n\n${phases.map((name, i) => `${i + 1}. ${name}`).join('\n')}\n\n## Steps\n\n${steps.join('\n')}\n`;
}

test('a new --until the same day is a new window: the lines are rewritten, the ceiling counts from now, the ledger stays, and a wave is refused again beside it', () => {
  const dir = store();
  const morning = openWave({ date: '2026-10-08', kind: 'plan-editor', until: '2026-10-09T02:00:00+03:00', session: 'orch-1', dir, now: NOW });
  assert.equal(morning.window, 'opened');
  writeFileSync(morning.file, `${readFileSync(morning.file, 'utf8')}${ledger(['Shell', 'Keys'], [1])}\n## Report\n\nPhase 1 passed; out of time.\n`, 'utf8');
  const later = NOW + 4 * 3_600_000;
  touch(morning.file, later);
  assert.deepEqual(openWaves(dir, later), [], 'the report let a wave open beside the run');
  // 27 hours after the morning start, 23 after now: only a window measured from now accepts it.
  const evening = openWave({ date: '2026-10-08', kind: 'plan-editor', until: '2026-10-10T02:00:00+03:00', session: 'orch-2', dir, now: later });
  assert.deepEqual(evening, { file: morning.file, window: 'new', previousEnd: '2026-10-09T02:00:00+03:00' });
  touch(evening.file, later);
  const text = readFileSync(evening.file, 'utf8');
  assert.match(text, /^Window starts: 2026-10-09T00:00:00\.000Z$/m);
  assert.match(text, /^Window ends: 2026-10-10T02:00:00\+03:00$/m);
  assert.deepEqual(waveSessions(evening.file), ['orch-1', 'orch-2'], 'the sessions stay under the window');
  assert.match(text, /^1\. Shell$/m);
  assert.match(text, /phase 1 pass$/m, 'the ledger stays');
  assert.match(text, /^## Earlier report$/m);
  assert.doesNotMatch(text, /^## Report/m);
  assert.deepEqual(openWaves(dir, later), [evening.file], 'the run counts as open again');
  assert.match(openWave({ date: '2026-10-09', kind: 'day', until: '2026-10-09T12:00:00+03:00', dir, now: later }).refusal, /another wave or plan run is open/);
});

test('the same --until restarts the run without touching the window', () => {
  const dir = store();
  const first = openWave({ date: '2026-10-08', kind: 'plan-editor', until: '2026-10-09T06:00:00+03:00', dir, now: NOW });
  writeFileSync(first.file, `${readFileSync(first.file, 'utf8')}${ledger(['Shell'], [])}\n## Report\n\nPaused.\n`, 'utf8');
  const before = readFileSync(first.file, 'utf8');
  // The same instant written differently is still the same window.
  const again = openWave({ date: '2026-10-08', kind: 'plan-editor', until: '2026-10-09T06:00+03:00', dir, now: NOW + 3_600_000 });
  assert.deepEqual(again, { file: first.file, window: 'resumed' });
  assert.equal(readFileSync(first.file, 'utf8'), before, 'nothing rewritten, the report stays');
});

test('a new window is still capped at 24 hours from its own start', () => {
  const dir = store();
  const first = openWave({ date: '2026-10-08', kind: 'plan-editor', until: '2026-10-09T02:00:00+03:00', dir, now: NOW });
  const before = readFileSync(first.file, 'utf8');
  const later = NOW + 4 * 3_600_000;
  assert.match(openWave({ date: '2026-10-08', kind: 'plan-editor', until: '2026-10-10T04:00:00+03:00', dir, now: later }).refusal, /24 hours from now/);
  assert.equal(readFileSync(first.file, 'utf8'), before, 'a refused window changes nothing');
  assert.ok(openWave({ date: '2026-10-08', kind: 'plan-editor', until: '2026-10-10T03:00:00+03:00', dir, now: later }).file);
});

test('a new date for a plan whose run is not done is refused and names the file to reopen', () => {
  const dir = store();
  const first = openWave({ date: '2026-10-08', kind: 'plan-editor', until: '2026-10-09T02:00:00+03:00', dir, now: NOW });
  writeFileSync(first.file, `${readFileSync(first.file, 'utf8')}${ledger(['Shell', 'Keys'], [1])}\n## Report\n\nPhase 1 passed; out of time.\n`, 'utf8');
  const tomorrow = NOW + 24 * 3_600_000;
  touch(first.file, tomorrow);
  const until = '2026-10-10T06:00:00+03:00';
  const refused = openWave({ date: '2026-10-09', kind: 'plan-editor', until, dir, now: tomorrow });
  assert.match(refused.refusal, /unfinished run/);
  assert.ok(refused.refusal.includes(first.file), refused.refusal);
  assert.match(refused.refusal, /--open 2026-10-08 plan-editor --until 2026-10-10T06:00:00\+03:00/);
  assert.equal(existsSync(path.join(dir, 'wave-plans', wavePlanName('2026-10-09', 'plan-editor'))), false, 'no empty ledger is started');
  // Once every phase has passed, the plan is done and a new date is free.
  writeFileSync(first.file, `${readFileSync(first.file, 'utf8')}${ledger(['Shell', 'Keys'], [1, 2])}`, 'utf8');
  touch(first.file, tomorrow);
  assert.equal(openWave({ date: '2026-10-09', kind: 'plan-editor', until, dir, now: tomorrow }).window, 'opened');
  // A run that never got its phases is not a run to continue.
  const bare = store();
  writeFileSync(path.join(bare, 'wave-plans', wavePlanName('2026-10-08', 'plan-editor')), '# Plan run editor 2026-10-08\n\n## Report\n\nNever started.\n', 'utf8');
  assert.ok(openWave({ date: '2026-10-09', kind: 'plan-editor', until, dir: bare, now: tomorrow }).file);
});
