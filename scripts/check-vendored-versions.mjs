// The VENDORED-DEPENDENCY freshness check: everything this repo ships that npm cannot see.
//
// Why this exists: `npm outdated` and `npm audit` only know about entries in package.json. The
// two libraries that reach EVERY user's exported graphic are not entries — GSAP and the Lottie
// player are committed files under src/assets/, bundled locally because a generated template
// must play offline with no CDN reference (root AGENTS.md, principle 3). Nothing warns when
// they go stale, and nothing did: GSAP sat at 3.10.4 while upstream reached 3.15.0, so every
// exported template carried a five-minor-versions-old runtime.
//
// Usage:
//   node scripts/check-vendored-versions.mjs           # exit 1 if anything is behind or due
//   node scripts/check-vendored-versions.mjs --json    # machine-readable report on stdout
//
// This is NOT in the build gate. It is a time-driven check (weekly-audit.yml) — the answer
// changes when upstream publishes, not when someone commits, so running it per push would only
// re-prove the previous run. Nothing here edits a file; upgrading a vendored library is a
// deliberate human step, because the bundled copy is the one users get and the es2017 output
// floor (docs/CLOUD_PLAYOUT.md §3, CasparCG 2.3.x) has to be re-checked when it moves.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The vendored files, each with the banner pattern that carries its version and the npm package
 * the upstream release is published as.
 *
 * The pattern reads the file's OWN banner rather than a number recorded beside it: a version
 * written down separately is a second source of truth, and it goes stale exactly when someone
 * updates the library without updating the note — which is the failure this check exists to
 * catch.
 */
const VENDORED = [
  {
    id: 'gsap',
    file: 'src/assets/gsap.min.js',
    pattern: /GSAP (\d+\.\d+\.\d+)/,
    npm: 'gsap',
    note: 'ships inside every exported template',
  },
  {
    id: 'lottie',
    file: 'src/assets/lottie.min.js',
    pattern: /lottie-web v(\d+\.\d+\.\d+)/,
    npm: 'lottie-web',
    note: 'lottie_light build — injected only when a template uses a Lottie asset',
  },
];

/**
 * Things with no machine-readable version at all, reviewed on a calendar instead.
 *
 * A woff2 carries no version, and the bundled faces' provenance already lives in ONE place
 * (src/assets/OFL.txt, which names every upstream project) — duplicating it here would create
 * the second source of truth src/export/AGENTS.md exists to prevent. So these entries record
 * only WHEN someone last looked, which is the one fact nothing else in the repo holds.
 *
 * Update `lastReviewed` when you actually check, not when the reminder fires.
 */
const MANUAL_REVIEW = [
  {
    id: 'bundled-fonts',
    what: 'the 7 woff2 faces in public/fonts (upstream projects listed in src/assets/OFL.txt)',
    whyNoVersion: 'a woff2 carries no version string, and the upstream projects tag irregularly',
    lastReviewed: '2026-08-03',
    intervalDays: 180,
  },
  {
    id: 'supabase-postgres',
    what: "the production project's Postgres version (dashboard → Infrastructure)",
    whyNoVersion: 'a platform upgrade is a dashboard action and never appears in git',
    lastReviewed: '2026-08-03',
    intervalDays: 180,
  },
];

const readVendored = ({ file, pattern }) => {
  const text = readFileSync(resolve(root, file), 'utf8').slice(0, 4000);
  const found = text.match(pattern);
  if (!found) throw new Error(`no version banner matching ${pattern} in ${file}`);
  return found[1];
};

const latestOnNpm = async (pkg) => {
  const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`);
  if (!res.ok) throw new Error(`registry answered ${res.status} for ${pkg}`);
  return (await res.json()).version;
};

/** -1 / 0 / 1, comparing plain three-part versions. Vendored releases never carry prereleases. */
const compare = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
  }
  return 0;
};

const daysSince = (iso) => Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);

const findings = [];
const report = { vendored: [], manual: [] };

for (const entry of VENDORED) {
  const have = readVendored(entry);
  // An unreachable registry FAILS rather than passing quietly. This check runs on a schedule
  // with network; a silent skip would read as "checked, fine" every week forever.
  const latest = await latestOnNpm(entry.npm);
  const order = compare(have, latest);
  const state = order < 0 ? 'behind' : order > 0 ? 'ahead' : 'current';
  report.vendored.push({ id: entry.id, file: entry.file, have, latest, state });
  if (state === 'behind') {
    findings.push(`${entry.id} ${have} → ${latest} available (${entry.file}) — ${entry.note}`);
  } else if (state === 'ahead') {
    findings.push(
      `${entry.id} ${have} is NEWER than the published ${latest} (${entry.file}) — a prerelease ` +
        'or a hand-edited banner; either way the bundled copy is not a released version',
    );
  }
}

for (const entry of MANUAL_REVIEW) {
  const age = daysSince(entry.lastReviewed);
  const due = age >= entry.intervalDays;
  report.manual.push({ id: entry.id, lastReviewed: entry.lastReviewed, ageDays: age, due });
  if (due) {
    findings.push(
      `${entry.id} last reviewed ${entry.lastReviewed} (${age} days ago, every ` +
        `${entry.intervalDays}) — ${entry.what}`,
    );
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ findings, ...report }, null, 2));
} else {
  for (const row of report.vendored) {
    const mark = row.state === 'current' ? 'ok  ' : 'DUE ';
    console.log(`${mark}${row.id.padEnd(8)} vendored ${row.have.padEnd(9)} latest ${row.latest}`);
  }
  for (const row of report.manual) {
    console.log(
      `${row.due ? 'DUE ' : 'ok  '}${row.id.padEnd(18)} last reviewed ${row.lastReviewed} ` +
        `(${row.ageDays}d)`,
    );
  }
  if (findings.length) {
    console.log('\nNeeds attention:');
    for (const line of findings) console.log(`  - ${line}`);
  }
}

// `process.exitCode`, never `process.exit()` — see the note in scripts/check-model-ids.mjs: an
// exit forced while a fetch handle is still closing trips a libuv assertion on Windows.
process.exitCode = findings.length ? 1 : 0;
