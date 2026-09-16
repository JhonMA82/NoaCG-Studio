import { SPACE_MODE_TITLE } from '../control/spaceMode';
import type { SpaceMode } from './playoutKeys';

/**
 * THE CHECKBOX for the two SPACE modes (docs/PLAYOUT_DASHBOARD.md §2f), rendered by both React
 * surfaces from this one place. It sits in the verb bar, beside the key it changes, rather than
 * on a settings screen: the operator decides how SPACE behaves while their hand is on it (the
 * same reasoning that keeps the playout layer in the cue editor).
 *
 * Unchecked is the default and today's behaviour; checked is the owner's mixer cut. The words
 * describe the press, never the mode's internal name. A click leaves focus on the box, and the
 * next SPACE is still the verb: `typingInto` in playoutKeys.ts does not count a checkbox as
 * typing, so nothing here has to steal focus back.
 */
export function SpaceModeToggle({
  mode,
  onChange,
  testId,
}: {
  mode: SpaceMode;
  onChange: (mode: SpaceMode) => void;
  testId: string;
}) {
  return (
    <label className="pd-space-mode" title={SPACE_MODE_TITLE}>
      <input
        type="checkbox"
        checked={mode === 'preview-then-take'}
        onChange={(e) => onChange(e.target.checked ? 'preview-then-take' : 'take')}
        data-testid={testId}
      />
      <span>
        <kbd>SPACE</kbd> previews first
      </span>
    </label>
  );
}
