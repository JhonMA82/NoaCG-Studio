import { useMemo, useState } from 'react';
import {
  deletePath,
  flattenLeaves,
  parseDataTree,
  parseLiteral,
  reparseLeaf,
  setPath,
  suggestPath,
  type JsonObject,
  type ResolvedValues,
} from '../../model/productionData';
import { setFieldBinding, setShowSeedData, type Show } from '../../model/shows';
import { fieldDescriptors } from '../../control/controlModel';

/**
 * THE MANUAL DATA PLAYGROUND (docs/PRODUCTION_DATA_PLAN.md §3) — the production's live data
 * tree, and the bindings that carry it into graphic fields.
 *
 * Three things at once, deliberately: an operator tool (change a value mid-show), a developer
 * tool (prove a binding before an external system exists), and the documentation for the future
 * ingress API — the JSON shown here is exactly the shape that endpoint will accept.
 *
 * Nothing here is domain-specific. The steppers below are generated from whichever leaves
 * happen to be NUMBERS, so a scoreboard, a poll and a lap counter get the same affordance and
 * the word "score" appears nowhere in this file.
 */
export default function ProductionDataPanel({
  show,
  setShows,
  liveData,
  setLiveData,
  resolved,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
  liveData: JsonObject;
  setLiveData: (data: JsonObject) => void;
  resolved: ResolvedValues;
}) {
  const [newPath, setNewPath] = useState('');
  const [newValue, setNewValue] = useState('');
  const [rawOpen, setRawOpen] = useState(false);
  const [rawText, setRawText] = useState('');
  const [rawError, setRawError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const leaves = useMemo(() => flattenLeaves(liveData), [liveData]);
  const seed = show.data;
  const hasSeed = !!seed && Object.keys(seed).length > 0;

  const write = (next: JsonObject, message?: string) => {
    setLiveData(next);
    setNote(message ?? null);
  };

  const addField = () => {
    const path = newPath.trim();
    if (path === '') return;
    write(setPath(liveData, path, parseLiteral(newValue)));
    setNewPath('');
    setNewValue('');
  };

  const openRaw = () => {
    setRawText(JSON.stringify(liveData, null, 2));
    setRawError(null);
    setRawOpen(true);
  };

  const applyRaw = () => {
    const { data, error } = parseDataTree(rawText);
    if (!data) {
      setRawError(error);
      return;
    }
    write(data, '✓ Data replaced');
    setRawOpen(false);
  };

  /** Nudge every NUMBER leaf by a hand-sized amount — the generic "does my binding move?"
   *  gesture. No named dataset, no per-domain button: the tree's own shape decides. */
  const randomise = () => {
    let next = liveData;
    let touched = 0;
    for (const leaf of leaves) {
      if (typeof leaf.value !== 'number') continue;
      next = setPath(next, leaf.path, Math.round((leaf.value + (Math.random() * 10 - 4)) * 100) / 100);
      touched += 1;
    }
    write(next, touched > 0 ? `✓ ${touched} number${touched === 1 ? '' : 's'} moved` : 'No numbers to move.');
  };

  return (
    <section className="pd-live" data-testid="production-live-data">
      {/* Deliberately NOT `.pd-data-head` / `.pd-data-actions`: those selectors belong to the
          tables section below and its empty-state layout is asserted through them by geometry
          (e2e/production-data.spec.ts). A second element wearing the same class would answer
          that measurement instead. */}
      <div className="pd-live-head">
        <h2>Production data</h2>
        <p className="hint">
          Live values this production owns. Graphics <em>bind</em> fields to them below, so one
          change moves every graphic that uses it — no matter which one is on air. This is state,
          not a command: nothing here plays, stops or takes anything.
        </p>
        <div className="pd-live-actions">
          <button
            onClick={() => write({ ...(seed ?? {}) }, '✓ Reset to seed')}
            disabled={!hasSeed}
            title={hasSeed ? 'Return every value to the saved seed' : 'No seed saved yet'}
            data-testid="data-reset"
          >
            ⟲ Reset to seed
          </button>
          <button onClick={() => write({}, '✓ Cleared')} data-testid="data-clear">
            ✕ Clear
          </button>
          <button
            onClick={() => {
              setShows(setShowSeedData(show.id, liveData));
              setNote('✓ Saved as this production’s seed');
            }}
            data-testid="data-save-seed"
          >
            ⬇ Save as seed
          </button>
          <button onClick={randomise} data-testid="data-randomise">
            ⚄ Move numbers
          </button>
          <button onClick={rawOpen ? () => setRawOpen(false) : openRaw} data-testid="data-raw-toggle">
            {rawOpen ? '▴ Hide JSON' : '▾ Raw JSON'}
          </button>
        </div>
      </div>

      {note && (
        <p className="status-ok pd-data-note" data-testid="data-note">
          {note}
        </p>
      )}

      {rawOpen && (
        <div className="pd-raw" data-testid="data-raw">
          {/* The honest view of a nested tree, and the paste target for a sample payload — the
              same JSON the future ingress API will accept, which is what makes this panel the
              API's documentation as well as its playground. */}
          <textarea
            value={rawText}
            spellCheck={false}
            onChange={(e) => {
              setRawText(e.target.value);
              setRawError(null);
            }}
            data-testid="data-raw-text"
          />
          {rawError && (
            <p className="status-bad" data-testid="data-raw-error">
              {rawError}
            </p>
          )}
          <button onClick={applyRaw} data-testid="data-raw-apply">
            Apply JSON
          </button>
        </div>
      )}

      <div className="pd-live-rows">
        {leaves.length === 0 && (
          <p className="hint" data-testid="data-empty-live">
            No values yet. Add one below — or open Raw JSON and paste a whole payload, nested as
            deep as you like.
          </p>
        )}
        {leaves.map((leaf) => (
          <div className="pd-live-row" key={leaf.path} data-testid={`data-row-${leaf.path}`}>
            <code className="pd-live-path">{leaf.path}</code>
            {/* A LIST needs a textarea, not an input: `<input>` sanitises newlines out of its
                own value, so a list rendered there would come back joined into one line and the
                array would quietly become a string. `reparseLeaf` puts the list back together. */}
            {leaf.text.includes('\n') ? (
              <textarea
                className="pd-live-lines"
                rows={Math.min(leaf.text.split('\n').length, 6)}
                value={leaf.text}
                onChange={(e) => write(setPath(liveData, leaf.path, reparseLeaf(leaf.value, e.target.value)))}
                data-testid={`data-value-${leaf.path}`}
              />
            ) : (
              <input
                value={leaf.text}
                onChange={(e) => write(setPath(liveData, leaf.path, reparseLeaf(leaf.value, e.target.value)))}
                data-testid={`data-value-${leaf.path}`}
              />
            )}
            <span className="pd-live-type">{Array.isArray(leaf.value) ? 'list' : typeof leaf.value}</span>
            {typeof leaf.value === 'number' && (
              <span className="pd-live-step">
                <button
                  onClick={() => write(setPath(liveData, leaf.path, (leaf.value as number) - 1))}
                  data-testid={`data-down-${leaf.path}`}
                >
                  −
                </button>
                <button
                  onClick={() => write(setPath(liveData, leaf.path, (leaf.value as number) + 1))}
                  data-testid={`data-up-${leaf.path}`}
                >
                  +
                </button>
              </span>
            )}
            <button
              className="pd-live-del"
              title="Delete this value"
              onClick={() => write(deletePath(liveData, leaf.path))}
              data-testid={`data-delete-${leaf.path}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="pd-live-add">
        <input
          value={newPath}
          placeholder="match.home.score"
          onChange={(e) => setNewPath(e.target.value)}
          data-testid="data-new-path"
        />
        <input
          value={newValue}
          placeholder="value"
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addField();
          }}
          data-testid="data-new-value"
        />
        <button onClick={addField} data-testid="data-add">
          + Add field
        </button>
        <span className="hint">
          <code>4</code> is a number, <code>true</code> a boolean, <code>[1,2]</code> a list;
          anything else is text.
        </span>
      </div>

      <BindingTable show={show} setShows={setShows} liveData={liveData} resolved={resolved} />
    </section>
  );
}

/**
 * Which field of which graphic reads which path — visible on both sides, editable in one place.
 *
 * The suggestion is offered, never applied silently: `suggestPath` returns a path only when
 * exactly ONE leaf matches the field's title, so an ambiguous name leaves an empty row for the
 * operator rather than a binding that is wrong half the time (the API's `ambiguous` doctrine).
 */
function BindingTable({
  show,
  setShows,
  liveData,
  resolved,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
  liveData: JsonObject;
  resolved: ResolvedValues;
}) {
  const leaves = useMemo(() => flattenLeaves(liveData), [liveData]);
  const bindings = show.bindings ?? {};

  return (
    <div className="pd-bindings" data-testid="production-bindings">
      <h3>Bindings</h3>
      {show.graphics.length === 0 && (
        <p className="hint">Add a graphic to this production and its fields appear here.</p>
      )}
      {show.graphics.map((g) => {
        const descriptors = fieldDescriptors(g.template.fields ?? [], { includeHidden: true });
        if (descriptors.length === 0) return null;
        return (
          <div className="pd-bind-graphic" key={g.id} data-testid={`bind-graphic-${g.name}`}>
            <h4>{g.name}</h4>
            {descriptors.map((d) => {
              const path = bindings[g.name]?.[d.key] ?? '';
              const suggestion = path ? null : suggestPath(d.label, leaves);
              const live = resolved[g.name]?.[d.key];
              return (
                <div className="pd-bind-row" key={d.key}>
                  <span className="pd-bind-field">
                    <code>{d.key}</code> {d.label}
                  </span>
                  <input
                    value={path}
                    placeholder={suggestion ? `suggested: ${suggestion}` : 'not bound'}
                    list="pd-data-paths"
                    onChange={(e) => setShows(setFieldBinding(show.id, g.name, d.key, e.target.value))}
                    data-testid={`bind-${g.name}-${d.key}`}
                  />
                  {suggestion && (
                    <button
                      className="pd-bind-suggest"
                      onClick={() => setShows(setFieldBinding(show.id, g.name, d.key, suggestion))}
                      data-testid={`bind-accept-${g.name}-${d.key}`}
                    >
                      use {suggestion}
                    </button>
                  )}
                  {/* What the field is ACTUALLY showing, so a typo in a path reads as a blank
                      here rather than as a mystery on air. */}
                  {path && (
                    <span
                      className={live === undefined ? 'pd-bind-miss' : 'pd-bind-live'}
                      data-testid={`bind-value-${g.name}-${d.key}`}
                    >
                      {live === undefined ? 'no value — field left alone' : live}
                    </span>
                  )}
                  {path && (
                    <button
                      className="pd-live-del"
                      title="Unbind — the field goes back to the cue's own value"
                      onClick={() => setShows(setFieldBinding(show.id, g.name, d.key, null))}
                      data-testid={`unbind-${g.name}-${d.key}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      <datalist id="pd-data-paths">
        {leaves.map((l) => (
          <option key={l.path} value={l.path} />
        ))}
      </datalist>
    </div>
  );
}
