// guards: src/components/wizard/import/draft.ts
//
// A VOTE NEVER WRITES INTO A LAYER TAKEN OFF THE ARTWORK (issue #784).
//
// The mapping step lets an author untick a text layer and answer "take it off the artwork", which
// hides it on air. A vote bound to that same layer went on writing its option and figure into it,
// so the row aired blank with nothing saying why. The step no longer offers that pair, and the
// draft refuses it outright: a layer a behaviour writes is never in the graphic's hidden list,
// whichever order the two answers were given in. A layer nothing writes is still taken off.
//
// No browser: `svgDesignOptions` is the one place the draft becomes the graphic's options.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function load(entry) {
  const bundle = await rolldown({ input: entry, platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code, 'utf8').toString('base64')}`);
}

const { svgDesignOptions } = await load(path.join(projectRoot, 'src/components/wizard/import/draft.ts'));

const text = (id, label) => ({ id, label, sample: label, numeric: false, clock: false });
/** A three-option vote board: a question, and a label and a figure per option. */
const LAYERS = [
  text('t0', 'Question'),
  text('t1', 'Option 1'), text('t2', 'Option 2'), text('t3', 'Option 3'),
  text('t4', 'Figure 1'), text('t5', 'Figure 2'), text('t6', 'Figure 3'),
  text('t7', 'Footnote'),
];

function draft({ removed, behaviour }) {
  return {
    designSvg: { markup: '<svg/>', width: 1920, height: 1080, candidates: LAYERS, images: [], outlines: [], groups: [], shapes: [] },
    svgFields: LAYERS.map((l) => ({
      candidateId: l.id, title: l.label, sample: l.sample, numeric: false,
      on: !removed.includes(l.id), ...(removed.includes(l.id) ? { whenOff: 'remove' } : {}),
    })),
    svgImages: [],
    svgOutlines: [],
    svgBehaviour: behaviour,
    svgExtras: [],
    svgStretch: { on: false, shapeId: null },
    svgFonts: [],
  };
}

const vote = {
  kind: 'poll', question: 't0', total: '', badge: '',
  rows: [
    { label: 't1', bar: '', value: 't4', winner: '' },
    { label: 't2', bar: '', value: 't5', winner: '' },
    { label: 't3', bar: '', value: 't6', winner: '' },
  ],
};

const hiddenIds = (options) => (options.hidden ?? []).map((h) => h.candidateId).sort();

test('a layer nothing writes is still taken off the artwork', () => {
  assert.deepEqual(hiddenIds(svgDesignOptions(draft({ removed: ['t7'], behaviour: vote }))), ['t7']);
});

test('a layer the vote writes is never taken off, so its row cannot air blank', () => {
  const options = svgDesignOptions(draft({ removed: ['t2', 't5', 't7'], behaviour: vote }));
  assert.deepEqual(hiddenIds(options), ['t7']);
});

test('nothing taken off is still no hidden list at all', () => {
  assert.equal(svgDesignOptions(draft({ removed: [], behaviour: vote })).hidden, undefined);
  assert.equal(svgDesignOptions(draft({ removed: ['t2'], behaviour: vote })).hidden, undefined);
});
