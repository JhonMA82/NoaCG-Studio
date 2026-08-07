import { useState } from 'react';
import {
  addDatasetColumn,
  addDatasetRow,
  addShowDataset,
  removeDatasetColumn,
  removeDatasetRow,
  removeShowDataset,
  renameDatasetColumn,
  renameShowDataset,
  importShowDataset,
  updateDatasetRow,
  type Show,
  type ShowDataset,
} from '../../model/shows';
import { commitDurableWrites } from '../../model/durableStore';
import { parseTableFile } from '../../model/csv';

/**
 * Which of an imported file's columns can actually BIND — the same match
 * `datasetValuesForFields` performs, asked of every graphic in this production's pool.
 *
 * It is here rather than in the model because it answers a UI question ("was that import
 * useful?"), and it deliberately reads the pool rather than the whole library: a table binds to
 * the graphics this production runs, not to graphics it does not.
 */
function boundColumns(show: Show, header: string[]): string[] {
  const titles = new Set<string>();
  for (const g of show.graphics) {
    for (const f of g.template.fields ?? []) {
      if (f.title) titles.add(f.title.trim().toLowerCase());
    }
  }
  return header.filter((h) => titles.has(h.trim().toLowerCase()));
}

/**
 * The production's DATA workspace (route `#/production/<id>/data` — the Data tab of the
 * playout dashboard, docs/INTERACTIVE_PLAYOUT_PLAN.md D3/D6): the show's own tables — quiz
 * question banks, teams, line-ups — edited here, loaded into CUES from the playout surface by
 * deliberate operator action. Everything is plain typed data on the Show record: offline,
 * synced with the production, no backend.
 *
 * Deliberately NOT a spreadsheet: no formulas, no cell formatting, no pivots. Tables, rows,
 * and the column labels that bind them to graphic fields (a column named like a field's title
 * loads into that field — the binding is the words, visible on both sides).
 */
export default function ProductionDataWorkspace({
  show,
  setShows,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
}) {
  const [newKind, setNewKind] = useState<ShowDataset['kind']>('quiz');
  const [importNote, setImportNote] = useState<string | null>(null);
  const datasets = show.datasets ?? [];

  /**
   * IMPORT a CSV/TSV/JSON file as a new table (Phase 7). The file's header row becomes the
   * column labels verbatim, because the binding IS the words — so a spreadsheet already using
   * the graphic's field titles works with no mapping step, and one that is not says so.
   *
   * The result is ordinary editable rows with NO link back to the file: re-importing is a
   * deliberate act, and a live file dependency would leave the production's data somewhere the
   * production does not travel.
   */
  const importFile = async (file: File) => {
    setImportNote(null);
    const text = await file.text();
    const parsed = parseTableFile(file.name, text);
    if (parsed.error) {
      setImportNote(parsed.error);
      return;
    }
    const name = file.name.replace(/\.[^.]+$/, '');
    const { shows, datasetId, error } = importShowDataset(show.id, parsed, { name });
    // The durable store answers a refusal after the call returns (model/durableStore.ts), so
    // this waits for it before claiming the table is in. There is deliberately no link back to
    // the file, so an import that quietly did not persist would have to be done again from
    // scratch - and the operator would only find out at the moment they needed the rows.
    const failure = error ?? (await commitDurableWrites());
    if (failure || !datasetId) {
      setImportNote(failure ?? 'The table could not be imported.');
      return;
    }
    setShows(shows);
    // Say what BOUND, not just what arrived. A table whose columns match no field on any of
    // this production's graphics imports perfectly and does nothing, and an import that only
    // reported "42 rows" would look like a success right up to the moment it was needed.
    const bound = boundColumns(show, parsed.header);
    setImportNote(
      bound.length > 0
        ? `✓ Imported ${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'}. These columns match a field on this production's graphics: ${bound.join(', ')}.`
        : `✓ Imported ${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'} — but NO column matches a field title on this production's graphics, so no cue can load a row yet. Rename a column to match a field, or add the graphic that uses them.`,
    );
  };

  return (
    <section className="pd-data" data-testid="production-data">
      <div className="pd-data-head">
        <h2>Production data</h2>
        <p className="hint">
          Tables this production owns. Column names bind to graphic fields: on the Playout tab,
          a cue whose field titles match a table's columns can load any row — into PREVIEW,
          never straight to air.
        </p>
        <div className="spacer" />
        <select value={newKind} onChange={(e) => setNewKind(e.target.value as ShowDataset['kind'])} data-testid="new-dataset-kind">
          <option value="quiz">Quiz questions</option>
          <option value="teams">Teams</option>
          <option value="roster">Line-up / roster</option>
          <option value="generic">Blank table</option>
        </select>
        <button
          className="primary"
          onClick={() => setShows(addShowDataset(show.id, newKind).shows)}
          data-testid="add-dataset"
        >
          ＋ New table
        </button>
        {/* IMPORT (Phase 7). A label wrapping a hidden input, so the control is a real file
            picker with no click-through indirection and no second button to keep in step. */}
        <label className="pd-data-import">
          <input
            type="file"
            accept=".csv,.tsv,.txt,.json,text/csv,application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Clear the input so picking the SAME file twice fires again — re-importing after
              // fixing a column name in the spreadsheet is the normal second act.
              e.target.value = '';
              if (file) void importFile(file);
            }}
            data-testid="import-dataset"
          />
          ⬆ Import CSV / JSON
        </label>
      </div>

      {importNote && (
        <p
          className={importNote.startsWith('✓') ? 'status-ok pd-data-note' : 'status-bad pd-data-note'}
          data-testid="import-note"
        >
          {importNote}
        </p>
      )}

      {datasets.length === 0 && (
        <p className="hint pd-data-empty" data-testid="data-empty">
          No tables yet. A quiz bank holds one question per row; the quiz cue on the Playout tab
          then loads them one by one.
        </p>
      )}

      {datasets.map((ds) => (
        <DatasetCard key={ds.id} show={show} dataset={ds} setShows={setShows} />
      ))}
    </section>
  );
}

function DatasetCard({
  show,
  dataset: ds,
  setShows,
}: {
  show: Show;
  dataset: ShowDataset;
  setShows: (shows: Show[]) => void;
}) {
  const [armedDelete, setArmedDelete] = useState(false);
  const [newColumn, setNewColumn] = useState('');

  return (
    <div className="pd-dataset" data-testid={`dataset-${ds.id}`}>
      <div className="pd-dataset-head">
        <input
          className="pd-dataset-name"
          value={ds.name}
          onChange={(e) => setShows(renameShowDataset(show.id, ds.id, e.target.value))}
          aria-label="Table name"
          data-testid="dataset-name"
        />
        <span className="muted">{ds.rows.length} row{ds.rows.length === 1 ? '' : 's'}</span>
        <div className="spacer" />
        {/* Two-step delete: a table of typed-in questions has no undo behind it. */}
        <button
          className={armedDelete ? 'pd-dataset-delete armed' : 'pd-dataset-delete'}
          onClick={() => {
            if (!armedDelete) setArmedDelete(true);
            else setShows(removeShowDataset(show.id, ds.id));
          }}
          onBlur={() => setArmedDelete(false)}
          data-testid="dataset-delete"
        >
          {armedDelete ? 'Delete table?' : '✕'}
        </button>
      </div>

      <div className="pd-dataset-scroll">
        <table className="pd-table">
          <thead>
            <tr>
              {ds.columns.map((c) => (
                <th key={c.key}>
                  <span className="pd-th">
                    <input
                      value={c.label}
                      onChange={(e) => setShows(renameDatasetColumn(show.id, ds.id, c.key, e.target.value))}
                      aria-label="Column name"
                      data-testid={`col-${c.key}`}
                    />
                    {ds.columns.length > 1 && (
                      <button
                        className="pd-col-delete"
                        title="Remove this column (its values go with it)"
                        onClick={() => setShows(removeDatasetColumn(show.id, ds.id, c.key))}
                        aria-label={`Remove column ${c.label}`}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </th>
              ))}
              <th className="pd-th-actions" aria-label="Row actions" />
            </tr>
          </thead>
          <tbody>
            {ds.rows.map((row, i) => (
              <tr key={row.id} data-testid={`row-${row.id}`}>
                {ds.columns.map((c) => (
                  <td key={c.key}>
                    <input
                      value={row.values[c.key] ?? ''}
                      onChange={(e) => setShows(updateDatasetRow(show.id, ds.id, row.id, { [c.key]: e.target.value }))}
                      aria-label={`${c.label}, row ${i + 1}`}
                      data-testid={`cell-${row.id}-${c.key}`}
                    />
                  </td>
                ))}
                <td className="pd-td-actions">
                  <button
                    title="Remove this row"
                    onClick={() => setShows(removeDatasetRow(show.id, ds.id, row.id))}
                    aria-label={`Remove row ${i + 1}`}
                    data-testid={`row-delete-${row.id}`}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pd-dataset-foot">
        <button onClick={() => setShows(addDatasetRow(show.id, ds.id).shows)} data-testid="add-row">
          ＋ Row
        </button>
        <input
          placeholder="New column name…"
          value={newColumn}
          onChange={(e) => setNewColumn(e.target.value)}
          data-testid="new-column-name"
        />
        <button
          disabled={!newColumn.trim()}
          onClick={() => {
            setShows(addDatasetColumn(show.id, ds.id, newColumn));
            setNewColumn('');
          }}
          data-testid="add-column"
        >
          ＋ Column
        </button>
      </div>
    </div>
  );
}
