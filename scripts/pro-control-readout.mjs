#!/usr/bin/env node
// FREE: what a NoaCG Pro graphic offers an OPERATOR. Compiles a checked-in fixture concept
// through the real Pro compiler (no model call, no cost) and prints exactly what the control
// generator would build from the result - the machine it carries, the buttons, the inputs.
//
//   node scripts/pro-control-readout.mjs [fixture-id]
//
// It exists because "Pro cannot generate a state machine" is a claim that should be read off
// the compiled artifact rather than inferred from the source. Requires the dev server.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';

const BASE = `http://localhost:${devPort()}`;
const id = process.argv[2] ?? 'news-public';
const OUT = path.resolve('pro-machine-out');

const bank = JSON.parse(await readFile(path.resolve('benchmarks/pro/v1/briefs.json'), 'utf8'));
const entry = bank.briefs.find((b) => b.id === id);
const png = await readFile(path.resolve('benchmarks/pro/v1/fixtures', id, 'concept.png'));
const interpretation = JSON.parse(await readFile(path.resolve('benchmarks/pro/v1/fixtures', id, 'interpretation.json'), 'utf8'));

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
await page.locator('.topbar').waitFor();

const readout = await page.evaluate(async (input) => {
  const bust = `?t=${Date.now()}`;
  const { normalizeProInterpretation } = await import(`/src/ai/pro/reconstruct/normalize.ts${bust}`);
  const { compileProPlan } = await import(`/src/ai/pro/reconstruct/compile.ts${bust}`);
  const { uuid } = await import(`/src/model/id.ts${bust}`);
  const { parseAnimData } = await import(`/src/blocks/animData.ts${bust}`);
  const { deriveMachine } = await import(`/src/blocks/animMachine.ts${bust}`);
  const { eventButtons, fieldDescriptors } = await import(`/src/control/controlModel.ts${bust}`);

  const size = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve({ width: el.naturalWidth, height: el.naturalHeight });
    el.onerror = () => reject(new Error('undecodable'));
    el.src = input.conceptDataUrl;
  });
  const concept = { dataUrl: input.conceptDataUrl, mediaType: 'image/png', ...size, model: 'fixture', costUsd: 0 };
  const plan = normalizeProInterpretation(input.interpretation, size, uuid);
  const compiled = await compileProPlan(plan, concept, input.brief, {});
  const t = compiled.template;

  const literal = t.js.match(/var\s+NOACG_ANIM\s*=\s*(\{[\s\S]*?\});/);
  const parsed = parseAnimData(t.js);
  const machine = parsed ? deriveMachine(parsed) : null;
  return {
    fields: t.fields.map((f) => `${f.field}:${f.ftype} "${f.title}"`),
    spxSteps: t.settings?.steps ?? null,
    authoredMachinePresent: literal ? Boolean(JSON.parse(literal[1]).machine) : null,
    steps: parsed?.steps?.length ?? 0,
    derivedGroups: machine ? machine.groups.map((g) => ({
      id: g.id, initial: g.initial, defaultPath: g.defaultPath,
      states: g.states.map((s) => s.id),
      transitions: g.transitions.map((tr) => `${tr.from} -${tr.trigger}:${tr.event ?? tr.after ?? ''}-> ${tr.to}`),
    })) : null,
    controlButtons: eventButtons(t.js).map((b) => `${b.label} (${b.event})`),
    controlInputs: fieldDescriptors(t.fields).map((d) => `${d.key}:${d.kind} "${d.label}"`),
  };
}, {
  brief: entry.brief,
  interpretation,
  conceptDataUrl: `data:image/png;base64,${png.toString('base64')}`,
});

console.log(`NoaCG Pro compiled graphic (fixture "${id}") — what the operator gets:\n`);
console.log(`  SPX fields          : ${readout.fields.join(', ')}`);
console.log(`  settings.steps      : ${readout.spxSteps}`);
console.log(`  authored machine    : ${readout.authoredMachinePresent ? 'YES' : 'NO (implicit, derived on read)'}`);
console.log(`  timeline steps      : ${readout.steps}`);
console.log(`  derived groups      : ${JSON.stringify(readout.derivedGroups, null, 1)}`);
console.log(`  control buttons     : ${readout.controlButtons.join(', ') || '(none — only the built-in Play/Next/Stop)'}`);
console.log(`  control field inputs: ${readout.controlInputs.join(', ')}`);
await writeFile(path.join(OUT, `pro-control-readout.${id}.json`), JSON.stringify(readout, null, 2));
await browser.close();
