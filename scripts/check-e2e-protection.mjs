#!/usr/bin/env node
// gate: workflow ci.yml
// guards: e2e/**, docs/work-specs/**/spec.md
// PROTECTION IS REMOVED ON PURPOSE OR NOT AT ALL (docs/work-specs/e2e-suite-budget/spec.md,
// decision 4). A change that takes coverage out of the merge gate - a spec file deleted, test
// declarations removed, an unconditional skip added, a per-test timeout raised past the gate's
// ceiling - must carry a test-maintenance entry naming what stays protected and by what. Without
// one the plan job fails and so does the gate.
//
//   node scripts/check-e2e-protection.mjs --changed <base>        # the diff this change makes
//   node scripts/check-e2e-protection.mjs --diff <file>           # a unified diff, for tests
//
// WHY. The suite budget work asks for tests to be moved, merged and retired, and the root auto-fix
// rule says a repair never loosens a test, check or limit. Nothing mechanical told the two apart:
// an automatic fixer facing a red spec could delete it, skip it or stretch its timeout and the
// gate would turn green. This check makes removal visible and deliberate: the same edit passes
// when the pull request's work spec says, under `## Test maintenance`, which behaviours the spec
// protected, what protects them now, and where the receipt is. A fixer never writes that section
// (the rule says so), a reviewer reads it like any claim, and the capacity line's budget
// exceptions live in a different section so one cannot stand in for the other.
//
// WHAT COUNTS. Any `e2e/**/*.spec.ts`: a deleted or renamed-away file; fewer `test(` declarations
// after the change than before (a rename within the file nets to zero); an added unconditional
// skip (`test.skip(true, ...)`, `test.skip()`, `test.fixme(...)`, `test.describe.skip(`,
// `skipOldEditor()`); for the offline gate specs (`e2e/*.spec.ts`), an added `test.setTimeout(N)`
// with N above TIMEOUT_CEILING_MS or an added `test.slow()`. A conditional skip (`test.skip(!creds,
// ...)`) is a declared environment, not removed coverage, and passes.
//
// THE ENTRY. One line per spec file under a `## Test maintenance` heading in any
// docs/work-specs/<x>/spec.md:
//
//   - e2e/old-walk.spec.ts: group and ungroup kept by editor-groups journeys and scripts/editor-groups.test.mjs; receipt docs/work-specs/x/evidence/groups.md
//
// The text after the colon is free, and it is what the reviewer judges.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { measured } from './measured.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The gate's per-test ceiling: above it one slow test can carry a shard past its 20-minute cap. */
export const TIMEOUT_CEILING_MS = 120_000;

const SPEC = /^e2e\/.+\.spec\.ts$/;
const GATE_SPEC = /^e2e\/[^/]+\.spec\.ts$/;
const DECLARATION = /^\s*test\(/;
const UNCONDITIONAL_SKIP = /\btest\.(?:describe\.)?(?:skip|fixme)\(\s*(?:true\b|\)|['"`])|\bskipOldEditor\(\)/;
const TIMEOUT = /\btest\.setTimeout\(\s*([\d_]+)\s*\)/;
const SLOW = /\btest\.slow\(\)/;

/**
 * Read a unified diff into per-file facts. Pure.
 * @returns {Map<string, { deleted: boolean, declarationsRemoved: number, declarationsAdded: number, skipsAdded: string[], timeoutsAdded: number[], slowAdded: boolean }>}
 */
export function readDiff(diffText) {
  const files = new Map();
  let current = null;
  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
      const after = m ? m[2].replace(/\\/g, '/') : null;
      current = after && SPEC.test(after) ? after : null;
      if (current && !files.has(current)) files.set(current, { deleted: false, declarationsRemoved: 0, declarationsAdded: 0, skipsAdded: [], timeoutsAdded: [], slowAdded: false });
      continue;
    }
    if (!current) continue;
    const facts = files.get(current);
    if (line.startsWith('deleted file mode')) { facts.deleted = true; continue; }
    if (/^rename to /.test(line)) { continue; }
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('-')) {
      if (DECLARATION.test(line.slice(1))) facts.declarationsRemoved++;
    } else if (line.startsWith('+')) {
      const text = line.slice(1);
      if (DECLARATION.test(text)) facts.declarationsAdded++;
      if (UNCONDITIONAL_SKIP.test(text)) facts.skipsAdded.push(text.trim());
      const t = TIMEOUT.exec(text);
      if (t) facts.timeoutsAdded.push(Number(t[1].replace(/_/g, '')));
      if (SLOW.test(text)) facts.slowAdded = true;
    }
  }
  return files;
}

/** A rename away from e2e/ counts as a deletion; `git diff --name-status` says which. */
export function deletedSpecs(nameStatus) {
  const out = [];
  for (const line of nameStatus.split(/\r?\n/)) {
    const [status, ...rest] = line.trim().split(/\t|\s+/);
    if (!status) continue;
    if (status === 'D' && SPEC.test(rest[0] ?? '')) out.push(rest[0]);
    if (/^R/.test(status) && SPEC.test(rest[0] ?? '') && !SPEC.test(rest[1] ?? '')) out.push(rest[0]);
  }
  return out;
}

/** What each changed spec removed, as reasons; empty when nothing was taken out. Pure. */
export function findings(files, deleted = []) {
  const out = new Map();
  const add = (spec, reason) => out.set(spec, [...(out.get(spec) ?? []), reason]);
  for (const spec of deleted) add(spec, 'the spec file is deleted or moved out of e2e/');
  for (const [spec, f] of files) {
    if (f.deleted && !deleted.includes(spec)) add(spec, 'the spec file is deleted');
    const net = f.declarationsRemoved - f.declarationsAdded;
    if (net > 0) add(spec, `${net} test declaration(s) fewer than before`);
    for (const s of f.skipsAdded) add(spec, `an unconditional skip is added: ${s}`);
    if (GATE_SPEC.test(spec)) {
      for (const ms of f.timeoutsAdded) if (ms > TIMEOUT_CEILING_MS) add(spec, `a per-test timeout of ${ms} ms is added, above the gate's ${TIMEOUT_CEILING_MS} ms ceiling`);
      if (f.slowAdded) add(spec, `test.slow() is added (three times the default, above the gate's ${TIMEOUT_CEILING_MS} ms ceiling)`);
    }
  }
  return out;
}

/** Spec files named under `## Test maintenance` in one work spec's markdown. */
export function parseMaintenance(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Test maintenance\s*$/i.test(l));
  if (start < 0) return [];
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const m = /^-\s+(?:\d{4}-\d{2}-\d{2}\s+)?`?(e2e\/[^\s:`]+\.spec\.ts)`?:\s*(\S.*)$/.exec(line.trim());
    if (m) out.push({ spec: m[1], text: m[2].trim() });
  }
  return out;
}

/** Every maintenance entry in every work spec on disk. */
export function readMaintenance(root = ROOT) {
  const dir = path.join(root, 'docs', 'work-specs');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const folder of readdirSync(dir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const file = path.join(dir, folder.name, 'spec.md');
    if (!existsSync(file)) continue;
    for (const e of parseMaintenance(readFileSync(file, 'utf8'))) out.push({ ...e, from: `docs/work-specs/${folder.name}/spec.md` });
  }
  return out;
}

/** The verdict: findings without an entry are refusals. Pure. */
export function verdict(found, entries) {
  const covered = new Set(entries.map((e) => e.spec.split('/').pop()));
  const refused = [];
  const allowed = [];
  for (const [spec, reasons] of found) (covered.has(spec.split('/').pop()) ? allowed : refused).push({ spec, reasons });
  return { refused, allowed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  let diffText = '';
  let deleted = [];
  const base = value('--changed');
  const diffFile = value('--diff');
  if (diffFile) diffText = readFileSync(diffFile, 'utf8');
  else if (base && !/^0{40}$/.test(base)) {
    const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, windowsHide: true });
    try {
      diffText = git('diff', `${base}...HEAD`, '--', 'e2e');
      deleted = deletedSpecs(git('diff', '--name-status', `${base}...HEAD`, '--', 'e2e'));
    } catch (e) {
      console.log(`::warning title=E2E protection::cannot diff ${base} (${String(e?.message ?? e).split('\n')[0]}) - nothing checked.`);
      process.exit(0);
    }
  } else {
    console.log('check-e2e-protection: no base to diff against - nothing to check.');
    process.exit(0);
  }
  const files = readDiff(diffText);
  measured.optional(files.size + deleted.length, 'changed spec files read from the diff', 'a change that touches no spec file has nothing to remove');
  const found = findings(files, deleted);
  const { refused, allowed } = verdict(found, readMaintenance());
  for (const a of allowed) console.log(`check-e2e-protection: ${a.spec} removes protection (${a.reasons.join('; ')}) and a test-maintenance entry covers it.`);
  if (refused.length === 0) {
    console.log(`check-e2e-protection: OK - ${files.size + deleted.length} changed spec file(s), none removes protection without an entry.`);
    process.exit(0);
  }
  for (const r of refused) {
    console.log(`::error title=E2E protection::${r.spec}: ${r.reasons.join('; ')}. Removing protection needs a line under "## Test maintenance" in the pull request's work spec naming what stays protected and by what (scripts/check-e2e-protection.mjs).`);
  }
  process.exit(1);
}
