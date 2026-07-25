// The AI harness's SAFETY screen: refuse generated JavaScript that talks to the network, reads
// browser storage, builds code at runtime, or reaches out of its frame.
//
// Why the harness needs one at all. The gate the app injects (validateTemplate + the runtime
// bench) asks whether a template is CORRECT — SPX contract, field binding, overlaps. Nothing in
// it asks what the code DOES, and the model does not only read the user's own brief: it reads
// uploaded reference images (text inside a picture is instructions to a vision model), and on
// modify/convert it reads a whole HTML file the user may have been handed by someone else. Any
// of those can carry an instruction the user never typed.
//
// What makes that worth blocking rather than warning about: a generated template is EXECUTED
// automatically. The runtime bench loads it in an iframe the moment a result lands — before the
// user has looked at it, let alone applied it — and today that iframe shares the app's origin
// (so it can read the stored API key). A finding here becomes a hard error, which means the
// provider's repair loop gets a round to write the code properly, and a result that still fails
// is surfaced with its validation rather than applied.
//
// The construct list is shared with the community share gate on purpose (validation/templateBench
// `unsafeJsConstructs`) — same question, same answer, one place to update. Its limits are the same
// too: a regex screen refuses the obvious, not the determined, and the containment that would
// actually hold is denying the preview iframe the app's origin.

import { unsafeJsConstructs } from '../validation/templateBench';
import { validateTemplate, type ValidationIssue, type ValidationResult } from '../validation/validateTemplate';
import type { SpxValidator } from './provider';
import type { SpxTemplate } from '../model/types';

/**
 * What a generated template INTRODUCED that a graphic has no business doing.
 *
 * `source` is the template a modify/fix/convert started FROM, and it is what keeps the screen
 * honest about the user's own work: a graphic that already carries a Live data or Show chat block
 * legitimately calls fetch(), and asking the AI to restyle it must not become unfixable because
 * the model faithfully preserved code the user put there. Only constructs the result ADDED are
 * reported. A plain generate passes no source — everything in a brand-new template is new.
 */
export function safetyFindings(template: SpxTemplate, source?: SpxTemplate | null): ValidationIssue[] {
  const before = new Set(source ? unsafeJsConstructs(source.js).map((c) => c.rule) : []);
  return unsafeJsConstructs(template.js)
    .filter((c) => !before.has(c.rule))
    .map((c) => ({
      rule: c.rule,
      message:
        `The generated JavaScript ${c.note}. A broadcast graphic runs offline and draws its own ` +
        `fields — it has no reason to, so this result is held back. If your brief asked for live ` +
        `data, add it yourself with the Live data block after creating.`,
    }));
}

/** Fold the screen into a validation result. Safe to apply twice — findings are deduped by rule. */
export function mergeSafety(
  base: ValidationResult,
  template: SpxTemplate,
  source?: SpxTemplate | null,
): ValidationResult {
  const seen = new Set(base.errors.map((e) => e.rule));
  const added = safetyFindings(template, source).filter((f) => !seen.has(f.rule));
  if (!added.length) return base;
  return { ok: false, errors: [...base.errors, ...added], warnings: base.warnings };
}

/**
 * Wrap the harness's INJECTED validator with the screen, so a finding reaches the provider's
 * repair loop and the model gets a round to write the code properly.
 *
 * Not every path runs the injected validator — `generateRaw` deliberately validates itself, to
 * stay the pure baseline the harness is measured against (src/ai/CLAUDE.md). So the surfaces that
 * SHOW a result screen it again with `mergeSafety`; that is the belt the raw path needs and it
 * costs nothing on the paths that already carry it.
 */
export function withSafetyChecks(inner: SpxValidator | undefined, source?: SpxTemplate | null): SpxValidator {
  return async (template: SpxTemplate): Promise<ValidationResult> => {
    const base = inner ? await inner(template) : validateTemplate(template);
    return mergeSafety(base, template, source);
  };
}
