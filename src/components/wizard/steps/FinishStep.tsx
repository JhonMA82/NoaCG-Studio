import { ALL_PRESETS } from '../../../blocks/presetRegistry';
import { FONTS } from '../../../model/fonts';
import type { SpxTemplate } from '../../../model/types';
import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { isRenderConfigured } from '../../../render/config';
import { draftResolution, type WizardDraft } from '../draft';

/** One "here is what you chose" line — the read-back the branch is taken in view of. */
export interface SummaryRow {
  label: string;
  value: string;
}

interface Props {
  /** The graphic's name (`draft.name`), and what an empty field falls back to. */
  name: string;
  namePlaceholder: string;
  onName: (name: string) => void;
  /** The read-back rows — catalog choices, or the AI result's shape. */
  summary: SummaryRow[];
  /** Create the project and land in the editor — the classic ending. Saving stays manual. */
  onOpenEditor: () => void;
  /** Create it, save it to the library, and go straight to the export window. */
  onExport: () => void;
  /** Disabled while there is nothing built to finish. */
  busy: boolean;
}

/**
 * Catalog-shaped read-back: the design, canvas, fields, look and motion the wizard configured.
 * One line of "here is what you chose", so the two doors are taken with the whole graphic in
 * view rather than from memory of four steps ago.
 */
export function catalogSummaryRows(variant: TemplateVariant, draft: WizardDraft): SummaryRow[] {
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

  const rows: SummaryRow[] = [
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
 * AI-result read-back: the generated design, its canvas, how many operator fields it declared,
 * and the fact it passed the gate. The template is its own source of truth here — there is no
 * catalog variant behind an AI creation — so the numbers come straight off it.
 */
export function aiSummaryRows(template: SpxTemplate, valid: boolean): SummaryRow[] {
  const rows: SummaryRow[] = [
    { label: 'Design', value: template.name },
    { label: 'Canvas', value: `${template.resolution.width}×${template.resolution.height} · ${template.fps} fps` },
  ];
  const fieldCount = template.fields.length;
  if (fieldCount > 0) {
    rows.push({
      label: 'Fields',
      value: `${fieldCount} data ${fieldCount === 1 ? 'field' : 'fields'}`,
    });
  }
  // Only ever shown once the result already passed the gate (the door here is unreachable
  // otherwise), so this states what happened rather than claiming a bench that never ran.
  rows.push({ label: 'Checks', value: valid ? 'Passed validation' : 'Some checks are failing' });
  return rows;
}

/**
 * The Finish step — the wizard's one branch point, shared by every creation mode. Everything
 * before it configures the graphic; this step names it and asks the only question left: are
 * you going to work on it, or is it done?
 *
 * "Export" exists because a graphic you are happy with should not have to pass through the
 * editor to become a package. It is the reason the step is here at all — a name field, and
 * two doors.
 */
export default function FinishStep({ name, namePlaceholder, onName, summary, onOpenEditor, onExport, busy }: Props) {
  return (
    <div className="wz-finish">
      <div className="panel-section">
        <h3>Name this graphic</h3>
        <input
          className="wz-finish-name"
          value={name}
          placeholder={namePlaceholder}
          onChange={(e) => onName(e.target.value)}
          data-testid="wz-finish-name"
          aria-label="Graphic name"
        />
        {/* Not cosmetic on the export branch: this name slugs the zip and, for the SPX and
            CasparCG packages, the template FOLDER inside it — what the operator picks from
            in the playout server. */}
        <p className="hint">
          Used in the library, on the topbar, and as the exported package’s folder name. Leave
          it blank to use “{namePlaceholder}”.
        </p>
      </div>

      <div className="panel-section">
        <h3>What you built</h3>
        <dl className="wz-finish-summary">
          {summary.map((r) => (
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
