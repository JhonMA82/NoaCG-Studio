// THE ONE SEAM Phase A is scored through - the injected production gate plus the platform's own
// divergences from what the model asked for (docs/NOACG_PRO_PLAN.md §15.8, §16).
//
// WHY IT EXISTS AT ALL, given the composer cannot emit invalid code. §16 is the argument: the
// reconstruction engine KNEW it had refused an erase, recorded it in a report field, and nothing
// read it - so the first real hosted generation shipped a double-printed graphic with
// `validation_rule_codes` empty and the ledger row saying `usable`. That is not a property of
// raster reconstruction; it is what happens whenever a pipeline's own findings live somewhere the
// gate does not look. Phase A has its own such findings - a palette repaired for legibility, a
// mark given a field, a model answer that fell back to the house - and they arrive here.
//
// ONE FUNCTION, EVERY CALLER. The product (`pro/language/pipeline.ts`) and the bench
// (`scripts/pro-spike.mjs`) both validate through `validateProLanguage`, for the reason
// `validateProCompile` exists one directory up: a second call site is how a round comes to score
// a different gate than the product runs, which this repo has now paid for twice.

import type { SpxValidator } from '../../provider';
import type { ValidationIssue, ValidationResult } from '../../../validation/validateTemplate';
import type { ComposedGraphic } from './compose';

/** The prefix every finding this file mints carries. Read by `proRuleCodes` below and by the
 *  outcome report, so "which findings are Pro's own" is answered in one place. */
export const PRO_RULE_PREFIX = 'pro-';

/** How many codes the outcome wire accepts (`reportProOutcome` slices to the same number). */
const MAX_RULE_CODES = 30;

/**
 * What the platform decided FOR the language, as findings rather than as prose.
 *
 * All three are WARNINGS, and that is the whole point of them. Each one describes a graphic that
 * is airable BECAUSE the platform intervened - the palette now reads, the mark now reads, the
 * house values filled a gap the answer left. A user must not be told their graphic failed; the
 * LEDGER must not be told everything was fine. Warnings are the only verdict that says both.
 */
export function proLanguageFindings(
  composed: Pick<ComposedGraphic, 'adjustments' | 'notes'>,
  fallbacks: string[],
): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const palette = composed.adjustments.filter((code) => code.startsWith('palette_'));
  if (palette.length) {
    out.push({
      rule: 'pro-palette-repaired',
      message: 'The language\'s supporting colours were moved to reach the contrast floor against'
        + ` its own panel: ${palette.join(', ')}. Identity (accent and panel) is untouched.`,
    });
  }
  if (composed.adjustments.includes('mark_field_painted')) {
    // The composer already wrote the measured reason into a note; reuse it rather than
    // recomputing the contrast, or the finding and the note can disagree about the same number.
    const note = composed.notes.find((n) => n.startsWith('mark field: '));
    out.push({
      rule: 'pro-mark-field',
      message: note
        ? `The brand mark's column carries a measured neutral field - ${note.slice('mark field: '.length)}`
        : 'The brand mark\'s column carries a measured neutral field so its ink reads on this panel.',
    });
  }
  if (fallbacks.length) {
    out.push({
      rule: 'pro-language-fallback',
      message: `${fallbacks.length} design decision(s) came back unreadable and fell back to the`
        + ` house language: ${fallbacks.slice(0, 12).join(', ')}${fallbacks.length > 12 ? ', …' : ''}.`,
    });
  }
  return out;
}

/**
 * The composed graphic's verdict: the injected production gate, plus the findings above.
 *
 * Shaped exactly like `validateProCompile` (pro/compile.ts) - null when there is nothing to say
 * and no validator was injected, the gate's own verdict otherwise, and the platform's findings
 * folded in either way. A caller with no validator (a probe, a unit-shaped check) still learns
 * what the platform changed.
 */
export async function validateProLanguage(
  composed: ComposedGraphic,
  fallbacks: string[],
  validate?: SpxValidator,
): Promise<ValidationResult | null> {
  const own = proLanguageFindings(composed, fallbacks);
  const gate = validate ? await validate(composed.template) : null;
  if (!gate) {
    if (!own.length) return null;
    // Nothing here is ever an error, so a language-only verdict always passes - the findings are
    // what the graphic cost, not a reason to refuse it.
    return { ok: true, errors: [], warnings: own };
  }
  return { ok: gate.errors.length === 0, errors: gate.errors, warnings: [...gate.warnings, ...own] };
}

/**
 * The rule codes that belong on the ledger row (`reportProOutcome`'s `ruleCodes`).
 *
 * TWO RULES, and the asymmetry between them is deliberate.
 *
 * **Every ERROR goes on, unfiltered.** An error is why the row says `failed`, and there are never
 * many of them; dropping one because it came from the shared gate rather than from Pro would
 * leave the row naming a failure it cannot explain.
 *
 * **WARNINGS are filtered to `pro-`.** This is the §16 hole being closed from the other side: the
 * old report sent errors only, so a graphic the platform had quietly repaired wrote an EMPTY
 * `validation_rule_codes` beside a `usable` status - a row that cannot distinguish a clean
 * generation from a rescued one. Warnings fix that, and the prefix keeps the fix affordable: the
 * runtime bench is chatty by design (a dozen `bench-*` observations on a healthy graphic), the
 * wire caps the list at 30, and a cap reached by bench noise would evict exactly the Pro-owned
 * codes this exists to carry.
 */
export function proRuleCodes(validation: ValidationResult | null | undefined): string[] {
  if (!validation) return [];
  const codes = [
    ...validation.errors.map((finding) => finding.rule),
    ...validation.warnings
      .map((finding) => finding.rule)
      .filter((rule) => rule.startsWith(PRO_RULE_PREFIX)),
  ];
  return [...new Set(codes)].slice(0, MAX_RULE_CODES);
}
