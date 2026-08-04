import { useState } from 'react';
import { createShow, deleteShow, type Show } from '../../../model/shows';
import { outputPageUrl } from '../../../control/hostedControl';
import { copyLink } from '../copyLink';
import { IconLink, IconTrash, IconTv } from '../../icons';

/**
 * The Productions section — Home's LEAD (docs/GOALS.md "Student release" step 8): a production
 * is the unit that airs, so the dashboard door and the output URL are the two things one click
 * away. Everything about one production (graphics, cues, publish, operating) lives on its own
 * page at #/production/<id>.
 */
export default function ProductionsSection({
  productions,
  onOpen,
  onChanged,
  limit,
  heading = true,
}: {
  productions: Show[];
  onOpen: (p: Show) => void;
  onChanged: () => void;
  /** Dashboard mode shows the top few; the full section shows everything. */
  limit?: number;
  heading?: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const shown = limit ? productions.slice(0, limit) : productions;
  return (
    <>
      {heading && (
        <>
          <h2><IconTv size={18} /> Productions</h2>
          <p className="hint">
            A production is the live unit: its graphics, a prepared CUE rundown, one persistent
            browser-<strong>output URL</strong> for CasparCG/OBS/vMix, and one <strong>control
            page</strong> for operating — see each production’s page for all of it.
          </p>
        </>
      )}
      <div className="row lib-create-row">
        <input
          value={newName}
          placeholder="New production name…"
          onChange={(e) => setNewName(e.target.value)}
          data-testid="new-production-name"
        />
        <button
          className="primary"
          disabled={!newName.trim()}
          onClick={() => {
            const next = createShow(newName);
            setNewName('');
            onChanged();
            const made = next[next.length - 1];
            if (made) onOpen(made);
          }}
          data-testid="new-production"
        >
          ＋ Create
        </button>
      </div>
      {productions.length === 0 && (
        <p className="hint" data-testid="no-productions">No productions yet — create one above, then add graphics and cues.</p>
      )}
      {shown.map((r) => (
        <div className="lib-row lib-row-flat" key={r.id} data-testid={`production-row-${r.id}`}>
          <span className="lib-row-icon" aria-hidden="true"><IconTv size={20} /></span>
          <div className="lib-info">
            <strong>{r.name}</strong>
            <span className="muted">
              {r.graphics.length} graphic{r.graphics.length === 1 ? '' : 's'}
              {r.cues?.length ? ` · ${r.cues.length} cue${r.cues.length === 1 ? '' : 's'}` : ''}
              {r.hostedSlug ? <span className="lib-live"> · ● live</span> : ''}
            </span>
          </div>
          <div className="lib-actions">
            {r.outputSlug && (
              <button
                onClick={() => {
                  void copyLink(outputPageUrl(r.outputSlug!)).then((ok) => {
                    if (!ok) return;
                    setCopiedLink(r.id);
                    setTimeout(() => setCopiedLink((c) => (c === r.id ? null : c)), 2000);
                  });
                }}
                title="Copy the browser-output URL (the one your playout client loads)"
                data-testid="copy-production-output"
              >
                {copiedLink === r.id ? '✓ Copied' : <><IconLink /> Output URL</>}
              </button>
            )}
            <button className="primary" onClick={() => onOpen(r)} data-testid="open-production">
              Open dashboard
            </button>
          </div>
          {confirmDelete === r.id ? (
            <button
              className="destructive"
              onClick={() => { deleteShow(r.id); setConfirmDelete(null); onChanged(); }}
              title="Delete this production (its graphics stay saved wherever else they live)"
            >
              Delete?
            </button>
          ) : (
            <button onClick={() => setConfirmDelete(r.id)} title="Delete this production" aria-label={`Delete ${r.name}`}>
              <IconTrash />
            </button>
          )}
        </div>
      ))}
    </>
  );
}
