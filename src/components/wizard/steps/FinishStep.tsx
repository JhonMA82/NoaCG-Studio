import { useState } from 'react';
import { ALL_PRESETS } from '../../../blocks/presetRegistry';
import { FONTS } from '../../../model/fonts';
import type { SpxTemplate } from '../../../model/types';
import type { Show } from '../../../model/shows';
import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { isRenderConfigured } from '../../../render/config';
import { formatProjectSummary } from '../../../model/projectFormat';
import { draftResolution, type WizardDraft } from '../draft';

/** Which earlier step a summary row was decided on — the target of its Edit link. Named
 *  rather than numbered because the step INDEX differs by mode (import mode carries an extra
 *  Images step before Template), and only the wizard knows the mode. */
export type SummaryStepKey = 'design' | 'format' | 'fields' | 'look' | 'motion';

/** One "here is what you chose" line — the read-back the branch is taken in view of. */
export interface SummaryRow {
  label: string;
  value: string;
  /** Present when the row can be gone back and changed (re-design/handoff.md §2f). */
  step?: SummaryStepKey;
}

/** Where the production door sends the graphic: an existing production, or a new one. */
export type ProductionDest = { kind: 'existing'; id: string } | { kind: 'new'; name: string };

interface Props {
  /** The graphic's name (`draft.name`), and what an empty field falls back to. */
  name: string;
  namePlaceholder: string;
  onName: (name: string) => void;
  /** The read-back rows — catalog choices, or the AI result's shape. */
  summary: SummaryRow[];
  /** Go back to the step a row was decided on. Absent = the rows are read-only (the AI
   *  result has no configuring steps behind it to return to). */
  onEditStep?: (step: SummaryStepKey) => void;
  /** The saved productions on offer (live list, loaded by the wizard when Finish shows). */
  productions: Show[];
  /** Preselect: the production the wizard was opened FOR (its page's "+ New graphic"),
   *  else null — the picker then defaults to the most recent, else a new one. */
  defaultProductionId: string | null;
  /** THE PRIMARY DOOR (docs/GOALS.md "Student release" step 6): create it, save it, pool it
   *  into the production, land on the production page — the road to air. */
  onAddToProduction: (dest: ProductionDest) => void;
  /** Create the project and land in the editor — the classic ending. Saving stays manual. */
  onOpenEditor: () => void;
  /** ADVANCED MODE only: the editor door renders when true (default studio hides it). */
  showEditorDoor: boolean;
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
    { label: 'Design', value: variant.name, step: 'design' },
    { label: 'Project format', value: formatProjectSummary(res, draft.fps), step: 'format' },
  ];
  if (draft.lines.length > 0) {
    rows.push({
      label: 'Fields',
      value: `${draft.lines.length} text ${draft.lines.length === 1 ? 'line' : 'lines'}`,
      step: 'fields',
    });
  }
  rows.push({ label: 'Look', value: `${palette.name} · ${font}`, step: 'look' });
  rows.push({ label: 'Motion', value: outPreset ? `${preset} in · ${outPreset} out` : preset, step: 'motion' });
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
    {
      label: 'Project format',
      value: formatProjectSummary(template.resolution, template.fps),
    },
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
 * before it configures the graphic; this step names it and asks the only question left:
 * where does it go?
 *
 * THE PRIMARY DOOR is a production (docs/GOALS.md "Student release" step 6) — the wizard's
 * whole promise ends on air, so the door that leads there leads. "Export" stays for the
 * download-and-run-locally workflow, and "Open in the editor" is Advanced mode's continuation
 * (the default studio does not offer it).
 */
export default function FinishStep({
  name,
  namePlaceholder,
  onName,
  summary,
  onEditStep,
  productions,
  defaultProductionId,
  onAddToProduction,
  onOpenEditor,
  showEditorDoor,
  onExport,
  busy,
}: Props) {
  // The picker's selection: an existing production's id, or 'new'. Preselect the context
  // production (opened FOR one), else the most recent, else a new one named after the graphic.
  const [dest, setDest] = useState<string>(() =>
    defaultProductionId && productions.some((p) => p.id === defaultProductionId)
      ? defaultProductionId
      : productions[0]?.id ?? 'new',
  );
  const [newName, setNewName] = useState('');
  const resolvedDest = (): ProductionDest =>
    dest === 'new'
      ? { kind: 'new', name: newName.trim() || (name.trim() || namePlaceholder) }
      : { kind: 'existing', id: dest };

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
              {/* Each decision is one click from the step it was made on — a read-back you
                  cannot act on makes the reader walk Back through four steps to change one
                  line (re-design/handoff.md §2f). */}
              {r.step && onEditStep && (
                <button className="wz-finish-edit" onClick={() => onEditStep(r.step!)}>Edit</button>
              )}
            </div>
          ))}
        </dl>
      </div>

      {/* Where the graphic joins a show: the primary door's one decision. */}
      <div className="panel-section" data-testid="wz-finish-production-pick">
        <h3>Production</h3>
        <div className="row" style={{ gap: 8 }}>
          <select
            className="grow"
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            data-testid="wz-finish-production"
            aria-label="Which production this graphic joins"
          >
            {productions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.graphics.length} graphic{p.graphics.length === 1 ? '' : 's'})
              </option>
            ))}
            <option value="new">＋ New production…</option>
          </select>
          {dest === 'new' && (
            <input
              className="grow"
              placeholder={`Production name — e.g. Friday Show (empty = "${name.trim() || namePlaceholder}")`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              data-testid="wz-finish-production-name"
            />
          )}
        </div>
        <p className="hint">
          A production is what airs: its graphics, the cue rundown, and — once published — the
          output URL your playout client loads and the control page you operate from.
        </p>
      </div>

      <div className="wz-finish-doors">
        <button
          className="wz-entry-card wz-entry-card--primary"
          onClick={() => onAddToProduction(resolvedDest())}
          disabled={busy}
          data-testid="wz-finish-production-go"
        >
          <span className="wz-entry-icon">▶</span>
          <strong>Add to the production — go live</strong>
          <span className="hint">
            Saves the graphic to your library, pools it into the production above with its
            first cue ready, and lands on the production page — publish for the live URLs, or
            export the whole set from there.
          </span>
        </button>
        <button
          className="wz-entry-card"
          onClick={onExport}
          disabled={busy}
          data-testid="wz-finish-export"
        >
          <span className="wz-entry-icon">⬇</span>
          <strong>Export it</strong>
          <span className="hint">
            Just the files — SPX, CasparCG, OGraf, LiveOS, an OBS/vMix overlay
            {isRenderConfigured() ? ', or a rendered video or still' : ''}. It is saved to
            your library first, so you can always come back to it.
          </span>
        </button>
        {showEditorDoor && (
          <button
            className="wz-entry-card"
            onClick={onOpenEditor}
            disabled={busy}
            data-testid="wz-finish-editor"
          >
            <span className="wz-entry-icon">‹›</span>
            <strong>Open in the editor</strong>
            <span className="hint">
              Fine-tune fields, motion and code on the canvas and timeline. Save it whenever
              you are ready — nothing is written to your library until you do.
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
