#!/usr/bin/env node
// THE CONTROL-DRIVE PROOF for the custom-lane type sweep (docs/NOACG_PRO_PLAN.md §21.2
// follow-on): does an EMITTED multi-step graphic drive through the SHIPPED control layer?
//
//   node scripts/custom-lane-drive-spike.mjs --out=pro-iterate-out-<model> [slugs]
//
// FREE - no model call. For every deliverable quiz-board and scoreboard cell in the out-dir's
// ledger, it loads the exact emitted template into the app's library (createGraphic - the same
// door a real save uses), opens the REAL control page (#/control/<id> - the panel generated
// from fields + the implicit machine, nothing bespoke), and drives it the way an operator
// would:
//   - scoreboard: play, then bump the home score twice and start/write the clock, each landing
//     through the panel's own Update - the frame must show each new value.
//   - quiz-board: play, then press the panel's Next through every declared step - each press
//     must move the frame (the reveal/lock/correct walk).
// Records drivable yes/no + what broke into <out>/drive-report.json. This answers the owner's
// backend-integration question with the REAL panel, not a claim.
//
// Named *-spike so the browser-job guard and the process detector both count it
// (scripts/command-match.mjs - a job known to one and not the other is a silent hole).

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';

const BASE = `http://localhost:${devPort()}`;
const args = process.argv.slice(2);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const only = args.find((a) => !a.startsWith('--'))?.split(',').filter(Boolean) ?? null;

const OUT = path.resolve(value('out') ?? 'pro-iterate-out');
const DRIVE_TYPES = new Set(['quiz-board', 'scoreboard']);

const ledger = JSON.parse(await readFile(path.join(OUT, 'results.json'), 'utf8'));
const cells = (ledger.results ?? []).filter((r) => r.kind === 'candidate' && !r.error && !r.skipped
  && DRIVE_TYPES.has(r.type) && (!only || only.includes(r.slug)));
if (!cells.length) {
  console.error(`No quiz-board/scoreboard candidates in ${OUT} - nothing to drive.`);
  process.exit(1);
}
// Deliverable cells are the proof set; a dirty-stopped cell is still driven and marked, so the
// report says what the panel does with it rather than skipping the question.
console.log(`${cells.length} cell(s) to drive (${cells.filter((c) => c.deliverable).length} deliverable).`);

/** The final round's saved template.json (the code dir keeps one per round). */
async function finalTemplate(slug) {
  const dir = path.join(OUT, 'code', slug);
  const rounds = (await readdir(dir)).filter((d) => d.startsWith('round-'))
    .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));
  const last = rounds[rounds.length - 1];
  return JSON.parse(await readFile(path.join(dir, last, 'template.json'), 'utf8'));
}

try {
  await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`Dev server not reachable at ${BASE} - start it first.`);
  process.exit(1);
}

const browser = await chromium.launch();
// ONE FRESH PAGE PER CELL. A graphic that throws on the control page can wedge the app
// shell, and a shared page then times out every LATER cell's navigation - measured
// 2026-08-18: qz-primetime's own runtime error made both healthy quiz cells read NOT
// DRIVABLE in a shared run while each drove fine solo. A refusal must stay one cell's fact.
let page = null;
async function freshPage() {
  if (page) await page.close().catch(() => undefined);
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (error) => console.log('  pageerror:', error.message));
  await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
  await page.locator('.topbar').waitFor();
  await page.locator('.wz-modal').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
  await page.keyboard.press('Escape');
  await page.locator('.wz-modal').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  return page;
}

const frame = () => page.frameLocator('[data-testid="control-stage"] iframe');
const stageText = async () => {
  try {
    return await frame().locator('body').innerText({ timeout: 5000 });
  } catch {
    return '';
  }
};

/** Set one field's value in the ACTIVE entry editor and return whether an input existed.
 *  The testid may sit on the input itself or on a wrapping row, so both shapes are tried. */
async function setField(fieldId, val) {
  const row = page.locator(`[data-testid="entry-field-${fieldId}"]`).first();
  if (!(await row.count())) return false;
  const tag = await row.evaluate((el) => el.tagName);
  const input = tag === 'INPUT' || tag === 'TEXTAREA' ? row : row.locator('input, textarea').first();
  if (!(await input.count())) return false;
  await input.fill(String(val));
  return true;
}

const report = [];
for (const cell of cells) {
  console.log(`\n── ${cell.slug} (${cell.type}${cell.deliverable ? '' : ', stopped dirty'}) ──`);
  const problems = [];
  let drivable = false;
  try {
    await freshPage();
    const template = await finalTemplate(cell.slug);
    const docId = await page.evaluate(async ({ template, name }) => {
      const bust = '?t=' + Date.now();
      const { createGraphic } = await import('/src/model/library.ts' + bust);
      const { doc, error } = createGraphic(template, { name });
      if (error) throw new Error(error);
      const { commitDurableWrites } = await import('/src/model/durableStore.ts' + bust);
      const failure = await commitDurableWrites();
      if (failure) throw new Error(`durable write refused: ${failure}`);
      return doc.id;
    }, { template, name: `drive ${cell.slug}` });

    await page.goto(`${BASE}/app#/control/${docId}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="graphic-control-page"]').waitFor({ timeout: 15_000 });

    // An entry is the panel's data row - add one so the field editor exists.
    if (!(await page.locator('[data-testid="entry-editor"]').count())) {
      await page.locator('[data-testid="add-entry"]').click();
      await page.locator('[data-testid="entry-editor"]').waitFor({ timeout: 5000 });
    }

    await page.locator('[data-testid="control-play"]').click();
    await page.waitForTimeout(2200);
    const afterPlay = await stageText();
    if (!afterPlay.trim()) problems.push('after play() the frame paints no text at all');

    if (cell.type === 'scoreboard') {
      // Score bump x2 through the panel's own Update, then the clock.
      let ok = true;
      for (const [round, score] of [[1, '7'], [2, '8']]) {
        if (!(await setField('f2', score))) { problems.push('the panel renders no input for f2 (home score)'); ok = false; break; }
        await page.locator('[data-testid="control-update"]').click();
        await page.waitForTimeout(900);
        const text = await stageText();
        if (!text.includes(score)) {
          problems.push(`score bump ${round}: wrote "${score}" to f2 through Update and the frame does not show it`);
          ok = false;
        }
      }
      if (ok) {
        const clockValue = '88:44';
        if (!(await setField('f4', clockValue))) {
          problems.push('the panel renders no input for f4 (clock)');
        } else {
          await page.locator('[data-testid="control-update"]').click();
          await page.waitForTimeout(900);
          const text = await stageText();
          if (!text.includes(clockValue) && !text.includes('88')) {
            problems.push(`clock write: "${clockValue}" through Update and the frame does not show it`);
          }
        }
      }
      drivable = problems.length === 0;
    } else {
      // Quiz: Next through every declared step; each press must move the frame. Markup is
      // compared rather than text, because a reveal or lock step legitimately changes only
      // styling (classes, transforms) while the words stay put.
      const presses = Math.max(1, (parseInt(template.settings?.steps, 10) || 4) - 1);
      const snapshot = () => frame().locator('body').innerHTML().catch(() => '');
      let before = await snapshot();
      let moved = 0;
      for (let k = 1; k <= presses; k += 1) {
        await page.locator('[data-testid="control-next"]').click();
        await page.waitForTimeout(1400);
        const after = await snapshot();
        if (after !== before) moved += 1;
        else problems.push(`Next press ${k} of ${presses} changed nothing in the frame`);
        before = after;
      }
      drivable = moved >= presses && problems.length === 0;
      console.log(`  next moved the frame on ${moved} of ${presses} press(es)`);
    }
  } catch (e) {
    problems.push(String(e?.message ?? e).slice(0, 300));
  }
  console.log(`  ${drivable ? 'DRIVABLE' : 'NOT DRIVABLE'}${problems.length ? ` - ${problems[0]}` : ''}`);
  report.push({ slug: cell.slug, type: cell.type, deliverable: cell.deliverable, drivable, problems });
}

await browser.close();
const reportPath = path.join(OUT, 'drive-report.json');
await writeFile(reportPath, `${JSON.stringify({ base: BASE, capturedAt: new Date().toISOString(), report }, null, 2)}\n`);
console.log(`\n${report.filter((r) => r.drivable).length} of ${report.length} drivable · ${reportPath}`);
