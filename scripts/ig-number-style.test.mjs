// guards: src/templates/infographics/igNumbers.ts, src/templates/infographics/igMotion.ts
//
// The infographic NUMBER STYLE (issue #971): how a board reads and prints figures in English
// (the default) and in Finnish/Swedish style.
//
// Both runtimes are authored inside template literals, so a rule that reads correctly in the .ts
// file can still ship broken. These tests transpile the two modules and run the exact JavaScript
// a generated infographic ships, against a stand-in document holding the board's Number style
// field. igMotion.ts imports one helper string from shared/base.ts that nothing here calls; it is
// stubbed so the module transpiles on its own.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const load = async (relative, stub = (s) => s) => {
  const source = stub(readFileSync(new URL(`../src/templates/infographics/${relative}`, import.meta.url), 'utf8'));
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};

const { IG_NUMBERS_JS } = await load('igNumbers.ts');
const { IG_MOTION_JS } = await load('igMotion.ts', (s) => {
  const stubbed = s.replace(/^import \{ motionSpeedJs \} from '\.\.\/shared\/base';$/m, "const motionSpeedJs = '';");
  assert.notEqual(stubbed, s, 'igMotion.ts no longer imports motionSpeedJs the way this test stubs it');
  return stubbed;
});

const NBSP = ' ';

/** A board whose Number style field holds `style` ('' = an older graphic with no field), with
 *  `numberFields` listed on the holder the way infographics/shared.ts writes it. */
function board(style, elements = {}, numberFields = '') {
  const holder = style === ''
    ? null
    : { textContent: style, getAttribute: (name) => (name === 'data-number-fields' ? numberFields : null) };
  const document = {
    querySelector: (selector) => (selector === '[data-number-style]' ? holder : null),
    getElementById: (id) => elements[id] ?? null,
  };
  return Object.assign(new Function(
    'document',
    `${IG_NUMBERS_JS}\n${IG_MOTION_JS}\nreturn { parseIgNumber, formatThousands, igNumberText, igPercent, igNumberSource, igStyleFields, infographicStat, infographicCountText };`,
  )(document), { holder });
}

/** A readout element as the count builders see it. */
const readout = (text) => {
  const attrs = { 'data-target': text };
  return {
    textContent: text,
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    setAttribute: (name, value) => { attrs[name] = String(value); },
  };
};

for (const [label, style] of [['no Number style field', ''], ['English style', 'en']]) {
  test(`${label}: figures read and print exactly as they did before the style existed`, () => {
    const b = board(style);
    assert.equal(b.parseIgNumber('1,234'), 1234);
    assert.equal(b.parseIgNumber('€124,213'), 124213);
    assert.equal(b.parseIgNumber('52.3'), 52.3);
    assert.equal(b.parseIgNumber('52,3'), 523, 'a comma is a thousands separator in English');
    assert.equal(b.parseIgNumber(''), 0);
    assert.equal(b.formatThousands(1234567), '1,234,567');
    assert.equal(b.formatThousands(124213.4), '124,213');
    assert.equal(b.igNumberText(52.3), '52.3');
    assert.equal(b.igNumberText('3.0'), '3.0');
    assert.equal(b.igPercent(42), '42%');
    assert.equal(b.igNumberSource('Yes | 52,3'), 'Yes | 52,3');
  });

  test(`${label}: a counted readout parses, groups and keeps its suffix as before`, () => {
    const b = board(style);
    const grouped = b.infographicStat(readout('124,213'));
    assert.deepEqual({ ...grouped }, { text: '124,213', value: 124213, suffix: '', grouped: true });
    assert.equal(b.infographicCountText(8807, grouped), '8,807');
    const percent = b.infographicStat(readout('87%'));
    assert.deepEqual({ ...percent }, { text: '87%', value: 87, suffix: '%', grouped: false });
    assert.equal(b.infographicStat(readout('MAJORITY')), null);
  });
}

for (const style of ['fi', 'sv', 'FI-fi']) {
  test(`Finnish/Swedish style ("${style}"): a decimal comma reads as a decimal`, () => {
    const b = board(style);
    assert.equal(b.parseIgNumber('52,3'), 52.3);
    assert.equal(b.parseIgNumber('52,3 %'), 52.3);
    assert.equal(b.parseIgNumber('-1,5'), -1.5);
  });
}

test('Finnish style: a comma that groups thousands the English way still reads as the whole number', () => {
  const b = board('fi');
  assert.equal(b.parseIgNumber('1,234'), 1234);
  assert.equal(b.parseIgNumber('€124,213'), 124213);
  assert.equal(b.parseIgNumber('1,234,567'), 1234567);
  assert.equal(b.parseIgNumber('1,234.5'), 1234.5);
  assert.equal(b.parseIgNumber('0,125'), 0.125, 'a leading zero makes it a decimal');
  assert.equal(b.parseIgNumber('1234,567'), 1234.567, 'four leading digits are no English group');
  assert.equal(b.infographicStat(readout('124,213')).value, 124213);
});

test('Finnish style: a space or a no-break space groups thousands', () => {
  const b = board('fi');
  assert.equal(b.parseIgNumber('1 234 567'), 1234567);
  assert.equal(b.parseIgNumber(`1${NBSP}234${NBSP}567`), 1234567);
  assert.equal(b.parseIgNumber('1 234,5'), 1234.5);
  assert.equal(b.parseIgNumber('€124 213'), 124213);
});

test('Finnish style still reads a point, which number fields and data feeds send', () => {
  const b = board('fi');
  assert.equal(b.parseIgNumber('52.3'), 52.3);
  assert.equal(b.parseIgNumber('71.4'), 71.4);
});

test('Finnish style prints a comma, space-grouped thousands and a spaced percent sign', () => {
  const b = board('fi');
  assert.equal(b.formatThousands(1234567), `1${NBSP}234${NBSP}567`);
  assert.equal(b.formatThousands(999), '999');
  assert.equal(b.igNumberText(52.3), '52,3');
  assert.equal(b.igNumberText((3.1).toFixed(1)), '3,1');
  assert.equal(b.igPercent(b.igNumberText(52.3)), `52,3${NBSP}%`);
});

test('Finnish style: a counted readout counts to the decimal figure and lands on its text', () => {
  const b = board('fi');
  const share = b.infographicStat(readout('52,3 %'));
  assert.deepEqual({ ...share }, { text: '52,3 %', value: 52.3, suffix: ' %', grouped: false });
  assert.equal(b.infographicCountText(52, share), '52 %');

  const total = b.infographicStat(readout('1 234 567'));
  assert.equal(total.value, 1234567);
  assert.equal(total.grouped, true);
  assert.equal(b.infographicCountText(8807, total), `8${NBSP}807`);

  const plain = b.infographicStat(readout('52 %'));
  assert.deepEqual({ ...plain }, { text: '52 %', value: 52, suffix: ' %', grouped: false });

  const ungrouped = b.infographicStat(readout('1 2345'));
  assert.deepEqual({ ...ungrouped }, { text: '1 2345', value: 1, suffix: ' 2345', grouped: false },
    'a space before four digits is no thousands group');
});

test('Finnish style: update() prints a number field\'s decimal with a comma, and nothing else', () => {
  const turnout = readout('71.4');
  const previous = readout('68.3');
  const time = readout('12.30');
  const parties = readout('SDP | 52.3');
  const precise = readout('1.234');
  const b = board('fi', { f0: turnout, f1: time, f2: previous, f3: parties, f5: precise }, 'f0 f2 f5');
  b.igStyleFields();
  assert.equal(turnout.textContent, '71,4');
  assert.equal(turnout.getAttribute('data-target'), '71,4');
  assert.equal(previous.textContent, '68,3');
  assert.equal(time.textContent, '12.30', 'a text field is never restyled');
  assert.equal(parties.textContent, 'SDP | 52.3', 'a line the operator composed stays as typed');
  assert.equal(precise.textContent, '1.234', 'a comma here would read as 1234');
  assert.equal(b.parseIgNumber(turnout.textContent), 71.4);
});

test('switching a board back to English restores the point a number field sent', () => {
  const turnout = readout('71.4');
  const b = board('fi', { f0: turnout }, 'f0');
  b.igStyleFields();
  assert.equal(turnout.textContent, '71,4');
  b.holder.textContent = 'en';
  b.igStyleFields();
  assert.equal(turnout.textContent, '71.4');
  assert.equal(b.parseIgNumber(turnout.textContent), 71.4);
});

test('English style: update() leaves English figures exactly as they were sent', () => {
  const turnout = readout('71.4');
  const total = readout('1,234');
  const b = board('en', { f0: turnout, f1: total }, 'f0 f1');
  b.igStyleFields();
  assert.equal(turnout.textContent, '71.4');
  assert.equal(total.textContent, '1,234');
});

test('a graphic without the field restyles nothing', () => {
  const turnout = readout('71.4');
  board('', { f0: turnout }).igStyleFields();
  assert.equal(turnout.textContent, '71.4');
});
