import type { SpaceMode } from './playoutKeys';

/**
 * THE CHECKBOX for the two SPACE modes (docs/PLAYOUT_DASHBOARD.md §2, "Two Space modes"),
 * rendered by both React surfaces from this one place. It sits in the verb bar, beside the key
 * it changes, rather than on a settings screen: the operator decides how SPACE behaves while
 * their hand is on it (the same reasoning that keeps the playout layer in the cue editor).
 *
 * Unchecked is the default and today's behaviour; checked is the owner's mixer cut. The words
 * describe the press, never the mode's internal name.
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
    <label
      className="pd-space-mode"
      title={
        'Checked: walking the rundown previews nothing. SPACE puts the selected cue on PREVIEW, ' +
        'SPACE again airs it, and SPACE on a cue that is on air takes it off and leaves it on PREVIEW. ' +
        'Unchecked: selecting a cue previews it and SPACE airs it.'
      }
    >
      <input
        type="checkbox"
        checked={mode === 'preview-then-take'}
        onChange={(e) => {
          onChange(e.target.checked ? 'preview-then-take' : 'take');
          // A checkbox is an INPUT, and the verb keys stand down while one has focus - which is
          // right while typing a name and wrong here: the very next SPACE after a click would
          // flip the mode back instead of taking. The click is over; the keys are the verbs'.
          e.target.blur();
        }}
        data-testid={testId}
      />
      <span>
        <kbd>SPACE</kbd> previews first
      </span>
    </label>
  );
}
