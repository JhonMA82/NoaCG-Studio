import {
  ASPECTS,
  PROJECT_FRAME_RATES,
  projectFormatById,
  projectFormatsForAspect,
  selectionForAspect,
  type ProjectAspectId,
  type ProjectFormatSelection,
} from '../model/projectFormat';

interface Props {
  value: ProjectFormatSelection;
  onChange: (selection: ProjectFormatSelection) => void;
  disabled?: boolean;
  description?: string;
  idPrefix?: string;
  className?: string;
}

/**
 * The shared authored-format control. It deliberately says "project" everywhere: rendered
 * media has separate output settings and changing those does not reauthor this canvas.
 */
export default function ProjectFormatPicker({
  value,
  onChange,
  disabled = false,
  description,
  idPrefix = 'project-format',
  className = '',
}: Props) {
  const selected = projectFormatById(value.resolutionId);
  const resolutionOptions = projectFormatsForAspect(value.aspectId);
  const normalizedValue = selected?.aspectId === value.aspectId ? selected.id : resolutionOptions[0].id;

  return (
    <fieldset
      className={`project-format-picker ${className}`.trim()}
      data-testid={`${idPrefix}-picker`}
      disabled={disabled}
    >
      <legend>Project format</legend>
      {description && <p className="hint project-format-description">{description}</p>}
      {/* Each label's TEXT is its own element so a surface can hide the wording without
          hiding the control it wraps — the Browse step does exactly that, because the
          wizard's rail already captions the format and the options say what they are
          ("16:9 Landscape", "25 fps"). Everywhere else it renders as before. */}
      <div className="project-format-fields">
        <label>
          <span className="project-format-label">Authored aspect ratio</span>
          <select
            value={value.aspectId}
            data-testid={`${idPrefix}-aspect`}
            onChange={(event) =>
              onChange(selectionForAspect(value, event.target.value as ProjectAspectId))
            }
          >
            {ASPECTS.map((aspect) => (
              <option key={aspect.id} value={aspect.id}>{aspect.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="project-format-label">Canvas resolution</span>
          <select
            value={normalizedValue}
            data-testid={`${idPrefix}-resolution`}
            onChange={(event) => {
              const preset = projectFormatById(event.target.value);
              if (preset) onChange({ ...value, aspectId: preset.aspectId, resolutionId: preset.id });
            }}
          >
            {resolutionOptions.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="project-format-label">Project frame rate</span>
          <select
            value={value.fps}
            data-testid={`${idPrefix}-fps`}
            onChange={(event) => onChange({ ...value, fps: Number(event.target.value) })}
          >
            {PROJECT_FRAME_RATES.map((rate) => (
              <option key={rate.value} value={rate.value}>{rate.label}</option>
            ))}
          </select>
        </label>
      </div>
      {selected?.capabilities.hostedMedia === 'tier-dependent' && (
        <p className="hint project-format-capability" data-testid={`${idPrefix}-capability`}>
          Package exports preserve native 4K. Hosted media rendering checks the active tier and
          may require a lower output scale.
        </p>
      )}
    </fieldset>
  );
}
