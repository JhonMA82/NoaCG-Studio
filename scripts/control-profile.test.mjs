// guards: src/model/profile.ts, supabase/migrations/0058_control_profile.sql
//
// Unit tests for the production CONTROL PROFILE format (src/model/profile.ts,
// docs/CONTROL_PANEL_ANY_GRAPHIC.md §6; AC-4 of docs/work-specs/control-panel-any-graphic).
//
// These run in the BUILD GATE rather than in Playwright because there is no browser in the
// question: bytes in, a profile out, and a list of refusals. The module is TypeScript and imports
// nothing at runtime, which is what makes one `transpileModule` call enough (the `csv.ts` and
// `productionData.ts` pattern) - and is why `profile.ts` must stay dependency-free.
//
// WHAT THE REFUSALS ARE ACTUALLY GUARDING. The design's whole fence - no condition, no
// comparison, no variable, no loop, no wait on a report, no wall clock - is enforced by the
// validator refusing any step key it does not know BY NAME. So the unknown-key tests below are
// not shape pedantry: they are the mechanism that keeps a profile from becoming a programming
// language, and a change that makes them pass by widening the allowed list has moved the line the
// owner drew on 2026-09-15.
//
// The two readers are tested separately and on purpose. `readShowProfile` DEGRADES (a show
// mid-programme renders what it can); `validateShowProfile` REFUSES (an authoring surface must
// not save a broken profile). A test that confused them would let one of the two quietly become
// the other.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('../src/model/profile.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import(`data:text/javascript,${encodeURIComponent(js)}`);
const { PROFILE_VERSION, emptyProfile, readShowProfile, readPublishedProfile, serializeShowProfile, validateShowProfile } =
  mod;

/** The proof case's production (docs/CONTROL_PANEL_ANY_GRAPHIC.md §3): two boards, a cue each. */
const POOL = {
  controls: {
    'Votes board': ['reveal', 'clear'],
    'Totals board': ['plus_katri', 'plus_mikko', 'new_game'],
  },
  cues: ['cue-1', 'cue-2'],
};

/** A profile that exercises every part of the shape: both primitives, all three step kinds and
 *  both marks. Written the way an authoring surface would hand it over. */
function goodProfile() {
  return {
    v: 1,
    arrange: {
      'Totals board': {
        plus_katri: { order: 0, section: 'Points', name: '+1 Katri', pinned: true },
        new_game: { hidden: true },
      },
    },
    combine: [
      {
        id: 'c1',
        name: 'Reveal, then the points',
        steps: [
          { kind: 'event', graphic: 'Votes board', control: 'reveal' },
          { kind: 'event', graphic: 'Totals board', control: 'plus_katri', after: 3, ask: { default: true } },
          { kind: 'verb', verb: 'take', cue: 'cue-2' },
          { kind: 'patch', graphic: 'Votes board', values: { f1: 'Katri', f0: '7' } },
        ],
      },
    ],
  };
}

/** Every error a validation produced, as `where` strings — what the assertions below read. */
const errorsAt = (findings) => findings.filter((f) => f.level === 'error').map((f) => f.where);
const warningsAt = (findings) => findings.filter((f) => f.level === 'warning').map((f) => f.where);

/** A good profile with one step replaced, which is how most refusals below are built. */
function withStep(step) {
  const profile = goodProfile();
  profile.combine[0].steps = [step];
  return profile;
}

// ── Reading, serializing, round trips ────────────────────────────────────────────────────────

test('a v1 profile round trips through read and serialize unchanged', () => {
  const read = readShowProfile(goodProfile());
  assert.equal(read.status, 'ok');
  const once = serializeShowProfile(read.profile);
  const twice = serializeShowProfile(readShowProfile(once).profile);
  assert.deepEqual(twice, once);
  // The step ORDER is the meaning of a combined control, so it is never sorted.
  assert.deepEqual(
    once.combine[0].steps.map((s) => s.kind),
    ['event', 'event', 'verb', 'patch'],
  );
});

test('serializing is canonical: key order and written defaults cannot change the bytes', () => {
  // The same profile, authored in a different key order and with every default spelled out.
  const spelled = {
    combine: [
      {
        steps: [
          { control: 'reveal', graphic: 'Votes board', kind: 'event', after: 0 },
          { ask: { default: true }, control: 'plus_katri', kind: 'event', graphic: 'Totals board', after: 3 },
          { cue: 'cue-2', kind: 'verb', verb: 'take' },
          { values: { f0: '7', f1: 'Katri' }, kind: 'patch', graphic: 'Votes board' },
        ],
        name: 'Reveal, then the points',
        id: 'c1',
      },
    ],
    arrange: {
      'Totals board': {
        new_game: { hidden: true, pinned: false },
        plus_katri: { pinned: true, name: '+1 Katri', section: 'Points', order: 0, hidden: false },
      },
    },
    v: 1,
  };
  assert.equal(
    JSON.stringify(serializeShowProfile(readShowProfile(spelled).profile)),
    JSON.stringify(serializeShowProfile(readShowProfile(goodProfile()).profile)),
  );
});

test('an empty profile is one shape, and deleting is not the same as emptying', () => {
  assert.deepEqual(emptyProfile(), { v: PROFILE_VERSION, arrange: {}, combine: [] });
  assert.equal(JSON.stringify(serializeShowProfile(emptyProfile())), '{"v":1,"arrange":{},"combine":[]}');
});

test('a profile from a newer build reads as READ-ONLY and keeps its bytes verbatim', () => {
  // The case the version invariant exists for. Dropping it instead would mean an older build
  // opening a show once quietly erased a profile it simply did not understand.
  const future = { v: 2, arrange: {}, combine: [], conditions: [{ when: 'score > 50' }] };
  const read = readShowProfile(future);
  assert.equal(read.status, 'read-only');
  assert.equal(read.version, 2);
  assert.deepEqual(read.raw, future);
});

test('garbage reads as no profile and never throws', () => {
  for (const value of [null, undefined, 7, 'profile', [], {}, { v: 'one' }, { v: Number.NaN }]) {
    assert.equal(readShowProfile(value).status, 'none', `${JSON.stringify(value)} should read as none`);
  }
});

test('reading DROPS what it cannot use rather than refusing it', () => {
  const messy = {
    v: 1,
    arrange: {
      'Totals board': {
        plus_katri: { order: 'first', section: '', name: '+1 Katri', hidden: false, when: 'ignored' },
        new_game: {},
      },
      'Gone board': 'not an object',
    },
    combine: [
      { id: 'c1', name: 'Fine', steps: [{ kind: 'event', graphic: 'Votes board', control: 'reveal', after: 0 }] },
      { id: 'c1', name: 'A repeat of c1', steps: [{ kind: 'verb', verb: 'out', cue: 'cue-1' }] },
      { id: 'c2', name: 'Sends nothing', steps: [] },
      { id: 'c3', name: 'Every step unusable', steps: [{ kind: 'loop', times: 3 }] },
    ],
  };
  const { profile } = readShowProfile(messy);
  // A wrongly typed `order`, an empty `section` and an unknown key all go; the name survives.
  assert.deepEqual(profile.arrange, { 'Totals board': { plus_katri: { name: '+1 Katri' } } });
  // A zero wait is the same as no wait, so it is not stored as 0.
  assert.deepEqual(profile.combine, [
    { id: 'c1', name: 'Fine', steps: [{ kind: 'event', graphic: 'Votes board', control: 'reveal' }] },
  ]);
});

test('every shape the PUBLISHED column can hand back reads correctly', () => {
  // The read side of `control_shows.profile` (migration 0058). Getting one of these wrong shows
  // up on air and nowhere else, so all four are pinned here rather than left to a surface.
  const pinned = serializeShowProfile(readShowProfile(goodProfile()).profile);
  assert.deepEqual(readPublishedProfile(pinned), pinned);
  // A row published before 0058 has no column at all; one published by a build with no profile
  // carries the `'{}'` default. Both mean "render the generated panel", which is null.
  assert.equal(readPublishedProfile(undefined), null);
  assert.equal(readPublishedProfile({}), null);
  // A profile from a NEWER build degrades to the generated panel rather than to a half-rendered
  // one: a surface may render only a profile it fully understands.
  assert.equal(readPublishedProfile({ v: 2, arrange: {}, combine: [], conditions: [] }), null);
  // An empty profile is still a profile: it exists and changes nothing.
  assert.deepEqual(readPublishedProfile(emptyProfile()), emptyProfile());
});

// ── Validating: the clean case ───────────────────────────────────────────────────────────────

test('a profile that validated clean still validates clean after serializing', () => {
  assert.deepEqual(validateShowProfile(goodProfile(), POOL), []);
  assert.deepEqual(validateShowProfile(serializeShowProfile(readShowProfile(goodProfile()).profile), POOL), []);
});

test('a verb step is not checked against cues the caller did not name', () => {
  const profile = withStep({ kind: 'verb', verb: 'next', cue: 'cue-nobody-declared' });
  assert.deepEqual(validateShowProfile(profile, { controls: POOL.controls }), []);
  assert.deepEqual(errorsAt(validateShowProfile(profile, POOL)), ['combine[0].steps[0].cue']);
});

// ── Validating: the fence ────────────────────────────────────────────────────────────────────

test('a step key nobody declared is REFUSED by name - the fence the design rests on', () => {
  // One case per capability §6c refuses by name. Each arrives as an extra key, and each must be
  // named in the finding so an authoring surface can point at it.
  const smuggled = [
    { kind: 'event', graphic: 'Votes board', control: 'reveal', when: 'score > 50' },
    { kind: 'event', graphic: 'Votes board', control: 'reveal', repeat: 9 },
    { kind: 'event', graphic: 'Votes board', control: 'reveal', until: 'stopped' },
    { kind: 'event', graphic: 'Votes board', control: 'reveal', at: '20:15' },
    { kind: 'verb', verb: 'take', cue: 'cue-1', store: 'winner' },
    { kind: 'patch', graphic: 'Votes board', values: { f0: '1' }, profile: 'another' },
  ];
  for (const step of smuggled) {
    const key = Object.keys(step).at(-1);
    const findings = validateShowProfile(withStep(step), POOL);
    assert.deepEqual(errorsAt(findings), [`combine[0].steps[0].${key}`], `"${key}" should be refused by name`);
    assert.match(findings[0].message, /condition, a variable, a loop, a wait or a clock/);
  }
});

test('a step kind nobody declared is refused, and there is no fourth kind', () => {
  const findings = validateShowProfile(withStep({ kind: 'wait', seconds: 3 }), POOL);
  assert.deepEqual(errorsAt(findings), ['combine[0].steps[0].kind']);
  assert.match(findings[0].message, /"wait"/);
});

test('an `ask` carries only its default - a tick, never a value', () => {
  const step = { kind: 'event', graphic: 'Votes board', control: 'reveal', ask: { default: true, value: '7' } };
  assert.deepEqual(errorsAt(validateShowProfile(withStep(step), POOL)), ['combine[0].steps[0].ask.value']);
});

// ── Validating: the refusals ─────────────────────────────────────────────────────────────────

test('a negative `after` is refused - a step cannot be sent before the press that sends it', () => {
  const findings = validateShowProfile(withStep({ kind: 'verb', verb: 'out', cue: 'cue-1', after: -3 }), POOL);
  assert.deepEqual(errorsAt(findings), ['combine[0].steps[0].after']);
  // Zero is not negative and means "with the rest", so it is legal.
  assert.deepEqual(validateShowProfile(withStep({ kind: 'verb', verb: 'out', cue: 'cue-1', after: 0 }), POOL), []);
  assert.deepEqual(
    errorsAt(validateShowProfile(withStep({ kind: 'verb', verb: 'out', cue: 'cue-1', after: 'soon' }), POOL)),
    ['combine[0].steps[0].after'],
  );
});

test('a step naming a graphic the production does not have is an ERROR', () => {
  // An arrange entry that matches nothing is inert; a STEP that matches nothing means the
  // operator presses a button that silently sends nothing. Hence the asymmetry with the warning
  // in the arrange test below.
  for (const step of [
    { kind: 'event', graphic: 'Scorebug', control: 'reveal' },
    { kind: 'patch', graphic: 'Scorebug', values: { f0: '1' } },
  ]) {
    assert.deepEqual(errorsAt(validateShowProfile(withStep(step), POOL)), ['combine[0].steps[0].graphic']);
  }
});

test('a step naming a control the graphic does not declare is refused - a profile invents nothing', () => {
  const step = { kind: 'event', graphic: 'Votes board', control: 'declare_winner' };
  const findings = validateShowProfile(withStep(step), POOL);
  assert.deepEqual(errorsAt(findings), ['combine[0].steps[0].control']);
  assert.match(findings[0].message, /can never invent an event/);
});

test('a combined control needs an id, a name, and steps that send something', () => {
  const profile = goodProfile();
  profile.combine = [
    { id: '', name: 'No id', steps: [{ kind: 'verb', verb: 'out', cue: 'cue-1' }] },
    { id: 'c2', name: '', steps: [{ kind: 'verb', verb: 'out', cue: 'cue-1' }] },
    { id: 'c3', name: 'Sends nothing', steps: [] },
    { id: 'c3', name: 'A repeat of c3', steps: [{ kind: 'verb', verb: 'out', cue: 'cue-1' }] },
  ];
  assert.deepEqual(errorsAt(validateShowProfile(profile, POOL)), [
    'combine[0].id',
    'combine[1].name',
    'combine[2].steps',
    'combine[3].id',
  ]);
});

test('a patch that writes nothing, or writes something that is not text, is refused', () => {
  assert.deepEqual(
    errorsAt(validateShowProfile(withStep({ kind: 'patch', graphic: 'Votes board', values: {} }), POOL)),
    ['combine[0].steps[0].values'],
  );
  assert.deepEqual(
    errorsAt(validateShowProfile(withStep({ kind: 'patch', graphic: 'Votes board', values: { f0: 7 } }), POOL)),
    ['combine[0].steps[0].values.f0'],
  );
});

test('an unknown version validates as one error saying it is read-only, not as a pile of them', () => {
  const findings = validateShowProfile({ v: 2, arrange: {}, combine: [{ nonsense: true }] }, POOL);
  assert.deepEqual(errorsAt(findings), ['profile.v']);
  assert.match(findings[0].message, /read-only/);
});

test('something that is not a profile at all is refused once', () => {
  assert.deepEqual(errorsAt(validateShowProfile('a profile', POOL)), ['profile']);
  assert.deepEqual(errorsAt(validateShowProfile({ arrange: {}, combine: [] }, POOL)), ['profile.v']);
});

test('a graphic named after an Object member is a name, not a member', () => {
  // Every key in this format is somebody's typed name, so a bare `map[name]` lookup answers a
  // FUNCTION for a graphic called `constructor`. Measured before the fix: the first case THREW out
  // of the validator instead of reporting, and the second passed clean - a button that validates
  // green and then sends nothing on air.
  const pool = { controls: { Bug: ['reveal'] } };
  for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.deepEqual(
      errorsAt(validateShowProfile(withStep({ kind: 'event', graphic: name, control: 'reveal' }), pool)),
      ['combine[0].steps[0].graphic'],
      `an event step on "${name}" must be refused, not resolved against Object.prototype`,
    );
    assert.deepEqual(
      errorsAt(validateShowProfile(withStep({ kind: 'patch', graphic: name, values: { f0: '1' } }), pool)),
      ['combine[0].steps[0].graphic'],
      `a patch step on "${name}" must be refused`,
    );
    // And the same name survives a round trip as an ordinary graphic when it really is one.
    const arranged = { v: 1, arrange: { [name]: { reveal: { pinned: true } } }, combine: [] };
    assert.deepEqual(serializeShowProfile(readShowProfile(arranged).profile).arrange, {
      [name]: { reveal: { pinned: true } },
    });
  }
});

test('serializing keeps exactly what reading keeps, so the canonical form is a fixed point', () => {
  // A duplicate id and a control with no steps are both dropped on read. Serialize used to keep
  // them, so a surface that duplicated a combined control without minting a fresh id wrote a
  // record whose diff looked right and whose panels showed only the first of the two.
  const step = { kind: 'event', graphic: 'Votes board', control: 'reveal' };
  const profile = {
    v: 1,
    arrange: {},
    combine: [
      { id: 'c1', name: 'First', steps: [step] },
      { id: 'c1', name: 'A repeat of c1', steps: [step] },
      { id: 'c2', name: 'Sends nothing', steps: [] },
    ],
  };
  const once = serializeShowProfile(profile);
  assert.deepEqual(
    once.combine.map((c) => c.name),
    ['First'],
  );
  assert.deepEqual(serializeShowProfile(readShowProfile(once).profile), once);
});

test('a damaged version is not blamed on a newer build', () => {
  // The cause is only knowable in one direction, and pointing an operator at a build that does not
  // exist is worse than saying the record is damaged.
  assert.match(validateShowProfile({ v: 2, arrange: {}, combine: [] }, POOL)[0].message, /written by a newer build/);
  for (const v of [0, -1, 1.5]) {
    const message = validateShowProfile({ v, arrange: {}, combine: [] }, POOL)[0].message;
    assert.match(message, /the record is damaged/, `version ${v} should read as damage, not as a newer build`);
    assert.equal(readShowProfile({ v, arrange: {}, combine: [] }).status, 'read-only');
  }
});

test('a patch step naming a field the graphic does not have is refused, when the fields are known', () => {
  const step = { kind: 'patch', graphic: 'Votes board', values: { f0: 'Katri', f99: 'nowhere' } };
  // Without `fields` the check is skipped, exactly as the cue check is.
  assert.deepEqual(validateShowProfile(withStep(step), POOL), []);
  const withFields = { ...POOL, fields: { 'Votes board': ['f0', 'f1'] } };
  assert.deepEqual(errorsAt(validateShowProfile(withStep(step), withFields)), ['combine[0].steps[0].values.f99']);
});

// ── Validating: what only WARNS, so a renamed graphic degrades ───────────────────────────────

test('an arrangement pointing at a graphic or control that is gone WARNS, and the profile still reads', () => {
  const profile = goodProfile();
  profile.arrange = {
    'Totals board': { plus_katri: { pinned: true }, declare_winner: { hidden: true } },
    'Scorebug': { reveal: { order: 1 } },
  };
  const findings = validateShowProfile(profile, POOL);
  assert.deepEqual(errorsAt(findings), []);
  // A graphic that is gone warns ONCE, naming the graphic - not once per control under it, which
  // would flood an authoring surface with a list of symptoms of one cause.
  assert.deepEqual(warningsAt(findings), ['arrange["Totals board"].declare_winner', 'arrange["Scorebug"]']);
  // A warning is not a refusal: the production keeps working and the panel falls back to what
  // the machine generates for whatever the entry no longer matches.
  assert.equal(readShowProfile(profile).status, 'ok');
});

test('an arrangement carries only the five presentation keys', () => {
  const profile = goodProfile();
  profile.arrange = { 'Totals board': { plus_katri: { pinned: true, disabled: true, order: 'first' } } };
  assert.deepEqual(errorsAt(validateShowProfile(profile, POOL)), [
    'arrange["Totals board"].plus_katri.disabled',
    'arrange["Totals board"].plus_katri.order',
  ]);
});
