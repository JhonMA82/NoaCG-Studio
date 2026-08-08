// The structural-satisfaction check (docs/CREATIVE_MODE_PLAN.md §8): verify a routed
// StructuralIntent's REQUIRED PARTS against the template - the brief-satisfaction proxy the
// harness sweep showed was missing (a timing tower emitted as two stray lines passed every
// gate; nothing asked "is this the graphic that was asked for").
//
// It measures PRESENCE and IDENTITY, not quality: pairwise human review stays the quality
// instrument. PARTS findings carry rule 'structural-intent' and stay non-blocking - the
// provider appends them as warnings after the repair loop, so the frozen control's repair
// rounds never change (plan §8). KIND findings carry rule 'structural-kind' and BLOCK a
// grounded result (owner decision 2026-07-31, AI_PLATFORM_PLAN §16.3): a wrong-kind graphic
// is an honest failure, never delivered as a success. Grounded assemblies have no repair
// loop, so blocking there disturbs nothing.
//
// It runs on BOTH routed paths. The check first shipped CREATE-only, which left the defect
// the benchmark hit most often unmeasured: a brief that routes to the CATALOG path
// correctly and comes back as the wrong catalog member. Being correct by construction says
// nothing about whether the right thing was constructed, so the kind check below asks.
//
// Browser-only (the DOM half loads the template in a hidden iframe, the runtime-bench
// pattern); the provider never imports this - it is injected as
// GenerateOptions.structuralCheck (src/ai/provider.ts StructuralIntentChecker).

import { composeDocument } from '../preview/composeDocument';
import { parseAnimData } from '../blocks/animData';
import { anchorsSatisfiedBy, structuralFit, variantSatisfiesAnchor } from '../templates/structuralAnchor';
import type { SpxTemplate } from '../model/types';
import { STRUCTURAL_INTENT_RULE, STRUCTURAL_KIND_RULE, type StructuralIntent } from '../model/structuralIntent';
import type { ValidationIssue } from './validateTemplate';
// The field-reachability drive is SHARED with the runtime bench (src/validation/fieldPaint.ts):
// one question, one answer. The bench asks it of a NoaCG Lite generation, which never reaches
// this file at all - Lite runs no intent stage, so `withStructuralFindings` returns early.
import { TEXT_FTYPES, unreachableFields } from './fieldPaint';

const issue = (message: string): ValidationIssue => ({ rule: STRUCTURAL_INTENT_RULE, message });
/** Kind findings carry their own rule because their SEVERITY differs: the provider blocks a
 *  grounded result on them (owner decision 2026-07-31 - a wrong-kind graphic is an error),
 *  while parts findings stay advisory warnings. */
const kindIssue = (message: string): ValidationIssue => ({ rule: STRUCTURAL_KIND_RULE, message });

/** How many same-classed siblings count as "a repeating group renders". Two is any pair of
 *  styled elements; three is a list. */
const REPEAT_MIN = 3;
/** The whole DOM pass's budget - a check that hangs must cost nothing but itself. */
const DOM_BUDGET_MS = 6_000;
const SETTLE_MS = 350;

// ── The KIND check (grounded results only - was this the graphic that was asked for?) ──

/**
 * Did the catalog assembly deliver the STRUCTURE the intent promised?
 *
 * This is the benchmark's most common defect, and the one every other gate was blind to.
 * Routing correctly sends a stinger brief down the catalog path (the catalog does carry
 * transitions); the design stage then picks a lower third; static validation passes, the
 * runtime bench passes, and the parts checks below pass too - a lower third really does
 * have a headline and really does sit bottom-left. Every measurement agreed, and the user
 * got the wrong graphic.
 *
 * Nothing measured it because the two halves that knew were never introduced: the ROUTER
 * resolved which structure the brief named and then forgot it once it had picked a path,
 * and this check only ever ran on the CUSTOM path. So the question is asked here, by
 * IDENTITY, against the same anchor the router resolved.
 *
 * `variantId` is the design stage's chosen chassis. Absent (a free-form result has no
 * catalog variant) the question does not apply - the parts checks below carry that path.
 */
export function structuralKindFindings(
  intent: StructuralIntent,
  variantId: string | undefined,
): ValidationIssue[] {
  if (!variantId) return [];
  const { fit, anchor } = structuralFit(intent);
  // No anchor means the brief named no catalog structure - there is nothing to have missed.
  // (A brief that routed to the catalog path anyway is a ROUTING finding, not this one.)
  if (!fit || !anchor) return [];
  // A mismatch can only be reported when BOTH sides are known. An id the catalog cannot
  // resolve means we do not know what was built, and "unknown" is not evidence of "wrong" -
  // reporting it would put a confident finding on a measurement that failed, which is the
  // same mistake as a gate judging a dimension it cannot see. Silence here, like the DOM
  // half's, is honest rather than lenient.
  const built = anchorsSatisfiedBy(variantId);
  if (!built.length) return [];
  if (variantSatisfiesAnchor(variantId, anchor)) return [];
  return [
    kindIssue(
      `The brief asks for ${anchor} (${intent.summary}), but the assembled design ` +
        `"${variantId}" is ${built.join(' / ')}. That is a different graphic, not a ` +
        'different look.',
    ),
  ];
}

// ── The static half (no DOM - field and state shape against the definition) ──

export function structuralIntentStaticFindings(
  template: SpxTemplate,
  intent: StructuralIntent,
): ValidationIssue[] {
  const findings: ValidationIssue[] = [];

  // Repeating data rides ONE textarea (the house list convention). A declared list field
  // with no textarea in the definition means the operator cannot type the list at all.
  const wantsList = intent.fields.some((f) => f.role === 'list');
  if (wantsList && !template.fields.some((f) => f.ftype === 'textarea')) {
    findings.push(
      issue(
        'The brief needs LIST data (one textarea field, one item per line), but the template ' +
          'declares no textarea field.',
      ),
    );
  }

  // Field capacity: the operator must be able to enter every non-hidden datum the intent
  // declared. A count check, deliberately - logical keys cannot be matched to fN ids.
  const required = intent.fields.filter((f) => f.role !== 'hidden').length;
  if (required > 0 && template.fields.length < required) {
    findings.push(
      issue(
        `The brief needs ${required} operator field(s); the template declares only ` +
          `${template.fields.length}.`,
      ),
    );
  }

  // Declared states need somewhere to live: a state machine, or at least a middle step the
  // operator can fire with Continue.
  if (intent.states?.length) {
    const anim = parseAnimData(template.js);
    const hasMachine = Boolean(anim?.machine);
    const hasMiddleStep = (anim?.steps.length ?? 0) > 2;
    if (!hasMachine && !hasMiddleStep) {
      findings.push(
        issue(
          `The brief needs operator/timer state(s) (${intent.states.map((s) => s.id).join(', ')}), ` +
            'but the template has no state machine and no middle step to carry them.',
        ),
      );
    }
  }

  return findings;
}

// ── The DOM half (repeating groups + placement, measured in a settled frame) ─

interface BenchGlobals {
  play?: () => void;
  update?: (data: string) => void;
  gsap?: { globalTimeline?: { timeScale: (v: number) => void } };
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The largest same-class sibling group in the rendered graphic - the "does a repeating
 *  structure actually render" measurement. Every element is measured as a PARENT (a
 *  repeating group can sit at any depth); the count is same-class DIRECT children, so two
 *  unrelated uses of a utility class never sum across containers. */
function largestRepeatingGroup(doc: Document): number {
  let best = 0;
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    if (el.children.length < 2) continue;
    const byClass = new Map<string, number>();
    for (const child of Array.from(el.children)) {
      for (const cls of Array.from(child.classList)) {
        byClass.set(cls, (byClass.get(cls) ?? 0) + 1);
      }
    }
    for (const count of byClass.values()) best = Math.max(best, count);
  }
  return best;
}

/** The union bbox of the visible text-bearing elements - where the graphic's content sits. */
function contentBox(doc: Document, win: Window): { cx: number; cy: number } | null {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity, any = false;
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    if (!el.textContent?.trim() || el.children.length) continue;
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    any = true;
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  return any ? { cx: (left + right) / 2, cy: (top + bottom) / 2 } : null;
}

/** Lenient zone agreement: only the third-band the zone names, with generous slack - this
 *  catches "the lower third rendered at the top", never a taste-level nudge. */
function placementFinding(
  zone: NonNullable<StructuralIntent['placement']>,
  cx: number,
  cy: number,
  width: number,
  height: number,
): ValidationIssue | null {
  const [row, col] = zone.split('-') as [string, string];
  const bad =
    (row === 'top' && cy > height * 0.55) ||
    (row === 'bottom' && cy < height * 0.45) ||
    (col === 'left' && cx > width * 0.6) ||
    (col === 'right' && cx < width * 0.4);
  return bad
    ? issue(
        `The brief places the graphic ${zone}, but the rendered content sits at ` +
          `${Math.round((cx / width) * 100)}%/${Math.round((cy / height) * 100)}% of the frame.`,
      )
    : null;
}

async function domFindings(template: SpxTemplate, intent: StructuralIntent): Promise<ValidationIssue[]> {
  const needsRepeat = intent.parts.some((p) => p.repeating);
  const needsPlacement = Boolean(intent.placement);
  // Field reachability is asked of EVERY result: it is the one part question whose answer the
  // markup cannot be read for, and the pass that motivated it had no repeating part either.
  const needsFields = template.fields.some((f) => TEXT_FTYPES.has(f.ftype));
  if (!needsRepeat && !needsPlacement && !needsFields) return [];

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:1920px;height:1080px;visibility:hidden;';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);
  try {
    const loaded = new Promise<void>((resolve) => {
      iframe.addEventListener('load', () => resolve(), { once: true });
    });
    iframe.srcdoc = composeDocument(template);
    const timedOut = await Promise.race([loaded.then(() => false), wait(DOM_BUDGET_MS).then(() => true)]);
    const win = iframe.contentWindow as (Window & BenchGlobals) | null;
    const doc = iframe.contentDocument;
    if (timedOut || !win || !doc) return [];

    // Exercise it the way playout will: real data in, play, let the entrance settle fast.
    try {
      const data = Object.fromEntries(template.fields.map((f) => [f.field, f.value ?? '']));
      win.update?.(JSON.stringify(data));
      win.gsap?.globalTimeline?.timeScale(20);
      win.play?.();
    } catch {
      return []; // a template that throws here is the runtime bench's finding, not ours
    }
    await wait(SETTLE_MS);

    const findings: ValidationIssue[] = [];
    if (needsRepeat) {
      const biggest = largestRepeatingGroup(doc);
      if (biggest < REPEAT_MIN) {
        const parts = intent.parts.filter((p) => p.repeating).map((p) => p.id);
        findings.push(
          issue(
            `The brief needs repeating structure (${parts.join(', ')}), but the rendered frame ` +
              `shows no group of ${REPEAT_MIN}+ similar elements (largest: ${biggest}).`,
          ),
        );
      }
    }
    if (intent.placement) {
      const box = contentBox(doc, win);
      if (box) {
        const finding = placementFinding(intent.placement, box.cx, box.cy, 1920, 1080);
        if (finding) findings.push(finding);
      }
    }
    // Last, because it REPLACES the frame's data with sentinels: everything measured above
    // wants the real values, and nothing after it reads the frame.
    if (needsFields) {
      const unreachable = await unreachableFields(doc, win, template, SETTLE_MS);
      if (unreachable.length) {
        findings.push(
          issue(
            `The operator can type into ${unreachable.length} field(s) that never reach the ` +
              `screen: ${unreachable.join(', ')}. A field the graphic cannot show is not data, ` +
              'it is a control with nothing behind it.',
          ),
        );
      }
    }
    return findings;
  } finally {
    iframe.remove();
  }
}

/**
 * The full check: kind + static + rendered-DOM. Matches the StructuralIntentChecker seam
 * (src/ai/provider.ts) - the app injects this beside the runtime bench.
 *
 * `variantId` is the grounded design stage's chosen chassis, and is what makes the KIND
 * question answerable; a free-form result has none and is measured by parts alone.
 */
export async function benchStructuralIntent(
  template: SpxTemplate,
  intent: StructuralIntent,
  variantId?: string,
): Promise<ValidationIssue[]> {
  const findings = [
    ...structuralKindFindings(intent, variantId),
    ...structuralIntentStaticFindings(template, intent),
  ];
  try {
    findings.push(...(await domFindings(template, intent)));
  } catch {
    // The DOM half is best-effort: measurement failure is never a finding.
  }
  return findings;
}
