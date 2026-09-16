#!/usr/bin/env node
// gate: build
// guards: .gitattributes, package.json, scripts/fixtures/package-merge-corpus.json
//
// Resolve a conflict in `package.json` by merging the two JSON objects instead of their text.
//
//   node scripts/package-merge-driver.mjs --check          # part of `npm run build`
//   node scripts/package-merge-driver.mjs --install        # register the driver in this clone
//   node scripts/package-merge-driver.mjs --record         # re-record the corpus from git history
//   node scripts/package-merge-driver.mjs %O %A %B %P      # what git runs, per conflicted file
//
// WHY. `package.json` is the most hand-resolved file in the repository - 13 of the 60 resolutions
// in the 45 days to 2026-09-16, three times the next file - and not one of those resolutions had a
// decision in it. A branch adds a script line, main adds a different one, and git cannot place two
// insertions in the same region of a 170-entry block. The correct answer was always both lines.
// `node scripts/metrics/conflict-trace.mjs` is where that count comes from, and re-running it is how
// anyone checks whether this file is still earning its place.
//
// WHAT THE HISTORY ACTUALLY SHOWS, and it is not what the backlog predicted. All thirteen
// resolutions changed `scripts.build` on BOTH sides, so a driver that conflicted on every key the
// two sides both touched would have deleted NOTHING. `scripts.build` is an `&&` chain and
// `scripts.test:jobs` is a space-separated file list: two branches each append a step, and the
// committed answer is both steps in the places their authors put them. So the union has to reach
// one level further down, into the VALUE - which is an ordinary three-way merge over the value's
// tokens, and git already owns that (`git merge-file`). Nothing here re-implements diffing.
//
// THE RULE, in one line: take a side's change when the other side did not make one, keep BOTH when
// the two changes are pure additions, and CONFLICT, loudly, on everything else. That last clause is
// the whole safety argument - this driver is incapable of choosing between two texts, so a
// dependency range bumped two different ways, a script body rewritten two different ways and a key
// one side deleted while the other edited it all still stop the merge and still get a person.
// `onlyAdds` is where the line is drawn, and the comment there carries the case that drew it.
//
// KEY ORDER is merged the same way, over the list of key names, so a key lands where its author
// put it and the file does not churn on the next landing. Order is presentation, never meaning, so
// an order that cannot be merged falls back (ours, then the keys only theirs has) rather than
// stopping the merge over a cosmetic disagreement.
//
// WHAT IT DOES NOT PROMISE. Two sides that add the SAME step at DIFFERENT points in one chain get
// both copies: base `a && b`, ours `a && x && b`, theirs `a && b && x`, and the merge runs `x`
// twice. That is the honest cost of a union - the two edits are disjoint by every test that does
// not already know what `x` means - and telling it apart needs a real diff of each side against
// the base rather than the three-way merge git already does. It is left alone because a step that
// runs twice is a slow build somebody notices, not a quiet wrong answer, and because the rule that
// would catch it ("both sides added the same token") fires on every `&&` and every `node`.
//
// `package-lock.json` is not merged here either. Its conflicts are resolved by regenerating it,
// which is a different mechanism, and a union of two lock files is not a lock.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { measured } from './measured.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = '[package-merge-driver]';

export const DRIVER_NAME = 'noacg-package';
export const CORPUS_FILE = 'scripts/fixtures/package-merge-corpus.json';

/** Nothing at this key on this side. Distinct from a key whose value is `undefined` or null. */
const ABSENT = Symbol('absent');

const git = (args, cwd = ROOT) => spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true });

// ---------------------------------------------------------------------------------------------
// Registration - the same shape as scripts/contracts-merge-driver.mjs, so there is one story for
// "this file is merged by a program" rather than two.
// ---------------------------------------------------------------------------------------------

/** Is the driver registered in this clone? A worktree shares the common dir's config. */
export function isInstalled(cwd = ROOT) {
  return git(['config', '--get', `merge.${DRIVER_NAME}.driver`], cwd).status === 0;
}

/**
 * What git is told to run. A RELATIVE path, and that is the whole point.
 *
 * Git runs a merge driver from the top of the working tree being merged - measured, including a
 * `git merge` started from a subdirectory - so this one command serves every worktree of this
 * clone. An ABSOLUTE path would not: worktrees share one `.git/config`, so the first checkout to
 * register would own the entry forever, and this repository creates and deletes a worktree per
 * session. The sibling contracts driver registers an absolute path and in this very clone it
 * already points at `agent-ae47713a44213dee3`, which no longer exists.
 *
 * That matters more here than it would anywhere else, because of what git does when the command
 * cannot run: it reports `CONFLICT (content)`, marks the file `UU`, and leaves OUR VERSION in the
 * working tree with no conflict markers in it. The person opens a conflicted file, sees clean
 * JSON, stages it, and every change the other side made to package.json is gone. A stale path
 * would turn this driver into the silent data loss it exists to prevent.
 *
 * The path is present exactly when it is needed: `.gitattributes` names the driver and this script
 * landed in the same commit, and git reads that attribute from the working tree it is merging into.
 */
export const DRIVER_COMMAND = 'node "scripts/package-merge-driver.mjs" %O %A %B %P';

/**
 * Register the driver, or correct it. Cheap enough to call on every build, and it must be: git
 * config is per clone and is not committed, so a fresh checkout has it missing, and a clone where
 * it is WRONG is worse than one where it is missing.
 */
export function install(cwd = ROOT) {
  git(['config', `merge.${DRIVER_NAME}.name`, 'Merge package.json as JSON, key by key'], cwd);
  return git(['config', `merge.${DRIVER_NAME}.driver`, DRIVER_COMMAND], cwd).status === 0;
}

// ---------------------------------------------------------------------------------------------
// The merge itself
// ---------------------------------------------------------------------------------------------

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Exactly what `JSON.stringify(v, null, 2)` writes, which is also exactly what npm writes. */
const stableText = (v) => JSON.stringify(v, null, 2);

/** Value identity for merge purposes: two sides agree when they serialize the same, order and all. */
const same = (a, b) => (a === ABSENT || b === ABSENT ? a === b : stableText(a) === stableText(b));

/**
 * A scratch directory for `git merge-file`, created on first use and removed when the merge ends.
 * One per process: a merge touches a handful of values, and three temp files each is cheaper than
 * reimplementing diff3.
 */
let scratchDir = null;

function scratch() {
  scratchDir ??= mkdtempSync(path.join(os.tmpdir(), 'noacg-package-merge-'));
  return scratchDir;
}

function releaseScratch() {
  if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
  scratchDir = null;
}

/**
 * Three-way merge of three lists of lines, by git's own diff3, with ONE class of conflict resolved
 * afterwards - see `settleInsertions`. Lines must not contain newlines; every caller below encodes
 * its units so that they cannot.
 * @returns {string[]|null} null when the two sides disagree inside one region
 */
function mergeLines(base, ours, theirs) {
  const dir = scratch();
  const write = (name, lines) => {
    const file = path.join(dir, name);
    // A trailing newline on every file, so a change at the very end is an ordinary line change
    // rather than a "\ No newline at end of file" difference between the three inputs.
    writeFileSync(file, lines.length ? `${lines.join('\n')}\n` : '', 'utf8');
    return file;
  };
  const res = spawnSync('git', [
    'merge-file', '--diff3', '-q', '-p',
    '-L', 'ours', '-L', 'base', '-L', 'theirs',
    write('ours', ours), write('base', base), write('theirs', theirs),
  ], { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  // GIT FAILING TO RUN IS NOT A VERDICT ABOUT THE CONTENT, and telling the two apart is only
  // possible because `git merge-file` caps its conflict count at 127 and reports any error as 255.
  // Read it as a conflict count and an unwritable temp directory becomes "merged to nothing":
  // empty stdout, no conflicts, and `"build": ""` committed without a word.
  if (res.error || res.status === null || res.status < 0 || res.status > 127) return null;
  const text = res.stdout.replace(/\n$/, '');
  const lines = text === '' ? [] : text.split('\n');
  return res.status === 0 ? lines : settleInsertions(lines);
}

/**
 * THE ONE CONFLICT THAT IS NOT A DISAGREEMENT, and the thirteen real resolutions are why it is
 * here. On 2026-09-14 one branch appended two test files to the end of a `node --test` list while
 * main appended a third. diff3 calls two insertions at the same point a conflict, because it
 * cannot know which goes first - but NOTHING IS IN DISPUTE: the base text in that region is empty,
 * so neither side removed or rewrote anything the other side wrote, and keeping both keeps every
 * character both authors typed. The committed resolution was exactly that, ours then theirs.
 *
 * A region whose BASE side is NOT empty is left conflicted, and that is the whole safety argument.
 * A dependency range bumped two different ways, a script body rewritten two different ways, a step
 * one side deleted and the other side edited - every one of those has base text under it, so every
 * one of them still stops the merge and still gets a person. This rule can only ever ADD, never
 * choose between two texts, so the outcome it is incapable of producing is the silent one.
 * @returns {string[]|null}
 */
function settleInsertions(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i] !== '<<<<<<< ours') {
      out.push(lines[i]);
      continue;
    }
    const baseAt = lines.indexOf('||||||| base', i);
    const sepAt = lines.indexOf('=======', baseAt);
    const endAt = lines.indexOf('>>>>>>> theirs', sepAt);
    if (baseAt < 0 || sepAt < 0 || endAt < 0) return null;
    // Non-empty base region: one of the two sides changed text the other side also changed.
    if (sepAt - baseAt > 1) return null;
    out.push(...lines.slice(i + 1, baseAt), ...lines.slice(sepAt + 1, endAt));
    i = endAt;
  }
  return out;
}

/**
 * How one string is cut into merge units and put back together. A single-line value (every script
 * body, every version range) is split on whitespace, each token carrying the whitespace that
 * precedes it, so rejoining is plain concatenation and no spacing is invented. A value with
 * newlines in it is merged by line instead.
 *
 * `multiline` is decided once for all three sides by the caller rather than per string: three
 * values cut two different ways cannot be compared against each other at all.
 */
function unitsOf(text, multiline) {
  if (multiline) return { units: text.split('\n'), join: (u) => u.join('\n') };
  const units = text.match(/\s*\S+/g) ?? [];
  const tail = text.slice(units.join('').length); // trailing whitespace, kept verbatim
  return { units, join: (u) => u.join('') + tail };
}

/**
 * Is `side` the base sequence with things ADDED and nothing removed or replaced? That is exactly
 * "base is a subsequence of side", and it is the precondition for merging a value at all.
 *
 * THIS GATE IS THE DIFFERENCE BETWEEN A UNION AND A GUESS, and it is here because diff3 alone got
 * a case wrong. With base `eslint .`, ours `eslint . --max-warnings 0` and theirs `biome check .`,
 * the two edits land in different token regions, so diff3 merges them cleanly into
 * `biome check . --max-warnings 0` - a command neither author wrote and nobody would want. Theirs
 * REPLACED a base token, which is a rewrite, and a rewrite against an edit is a disagreement
 * however tidily the regions happen to line up. Only when both sides purely add does "keep both"
 * mean what it sounds like.
 */
function onlyAdds(base, side) {
  let i = 0;
  for (const unit of side) if (i < base.length && unit === base[i]) i += 1;
  return i === base.length;
}

/**
 * The whole merge rule, over units somebody else encoded: refuse unless BOTH sides only added, and
 * otherwise let diff3 interleave the additions. A string value and an array value are the same
 * problem once they are lists of lines, so they ask the same question here.
 * @returns {string[]|null}
 */
function mergeUnits(base, ours, theirs) {
  if (!onlyAdds(base, ours) || !onlyAdds(base, theirs)) return null;
  return mergeLines(base, ours, theirs);
}

/** Merge two edits of the same string. Both sides appending to an `&&` chain is the common case. */
function mergeStrings(base, ours, theirs) {
  const multiline = [base, ours, theirs].some((s) => s.includes('\n'));
  const [b, o, t] = [base, ours, theirs].map((s) => unitsOf(s, multiline));
  const merged = mergeUnits(b.units, o.units, t.units);
  return merged === null ? { ok: false } : { ok: true, value: o.join(merged) };
}

/**
 * The order the merged keys come out in. Both sides insert into the same list, so the same diff3
 * that merges a script body merges the key names.
 *
 * A conflict here is NOT a merge failure. Two branches that each added a key in the same place
 * disagree about presentation and about nothing else, and stopping a landing over that would be
 * the conflict this file exists to remove, wearing a different hat. The fallback is ours' order
 * with theirs' additions after it, which is deterministic and keeps every key.
 */
function mergeKeyOrder(base, ours, theirs) {
  const ordered = mergeLines(base, ours, theirs) ?? [...ours, ...theirs.filter((k) => !ours.includes(k))];
  // diff3 works on lines, so a key deleted on one side and re-added on the other could in
  // principle appear twice. De-duplicate rather than emit a JSON object with a repeated key.
  return [...new Set(ordered)];
}

/**
 * Merge one value three ways. `path` is only carried so a conflict can name itself.
 * @returns {{ value: unknown, conflicts: string[] }}
 */
function mergeValue(base, ours, theirs, where) {
  if (same(ours, theirs)) return { value: ours, conflicts: [] };
  if (same(ours, base)) return { value: theirs, conflicts: [] }; // only theirs changed
  if (same(theirs, base)) return { value: ours, conflicts: [] }; // only ours changed

  // Both sides changed it, differently. That is a conflict UNLESS the two changes are disjoint
  // edits of the same structure, which is what everything below tries to establish.
  if (isPlainObject(ours) && isPlainObject(theirs)) {
    return mergeObjects(isPlainObject(base) ? base : {}, ours, theirs, where);
  }
  if (Array.isArray(ours) && Array.isArray(theirs)) {
    // Elements as JSON lines: an array of strings merges by element, and an array of objects by
    // whole element, which is the only granularity that keeps each element valid JSON. An array
    // needs no base to merge against, unlike a string: splicing two version ranges together makes
    // something that is not a version, while splicing two lists together is still a list.
    const line = (v) => JSON.stringify(v);
    const merged = mergeUnits((Array.isArray(base) ? base : []).map(line), ours.map(line), theirs.map(line));
    if (merged === null) return { value: ours, conflicts: [where] };
    return { value: merged.map((l) => JSON.parse(l)), conflicts: [] };
  }
  // A STRING IS ONLY MERGEABLE AGAINST A REAL ONE. With no base TEXT - the key is new on both
  // sides, or the base value was blank - every token on both sides reads as an insertion, and the
  // insertion rule would happily "merge" the ranges `^5.1.0` and `^5.2.0` into `^5.1.0 ^5.2.0`.
  // That is the silent corruption this driver must not be capable of, so an add/add of a string
  // goes to a person however small the two values are. The test is on the base's CONTENT and not
  // on its length, because a base of one space has no tokens either and read the same way.
  if (typeof ours === 'string' && typeof theirs === 'string' && typeof base === 'string' && base.trim() !== '') {
    const merged = mergeStrings(base, ours, theirs);
    if (!merged.ok) return { value: ours, conflicts: [where] };
    return { value: merged.value, conflicts: [] };
  }
  // A number, a boolean, a null, or two sides that stopped agreeing about the SHAPE of the value.
  // There is no union of those, and guessing one is the failure this driver must not have.
  return { value: ours, conflicts: [where] };
}

/**
 * Put the surviving keys in order. The merged order list is the sequence, and anything it dropped
 * goes back beside the neighbour it had on whichever side still lists it.
 *
 * WHICH KEYS SURVIVE IS NOT DECIDED HERE, and the first draft of this file got that wrong. It read
 * the merged key order as the key set, so `scripts.a` deleted on our side and edited on theirs
 * came out of diff3 as a plain deletion and was gone before anything asked whether the two sides
 * agreed about it - the delete-versus-edit conflict resolved itself, silently, in the one
 * direction that loses a person's work. Membership is `mergeValue`'s answer; order is only order.
 */
function orderKeys(merged, surviving, sides) {
  const out = merged.filter((key) => surviving.has(key));
  for (const key of surviving.keys()) {
    if (out.includes(key)) continue;
    const list = sides.find((side) => side.includes(key)) ?? [];
    const previous = list.slice(0, list.indexOf(key)).reverse().find((k) => out.includes(k));
    out.splice(previous ? out.indexOf(previous) + 1 : 0, 0, key);
  }
  return out;
}

/** @returns {{ value: Record<string, unknown>, conflicts: string[] }} */
function mergeObjects(base, ours, theirs, where = '') {
  const sides = [Object.keys(ours), Object.keys(theirs), Object.keys(base)];
  const at = (obj, key) => (Object.hasOwn(obj, key) ? obj[key] : ABSENT);
  const surviving = new Map();
  const conflicts = [];
  for (const key of new Set([...sides[2], ...sides[0], ...sides[1]])) {
    const here = where ? `${where}.${key}` : key;
    const merged = mergeValue(at(base, key), at(ours, key), at(theirs, key), here);
    conflicts.push(...merged.conflicts);
    if (merged.value !== ABSENT) surviving.set(key, merged.value);
    // A key both sides deleted, or one side deleted and the other left alone, is simply gone. A
    // key one side deleted while the other CHANGED it is a conflict, and it has to keep a slot in
    // the object so the marker block has somewhere to render.
    else if (merged.conflicts.length > 0) surviving.set(key, null);
  }
  const order = orderKeys(mergeKeyOrder(sides[2], sides[0], sides[1]), surviving, sides);
  const value = {};
  for (const key of order) value[key] = surviving.get(key);
  return { value, conflicts };
}

/**
 * Merge three package.json TEXTS.
 * @returns {{ text: string, conflicts: string[] }} `text` carries git conflict markers, and is
 * therefore not valid JSON, exactly when `conflicts` is non-empty.
 */
export function mergePackageText(baseText, oursText, theirsText) {
  try {
    const base = JSON.parse(baseText || '{}');
    const ours = JSON.parse(oursText);
    const theirs = JSON.parse(theirsText);
    const { value, conflicts } = mergeObjects(isPlainObject(base) ? base : {}, ours, theirs);
    const eol = oursText.includes('\r\n') ? '\r\n' : '\n';
    const text = conflicts.length === 0
      ? stableText(value) + '\n'
      : renderConflicted(value, conflicts, base, ours, theirs);
    return { text: eol === '\n' ? text : text.replaceAll('\n', '\r\n'), conflicts };
  } finally {
    releaseScratch();
  }
}

/**
 * The merged file with a git-style marker block at each key the two sides really disagree about.
 * Every OTHER key is already settled, so the person who opens this file reads one disagreement
 * instead of a 170-line block - which is the whole point even on the merges that do need them.
 */
function renderConflicted(merged, conflicts, base, ours, theirs) {
  const conflicted = new Set(conflicts);
  const at = (obj, keys) => keys.reduce((node, k) => (isPlainObject(node) && Object.hasOwn(node, k) ? node[k] : undefined), obj);

  const render = (node, trail, depth) => {
    const pad = '  '.repeat(depth + 1);
    if (Array.isArray(node)) {
      if (node.length === 0) return '[]';
      return `[\n${node.map((v) => pad + stableIndented(v, depth + 1)).join(',\n')}\n${'  '.repeat(depth)}]`;
    }
    if (!isPlainObject(node)) return JSON.stringify(node);
    const keys = Object.keys(node);
    if (keys.length === 0) return '{}';
    const lines = [];
    keys.forEach((key, i) => {
      const here = [...trail, key];
      const last = i === keys.length - 1;
      const comma = last ? '' : ',';
      if (!conflicted.has(here.join('.'))) {
        lines.push(`${pad}${JSON.stringify(key)}: ${render(node[key], here, depth + 1)}${comma}`);
        return;
      }
      // A side that does not have the key at all shows an EMPTY section rather than a made-up
      // value, so "delete it" is one of the answers the person can pick by deleting lines.
      //
      // Which is only true if the comma comes with it. A conflicted key that is LAST in its object
      // is separated from the key before it by a comma that belongs to IT, so an empty section
      // leaves `"build": "b",` in front of a `}` - a resolution that looks finished and no longer
      // parses. Git solves this by absorbing the neighbouring line into the block, and so does
      // this: the preceding entry is pulled into every side, with its comma only where the key
      // actually follows. Not when that entry is itself a conflict block, because nesting two
      // disagreements inside one another helps nobody.
      const absorbs = last && lines.length > 0 && !lines.at(-1).startsWith('<<<<<<< ')
        && [ours, base, theirs].some((obj) => at(obj, here) === undefined);
      const previous = absorbs ? lines.pop() : null;
      const side = (obj) => {
        const v = at(obj, here);
        const own = v === undefined ? [] : [`${pad}${JSON.stringify(key)}: ${stableIndented(v, depth + 1)}${comma}`];
        if (!absorbs) return own;
        return [own.length > 0 ? previous : previous.replace(/,$/, ''), ...own];
      };
      lines.push(['<<<<<<< ours', ...side(ours), '||||||| base', ...side(base), '=======', ...side(theirs), '>>>>>>> theirs'].join('\n'));
    });
    // Each line already carries its own separating comma, because a conflict block needs one on
    // every side of the markers rather than one after the block.
    return `{\n${lines.join('\n')}\n${'  '.repeat(depth)}}`;
  };
  return `${render(merged, [], 0)}\n`;
}

/** `JSON.stringify(v, null, 2)` re-indented to sit at `depth`, so nested values stay readable. */
function stableIndented(value, depth) {
  return stableText(value).replaceAll('\n', `\n${'  '.repeat(depth)}`);
}

// ---------------------------------------------------------------------------------------------
// The corpus - every real resolution in the measured window, replayed
// ---------------------------------------------------------------------------------------------

export function loadCorpus(root = ROOT) {
  return JSON.parse(readFileSync(path.join(root, CORPUS_FILE), 'utf8'));
}

/**
 * Does `.gitattributes` actually hand package.json to this driver? Registering the driver in git
 * config achieves precisely nothing without that line, so both the build gate and the test ask
 * here rather than each carrying its own copy of the pattern.
 */
export function namedInAttributes(root = ROOT) {
  const attributes = readFileSync(path.join(root, '.gitattributes'), 'utf8');
  return new RegExp(`^/?package\\.json\\s+merge=${DRIVER_NAME}\\b`, 'm').test(attributes);
}

/**
 * Replay every recorded resolution and report the ones the driver does not reproduce.
 * @returns {{ cases: number, failures: {merge: string, subject: string, detail: string}[] }}
 */
export function replayCorpus(corpus = loadCorpus()) {
  const failures = [];
  for (const record of corpus.cases) {
    const text = (name) => `${stableText(record[name])}\n`;
    const { text: got, conflicts } = mergePackageText(text('base'), text('ours'), text('theirs'));
    const want = text('expected');
    if (conflicts.length > 0) failures.push({ merge: record.merge, subject: record.subject, detail: `conflicted on ${conflicts.join(', ')}` });
    else if (got !== want) failures.push({ merge: record.merge, subject: record.subject, detail: firstDifference(want, got) });
  }
  return { cases: corpus.cases.length, failures };
}

/** The first line that differs, which is what a person needs to see and all they need to see. */
function firstDifference(want, got) {
  const a = want.split('\n');
  const b = got.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) return `line ${i + 1}\n    committed: ${a[i] ?? '(end of file)'}\n    driver:    ${b[i] ?? '(end of file)'}`;
  }
  return 'identical text, which should not be reachable';
}

/**
 * Re-record the corpus from git history. Needs a full clone, so it is a thing a person runs, never
 * a thing the build runs: `.github/workflows/ci.yml` checks the build job out at depth 1 and would
 * find no merges at all.
 */
function record(days = 45) {
  const stream = git(['log', '--merges', `--since=${days}.days`, '--cc', '--format=@@%H', 'origin/main']);
  if (stream.status !== 0) {
    console.error(`${LABEL} could not read the merge history - --record needs a full clone.\n${stream.stderr}`);
    return 1;
  }
  const shas = [];
  let current = null;
  for (const line of stream.stdout.split('\n')) {
    if (/^@@[0-9a-f]{40}$/.test(line)) current = line.slice(2);
    else if (line === 'diff --cc package.json' && current) shas.push(current);
  }
  const cases = [];
  for (const sha of shas) {
    const parents = git(['rev-list', '--parents', '-n', '1', sha]).stdout.trim().split(/\s+/).slice(1);
    if (parents.length !== 2) continue;
    const base = git(['merge-base', parents[0], parents[1]]).stdout.trim();
    const read = (rev) => {
      const res = git(['show', `${rev}:package.json`]);
      if (res.status !== 0) return null;
      // Refuse anything that does not round-trip: the corpus is stored as objects, and that is
      // only a faithful record of the file while the file is exactly what npm's writer emits.
      const parsed = JSON.parse(res.stdout);
      return `${stableText(parsed)}\n` === res.stdout ? parsed : null;
    };
    const versions = { base: read(base), ours: read(parents[0]), theirs: read(parents[1]), expected: read(sha) };
    if (Object.values(versions).some((v) => v === null)) {
      console.error(`${LABEL} skipping ${sha.slice(0, 8)} - a version of package.json there is not in npm's own formatting`);
      continue;
    }
    const subject = git(['log', '-1', '--format=%s', sha]).stdout.trim();
    cases.push({ merge: sha, subject, ...versions });
  }
  const corpus = {
    recorded: new Date().toISOString().slice(0, 10),
    window: `${days} days of merges reachable from origin/main whose combined diff names package.json`,
    why: 'Every one of these was resolved by hand and none of them needed a decision. Re-record with `node scripts/package-merge-driver.mjs --record`.',
    cases,
  };
  writeFileSync(path.join(ROOT, CORPUS_FILE), `${stableText(corpus)}\n`, 'utf8');
  console.log(`${LABEL} recorded ${cases.length} resolution(s) to ${CORPUS_FILE}`);
  return 0;
}

// ---------------------------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------------------------

/** `npm run check:package-merge`: the driver still reproduces history, and this clone can use it. */
function check() {
  const { cases, failures } = replayCorpus();
  measured(cases, 'recorded package.json resolutions replayed');
  if (failures.length > 0) {
    console.error(`${LABEL} the driver no longer reproduces ${failures.length} of ${cases} recorded resolution(s):`);
    for (const f of failures) console.error(`  - ${f.merge.slice(0, 8)} ${f.subject}\n    ${f.detail}`);
    return 1;
  }
  if (!namedInAttributes()) {
    console.error(`${LABEL} .gitattributes does not give package.json merge=${DRIVER_NAME}, so nothing would call this driver.`);
    return 1;
  }
  // Registering here rather than in a setup step nobody runs: `npm run build` is the command every
  // session already runs, git config is per clone so a fresh checkout has it missing, and writing
  // it costs one `git config`. UNCONDITIONALLY, not only when it is missing - an entry left over
  // from an older version of this script would otherwise stand forever, and `DRIVER_COMMAND` says
  // what a wrong one costs. Reported, never failed: a runner that never resolves a conflict loses
  // nothing by not having it, and a read-only git dir must not fail the build.
  if (!install()) console.log(`${LABEL} note: could not register merge.${DRIVER_NAME}.driver in this clone.`);
  console.log(`${LABEL} OK - ${cases} recorded resolution(s) reproduced, package.json merged by ${DRIVER_NAME}`);
  return 0;
}

/** Git hands us the ancestor (%O), OUR version (%A, and the file to write), THEIRS (%B), path (%P). */
function resolve(baseFile, oursFile, theirsFile, target) {
  let merged;
  try {
    merged = mergePackageText(
      existsSync(baseFile) ? readFileSync(baseFile, 'utf8') : '',
      readFileSync(oursFile, 'utf8'),
      readFileSync(theirsFile, 'utf8'),
    );
  } catch (error) {
    // One side is not parseable JSON - most likely because something upstream already wrote
    // conflict markers into it. Leave git's own file alone and let the person see it.
    console.error(`${LABEL} could not merge ${target} as JSON (${error.message}) - leaving it to git.`);
    return 1;
  }
  writeFileSync(oursFile, merged.text, 'utf8');
  if (merged.conflicts.length === 0) return 0;
  console.error(`${LABEL} ${target}: merged every key but ${merged.conflicts.length}, which both sides changed differently:`);
  for (const key of merged.conflicts) console.error(`  - ${key}`);
  console.error(`${LABEL} those need a person. The rest of the file is already resolved.`);
  return 1;
}

function main(argv) {
  if (argv.includes('--check')) return check();
  if (argv.includes('--record')) return record();
  if (argv.includes('--install')) {
    const ok = install();
    console.log(`${LABEL} ${ok ? 'registered' : 'could not register'} merge.${DRIVER_NAME}.driver in this clone`);
    return ok ? 0 : 1;
  }
  const [base, ours, theirs, target] = argv;
  if (!base || !ours || !theirs || !target) {
    console.error(`${LABEL} expects git's %O %A %B %P, or --check, --install or --record.`);
    return 2;
  }
  return resolve(base, ours, theirs, target);
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) process.exit(main(process.argv.slice(2)));
