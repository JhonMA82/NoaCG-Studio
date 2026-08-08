// Shared shape for the four sign-off designs. The category assembler still owns the complete
// template; this helper only keeps the sign-off field and logo contract identical in every look.

import type { SpxField } from '../../model/types';
import type { ResolvedOptions } from '../../model/wizard';
import type { StartingSoonDesign } from './shared';
import { designFieldId } from '../shared/standard';

export interface SignOffLook {
  /** Family-owned CSS. The helper appends only the field-contract rules shared by all looks. */
  css: string;
  /** Human-readable name used in the generated markup comment. */
  label: string;
}

export function signOffDesign(
  o: ResolvedOptions,
  look: SignOffLook,
): StartingSoonDesign {
  // The logo follows the three visible lines, so designFieldId resolves the required f3 slot.
  const logoId = designFieldId(o);
  // Optional means the field always exists while empty artwork consumes no visual space.
  const logoPath = o.logoEnabled ? (o.logoAssetPath ?? '') : '';
  const logoAttrs = logoPath ? ` src="${logoPath}"` : ' style="display: none"';

  // Keep the image an ordinary SPX field. The type compiler and every control page then see
  // the same four-field contract, regardless of which visual family resolves the design.
  const logoField: SpxField = {
    field: logoId,
    ftype: 'filelist',
    title: 'Logo',
    value: logoPath,
    assetfolder: './images/',
    extension: 'png',
  };

  return {
    // A sign-off is a clockless hold. Three lines preserve the optional next-broadcast field
    // without inventing a countdown for an event that may not have a scheduled return.
    lineCount: 3,
    clock: 'none',
    lineDefaults: [
      { title: 'Closing line', sample: 'UNTIL NEXT TIME' },
      { title: 'Message', sample: 'Thanks for watching' },
      { title: 'Next broadcast', sample: 'Back Thursday at 19:00' },
    ],
    html: `    <!-- ${look.label}: logo / closing line / sign-off message / optional next broadcast. -->
    <div class="starting-soon-box">
      <!-- The logo wrapper remains stable across updates; the image itself may be empty. -->
      <div class="starting-soon-logo${logoPath ? ' has-image' : ''}"><img id="${logoId}" class="starting-soon-logo-image"${logoAttrs} alt="" /></div>
      <!-- The three lines keep the type's positional f0/f1/f2 field mapping explicit. -->
      <div class="starting-soon-mask"><span id="f0" class="starting-soon-kicker">${o.lines[0]?.sample || 'UNTIL NEXT TIME'}</span></div>
      <div class="starting-soon-mask"><span id="f1" class="starting-soon-message">${o.lines[1]?.sample || 'Thanks for watching'}</span></div>
      <div class="starting-soon-rule starting-soon-pulse"></div>
      <div class="starting-soon-mask"><span id="f2" class="starting-soon-next">${o.lines[2]?.sample || 'Back Thursday at 19:00'}</span></div>
    </div>`,
    css: `${look.css}

/* The logo slot is always present in the field contract and disappears cleanly when empty. */
.starting-soon-logo {
  min-height: calc(54px * var(--scale));  /* reserves the slot only when its optional content exists */
  display: flex;  /* selects the layout model the composition depends on */
  align-items: center;  /* keeps related elements aligned as one visual unit */
  justify-content: center;  /* distributes the authored negative space predictably */
}

/* Bound both axes so wide and tall station marks share one dependable sign-off footprint. */
.starting-soon-logo-image {
  display: block;  /* selects the layout model the composition depends on */
  width: auto;  /* fixes the authored horizontal footprint */
  max-width: calc(220px * var(--scale));  /* caps growth before it spends safe-area capacity */
  height: auto;  /* fixes the authored vertical footprint */
  max-height: calc(82px * var(--scale));  /* caps varied artwork inside the designed slot */
  object-fit: contain;  /* preserves the source aspect ratio inside the fixed slot */
}

/* An unused optional slot must not leave unexplained air above the closing line. */
.starting-soon-logo:not(.has-image) {
  min-height: 0;  /* reserves the slot only when its optional content exists */
}

/* The next appointment is genuinely optional, so empty data collapses without runtime state. */
.starting-soon-next:empty {
  display: none;  /* selects the layout model the composition depends on */
}`,
    extraFields: [logoField],
  };
}
