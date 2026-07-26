import { useRef, useState } from 'react';
import { loadAiSettings, saveAiSettings } from '../ai/settings';
import { loadPrefs, savePrefs } from '../model/prefs';
import { EXPORT_TARGETS } from '../export/registry';
import { useModalGate } from './spaceKey';
import AiProviderSettings from './AiProviderSettings';

interface Props {
  onClose: () => void;
}

/**
 * Account/app settings (reached from the topbar account menu). Preferences are stored in
 * this browser; provider keys are held only by the server. Style defaults live where the
 * work happens so this dialog stays small on purpose.
 */
export default function SettingsDialog({ onClose }: Props) {
  useModalGate();
  const pressedOnBackdrop = useRef(false);
  const [ai, setAi] = useState(loadAiSettings);
  const [prefs, setPrefs] = useState(loadPrefs);

  const saveAi = (patch: Parameters<typeof saveAiSettings>[0]) => {
    saveAiSettings(patch);
    setAi(loadAiSettings());
  };
  const savePref = (patch: Parameters<typeof savePrefs>[0]) => {
    savePrefs(patch);
    setPrefs(loadPrefs());
  };

  return (
    <div
      className="gallery-backdrop"
      onMouseDown={(event) => { pressedOnBackdrop.current = event.target === event.currentTarget; }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedOnBackdrop.current) onClose();
        pressedOnBackdrop.current = false;
      }}
    >
      <div className="wz-modal pk-modal settings-modal" data-testid="settings">
        <div className="wz-header">
          <div>
            <h2>Settings</h2>
            <p className="hint">Preferences stay in this browser. Provider keys stay server-side.</p>
          </div>
          <button className="gallery-close" onClick={onClose} title="Close">×</button>
        </div>

        <div className="pk-body">
          <div className="panel-section">
            <h3>AI</h3>
            <AiProviderSettings settings={ai} onChange={saveAi} />
          </div>

          <div className="panel-section">
            <h3>Workflow defaults</h3>
            <label htmlFor="set-export-target">Default export target</label>
            <select
              id="set-export-target"
              value={prefs.defaultExportTarget || EXPORT_TARGETS[0].id}
              onChange={(event) => savePref({ defaultExportTarget: event.target.value })}
            >
              {EXPORT_TARGETS.map((target) => (
                <option key={target.id} value={target.id}>{target.label}</option>
              ))}
            </select>
            <p className="hint">
              Preselected in the Export tab (picking a target there updates this too - it
              remembers your last choice).
            </p>
          </div>

          <div className="panel-section">
            <h3>Brand &amp; style defaults</h3>
            <p className="hint">
              Your visual defaults live where the work happens: the <strong>project brand</strong> is
              captured on every wizard Create (reapply it with the wizard&apos;s &quot;Use current
              project&apos;s colors &amp; font&quot; toggle), and named <strong>brand looks</strong> -
              palette + font, shareable as files - live under Home / Brand looks. Imported fonts
              and logos travel inside each graphic and its export.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
