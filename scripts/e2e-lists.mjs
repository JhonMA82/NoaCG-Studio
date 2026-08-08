// SPRINT FOCUS - the student-critical spec set (added 2026-08, docs/GOALS.md "Student release").
//
// While the student-release sprint runs, a change that would escalate to the FULL suite runs
// this set instead (scripts/e2e-affected.mjs, gated on E2E_SPRINT_FOCUS=1), and the nightly
// verdict classifies failures as focus (fix now) vs paused (drift, swept at sprint end)
// through scripts/nightly-triage.mjs. Both consumers import THIS list so they cannot drift.
//
// The list is the sprint's definition of "the product": wizard, home/library, productions,
// control/playout, export, auth/sync, landing, layout. Retire the whole file - together with
// the E2E_SPRINT_FOCUS env in ci.yml and the focus branch in e2e-affected.mjs - when the
// sprint ends.
export const FOCUS = [
  'advanced-mode.spec.ts',
  'auth.spec.ts',
  'control.spec.ts',
  'exports.spec.ts',
  'feedback.spec.ts',
  'flows.spec.ts',
  'format.spec.ts',
  'hosted-control.spec.ts',
  'landing.spec.ts',
  'layout.spec.ts',
  'lazy-editor.spec.ts',
  'library.spec.ts',
  'library-bulk.spec.ts',
  'local-relay.spec.ts',
  'offline.spec.ts',
  'package.spec.ts',
  'playout-drills.spec.ts',
  'production-audience.spec.ts',
  'production-controls.spec.ts',
  'production-data.spec.ts',
  'production-persistence.spec.ts',
  'productions.spec.ts',
  'quiz-pilot.spec.ts',
  'project.spec.ts',
  'project-format.spec.ts',
  'shows.spec.ts',
  'snap-recovery.spec.ts',
  'storage-full.spec.ts',
  'sync.spec.ts',
  'template-deep-link.spec.ts',
  'wizard-entry-fit.spec.ts',
  'wizard-filters.spec.ts',
  'wizard-finish.spec.ts',
  'wizard-kit.spec.ts',
  'wizard-logo.spec.ts',
  'wizard-preview.spec.ts',
  'wizard-shell.spec.ts',
];
