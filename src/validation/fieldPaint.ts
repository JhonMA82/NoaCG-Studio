// Does a declared field reach the SCREEN?
//
// One definition, two consumers: `structuralIntentCheck` asks it of a routed harness result,
// and `runtimeBench` asks it of a NoaCG Lite generation (opt-in - see `fieldPaints`). It lived
// inside the first of those until 2026-08-08, when a Lite round produced a frame whose second
// field painted nothing at all: the panel reserved its space, `update()` with fresh data
// changed nothing, every rule code stayed silent, and the check that answers exactly this
// question could not run on that path (Lite never runs the intent stage, and the structural
// check needs an intent). Copying it would have been the second definition of a question that
// must have one answer, so it moved here instead.
//
// Browser-only: it drives a template running in a same-origin iframe and re-reads the frame.

import type { SpxTemplate } from '../model/types';

/** The field types whose value becomes VISIBLE TEXT, so driving them can be observed on the
 *  screen. A `filelist` points at a picture that does not exist here, and a colour or a
 *  checkbox moves a style rather than a string - none of the three can be measured this way,
 *  so none is reported. Honest silence beats a finding the method cannot support. */
export const TEXT_FTYPES = new Set(['textfield', 'textarea', 'number', 'hidden']);

/** A value that will be ACCEPTED for the field's type and is unmistakable on screen. */
export function sentinelFor(field: SpxTemplate['fields'][number], i: number): string {
  const tag = `ZQ${i}X`;
  if (field.ftype === 'number') return String(900000 + i);
  const value = String(field.value ?? '');
  // A multi-line source (a rows/lines field) keeps its line and column COUNT, so the runtime
  // rebuilds the same shape and every cell carries its own sentinel.
  if (value.includes('\n') || value.includes('|')) {
    return value
      .split('\n')
      .map((line, li) => line.split('|').map((_, ci) => `${tag}_${li}_${ci}`).join(' | '))
      .join('\n');
  }
  return tag;
}

/**
 * Every string the frame can show, skipping only what is `display: none` or
 * `visibility: hidden`.
 *
 * OPACITY is deliberately not consulted. A region the state machine reveals in a later step is
 * transparent during the entrance and is perfectly reachable - the bracket's champion is
 * exactly that, and treating it as unreachable was this check's first false positive. The
 * defect being hunted has a different signature: the value exists NOWHERE but the hidden
 * holder, or nowhere at all. An element left at opacity 0 forever is a real fault, but it is
 * the entrance's, and `stripHidingDeclarations` and the runtime bench already own it.
 */
export function visibleText(doc: Document, win: Window): string {
  let out = '';
  const walk = (el: Element) => {
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3 && node.textContent?.trim()) out += ` ${node.textContent.trim()}`;
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  if (doc.body) walk(doc.body);
  return out;
}

interface UpdateGlobal {
  update?: (data: string) => void;
}

/**
 * Which declared fields never reach the screen.
 *
 * The technique is scripts/field-coverage.mjs's, asked in the opposite direction: instead of
 * "which visible string can no operator reach", this asks "which field reaches no visible
 * string". It exists because presence in the DOM is not reachability - the 2026-08-01 pass
 * shipped 88 fields that were structurally impossible to draw (hidden holders no runtime read,
 * a list runtime whose container was never emitted) and every gate reported the parts present,
 * including the structural check's own parts check (PASS-2026-08-01.md cause 4).
 *
 * Reading the markup for `id="fN"` would not answer it: a standings row, a ticker item and a
 * credits line are all BUILT by a runtime from ONE field, so the id is legitimately absent.
 * Driving the field and re-reading the screen is the only question that survives that.
 *
 * It REPLACES the frame's data with sentinels. A caller that measures anything else afterwards
 * has to restore the values it wants - `runtimeBench` does; the structural check runs it last.
 */
export async function unreachableFields(
  doc: Document,
  win: Window & UpdateGlobal,
  template: SpxTemplate,
  settleMs: number,
): Promise<string[]> {
  const driven = template.fields
    .map((f, i) => ({ field: f, sentinel: sentinelFor(f, i) }))
    .filter((d) => TEXT_FTYPES.has(d.field.ftype));
  if (!driven.length) return [];
  try {
    win.update?.(JSON.stringify(Object.fromEntries(driven.map((d) => [d.field.field, d.sentinel]))));
  } catch {
    return []; // a template that throws on update is the runtime bench's finding, not ours
  }
  await new Promise<void>((r) => setTimeout(r, settleMs)); // a rebuild runtime may re-fit
  const painted = visibleText(doc, win);
  return driven
    // One cell is enough for a list: the field reached the screen, and how many rows the
    // runtime chose to draw is a different question.
    .filter((d) => !d.sentinel.split(/[\s|\n]+/).some((part) => part && painted.includes(part)))
    .map((d) => `${d.field.title || d.field.field} (${d.field.field})`);
}
