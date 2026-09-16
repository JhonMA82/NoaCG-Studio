// What the package.json merge driver unions, what it refuses to guess, and that it still
// reproduces every resolution a person actually made.
//
// The corpus half is the one that matters. `scripts/fixtures/package-merge-corpus.json` holds the
// base, ours, theirs and COMMITTED RESULT of all thirteen package.json resolutions in the 45 days
// to 2026-09-16, recorded straight out of git by `node scripts/package-merge-driver.mjs --record`.
// A driver that reproduces thirteen real human resolutions byte for byte is making the same calls
// a person made; one that quietly resolved a real disagreement would not.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DRIVER_NAME, install, isInstalled, loadCorpus, mergePackageText, replayCorpus } from './package-merge-driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRIVER = path.join(ROOT, 'scripts', 'package-merge-driver.mjs');

const text = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** A small package.json to edit from, in the shape of the real one. */
const BASE = {
  name: 'noacg-studio',
  version: '1.0.0',
  scripts: { build: 'node a.mjs && node b.mjs', lint: 'eslint .', 'test:jobs': 'node --test one.test.mjs two.test.mjs' },
  dependencies: { ai: '^5.0.0' },
  devDependencies: { eslint: '^9.0.0' },
  files: ['dist'],
};

/** `edit` applied to a copy of BASE, as the text git would hand the driver. */
const side = (edit) => {
  const copy = JSON.parse(JSON.stringify(BASE));
  edit(copy);
  return text(copy);
};

const merge = (ours, theirs, base = text(BASE)) => mergePackageText(base, ours, theirs);

// Both streams: a conflict the driver refuses to guess at is reported, and the report is half the
// behaviour - a merge that carries on quietly is the outcome this file exists to rule out.
const run = (args, cwd = ROOT, env = process.env) => {
  const result = spawnSync(process.execPath, [DRIVER, ...args], { cwd, env, encoding: 'utf8', windowsHide: true });
  return { status: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};

test('every resolution a person made in the measured window comes back byte for byte', () => {
  const corpus = loadCorpus();
  // A corpus that emptied itself would let every assertion below pass over nothing.
  assert.ok(corpus.cases.length >= 13, `the corpus holds ${corpus.cases.length} resolutions, and the window measured 13`);
  const { cases, failures } = replayCorpus(corpus);
  assert.deepEqual(failures, [], `the driver no longer reproduces ${failures.length} of ${cases} recorded resolutions`);
});

test('each side adding its own script keeps both, and the file is still what npm writes', () => {
  const { text: merged, conflicts } = merge(
    side((p) => { p.scripts['check:ours'] = 'node ours.mjs'; }),
    side((p) => { p.scripts['check:theirs'] = 'node theirs.mjs'; }),
  );
  assert.deepEqual(conflicts, []);
  const parsed = JSON.parse(merged);
  assert.equal(parsed.scripts['check:ours'], 'node ours.mjs');
  assert.equal(parsed.scripts['check:theirs'], 'node theirs.mjs');
  // npm's own formatting, or the next landing carries a whole-file reformat as its diff.
  assert.equal(merged, text(parsed));
});

test('each side appending a step to the same build chain keeps both steps, in place', () => {
  const { text: merged, conflicts } = merge(
    side((p) => { p.scripts.build = 'node a.mjs && node ours.mjs && node b.mjs'; }),
    side((p) => { p.scripts.build = 'node a.mjs && node b.mjs && node theirs.mjs'; }),
  );
  assert.deepEqual(conflicts, []);
  assert.equal(JSON.parse(merged).scripts.build, 'node a.mjs && node ours.mjs && node b.mjs && node theirs.mjs');
});

test('each side appending to the same list at the same point keeps both, ours first', () => {
  // The real shape of merge e330131d: one branch added two test files to the end of a `node --test`
  // list while main added a third. diff3 calls that a conflict; nothing is actually in dispute.
  const { text: merged, conflicts } = merge(
    side((p) => { p.scripts['test:jobs'] = 'node --test one.test.mjs two.test.mjs ours.test.mjs'; }),
    side((p) => { p.scripts['test:jobs'] = 'node --test one.test.mjs two.test.mjs theirs.test.mjs'; }),
  );
  assert.deepEqual(conflicts, []);
  assert.equal(JSON.parse(merged).scripts['test:jobs'], 'node --test one.test.mjs two.test.mjs ours.test.mjs theirs.test.mjs');
});

test('each side adding to the same array keeps both entries', () => {
  const { text: merged, conflicts } = merge(
    side((p) => { p.files.push('cli'); }),
    side((p) => { p.files.push('docs'); }),
  );
  assert.deepEqual(conflicts, []);
  assert.deepEqual(JSON.parse(merged).files, ['dist', 'cli', 'docs']);
});

test('a dependency the two sides bumped to different versions conflicts, and says which key', () => {
  const { text: merged, conflicts } = merge(
    side((p) => { p.dependencies.ai = '^5.1.0'; }),
    side((p) => { p.dependencies.ai = '^5.2.0'; }),
  );
  assert.deepEqual(conflicts, ['dependencies.ai']);
  assert.match(merged, /<<<<<<< ours/);
  assert.match(merged, /"ai": "\^5\.1\.0"[\s\S]*\|\|\|\|\|\|\| base[\s\S]*"ai": "\^5\.0\.0"[\s\S]*=======[\s\S]*"ai": "\^5\.2\.0"/);
});

test('a dependency BOTH sides added, at different ranges, conflicts rather than unioning the text', () => {
  // With no base text every token on both sides reads as an insertion, so the insertion rule would
  // cheerfully produce "^3.0.0 ^4.0.0". This is the silent corruption the driver must not have.
  const { text: merged, conflicts } = merge(
    side((p) => { p.dependencies.zod = '^3.0.0'; }),
    side((p) => { p.dependencies.zod = '^4.0.0'; }),
  );
  assert.deepEqual(conflicts, ['dependencies.zod']);
  assert.ok(!merged.includes('^3.0.0 ^4.0.0'), 'two version ranges were spliced into one string');
});

test('a script body the two sides rewrote differently conflicts', () => {
  const { conflicts } = merge(
    side((p) => { p.scripts.lint = 'eslint . --max-warnings 0'; }),
    side((p) => { p.scripts.lint = 'biome check .'; }),
  );
  assert.deepEqual(conflicts, ['scripts.lint']);
});

test('a key one side deleted and the other side changed conflicts rather than vanishing', () => {
  // Key ORDER is merged by the same diff3, and reading that merge as the key SET made this delete
  // resolve itself silently in the direction that loses the other side's edit.
  const { text: merged, conflicts } = merge(
    side((p) => { delete p.scripts.lint; }),
    side((p) => { p.scripts.lint = 'eslint . --fix'; }),
  );
  assert.deepEqual(conflicts, ['scripts.lint']);
  assert.match(merged, /<<<<<<< ours\n\|\|\|\|\|\|\| base/, 'the side that deleted the key shows an empty section');
});

test('a key one side deleted and the other side left alone is deleted', () => {
  const { text: merged, conflicts } = merge(
    side((p) => { delete p.scripts.lint; }),
    side((p) => { p.scripts['check:theirs'] = 'node theirs.mjs'; }),
  );
  assert.deepEqual(conflicts, []);
  assert.deepEqual(Object.keys(JSON.parse(merged).scripts), ['build', 'test:jobs', 'check:theirs']);
});

test('a value whose type the two sides changed differently conflicts', () => {
  const { conflicts } = merge(
    side((p) => { p.files = 'dist'; }),
    side((p) => { p.files = ['dist', 'docs']; }),
  );
  assert.deepEqual(conflicts, ['files']);
});

test('nothing but ours changing means the merge is ours, and the reverse', () => {
  const ours = side((p) => { p.scripts['check:ours'] = 'node ours.mjs'; });
  assert.equal(merge(ours, text(BASE)).text, ours);
  assert.equal(merge(text(BASE), ours).text, ours);
});

test('a CRLF working copy comes back CRLF, because that is what the checkout had', () => {
  const ours = side((p) => { p.scripts['check:ours'] = 'node ours.mjs'; }).replaceAll('\n', '\r\n');
  const { text: merged } = merge(ours, side((p) => { p.scripts['check:theirs'] = 'node theirs.mjs'; }));
  assert.ok(merged.includes('\r\n'), 'the driver dropped the checkout line endings');
  assert.equal(merged.replaceAll('\r\n', '\n'), text(JSON.parse(merged)));
});

test('installing registers a command with the four placeholders git passes, and is idempotent', () => {
  // A disposable repository: the checkout running the suite may expose its git metadata read-only,
  // and a test of the installer must not rewrite the developer's real config.
  const dir = mkdtempSync(path.join(tmpdir(), 'package-merge-install-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, encoding: 'utf8' });
    assert.equal(install(dir), true);
    const configured = execFileSync('git', ['config', '--get', `merge.${DRIVER_NAME}.driver`], { cwd: dir, encoding: 'utf8' }).trim();
    assert.match(configured, /package-merge-driver\.mjs" %O %A %B %P$/);
    assert.equal(isInstalled(dir), true);
    assert.equal(install(dir), true, 'registering twice is a no-op, so every build can do it');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('.gitattributes hands package.json to this driver', () => {
  const attributes = readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');
  assert.match(attributes, new RegExp(`^/?package\\.json\\s+merge=${DRIVER_NAME}$`, 'm'));
});

test('run as git runs it, it writes the merged file and exits 0', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'package-merge-'));
  try {
    const file = (name, body) => { const p = path.join(dir, name); writeFileSync(p, body, 'utf8'); return p; };
    const ours = file('ours.json', side((p) => { p.scripts['check:ours'] = 'node ours.mjs'; }));
    const result = run([file('base.json', text(BASE)), ours, file('theirs.json', side((p) => { p.scripts['check:theirs'] = 'node theirs.mjs'; })), 'package.json']);
    assert.equal(result.status, 0, result.out);
    const written = JSON.parse(readFileSync(ours, 'utf8'));
    assert.equal(written.scripts['check:ours'], 'node ours.mjs');
    assert.equal(written.scripts['check:theirs'], 'node theirs.mjs');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run as git runs it on a real disagreement, it exits non-zero and names the key', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'package-merge-'));
  try {
    const file = (name, body) => { const p = path.join(dir, name); writeFileSync(p, body, 'utf8'); return p; };
    const ours = file('ours.json', side((p) => { p.dependencies.ai = '^5.1.0'; }));
    const result = run([file('base.json', text(BASE)), ours, file('theirs.json', side((p) => { p.dependencies.ai = '^5.2.0'; })), 'package.json']);
    assert.notEqual(result.status, 0, 'a real disagreement must stop the merge');
    assert.match(result.out, /dependencies\.ai/);
    assert.match(readFileSync(ours, 'utf8'), /<<<<<<< ours/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a side that is not parseable JSON is left to git rather than guessed at', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'package-merge-'));
  try {
    const file = (name, body) => { const p = path.join(dir, name); writeFileSync(p, body, 'utf8'); return p; };
    const ours = file('ours.json', '<<<<<<< HEAD\nsomething already went wrong upstream\n>>>>>>> theirs\n');
    const result = run([file('base.json', text(BASE)), ours, file('theirs.json', text(BASE)), 'package.json']);
    assert.notEqual(result.status, 0);
    assert.match(result.out, /could not merge package\.json as JSON/);
    assert.match(readFileSync(ours, 'utf8'), /something already went wrong upstream/, 'git\'s own file was overwritten');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('called with nothing useful it refuses rather than writing a file it guessed at', () => {
  const bad = run([]);
  assert.equal(bad.status, 2);
  assert.match(bad.out, /expects git's %O %A %B %P/);
});
