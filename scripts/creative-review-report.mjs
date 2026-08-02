// Join blind pairwise judgements back to the arms and report criterion 4
// (docs/CREATIVE_MODE_PLAN.md §11.4: "pairwise win rate of arm C (and D) over arm A, per
// category", threshold >= 60%, ties excluded, >= 20 joined items per comparison).
//
//   node scripts/creative-review-report.mjs [gallery-dir]
//
// Reads judgements.jsonl + blind-key.json from the gallery directory. The reviewer's answer is
// a SIDE ("left"/"right"); the key says which arm sat on that side. Nothing else joins them -
// which is what makes the review blind and this script the only place the two meet.
//
// What it refuses to do:
//   - report a win rate on fewer than the plan's minimum joined items (it prints the count and
//     says the threshold cannot be read, rather than printing a number that looks like a result);
//   - pool the categories (§11: "a promotion argument must say which categories carried it");
//   - hide the repeat. If the reviewer answered the unmarked repeat differently from its twin,
//     their own test-retest disagreed, and every margin narrower than that is inside their noise.
//     That is reported FIRST, because it is the number that says whether to trust the rest.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || './creative-gallery');
const MIN_JOINED = 20;          // §6e - below this, no threshold conclusion
const THRESHOLD = 0.6;          // §11.4 - arm C over arm A, per category

const read = async (file) => {
  try {
    return await readFile(path.join(DIR, file), 'utf8');
  } catch {
    console.error(`Missing ${file} in ${DIR}`);
    process.exit(2);
  }
};

const key = new Map(JSON.parse(await read('blind-key.json')).map((k) => [k.code, k]));
const judgements = (await read('judgements.jsonl'))
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => JSON.parse(l));

if (!judgements.length) {
  console.error('No judgements found.');
  process.exit(1);
}

// ── The repeat: does the reviewer agree with themselves? ────────────────────
const repeatEntry = [...key.values()].find((k) => k.repeatOf);
let repeatLine = 'No repeat item in this gallery.';
if (repeatEntry) {
  const twin = judgements.find((j) => j.code === repeatEntry.repeatOf);
  const rep = judgements.find((j) => j.code === repeatEntry.code);
  if (!twin || !rep) {
    repeatLine = 'Repeat pair not both judged - test-retest not measurable.';
  } else {
    // The repeat has its SIDES SWAPPED, so agreeing means answering the mirrored side.
    const mirror = { left: 'right', right: 'left', neither: 'neither', tie: 'tie', skipped: 'skipped' };
    const agreed = mirror[twin.verdict] === rep.verdict;
    repeatLine = agreed
      ? 'Repeat: CONSISTENT - the reviewer picked the same graphic both times.'
      : `Repeat: INCONSISTENT - "${twin.verdict}" then "${rep.verdict}" (sides swapped) on the same pair. ` +
        'Treat any margin near the threshold as inside the reviewer\'s own noise.';
  }
}

// ── Join ────────────────────────────────────────────────────────────────────
const rows = [];
for (const j of judgements) {
  const k = key.get(j.code);
  if (!k || k.repeatOf) continue;             // the repeat is diagnostics, never a data point
  if (j.verdict === 'skipped') continue;
  const winner = j.verdict === 'left' ? k.left : j.verdict === 'right' ? k.right : j.verdict;
  rows.push({ ...k, verdict: j.verdict, winner, notes: j.notes });
}

const groups = new Map();
for (const r of rows) {
  const g = `${r.category} :: ${r.challenger} vs A`;
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(r);
}

console.log(`\n${repeatLine}\n`);
console.log(`Judged ${judgements.length} item(s); ${rows.length} joined to a comparison.\n`);

for (const [name, list] of [...groups].sort()) {
  const decisive = list.filter((r) => r.winner === 'A' || r.winner === r.challenger);
  const wins = decisive.filter((r) => r.winner === r.challenger).length;
  const neither = list.filter((r) => r.verdict === 'neither').length;
  const ties = list.filter((r) => r.verdict === 'tie').length;
  console.log(`${name}`);
  console.log(`  ${list.length} judged - ${decisive.length} decisive, ${ties} tie, ${neither} neither airable`);
  if (!decisive.length) {
    console.log('  no decisive pair - nothing to rate\n');
    continue;
  }
  const rate = wins / decisive.length;
  const verdict = decisive.length < MIN_JOINED
    ? `below the ${MIN_JOINED}-item minimum - REPORTED, NOT A CONCLUSION`
    : rate >= THRESHOLD ? `PASSES the ${THRESHOLD * 100}% threshold` : `FAILS the ${THRESHOLD * 100}% threshold`;
  console.log(`  challenger wins ${wins}/${decisive.length} = ${(rate * 100).toFixed(0)}%  (${verdict})`);
  // "Neither airable" is its own finding: an arm can win a pairwise and still not be shippable.
  if (neither) console.log(`  NOTE: ${neither} pair(s) where NEITHER was airable - a win rate cannot see this`);
  console.log('');
}

const notes = rows.filter((r) => r.notes?.trim());
if (notes.length) {
  console.log('Reviewer notes (what was wrong with the rejected one):');
  for (const r of notes) {
    console.log(`  [${r.category}] ${r.brief} - ${r.challenger} vs A, chose ${r.winner}: ${r.notes.trim()}`);
  }
  console.log('');
}

const neitherAll = rows.filter((r) => r.verdict === 'neither');
if (neitherAll.length) {
  console.log(`Briefs where neither arm was airable (${neitherAll.length}):`);
  for (const r of neitherAll) console.log(`  [${r.category}] ${r.brief} (${r.challenger} vs A)`);
  console.log('');
}
