// gate: build
// guards: docs/GOALS.md
//
// The three ways this gate could go quiet, pinned. It resolves its THRESHOLD by a regex over
// prose, which is the exact shape `scripts/measured.mjs` was written about: a constant moves, the
// regex matches nothing, and the gate passes having measured against `undefined`. Here that shape
// is caught by failing closed on a missing cap - so these tests exist to prove the cap is still
// FOUND in the wordings the file plausibly carries, and that the boundary is where it says.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { declaredCap, judge, lineCount } from './check-goals-budget.mjs';

const GOALS = fileURLToPath(new URL('../docs/GOALS.md', import.meta.url));

test('the cap is read from the live file, in both the plain and the tilde wording', () => {
  const live = readFileSync(GOALS, 'utf8');
  assert.equal(typeof declaredCap(live), 'number', 'docs/GOALS.md must still state its own budget');
  assert.equal(declaredCap('x **Keep it under 200 lines** y'), 200);
  // The wording the file carried until 2026-09-16, and the one a reader is most likely to restore.
  assert.equal(declaredCap('x **Keep it under ~200 lines** y'), 200);
});

test('a cap stated below the first heading is not a declaration', () => {
  // Only the opening paragraph counts, so a `## ` section quoting the sentence cannot set the cap -
  // which is what stops the archive's own copy of the rule from being read as the rule.
  assert.equal(declaredCap('# Goals\n\nno budget here\n\n## Later\n\n**Keep it under 999 lines**'), null);
});

test('a reworded sentence fails closed rather than falling back to a default', () => {
  assert.equal(declaredCap('# Goals\n\nKeep it roughly short.\n'), null);
  assert.equal(judge(null, 10).ok, false);
});

test('lines are counted with or without a trailing newline, on either line ending', () => {
  assert.equal(lineCount('a\nb\nc\n'), 3);
  assert.equal(lineCount('a\nb\nc'), 3, 'a last line with no newline after it is still a line');
  assert.equal(lineCount('a\r\nb\r\n'), 2, 'a CRLF working copy must agree with CI');
});

test('the boundary is the cap itself: at it passes, one over fails', () => {
  assert.equal(judge(200, 200).ok, true);
  assert.equal(judge(200, 201).ok, false);
  assert.match(judge(200, 201).message, /201 lines against the 200 it declares/);
});

test('the live roadmap is inside the budget it declares', () => {
  const live = readFileSync(GOALS, 'utf8');
  const verdict = judge(declaredCap(live), lineCount(live));
  assert.equal(verdict.ok, true, verdict.message);
});
