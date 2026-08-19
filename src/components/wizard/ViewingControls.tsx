// The wizard's legibility controls (docs/DESIGN_RULES_PLAN.md §5 R4): WHERE the graphic will
// be watched, and the two size-floor toggles the ratified severity policy names. One shared
// component, because the catalog walk (Style step) and the AI step both offer the same three
// decisions and two copies would drift.
//
// The two toggles are MIRRORS of one tri-state (model/designRules.ts LegibilityFloors):
// "Broadcast text sizes" OFF = 'relaxed' (floors demote to warnings, the prompt says the
// customer chose a denser scale - a deliberate act with a paper trail, never a silent
// bypass); "Guaranteed readable size" ON = 'safe' (the AI designs FOR big type). They cannot
// both be on, and the interlock lives here so no caller re-implements it.

import {
  VIEWING_PROFILE_LABELS,
  type ProjectLegibility,
  type ViewingProfileId,
} from '../../model/designRules';

interface Props {
  value: ProjectLegibility;
  onChange: (next: ProjectLegibility) => void;
}

export default function ViewingControls({ value, onChange }: Props) {
  const profile: ViewingProfileId = value.viewing?.profile ?? 'tv';
  const floors = value.floors;
  const active = VIEWING_PROFILE_LABELS.find((p) => p.id === profile) ?? VIEWING_PROFILE_LABELS[0];

  const setProfile = (id: ViewingProfileId) => {
    onChange({
      ...value,
      viewing: id === 'tv' ? undefined : { profile: id, ...(id === 'custom' && value.viewing?.note ? { note: value.viewing.note } : {}) },
    });
  };

  return (
    <div className="panel-section viewing-section" data-testid="wz-viewing">
      {/* The subtitle CONTINUES the title rather than labelling it from the right, so it must
          stay sentence case. The wizard's step CSS already does that for its own headings; the
          editor's `.panel-section h3` uppercases everything inside, which ran the two together
          into "VIEWING WHERE THIS GRAPHIC WILL BE WATCHED". `.viewing-section` is what carries
          the exemption to the editor's Style panel. */}
      <h3>Viewing <span className="muted">where this graphic will be watched</span></h3>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <span style={{ whiteSpace: 'nowrap' }}>Watched on:</span>
        <select
          className="grow"
          data-testid="wz-viewing-profile"
          value={profile}
          onChange={(e) => setProfile(e.target.value as ViewingProfileId)}
        >
          {VIEWING_PROFILE_LABELS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>
      <p className="hint" style={{ marginTop: 4 }}>{active.hint}. Text-size recommendations scale to it.</p>
      {profile === 'custom' && (
        <input
          className="grow"
          data-testid="wz-viewing-note"
          placeholder="Describe the environment — “projected in a lecture hall”, “stadium ribbon board”…"
          value={value.viewing?.note ?? ''}
          onChange={(e) => onChange({ ...value, viewing: { profile: 'custom', note: e.target.value } })}
          style={{ marginTop: 6 }}
        />
      )}
      <label className="dlg-check" style={{ marginTop: 10 }}>
        <input
          type="checkbox"
          data-testid="wz-broadcast-sizes"
          checked={floors !== 'relaxed'}
          onChange={(e) =>
            onChange({ ...value, floors: e.target.checked ? undefined : 'relaxed' })
          }
        />
        <span className="dlg-check-text">
          <span className="dlg-check-title">Broadcast text sizes</span>
          <span className="dlg-check-desc">
            Keep AI-generated text at the sizes we know read on air. Switch off only when you
            deliberately want a denser, smaller composition — the AI is told it was your call.
          </span>
        </span>
      </label>
      <label className="dlg-check" style={{ marginTop: 6 }}>
        <input
          type="checkbox"
          data-testid="wz-guaranteed-readable"
          checked={floors === 'safe'}
          onChange={(e) => onChange({ ...value, floors: e.target.checked ? 'safe' : undefined })}
        />
        <span className="dlg-check-text">
          <span className="dlg-check-title">Guaranteed readable size</span>
          <span className="dlg-check-desc">
            The AI designs FOR big type from the start — fewer fields, a simpler composition.
            It never inflates a small layout.
          </span>
        </span>
      </label>
    </div>
  );
}
