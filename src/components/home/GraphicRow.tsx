import { useEffect, useRef, useState } from 'react';
import { useRouter } from '../../app/router';
import { syncSampleData } from '../../store/templateStore';
import { useExportUi } from '../ExportWindow';
import { deleteGraphic, duplicateGraphic, updateGraphic, type GraphicDoc } from '../../model/library';
import { addGraphicToShow, createShowNamed, loadShows, productionsContaining } from '../../model/shows';
import { useAdvancedMode } from '../useAdvancedMode';
import GraphicThumb from './GraphicThumb';
import RowMenu, { type RowMenuItem } from './RowMenu';
import { IconControl, IconCopy, IconDownload, IconGlobe, IconPencil, IconPlus, IconTrash, IconTv } from '../icons';

/** A saved graphic's thumbnail shows the data an operator last selected, when there is one. */
function activeValues(g: GraphicDoc): Record<string, string> | undefined {
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
  const addTo = (showId: string) => {
    const { error } = addGraphicToShow(showId, g.template, { graphicId: g.id });
    if (!error) {
      setAddedTo(showId);
      setTimeout(() => setAddedTo((c) => (c === showId ? null : c)), 2000);
    }
    onChanged();
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
      className={`lib-row${onToggleSelect ? ' selectable' : ''}${selected ? ' selected' : ''}`}
      data-testid={`graphic-row-${g.id}`}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          className="lib-select"
          checked={!!selected}
          // onClick, not onChange: shiftKey has to ride along for range selection.
          onClick={(e) => onToggleSelect(e.shiftKey)}
          onChange={() => {}}
          title="Select (Shift-click selects a range)"
          aria-label={`Select ${g.name}`}
          data-testid="select-graphic"
        />
      )}
      <GraphicThumb template={g.template} values={activeValues(g)} label={g.name} fixedBox />
      <div className="lib-info">
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
        <span className="muted">
          {g.type}
          {' · '}
          {new Date(g.updatedAt).toLocaleDateString()}
        </span>
      </div>
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
                    onClick={() => addTo(s.id)}
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
                      if (e.key === 'Enter' && newProdName.trim()) {
                        const show = createShowNamed(newProdName);
                        addTo(show.id);
                        setNewProdName('');
                        setAddOpen(false);
                        navigate({ view: 'production', id: show.id });
                      }
                    }}
                    data-testid="add-to-new-production-name"
                  />
                  <button
                    disabled={!newProdName.trim()}
                    onClick={() => {
                      const show = createShowNamed(newProdName);
                      addTo(show.id);
                      setNewProdName('');
                      setAddOpen(false);
                      navigate({ view: 'production', id: show.id });
                    }}
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
