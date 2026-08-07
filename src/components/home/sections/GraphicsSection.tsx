import { useMemo, useRef, useState } from 'react';
import { useRouter } from '../../../app/router';
import {
  deleteGraphics,
  graphicFolders,
  setGraphicsFolder,
  type GraphicDoc,
} from '../../../model/library';
import { addGraphicToShow, createShowNamedChecked, loadShows, productionsContaining } from '../../../model/shows';
import { raiseStorageAlert } from '../../../store/storageAlert';
import { loadPrefs, savePrefs } from '../../../model/prefs';
import { commitDurableWrites } from '../../../model/durableStore';
import GraphicRow from '../GraphicRow';
import { IconFolder, IconGrid, IconList, IconPlus, IconTrash, IconTv } from '../../icons';

/**
 * The full Graphics section (docs/SAVED_CONTENT_MODEL.md): the flat library with the two
 * organisation tools the dashboard's top-8 deliberately does not carry —
 *
 * - FLAT FOLDERS (GraphicDoc.folder, one level): chips derived from the data filter the
 *   list; a folder view can become a production in one click. Folders are the light sorting
 *   layer, deliberately not the retired packages — no export unit, no embedded copies.
 * - MULTI-SELECT: checkbox + shift-click range over the VISIBLE order, with one bulk bar
 *   (delete, move to folder, add to production, new production from selection). Selection is
 *   UI state over ids; every mutation goes through the model layer's bulk helpers so N rows
 *   cost one storage write.
 */
export default function GraphicsSection({
  graphics,
  onOpen,
  onChanged,
  onPublish,
}: {
  /** Already search-filtered by HomePage — this section applies the folder filter on top. */
  graphics: GraphicDoc[];
  onOpen: (g: GraphicDoc) => void;
  onChanged: () => void;
  onPublish?: (g: GraphicDoc) => void;
}) {
  const navigate = useRouter((s) => s.navigate);
  // Cards or table. Device-level and remembered (model/prefs.ts) — which one is right
  // depends on the library's size and the screen, so it is a setting, not a session state.
  const [view, setViewState] = useState<'grid' | 'list'>(() => loadPrefs().libraryView);
  const setView = (next: 'grid' | 'list') => {
    setViewState(next);
    savePrefs({ libraryView: next });
  };
  /** null = All; '' = the virtual Unfiled chip; a name = that folder. */
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  // `graphics` is the refresh signal, not an input: graphicFolders() reads the model layer
  // fresh, and the prop changing is what says the library changed (HomePage's rev idiom).
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  const folders = useMemo(() => graphicFolders(), [graphics]);
  const listed = useMemo(
    () =>
      folderFilter === null
        ? graphics
        : graphics.filter((g) => (folderFilter === '' ? !g.folder : g.folder === folderFilter)),
    [graphics, folderFilter],
  );

  // ── Selection: ids + the last toggled index, for shift ranges over the visible order. ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastIndex = useRef<number | null>(null);
  const selectedListed = listed.filter((g) => selected.has(g.id));
  const clearSelection = () => {
    setSelected(new Set());
    lastIndex.current = null;
  };
  const toggle = (index: number, shiftKey: boolean) => {
    // Read the anchor BEFORE scheduling: the state updater runs after this function has
    // already advanced lastIndex to the clicked row, so reading the ref inside it compared
    // the click against itself and every shift-range degraded to a plain toggle.
    const anchor = lastIndex.current;
    lastIndex.current = index;
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && anchor !== null && anchor !== index) {
        // Range = anchor..index over the list as displayed; the anchor's current state
        // decides whether the range selects or clears (the convention file managers use).
        const adding = next.has(listed[anchor]?.id ?? '');
        const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
        for (let i = from; i <= to; i++) {
          const id = listed[i]?.id;
          if (!id) continue;
          if (adding) next.add(id);
          else next.delete(id);
        }
      } else {
        const id = listed[index]?.id;
        if (id) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
      }
      return next;
    });
  };

  // ── Bulk actions (each closes its popover; the model layer announces the change). ──
  const [note, setNote] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [newFolder, setNewFolder] = useState('');
  const [prodOpen, setProdOpen] = useState(false);
  const [newProdName, setNewProdName] = useState('');

  const ids = () => selectedListed.map((g) => g.id);

  const doDelete = () => {
    const inProductions = selectedListed.filter((g) => productionsContaining(g.id).length > 0).length;
    deleteGraphics(ids());
    setNote(
      `✓ Deleted ${selectedListed.length} graphic${selectedListed.length === 1 ? '' : 's'}.` +
        (inProductions
          ? ` ${inProductions} of them were in productions — those keep their own embedded copy and stay operable.`
          : ''),
    );
    setDeleteArmed(false);
    clearSelection();
    onChanged();
  };

  const moveTo = (folder: string | undefined) => {
    const error = setGraphicsFolder(ids(), folder);
    setNote(error ?? `✓ Moved ${selectedListed.length} to ${folder ? `"${folder}"` : 'Unfiled'}.`);
    setFolderOpen(false);
    setNewFolder('');
    clearSelection();
    onChanged();
  };

  /** Pool every selected graphic, stopping at the FIRST failure and saying how far it got - a
   *  bulk add that reported "✓ Added 12" after storing three would be worse than the silence it
   *  replaces. Returns how many actually landed. */
  const poolAll = async (showId: string, showName: string, list: GraphicDoc[]): Promise<number> => {
    let added = 0;
    for (const g of list) {
      const { error: written } = addGraphicToShow(showId, g.template, { graphicId: g.id });
      // Confirmed per graphic (model/durableStore.ts's claim protocol): "stop at the first
      // failure and say how far it got" only means anything if each add is actually known to
      // have landed before the next one is attempted.
      const error = written ?? (await commitDurableWrites());
      if (error) {
        raiseStorageAlert({
          action: `Adding ${list.length} graphics to “${showName}”`,
          error,
          outcome:
            added === 0
              ? 'Nothing was added. Your graphics are unchanged in the library.'
              : `${added} of ${list.length} were added before storage ran out; the rest are unchanged in your library.`,
        });
        return added;
      }
      added += 1;
    }
    return added;
  };

  const addAllTo = async (showId: string, showName: string) => {
    const added = await poolAll(showId, showName, selectedListed);
    if (added === selectedListed.length) setNote(`✓ Added ${added} to "${showName}".`);
    setProdOpen(false);
    clearSelection();
    onChanged();
  };

  const createProductionFrom = async (list: GraphicDoc[], name: string) => {
    const { show, error: written } = createShowNamedChecked(name);
    const error = written ?? (await commitDurableWrites());
    if (error) {
      raiseStorageAlert({
        action: `Creating the production “${show.name}”`,
        error,
        outcome: 'Your graphics are unchanged in the library.',
      });
      return;
    }
    // The kit flow's primitive: one production, every graphic pooled in list order.
    const added = await poolAll(show.id, show.name, list);
    onChanged();
    if (added > 0) navigate({ view: 'production', id: show.id });
  };

  return (
    <>
      {/* GRID or LIST (re-design/handoff.md §5b/§5c). The toggle swaps only the item
          container — chrome, selection, folders and the bulk bar are identical either way,
          which is what keeps this a view preference rather than a second screen. */}
      <div className="lib-viewbar">
        <div className="spacer" />
        <div className="lib-viewtoggle" role="group" aria-label="Library view">
          <button
            className={view === 'grid' ? 'active' : ''}
            aria-pressed={view === 'grid'}
            onClick={() => setView('grid')}
            title="Cards"
            data-testid="library-view-grid"
          >
            <IconGrid />
          </button>
          <button
            className={view === 'list' ? 'active' : ''}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
            title="List"
            data-testid="library-view-list"
          >
            <IconList />
          </button>
        </div>
      </div>

      {/* Folder chips, derived from the data — an emptied folder disappears by itself. The
          Unfiled chip appears only when folders exist at all (until then it IS "All"). */}
      {folders.length > 0 && (
        <div className="lib-folders" data-testid="folder-chips">
          <button className={`lib-folder-chip${folderFilter === null ? ' active' : ''}`} onClick={() => { setFolderFilter(null); clearSelection(); }}>
            All ({graphics.length})
          </button>
          {folders.map((f) => (
            <button
              key={f}
              className={`lib-folder-chip${folderFilter === f ? ' active' : ''}`}
              onClick={() => { setFolderFilter(f); clearSelection(); }}
              data-testid={`folder-chip-${f}`}
            >
              <IconFolder /> {f} ({graphics.filter((g) => g.folder === f).length})
            </button>
          ))}
          <button className={`lib-folder-chip${folderFilter === '' ? ' active' : ''}`} onClick={() => { setFolderFilter(''); clearSelection(); }}>
            Unfiled ({graphics.filter((g) => !g.folder).length})
          </button>
        </div>
      )}

      {/* A folder view is one click from being a production — the second door the ask named. */}
      {folderFilter ? (
        <div className="lib-folder-head" data-testid="folder-head">
          <span className="muted">
            Folder · {listed.length} graphic{listed.length === 1 ? '' : 's'}
          </span>
          <button
            onClick={() => void createProductionFrom(listed, folderFilter)}
            disabled={listed.length === 0}
            title={`One production named "${folderFilter}" with every graphic of this folder`}
            data-testid="folder-to-production"
          >
            <IconTv /> Create production from this folder
          </button>
        </div>
      ) : null}

      {note && <p className={note.startsWith('✓') ? 'status-ok' : 'status-bad'} data-testid="bulk-note">{note}</p>}

      {/* The bulk bar: appears with the first selection, sticky over the list. */}
      {selectedListed.length > 0 && (
        <div className="lib-bulkbar" data-testid="bulk-bar">
          <strong>{selectedListed.length} selected</strong>
          <button
            className="link-inline"
            onClick={() => {
              setSelected(new Set(listed.map((g) => g.id)));
              lastIndex.current = null;
            }}
          >
            Select all {listed.length}
          </button>

          <div className="spacer" />

          <div className="lib-menu-host">
            <button onClick={() => { setProdOpen((o) => !o); setFolderOpen(false); }} aria-expanded={prodOpen} data-testid="bulk-add-production">
              <IconPlus /> Production
            </button>
            {prodOpen && (
              <>
                <div className="lib-menu-backdrop" onClick={() => setProdOpen(false)} />
                <div className="lib-menu" role="menu" data-testid="bulk-production-menu">
                  {loadShows().map((s) => (
                    <button key={s.id} role="menuitem" onClick={() => void addAllTo(s.id, s.name)}>
                      <IconTv /> {s.name}
                    </button>
                  ))}
                  <div className="lib-menu-new">
                    <input
                      value={newProdName}
                      placeholder="New production…"
                      onChange={(e) => setNewProdName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newProdName.trim()) void createProductionFrom(selectedListed, newProdName.trim());
                      }}
                      data-testid="bulk-new-production-name"
                    />
                    <button
                      disabled={!newProdName.trim()}
                      onClick={() => void createProductionFrom(selectedListed, newProdName.trim())}
                      data-testid="bulk-new-production"
                    >
                      Create
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="lib-menu-host">
            <button onClick={() => { setFolderOpen((o) => !o); setProdOpen(false); }} aria-expanded={folderOpen} data-testid="bulk-move-folder">
              <IconFolder /> Folder
            </button>
            {folderOpen && (
              <>
                <div className="lib-menu-backdrop" onClick={() => setFolderOpen(false)} />
                <div className="lib-menu" role="menu" data-testid="bulk-folder-menu">
                  {folders.map((f) => (
                    <button key={f} role="menuitem" onClick={() => moveTo(f)}>
                      <IconFolder /> {f}
                    </button>
                  ))}
                  <button role="menuitem" onClick={() => moveTo(undefined)} data-testid="bulk-unfile">
                    Remove from folder
                  </button>
                  <div className="lib-menu-new">
                    <input
                      value={newFolder}
                      placeholder="New folder…"
                      onChange={(e) => setNewFolder(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newFolder.trim()) moveTo(newFolder.trim());
                      }}
                      data-testid="bulk-new-folder-name"
                    />
                    <button disabled={!newFolder.trim()} onClick={() => moveTo(newFolder.trim())} data-testid="bulk-new-folder">
                      Move
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            className="destructive"
            onClick={() => (deleteArmed ? doDelete() : setDeleteArmed(true))}
            title={
              deleteArmed
                ? 'Click again to delete — productions using any of them keep their own copy'
                : 'Delete the selected graphics'
            }
            data-testid="bulk-delete"
          >
            <IconTrash /> {deleteArmed ? `Delete ${selectedListed.length}?` : 'Delete'}
          </button>

          <button onClick={clearSelection} title="Clear the selection" data-testid="bulk-clear">✕</button>
        </div>
      )}

      {/* Clicking the empty space around the items clears the selection — the third gesture
          of the selection model, and the one that makes the other two safe to try. */}
      <div
        className={view === 'grid' ? 'lib-grid' : 'lib-list'}
        onClick={(e) => { if (e.target === e.currentTarget) clearSelection(); }}
      >
        {listed.map((g, i) => (
          <GraphicRow
            key={g.id}
            g={g}
            view={view}
            onOpen={onOpen}
            onChanged={onChanged}
            onPublish={onPublish}
            selected={selected.has(g.id)}
            onToggleSelect={(shiftKey) => toggle(i, shiftKey)}
          />
        ))}
      </div>
    </>
  );
}
