import MiniPreview from '../MiniPreview';
import type { SpxTemplate } from '../../../model/types';

interface Props {
  /** The production's name; empty falls back to `namePlaceholder` (the kit's own name). */
  name: string;
  namePlaceholder: string;
  onName: (name: string) => void;
  /** Every graphic that was built, in kit order. */
  built: SpxTemplate[];
  /** Save the whole set and land on the production page. */
  onOpenProduction: () => void;
  /** Save the whole set, then export it as one package. */
  onExport: () => void;
  /** True while the set is being written — both doors save, so both must say so. */
  busy: boolean;
  /** A save that did not land, reported here rather than swallowed. */
  error: string | null;
}

/**
 * THE KIT'S FINISH — name the production, see everything that was built, choose a door.
 *
 * BOTH DOORS SAVE FIRST, and the save is not optional (the Finish step's doctrine, applied to
 * N graphics instead of one): a kit that was configured, exported and then dropped would cost
 * every choice in the walk to reproduce, times the size of the set. Export does not require
 * opening the editor — the editor is never involved in a kit at all.
 *
 * The thumbnail grid is the point of the step. A kit's promise is that the set reads as one
 * package, and a list of names cannot show whether it does; these are the real graphics, built,
 * settled and rendered side by side, which is the only place that promise can actually be
 * checked before anything is saved.
 */
export default function KitFinishStep({
  name,
  namePlaceholder,
  onName,
  built,
  onOpenProduction,
  onExport,
  busy,
  error,
}: Props) {
  return (
    <div className="wz-finish wz-kit-finish" data-testid="kit-finish">
      <div className="panel-section">
        <h3>Name this production</h3>
        <input
          className="wz-finish-name"
          value={name}
          placeholder={namePlaceholder}
          onChange={(e) => onName(e.target.value)}
          data-testid="kit-finish-name"
          aria-label="Production name"
        />
        <p className="hint">
          A production is what airs: its graphics, the cue rundown, the output URL, and the
          control page.
        </p>
      </div>

      <div className="panel-section">
        <h3>
          What you built
          <span className="dlg-caption">{built.length} graphics, one look</span>
        </h3>
        <ul className="wz-kit-built" data-testid="kit-built">
          {built.map((template, i) => (
            <li key={`${template.name}-${i}`} className="wz-kit-built-cell">
              <MiniPreview template={template} lazy />
              <span className="wz-kit-built-name">{template.name}</span>
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="status-bad" data-testid="kit-finish-error">{error}</p>}

      <div className="wz-finish-doors">
        <button
          className="wz-entry-card wz-entry-card--primary"
          onClick={onOpenProduction}
          disabled={busy}
          data-testid="kit-finish-production"
        >
          <span className="wz-entry-head">
            <span className="wz-entry-icon">▶</span>
            <strong>Open the production</strong>
          </span>
          <span className="hint">
            Saves all {built.length}, pools them with their cues ready, and opens the cockpit.
          </span>
        </button>
        <button
          className="wz-entry-card"
          onClick={onExport}
          disabled={busy}
          data-testid="kit-finish-export"
        >
          <span className="wz-entry-head">
            <span className="wz-entry-icon">⬇</span>
            <strong>Export the kit (.zip)</strong>
          </span>
          <span className="hint">
            One package with every graphic on its own playout layer. Saved first, so nothing is
            lost.
          </span>
        </button>
      </div>
    </div>
  );
}
