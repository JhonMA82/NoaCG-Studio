import ProjectFormatPicker from '../../ProjectFormatPicker';
import {
  draftFormatSelection,
  formatDraftPatch,
  type DraftPatch,
  type WizardDraft,
} from '../draft';

interface Props {
  draft: WizardDraft;
  onDraft: (patch: DraftPatch) => void;
  onCreate: () => void;
}

export default function BlankStep({ draft, onDraft, onCreate }: Props) {
  return (
    <div data-testid="blank-step">
      <div className="panel-section">
        <h3>Blank project</h3>
        <p className="hint">
          Start with a clean, transparent canvas. The authored format is set before the editor
          opens, so code, preview, animation timing, and package exports agree from the first frame.
        </p>
      </div>
      <ProjectFormatPicker
        value={draftFormatSelection(draft)}
        onChange={(selection) => onDraft(formatDraftPatch(selection))}
        idPrefix="blank-format"
      />
      <button className="primary" data-testid="blank-create" onClick={onCreate}>
        Create blank project
      </button>
    </div>
  );
}
