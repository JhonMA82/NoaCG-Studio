import { useRef, useState } from 'react';
import { createShow, deleteShow, type Show } from '../../../model/shows';
import { outputPageUrl } from '../../../control/hostedControl';
import { copyLink } from '../copyLink';
import { importProductionPack } from '../importProductionPack';
import ProductionExportDialog from '../ProductionExportDialog';
import GraphicThumb from '../GraphicThumb';
import { IconDownload, IconLink, IconTrash, IconTv } from '../../icons';

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
  const [exportShow, setExportShow] = useState<Show | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement | null>(null);
  const shown = limit ? productions.slice(0, limit) : productions;
  const create = () => {
    const next = createShow(newName);
    setNewName('');
    onChanged();
    const made = next[next.length - 1];
    if (made) onOpen(made);
  };
  const importText = async (raw: string) => {
    setImportBusy(true);
    setImportError(null);
    try {
      const { show, error } = await importProductionPack(raw);
      if (!show || error) {
        setImportError(error ?? 'Import failed.');
        return;
      }
      onChanged();
      onOpen(show);
    } finally {
      setImportBusy(false);
    }
  };
  // The bundled sample (public/packs/, built by scripts/build-production-pack.mjs)
  // goes through the exact same parser and gate as a user's file.
  const importSample = async () => {
    setImportBusy(true);
    setImportError(null);
    try {
      const res = await fetch('/packs/fight-night.noacgpack.json');
      if (!res.ok) {
        setImportError('The sample pack is not available in this build.');
        return;
      }
      await importText(await res.text());
    } catch {
      setImportError('The sample pack is not available in this build.');
    } finally {
      setImportBusy(false);
    }
  };
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
      {productions.length === 0 && (
        <p className="hint" data-testid="no-productions">No productions yet — name one below, then add graphics and cues.</p>
      )}
      {/* CARDS, not rows (re-design/handoff.md §5a). A production is the unit that airs — it
          has a state, a size, and a set of graphics — and a one-line row could show none of
          that. The card leads with its name and whether it is published, then what is in it,
          then a strip of the graphics themselves, then the ways to open and take it away. */}
      <div className="prod-grid">
        {shown.map((r) => (
          <div
            className={`prod-card${r.hostedSlug ? ' live' : ''}`}
            key={r.id}
            data-testid={`production-row-${r.id}`}
          >
            <div className="prod-card-head">
              {/* The NAME is the card's own door — reaching for "Open dashboard" for every
                  open was an acceptance-round papercut. */}
              <button
                className="lib-name-link"
                onClick={() => onOpen(r)}
                title={`Open "${r.name}"`}
                data-testid="open-production-name"
              >
                <strong>{r.name}</strong>
              </button>
              <span className={`prod-badge${r.hostedSlug ? ' live' : ''}`}>
                {r.hostedSlug ? '● Live' : 'Idle'}
              </span>
              <div className="spacer" />
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

            <p className="prod-card-stats">
              {r.graphics.length} graphic{r.graphics.length === 1 ? '' : 's'}
              {r.cues?.length ? ` · ${r.cues.length} cue${r.cues.length === 1 ? '' : 's'}` : ''}
            </p>

            {/* What is actually in it. Four is the strip's width, and the remainder is
                counted rather than dropped silently. */}
            {r.graphics.length > 0 && (
              <div className="prod-card-strip">
                {r.graphics.slice(0, 4).map((g) => (
                  <GraphicThumb key={g.id} template={g.template} label={g.name} />
                ))}
                {r.graphics.length > 4 && (
                  <span className="prod-card-more">+{r.graphics.length - 4}</span>
                )}
              </div>
            )}

            <div className="prod-card-actions">
              <button className="primary" onClick={() => onOpen(r)} data-testid="open-production">
                Open dashboard
              </button>
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
              <button
                onClick={() => setExportShow(r)}
                disabled={r.graphics.length === 0}
                title="Export every graphic of this production — SPX, CasparCG, OBS/vMix overlay, H2R, OGraf, LiveOS"
                aria-label={`Export ${r.name}`}
                data-testid="export-production-row"
              >
                <IconDownload />
              </button>
            </div>
          </div>
        ))}
        {/* The way to make one, as the grid's last card — the reference's dashed slot. A
            create row above the list read as a stray form; here it is one of the choices. */}
        <div className="prod-card prod-card-new">
          <strong>New production</strong>
          <p className="prod-card-stats">Name it, add graphics, publish for a live URL.</p>
          <div className="spacer" />
          <input
            value={newName}
            placeholder="Production name…"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) create(); }}
            data-testid="new-production-name"
          />
          <button
            className="primary"
            disabled={!newName.trim()}
            onClick={create}
            data-testid="new-production"
          >
            ＋ Create
          </button>
        </div>
        {/* The other way in: a whole production as one file (model/productionPack.ts) -
            graphics, layers and cue rundown land ready to run, validation-gated at the
            boundary. The export half lives in the export dialog beside the zip targets. */}
        <div className="prod-card prod-card-new">
          <strong>Import production</strong>
          <p className="prod-card-stats">
            A <code>.noacgpack.json</code> file — its graphics, layers and cue rundown, ready to run.
          </p>
          <div className="spacer" />
          {importError && (
            <p className="status-bad" data-testid="import-production-error">{importError}</p>
          )}
          <input
            ref={importInput}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void file.text().then(importText);
            }}
            data-testid="import-production-file"
          />
          <button
            disabled={importBusy}
            onClick={() => importInput.current?.click()}
            data-testid="import-production"
          >
            {importBusy ? 'Importing…' : '⬆ Import…'}
          </button>
          <button
            disabled={importBusy}
            onClick={() => void importSample()}
            title="A complete combat-sports production - 12 graphics and a ready-to-run cue rundown"
            data-testid="import-sample-production"
          >
            Try the Fight Night sample
          </button>
        </div>
      </div>
      {exportShow && <ProductionExportDialog show={exportShow} onClose={() => setExportShow(null)} />}
    </>
  );
}
