import { ALL_PRESETS } from '../../../blocks/presetRegistry';
import { FONTS } from '../../../model/fonts';
import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { isRenderConfigured } from '../../../render/config';
import { draftResolution, type DraftPatch, type WizardDraft } from '../draft';

interface Props {
  variant: TemplateVariant;
  draft: WizardDraft;
  onDraft: (patch: DraftPatch) => void;
  /** Create the project and land in the editor — the classic ending. Saving stays manual. */
  onOpenEditor: () => void;
  /** Create it, save it to the library, and go straight to the export window. */
  onExport: () => void;
  /** Disabled while there is nothing built to finish (no variant picked). */
  busy: boolean;
}

/** One line of "here is what you chose", so the two doors are taken with the whole graphic
 *  in view rather than from memory of four steps ago. */
function summaryRows(variant: TemplateVariant, draft: WizardDraft): { label: string; value: string }[] {
  const res = draftResolution(draft);
  const palette = draft.customPalette ?? (draft.paletteId ? paletteById(draft.paletteId) : variant.defaultPalette);
  const fontId = draft.fontId ?? variant.defaultFontId;
  const font =
    fontId === 'custom'
      ? draft.customFont?.family ?? 'Imported font'
      : FONTS.find((f) => f.id === fontId)?.family ?? 'The design’s font';
  const presetId = draft.animation.presetId ?? variant.animationPresets[0];
  const preset = ALL_PRESETS.find((p) => p.id === presetId)?.name ?? presetId;
  const outId = draft.animation.outPresetId;
  const outPreset = outId && outId !== presetId ? ALL_PRESETS.find((p) => p.id === outId)?.name ?? outId : null;

  const rows = [
    { label: 'Design', value: variant.name },
    { label: 'Canvas', value: `${res.width}×${res.height} · ${draft.fps} fps` },
  ];
  if (draft.lines.length > 0) {
    rows.push({
      label: 'Fields',
      value: `${draft.lines.length} text ${draft.lines.length === 1 ? 'line' : 'lines'}`,
    });
  }
  rows.push({ label: 'Look', value: `${palette.name} · ${font}` });
  rows.push({ label: 'Motion', value: outPreset ? `${preset} in · ${outPreset} out` : preset });
  return rows;
}

/**
 * The Finish step — the wizard's one branch point. Everything before it configures the
 * graphic; this step names it and asks the only question left: are you going to work on it,
 * or is it done?
 *
 * "Export" exists because a graphic you are happy with should not have to pass through the
 * editor to become a package. It is the reason the step is here at all — a name field, and
 * two doors.
 */
export default function FinishStep({ variant, draft, onDraft, onOpenEditor, onExport, busy }: Props) {
  const rows = summaryRows(variant, draft);

  return (
    <div className="wz-finish">
      <div className="panel-section">
        <h3>Name this graphic</h3>
        <input
          className="wz-finish-name"
          value={draft.name}
          placeholder={variant.name}
          onChange={(e) => onDraft({ name: e.target.value })}
          data-testid="wz-finish-name"
          aria-label="Graphic name"
        />
        {/* Not cosmetic on the export branch: this name slugs the zip and, for the SPX and
            CasparCG packages, the template FOLDER inside it — what the operator picks from
            in the playout server. */}
        <p className="hint">
          Used in the library, on the topbar, and as the exported package’s folder name. Leave
          it blank to use the design’s name (“{variant.name}”).
        </p>
      </div>

      <div className="panel-section">
        <h3>What you built</h3>
        <dl className="wz-finish-summary">
          {rows.map((r) => (
            <div key={r.label}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="wz-finish-doors">
        <button
          className="wz-entry-card"
          onClick={onOpenEditor}
          disabled={busy}
          data-testid="wz-finish-editor"
        >
          <span className="wz-entry-icon">‹›</span>
          <strong>Open in the editor</strong>
          <span className="hint">
            Fine-tune fields, motion and code on the canvas and timeline. Save it whenever you
            are ready — nothing is written to your library until you do.
          </span>
        </button>
        <button
          className="wz-entry-card wz-entry-card--primary"
          onClick={onExport}
          disabled={busy}
          data-testid="wz-finish-export"
        >
          <span className="wz-entry-icon">⬇</span>
          <strong>Export it</strong>
          <span className="hint">
            Happy with it? Go straight to the packages — SPX, CasparCG, OGraf, LiveOS, an
            OBS/vMix overlay{isRenderConfigured() ? ', or a rendered video or still' : ''}. It
            is saved to your library first, so you can always come back to it.
          </span>
        </button>
      </div>
    </div>
  );
}
