#!/usr/bin/env node
// gate: build
// guards: docs/GOALS.md
//
// THE ROADMAP STAYS INSIDE THE BUDGET IT DECLARES.
//
//   node scripts/check-goals-budget.mjs        # part of `npm run build`
//
// `docs/GOALS.md` states its own cap in its opening paragraph - "Keep it under 200 lines: a roadmap
// nobody can read in one sitting steers nothing" - and for three rounds running the file ignored
// it. 460 lines on 2026-08-30, 419 when the defect was filed on the shelf, 212 after the
// 2026-09-01 condense, then 284, 308 and 310 as that condense wore off. Each round
// re-read the file and cut it by hand; each time it drifted back within a week, because nothing
// measured it between rounds. A rule visibly ignored in the one file that states it teaches a
// reader that the rules here are decorative, and the next rule they discount may be one that
// matters - which is the real cost, and the reason this is a gate rather than a reminder.
//
// THE CAP IS READ FROM THE FILE, never from this script. The number lives in one place, the
// sentence a reader meets first, so raising it deliberately is an edit to the roadmap's own prose
// and there is no second copy to drift out of step. Three other docs used to restate it; they now
// point here. If the sentence is reworded so the number cannot be found, this gate FAILS rather
// than falling back to a default: a threshold resolved by a regex that silently stops matching is
// exactly the failure `scripts/measured.mjs` exists to stop, and a default would hide it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { measured } from './measured.mjs';

/** The declared cap, read from the opening paragraph. Null when the sentence no longer says it. */
export function declaredCap(text) {
  return Number(text.split(/\r?\n## /, 1)[0].match(/\*\*Keep it under (\d+) lines\*\*/)?.[1]) || null;
}

/** Lines the way `wc -l` counts them, on either line ending, so laptop and CI agree. */
export function lineCount(text) {
  const lines = text.split(/\r?\n/);
  return lines.at(-1) === '' ? lines.length - 1 : lines.length;
}

const GOALS = fileURLToPath(new URL('../docs/GOALS.md', import.meta.url));
const text = readFileSync(GOALS, 'utf8');
const cap = declaredCap(text);
const lines = lineCount(text);
measured(lines, 'lines of docs/GOALS.md');

if (cap === null) {
  console.error(
    '\ncheck-goals-budget: docs/GOALS.md no longer states its budget.\n' +
      '      Its opening paragraph must carry the sentence this gate reads, verbatim:  **Keep it under <n> lines**\n' +
      '      That sentence is the only place the number lives. Restore it, or change the number there to change the cap.\n',
  );
  process.exit(1);
}
if (lines > cap) {
  console.error(
    `\ncheck-goals-budget: docs/GOALS.md is ${lines} lines against the ${cap} it declares.\n` +
      '      The file holds only what is NOT done, so a landed item moves VERBATIM to docs/GOALS_ARCHIVE.md,\n' +
      "      and a parked item's argument belongs in the plan doc for its subject - the roadmap carries the\n" +
      '      item and the link, not the case for it. Raising the cap is a deliberate edit to that sentence.\n',
  );
  process.exit(1);
}
console.log(`check-goals-budget: OK - docs/GOALS.md is ${lines} lines, inside the ${cap} it declares.`);
