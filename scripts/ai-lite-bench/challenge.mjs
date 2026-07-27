// The ROTATING CHALLENGE suite - diagnostic only, never part of core-suite scoring and
// never retroactively redefining core history. It grows from REAL observed failures;
// the seed entries below cover the stress classes the benchmark contract names (long
// names, text expansion, difficult contrast, complex Unicode, rapid updates). Add a new
// entry when a production or eval failure shows a class the suites miss; retire nothing
// (a fixed challenge documents the fix).

export const CHALLENGE_SUITE_VERSION = 1;

export const CHALLENGE_SUITE = [
  {
    id: 'challenge-extreme-length',
    class: 'text-expansion',
    brief: 'A broadcast-safe lower third for speaker name Prof. Dr. h.c. Maximiliane von und zu Hohenberg-Wittelsbach and role Chair of the Intergovernmental Advisory Committee on Cross-Border Infrastructure Resilience. Nothing may clip or shrink into illegibility.',
    expect: { decision: 'ready', aiCategory: 'lower-third', intentKind: 'person', roles: ['person-name', 'person-role'] },
    fields: {
      primary: { title: 'Name', sample: 'Prof. Dr. h.c. Maximiliane von und zu Hohenberg-Wittelsbach', role: 'person-name' },
      secondary: { title: 'Role', sample: 'Chair of the Intergovernmental Advisory Committee on Cross-Border Infrastructure Resilience', role: 'person-role' },
    },
  },
  {
    id: 'challenge-complex-unicode',
    class: 'unicode',
    brief: 'A calm interview lower third for guest name 山本 美咲 (Yamamoto Misaki) and role 東京支局長 - Tokyo Bureau Chief. Keep both scripts exactly as written and equally legible.',
    expect: { decision: 'ready', aiCategory: 'lower-third', intentKind: 'person', roles: ['person-name', 'person-role'] },
    fields: {
      primary: { title: 'Name', sample: '山本 美咲 (Yamamoto Misaki)', role: 'person-name' },
      secondary: { title: 'Role', sample: '東京支局長 - Tokyo Bureau Chief', role: 'person-role' },
    },
  },
  {
    id: 'challenge-rtl-mixed',
    class: 'unicode',
    brief: 'A restrained news lower third for correspondent name ليلى حداد (Layla Haddad) and role Beirut Correspondent. Mixed right-to-left and Latin text must read correctly.',
    expect: { decision: 'ready', aiCategory: 'lower-third', intentKind: 'person', roles: ['person-name', 'person-role'] },
    fields: {
      primary: { title: 'Name', sample: 'ليلى حداد (Layla Haddad)', role: 'person-name' },
      secondary: { title: 'Role', sample: 'Beirut Correspondent', role: 'person-role' },
    },
  },
  {
    id: 'challenge-difficult-contrast',
    class: 'contrast',
    brief: 'A lower third for presenter name Iris Vale and role Weather Anchor, in a pale pastel palette over bright daylight footage. Legibility must survive the bright background.',
    expect: { decision: 'ready', aiCategory: 'lower-third', intentKind: 'person', roles: ['person-name', 'person-role'] },
    fields: {
      primary: { title: 'Name', sample: 'Iris Vale', role: 'person-name' },
      secondary: { title: 'Role', sample: 'Weather Anchor', role: 'person-role' },
    },
  },
  {
    id: 'challenge-rapid-updates',
    class: 'update-stress',
    brief: 'A lower third for commentator name Rex Odum and role Play-by-Play, where the role line will be retyped by the operator many times per minute during the broadcast.',
    expect: { decision: 'ready', aiCategory: 'lower-third', intentKind: 'person', roles: ['person-name', 'person-role'] },
    fields: {
      primary: { title: 'Name', sample: 'Rex Odum', role: 'person-name' },
      secondary: { title: 'Role', sample: 'Play-by-Play', role: 'person-role' },
    },
  },
  {
    id: 'challenge-one-word-minimal',
    class: 'sparse-content',
    brief: 'A cinematic single-name lower third identifying Cher. One line only, nothing invented.',
    expect: { decision: 'ready', aiCategory: 'lower-third', intentKind: 'person', roles: ['person-name'] },
    fields: {
      primary: { title: 'Name', sample: 'Cher', role: 'person-name' },
    },
  },
];
