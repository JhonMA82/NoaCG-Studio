// Video project settings: name, duration, fps, aspect/resolution, transparency, AI model.
// Every commit is ONE undoable patchSettings. Duration is edited in seconds (the natural
// unit) and stored in frames; changing fps keeps the duration in seconds constant.
//
// These settings drive the player and the renderer immediately - but NOT the composition's
// code, which the AI wrote against whatever they were at the time (frame numbers, type sized
// to the frame, a background painted or deliberately not). So when they drift apart the panel
// says so plainly and offers to have the AI update the code, rather than letting a shortened
// project quietly render with its exit cut off. See videoTypes.ts settingsDrift.

import { useEffect, useMemo, useState } from 'react';
import {
  discoverAiModels,
  modelPriceLabel,
  videoCompatibleModels,
  type AiDiscoveredModel,
} from '../../ai/modelCatalog';
import { loadAiSettings, modelsForProvider } from '../../ai/settings';
import { driftRequest, settingsDrift } from '../../model/videoTypes';
import { useVideoProjectStore } from '../../store/videoProjectStore';
import ProjectFormatPicker from '../ProjectFormatPicker';
import {
  DEFAULT_VIDEO_FORMAT,
  isProjectFrameRate,
  projectFormatForResolution,
  resolutionForSelection,
  type ProjectFormatSelection,
} from '../../model/projectFormat';

export default function VideoSettingsPanel() {
  const project = useVideoProjectStore((s) => s.project);
  const patchSettings = useVideoProjectStore((s) => s.patchSettings);
  const requestAi = useVideoProjectStore((s) => s.requestAi);
  const globalAi = loadAiSettings();
  const curatedModelOptions = modelsForProvider(globalAi.provider);
  const [discoveredModels, setDiscoveredModels] = useState<AiDiscoveredModel[]>([]);
  const modelOptions = useMemo(
    () => videoCompatibleModels(discoveredModels),
    [discoveredModels],
  );
  const busy = useVideoProjectStore((s) => s.busy);
  const drift = settingsDrift(project);

  useEffect(() => {
    let live = true;
    setDiscoveredModels([]);
    if (globalAi.provider !== 'openrouter' && globalAi.provider !== 'huggingface') return;
    void discoverAiModels(globalAi.provider)
      .then((catalog) => {
        if (live) setDiscoveredModels(catalog.models);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [globalAi.provider]);

  const durationSec = project.durationInFrames / project.fps;
  // While the field is being edited it holds a raw string (which may be temporarily empty);
  // when not editing it mirrors the stored value. Committing on blur/Enter both clamps the
  // value and keeps duration edits to ONE undoable step instead of one per keystroke.
  const [durationDraft, setDurationDraft] = useState<string | null>(null);
  const [choosingPreset, setChoosingPreset] = useState(false);
  const durationShown = durationDraft ?? String(Number(durationSec.toFixed(2)));
  const commitDuration = () => {
    if (durationDraft === null) return;
    const sec = Math.min(600, Math.max(0.5, Number(durationDraft) || 0.5));
    patchSettings({ durationInFrames: Math.max(1, Math.round(sec * project.fps)) });
    setDurationDraft(null);
  };
  const preset = projectFormatForResolution(project);
  const registeredFormat = preset && isProjectFrameRate(project.fps)
    ? { aspectId: preset.aspectId, resolutionId: preset.id, fps: project.fps }
    : null;
  const changeFormat = (format: ProjectFormatSelection) => {
    const resolution = resolutionForSelection(format);
    patchSettings({
      width: resolution.width,
      height: resolution.height,
      fps: format.fps,
      // Keep duration in seconds stable. authoredFor deliberately remains unchanged, so
      // settingsDrift continues to tell the truth about code authored at the previous rate.
      durationInFrames: Math.max(1, Math.round(durationSec * format.fps)),
    });
    setChoosingPreset(false);
  };

  return (
    <div className="video-settings">
      <div className="panel-section">
        <h3>Project</h3>
        <label>Name</label>
        <input
          value={project.name}
          onChange={(e) => patchSettings({ name: e.target.value })}
          data-testid="video-name"
        />
      </div>

      <div className="panel-section">
        <h3>Timing</h3>
        <label>Duration (seconds)</label>
        <input
          type="number"
          min={0.5}
          max={600}
          step={0.5}
          value={durationShown}
          onChange={(e) => setDurationDraft(e.target.value)}
          onBlur={commitDuration}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitDuration();
          }}
          data-testid="video-duration"
        />
        <p className="hint">
          {project.durationInFrames} frames at {project.fps} fps
        </p>
      </div>

      <div className="panel-section">
        <h3>Canvas and timing</h3>
        {registeredFormat ? (
          <ProjectFormatPicker
            value={registeredFormat}
            onChange={changeFormat}
            idPrefix="video-settings-format"
            description="Changing this keeps duration in seconds, but the authoredFor warning remains until code is updated."
          />
        ) : (
          <div data-testid="video-custom-format">
            <p className="hint">
              Current authored format: {project.width}×{project.height} · {project.fps} fps.
              This older or custom format is preserved until you explicitly choose a preset.
            </p>
            {!choosingPreset ? (
              <button onClick={() => setChoosingPreset(true)}>Choose a registered preset</button>
            ) : (
              <ProjectFormatPicker
                value={DEFAULT_VIDEO_FORMAT}
                onChange={changeFormat}
                idPrefix="video-settings-format"
              />
            )}
          </div>
        )}
        <label className="row" style={{ marginTop: 10, gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={project.transparent}
            onChange={(e) => patchSettings({ transparent: e.target.checked })}
          />
          Transparent background (for overlays - WebM/ProRes/PNG keep the alpha)
        </label>
      </div>

      {drift.length > 0 && (
        <div className="panel-section" data-testid="video-settings-drift">
          <p className="status-bad" style={{ margin: '0 0 6px' }}>
            ⚠ These settings no longer match the code
          </p>
          <ul className="hint" style={{ margin: '0 0 8px 16px' }}>
            {drift.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <p className="hint" style={{ marginTop: 0 }}>
            The player and the render always follow the settings above - but the composition's own
            code was written for the old ones, so the motion and the layout still fit those. The
            AI can bring the code up to date; you can also just say so in the chat.
          </p>
          <button
            className="primary"
            disabled={!!busy}
            data-testid="video-drift-fix"
            onClick={() => requestAi(driftRequest(project))}
          >
            ✦ Update the code to these settings
          </button>
        </div>
      )}

      <div className="panel-section">
        <h3>AI model</h3>
        <input
          list="video-ai-models"
          value={project.aiModel}
          onChange={(e) => patchSettings({ aiModel: e.target.value })}
          placeholder={`Use global setting (${globalAi.model})`}
        />
        <datalist id="video-ai-models">
          {modelOptions.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name} - {modelPriceLabel(model)}
            </option>
          ))}
          {curatedModelOptions
            .filter((model) => !modelOptions.some((item) => item.id === model.id))
            .map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
        </datalist>
        <p className="hint">
          Optional model override for this project on the global {globalAi.provider} provider.
          Live suggestions support structured output, at least 32K context, and the full
          Remotion and HyperFrames code contract.
        </p>
      </div>
    </div>
  );
}
