import { useEffect, useRef, useState } from 'react';
import { useRouter } from '../../app/router';
import { syncSampleData } from '../../store/templateStore';
import { useExportUi } from '../ExportWindow';
import { deleteGraphic, duplicateGraphic, updateGraphic, type GraphicDoc } from '../../model/library';
import { addGraphicToShow, createShowNamedChecked, loadShows, productionsContaining } from '../../model/shows';
import { raiseStorageAlert } from '../../store/storageAlert';
import { commitDurableWrites } from '../../model/durableStore';
import { useAdvancedMode } from '../useAdvancedMode';
import GraphicThumb from './GraphicThumb';
import RowMenu, { type RowMenuItem } from './RowMenu';
import { IconControl, IconCopy, IconDownload, IconFolder, IconGlobe, IconPencil, IconPlus, IconTrash, IconTv } from '../icons';

/** A saved graphic's thumbnail shows the data an operator last selected, when there is one.
 *  Exported because the dashboard's shelf renders the same graphic and must show it the same
 *  way — two answers to "what does this card show" is how the two surfaces come to disagree. */
export function activeValues(g: GraphicDoc): Record<string, string> | undefined {
  return g.entries.find((e) => e.id === g.activeEntryId)?.values;
}

/**
 * One library row (docs/GOALS.md "Student release" step 8). THREE visible actions — Open,
 * "+ Production" (the popover below), and the ⋯ overflow menu — because the row's job is the
 * student workflow: open it, or put it in the production that airs it. Export, rename,
 * duplicate, publish and delete are real but rarer, so they live behind ⋯ where they cannot
 * crowd the two that matter. The two-step delete stays two-step inside the menu.
 */
export default function GraphicRow({
  g,
  onOpen,
  onChanged,
  onPublish,
  selected,
  onToggleSelect,
  view = 'list',
}: {
  g: GraphicDoc;
  onOpen: (g: GraphicDoc) => void;
  onChanged: () => void;
  /** Present only when community publishing is available (backend + signed in). */
  onPublish?: (g: GraphicDoc) => void;
  /** Multi-select (the Graphics section's bulk bar). Present = the row offers a checkbox;
   *  shift-click range logic lives with the LIST, which knows the visible order. */
  selected?: boolean;
  onToggleSelect?: (shiftKey: boolean) => void;
  /** Card ('grid') or table row ('list') — the same item, two containers, one behaviour
   *  (re-design/handoff.md §5b/§5c). Defaults to the row every other section renders. */
  view?: 'grid' | 'list';
}) {
  const navigate = useRouter((s) => s.navigate);
  const openExport = useExportUi((s) => s.openExport);
  const advanced = useAdvancedMode((s) => s.advanced);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(g.name);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (deleteTimer.current) clearTimeout(deleteTimer.current); }, []);

  // ── The "+ Production" popover: the row's door into the unit that airs. ──
  const [addOpen, setAddOpen] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [addedTo, setAddedTo] = useState<string | null>(null);
  const productions = addOpen ? loadShows() : [];
  const containing = addOpen ? new Set(productionsContaining(g.id).map((s) => s.id)) : new Set<string>();
  /** Returns whether the graphic actually reached the production. A FAILED add used to leave
   *  the ✓ off and say nothing else, so on a full quota the button simply did nothing - the
   *  acceptance pass reported it as "I can't add anything to even ongoing productions". */
  const addTo = async (showId: string, showName?: string): Promise<boolean> => {
    const { error: written } = addGraphicToShow(showId, g.template, { graphicId: g.id });
    // The durable store confirms a write after the call returns, so "did it land?" is one
    // await (model/durableStore.ts). Claiming the failure keeps THIS message, which names the
    // graphic and the production, instead of the generic app-level announcement.
    const error = written ?? (await commitDurableWrites());
    if (error) {
      raiseStorageAlert({
        action: `Adding “${g.name}” to ${showName ? `“${showName}”` : 'the production'}`,
        error,
        outcome: 'The graphic itself is unchanged in your library.',
      });
      onChanged();
      return false;
    }
    setAddedTo(showId);
    setTimeout(() => setAddedTo((c) => (c === showId ? null : c)), 2000);
    onChanged();
    return true;
  };

  /** Create a production and put this graphic in it - both halves checked, because on a full
   *  quota the row never persists and the navigation would land on a production that is not
   *  there. */
  const addToNewProduction = async (rawName: string) => {
    const { show, error: written } = createShowNamedChecked(rawName);
    const error = written ?? (await commitDurableWrites());
    if (error) {
      raiseStorageAlert({
        action: `Creating the production “${show.name}”`,
        error,
        outcome: 'The graphic itself is unchanged in your library.',
      });
      return;
    }
    const ok = await addTo(show.id, show.name);
    setNewProdName('');
    setAddOpen(false);
    if (ok) navigate({ view: 'production', id: show.id });
  };

  const commitRename = () => {
    setRenaming(false);
    if (name.trim() && name.trim() !== g.name) {
      updateGraphic(g.id, { name: name.trim() });
      // The open working copy keeps its own name until re-opened; the row updates now.
      onChanged();
    }
  };

  const menu: RowMenuItem[] = [
    // The per-graphic operator panel stays one step from every row — in the default studio
    // Open already leads there, but the Advanced row's Open means the editor.
    {
      label: 'Control panel',
      icon: <IconControl />,
      onClick: () => navigate({ view: 'control', id: g.id }),
      testid: 'open-control',
    },
    {
      label: 'Export…',
      icon: <IconDownload />,
      onClick: () =>
        openExport({
          template: g.template,
          sampleData: syncSampleData(g.template, activeValues(g) ?? {}),
          graphicId: g.id,
        }),
      testid: 'export-graphic',
    },
    { label: 'Rename', icon: <IconPencil />, onClick: () => { setName(g.name); setRenaming(true); }, testid: 'rename-graphic' },
    { label: 'Duplicate', icon: <IconCopy />, onClick: () => { duplicateGraphic(g.id); onChanged(); }, testid: 'duplicate-graphic' },
    ...(onPublish
      ? [{ label: 'Publish to community…', icon: <IconGlobe />, onClick: () => onPublish(g), testid: 'publish-graphic' }]
      : []),
    {
      label: deleteArmed ? 'Delete? (click to confirm)' : 'Delete',
      icon: <IconTrash />,
      destructive: true,
      keepOpen: !deleteArmed,
      testid: 'delete-graphic',
      onClick: () => {
        if (deleteArmed) {
          if (deleteTimer.current) clearTimeout(deleteTimer.current);
          setDeleteArmed(false);
          deleteGraphic(g.id);
          onChanged();
        } else {
          setDeleteArmed(true);
          if (deleteTimer.current) clearTimeout(deleteTimer.current);
          deleteTimer.current = setTimeout(() => setDeleteArmed(false), 3500);
        }
      },
    },
  ];

  return (
    <div
      className={`lib-row lib-row--${view}${onToggleSelect ? ' selectable' : ''}${selected ? ' selected' : ''}`}
      data-testid={`graphic-row-${g.id}`}
      // Dragged onto a folder card (GraphicsSection) — the gesture the FOLDERS band offers.
      // Only the id travels: the drop calls the same setGraphicsFolder the bulk bar does.
      draggable={!!onToggleSelect}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-noacg-graphic', g.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      // Clicking the item selects it, the way a file manager does — but only on the item's
      // own background, never through a control inside it. The pip and the row are the same
      // gesture, so shift-click ranges work from either.
      onClick={(e) => {
        if (!onToggleSelect) return;
        if ((e.target as HTMLElement).closest('button, input, a')) return;
        onToggleSelect(e.shiftKey);
      }}
    >
      {/* A card's thumbnail fills its width; a table row's is the 100px PREVIEW column. */}
      <GraphicThumb
        template={g.template}
        values={activeValues(g)}
        label={g.name}
        fixedBox={view === 'list'}
        fill={view === 'grid'}
      />
      <div className="lib-info">
        {onToggleSelect && (
          // A PIP, not a checkbox (re-design/handoff.md §5). A library of graphics is picked
          // from the way files are: the row is the target and the mark reports the state. A
          // column of tick boxes puts a permanent control beside every row for an action most
          // visits never take. It stays a real button — keyboard-reachable, and the thing a
          // shift-click lands on — so range selection works exactly as before. It sits with
          // the NAME (the card absolutely positions it over the thumbnail), never in a column
          // of its own, which is what would make it a checkbox again.
          <button
            className="lib-select"
            aria-pressed={!!selected}
            onClick={(e) => onToggleSelect(e.shiftKey)}
            title="Select (Shift-click selects a range)"
            aria-label={`Select ${g.name}`}
            data-testid="select-graphic"
          >
            <span aria-hidden="true">✓</span>
          </button>
        )}
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setName(g.name); setRenaming(false); }
            }}
            data-testid="rename-input"
          />
        ) : (
          // The NAME is the row's own door, exactly as a production row's is — reaching for
          // "Open" on the far right of every row was the same acceptance-round papercut twice.
          <button
            className="lib-name-link"
            onClick={() => onOpen(g)}
            title={advanced ? `Open "${g.name}" in the editor` : `Open "${g.name}" — preview, edit data, operate`}
            data-testid="open-graphic-name"
          >
            <strong>{g.name}</strong>
          </button>
        )}
        {/* On a CARD the type and date ride under the name; the table gives each its own
            column, so repeating them here would print every value twice. */}
        {view === 'grid' && (
          <span className="muted">
            {g.type}
            {' · '}
            {new Date(g.updatedAt).toLocaleDateString()}
          </span>
        )}
      </div>
      {view === 'list' && (
        <>
          <span className="lib-cell lib-cell-mono" data-testid="row-type">{g.type}</span>
          <span className="lib-cell lib-cell-mono" data-testid="row-edited">
            {new Date(g.updatedAt).toLocaleDateString()}
          </span>
          <span className="lib-cell" data-testid="row-folder">
            {g.folder ? (
              <span className="lib-folder-tag"><IconFolder /> {g.folder}</span>
            ) : (
              <span className="muted" aria-hidden="true">—</span>
            )}
          </span>
        </>
      )}
      <div className="lib-actions">
        <button className="primary" onClick={() => onOpen(g)} title={advanced ? 'Open in the editor' : 'Open — preview, edit data, operate'} data-testid="open-graphic">
          Open
        </button>
        <div className="lib-menu-host">
          <button
            onClick={() => setAddOpen((o) => !o)}
            title="Add this graphic to a production"
            aria-expanded={addOpen}
            data-testid="add-to-production"
          >
            <IconPlus /> Production
          </button>
          {addOpen && (
            <>
              <div className="lib-menu-backdrop" onClick={() => setAddOpen(false)} />
              <div className="lib-menu" role="menu" data-testid="add-to-production-menu">
                {productions.length === 0 && <p className="hint">No productions yet — name one below.</p>}
                {productions.map((s) => (
                  <button
                    key={s.id}
                    role="menuitem"
                    onClick={() => void addTo(s.id, s.name)}
                    title={containing.has(s.id) ? 'Already in this production — adds/updates its copy' : `Add to "${s.name}"`}
                  >
                    <IconTv />
                    {addedTo === s.id ? '✓ Added' : s.name}
                    {containing.has(s.id) && addedTo !== s.id ? <span className="muted"> · in it</span> : null}
                  </button>
                ))}
                <div className="lib-menu-new">
                  <input
                    value={newProdName}
                    placeholder="New production…"
                    onChange={(e) => setNewProdName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newProdName.trim()) void addToNewProduction(newProdName);
                    }}
                    data-testid="add-to-new-production-name"
                  />
                  <button
                    disabled={!newProdName.trim()}
                    onClick={() => void addToNewProduction(newProdName)}
                    data-testid="add-to-new-production"
                  >
                    Create
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <RowMenu items={menu} />
    </div>
  );
}
