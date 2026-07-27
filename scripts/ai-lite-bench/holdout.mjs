// HIDDEN HOLDOUT - do not read these briefs while tuning prompts, and never include them
// in development reports. They exist to validate a PROMOTION decision and to detect
// prompt overfitting: a candidate that scores well on the core suite but drops here was
// tuned to the suite, not to the task. Runners must only touch this file when invoked
// with an explicit --holdout flag, and report results as a single aggregate.

export const HOLDOUT_SUITE_VERSION = 1;

export const HOLDOUT_SUITE = [
  {
    id: 'holdout-finnish-name',
    brief: 'A calm regional-news lower third for reporter name Päivi Kyllönen-Järvinen and role Itä-Suomen kirjeenvaihtaja. Keep the Finnish copy exactly as written.',
    expect: { decision: 'ready', aiCategory: 'lower-third', intentKind: 'person', roles: ['person-name', 'person-role'] },
    fields: {
      primary: { title: 'Name', sample: 'Päivi Kyllönen-Järvinen', role: 'person-name' },
      secondary: { title: 'Role', sample: 'Itä-Suomen kirjeenvaihtaja', role: 'person-role' },
    },
  },
  {
    id: 'holdout-swedish-org',
    brief: 'A minimal lower third for organization name Sveriges Kustbevakningsförbund and supporting context Presskonferens. Long-name capacity matters.',
    expect: { decision: 'ready', aiCategory: 'lower-third', intentKind: 'organization', roles: ['organization', 'supporting-context'] },
    fields: {
      primary: { title: 'Organization', sample: 'Sveriges Kustbevakningsförbund', role: 'organization' },
      secondary: { title: 'Context', sample: 'Presskonferens', role: 'supporting-context' },
    },
  },
  {
    id: 'holdout-hyphenated-title',
    brief: 'A corporate lower third for name Anna-Liisa Väre-Koskinen and role Co-Chief Sustainability & Supply-Chain Officer. Preserve hierarchy without tiny text.',
    expect: { decision: 'ready', aiCategory: 'lower-third', intentKind: 'person', roles: ['person-name', 'person-role'] },
    fields: {
      primary: { title: 'Name', sample: 'Anna-Liisa Väre-Koskinen', role: 'person-name' },
      secondary: { title: 'Role', sample: 'Co-Chief Sustainability & Supply-Chain Officer', role: 'person-role' },
    },
  },
  {
    id: 'holdout-story-headline',
    brief: 'A restrained news lower third for headline Ferry timetables change as ice season begins and supporting location Turku Archipelago.',
    expect: { decision: 'ready', aiCategory: 'lower-third', intentKind: 'story', roles: ['story-headline', 'location'] },
    fields: {
      primary: { title: 'Headline', sample: 'Ferry timetables change as ice season begins', role: 'story-headline' },
      secondary: { title: 'Location', sample: 'Turku Archipelago', role: 'location' },
    },
  },
  {
    id: 'holdout-scoreboard-refusal',
    brief: 'A live score bug for the match, home and away scores updating rapidly, with a period clock.',
    expect: { decision: 'unsupported', unsupportedCode: 'unsupported-category' },
  },
  {
    id: 'holdout-external-data-refusal',
    brief: 'A lower third that pulls the presenter name from our newsroom API in real time.',
    expect: { decision: 'unsupported', unsupportedCode: 'external-data' },
  },
];
