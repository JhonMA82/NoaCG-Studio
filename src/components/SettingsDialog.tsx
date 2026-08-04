import { useRef, useState, type FormEvent } from 'react';
import { loadAiSettings, saveAiSettings } from '../ai/settings';
import { loadPrefs, savePrefs } from '../model/prefs';
import { EXPORT_TARGETS } from '../export/registry';
import { signOut, updatePassword } from '../backend/auth';
import { useModalGate } from './spaceKey';
import { useAdvancedMode } from './useAdvancedMode';
import { useAuthState } from './auth/useAuthState';
import { useAuthUi } from './auth/authUi';
import AiProviderSettings from './AiProviderSettings';

interface Props {
  onClose: () => void;
}

/**
 * Account/app settings (reached from the topbar account menu). Preferences are stored in
 * this browser; provider keys are held only by the server. Style defaults live where the
 * work happens so this dialog stays small on purpose.
 */
/**
 * The Account section (docs/GOALS.md "Student release" step 9): email display, password
 * change, sign out — the essentials a student needs without leaving Settings. Renders NOTHING
 * offline (no backend, zero auth UI — e2e/auth.spec.ts pins the posture) and a sign-in door
 * when signed out. Password change needs only the live session (Supabase updateUser); the
 * forgotten-password path is the SignInDialog's reset link instead.
 */
function AccountSection({ onClose }: { onClose: () => void }) {
  const { backendConfigured, status, user } = useAuthState();
  const openSignIn = useAuthUi((s) => s.openSignIn);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Offline builds grow zero auth UI; while the stored session is still being read, showing
  // "Not signed in" would be a wrong claim, so the section waits.
  if (!backendConfigured || status === 'loading') return null;

  if (status === 'signed-out') {
    return (
      <div className="panel-section" data-testid="settings-account">
        <h3>Account</h3>
        <p className="hint">Not signed in. An account adds cloud sync, publishing, and hosted control pages — creating and exporting never needs one.</p>
        <button className="primary" onClick={() => { onClose(); openSignIn(); }}>Sign in</button>
      </div>
    );
  }

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setNote('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setNote(null);
    const { error } = await updatePassword(password);
    setBusy(false);
    setNote(error ?? '✓ Password changed.');
    if (!error) {
      setPassword('');
      setConfirm('');
    }
  };

  return (
    <div className="panel-section" data-testid="settings-account">
      <h3>Account</h3>
      <p data-testid="account-email"><strong>{user?.email ?? 'Signed in'}</strong></p>
      <form onSubmit={(e) => void changePassword(e)}>
        <label htmlFor="account-new-pass">Change password</label>
        <div className="row">
          <input
            id="account-new-pass"
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            data-testid="account-password"
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Repeat it"
            aria-label="Repeat the new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            data-testid="account-password-confirm"
          />
          <button type="submit" disabled={busy || !password} data-testid="account-password-save">Save</button>
        </div>
      </form>
      {note && <p className={note.startsWith('✓') ? 'status-ok' : 'status-bad'} data-testid="account-note">{note}</p>}
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={() => { void signOut(); onClose(); }} data-testid="account-sign-out">Sign out</button>
      </div>
    </div>
  );
}

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
          <AccountSection onClose={onClose} />

          <div className="panel-section">
            <h3>AI</h3>
            <AiProviderSettings settings={ai} onChange={saveAi} />
          </div>

          <div className="panel-section">
            <h3>Workflow defaults</h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={useAdvancedMode((s) => s.advanced)}
                onChange={(event) => useAdvancedMode.getState().setAdvanced(event.target.checked)}
                data-testid="advanced-mode-toggle"
              />
              Advanced mode — show the code editor
            </label>
            <p className="hint">
              Off, the studio is wizard → production → playout. On, every &quot;Open in the
              editor&quot; door returns: canvas, timeline, and code. Direct graphic links open
              the editor either way.
            </p>
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
