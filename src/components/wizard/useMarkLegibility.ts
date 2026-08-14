// Is the logo the user just uploaded still visible in the package they just chose?
//
// The wizard had no answer to that at all until the owner's value-gate ballot found out the hard
// way (`docs/AI_LITE_BRAND_PLAN.md` §2.2): a knockout mark on a light palette rendered white ink
// on a near-white panel, and the wizard reported nothing, because nothing in the create path ever
// looks at the frame. The measurement itself is `validation/markLegibility.ts`; this hook is only
// the timing - when to ask, and how not to ask on every keystroke.

import { useEffect, useState } from 'react';
import type { SpxTemplate } from '../../model/types';
import { checkMarkLegibility, markLegibilityMessage } from '../../validation/markLegibility';

/** Long enough that dragging a colour picker does not mount a frame per pixel, short enough that
 *  the answer is there before the user has finished looking at the palette they picked. The live
 *  preview's own debounce is 220ms; this deliberately trails it, so the measurement runs on the
 *  design the user is already looking at. */
const DEBOUNCE_MS = 450;

/**
 * The warning sentence for a template whose mark cannot be read, or null.
 *
 * `enabled` is the caller's cheap pre-check (has this draft a logo at all): mounting and settling
 * an offscreen 1920x1080 frame is real work, and a graphic with no mark can never produce a
 * finding, so it must not pay for one.
 */
export function useMarkLegibility(template: SpxTemplate | null, enabled: boolean): string | null {
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !template) {
      setWarning(null);
      return undefined;
    }
    // `cancelled` rather than a cleanup that only clears the timer: the measurement is async and
    // a fast palette change can land its result after a newer one started, which would leave the
    // step showing a warning about a package the user has already moved off.
    let cancelled = false;
    const timer = setTimeout(() => {
      void checkMarkLegibility(template).then((findings) => {
        if (cancelled) return;
        setWarning(findings.length ? markLegibilityMessage(findings[0]) : null);
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [template, enabled]);

  return warning;
}
