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
  updateDatasetRow,
  type Show,
  type ShowDataset,
} from '../../model/shows';

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
  const datasets = show.datasets ?? [];

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
      </div>

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
