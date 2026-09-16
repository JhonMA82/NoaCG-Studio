import { useMemo, useState } from 'react';
import {
  deletePath,
  flattenLeaves,
  matchTitle,
  parseDataTree,
  parseLiteral,
  reparseLeaf,
  setPath,
  suggestPath,
  type DataLeaf,
  type JsonObject,
  type ResolvedValues,
} from '../../model/productionData';
import { setFieldBinding, setFieldBindings, setShowSeedData, type Show } from '../../model/shows';
import { fieldDescriptors } from '../../control/controlModel';
import type { FieldDescriptor } from '../../model/fieldModel';
import { copyLink } from './copyLink';

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
  dataKey,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
  liveData: JsonObject;
  setLiveData: (data: JsonObject) => void;
  resolved: ResolvedValues;
  /** The production's own data key, or null when there is nothing to show (unpublished,
   *  offline, or not the owner). See the Data key block below for why it belongs on screen. */
  dataKey?: string | null;
}) {
  const [newPath, setNewPath] = useState('');
  const [newValue, setNewValue] = useState('');
  const [rawOpen, setRawOpen] = useState(false);
  const [rawText, setRawText] = useState('');
  const [rawError, setRawError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** The data key is hidden until asked for: it is a credential, and this page is often on a
   *  screen somebody else is looking at. */
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyShown, setKeyShown] = useState(false);
  /** The one ✕ whose second click deletes, or null. One slot, so arming a row disarms any other. */
  const [armed, setArmed] = useState<string | null>(null);

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
          The values this production knows right now. Change one here and every graphic bound to
          it follows, on air too. Nothing here plays or stops a graphic.
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
          {/* Only when there IS a key: unpublished productions and offline builds have no API to
              point anybody at, and a permanently dead button is worse than no button. */}
          {dataKey && (
            <button
              onClick={() => {
                setKeyOpen((open) => !open);
                setKeyShown(false);
              }}
              data-testid="data-key-toggle"
            >
              {keyOpen ? '▴ Hide data key' : '▾ Data key'}
            </button>
          )}
        </div>
      </div>

      {/* WHAT THIS TAB IS FOR, in three short paragraphs, closed by default. The owner opened this
          tab on 2026-09-15 and could not tell what the button did or how the boxes worked, and he
          built the product; the students on 2026-09-25 get one look. A drawer costs nothing once
          learned, and a paragraph that is always open is one more thing to scroll past on air. */}
      <details className="pd-explain" data-testid="data-explain">
        <summary>How this tab works</summary>
        <div className="pd-explain-body">
          <p>
            <strong>Production data</strong> is a list of values with a path and a value, like{' '}
            <code>match.home.score</code> and <code>2</code>. Type a new value and every graphic
            bound to that path shows it, also while it is on air. An outside system can write the
            same list over the data key.
          </p>
          <p>
            <strong>Bindings</strong> link one field of one graphic to one path. Click a field's
            box to pick a path from the list, or type one. A bound field takes its value from here
            at Take, not from what was typed in the cue.
          </p>
          <p>
            <strong>Tables</strong> are banks of rows, like a quiz bank or a line-up. They change
            nothing by themselves: on the Playout tab you load one row into a cue's preview, then
            take it.
          </p>
          <p className="hint">
            <a href="/docs#data-example" target="_blank" rel="noreferrer">
              More about this, with a worked example
            </a>
          </p>
        </div>
      </details>

      {note && (
        <p className="status-ok pd-data-note" data-testid="data-note">
          {note}
        </p>
      )}

      {/* THE DATA KEY (docs/DATA_API.md). The API was documented and then unreachable: the key is
          minted at publish and lived only in `control_shows.data_key`, so the whole guide told a
          hosted operator to go and read a database row they have no way to open. It is the
          OWNER'S OWN key, read over RLS in their own authenticated session
          (control/productionDataApi.ts says why that is not the "never a web page" case the
          integrator doc warns about), and it is strictly weaker than the control-page URL this
          same production already hands out.

          Hidden until asked for, because this screen is often in front of other people, and
          revealed rather than masked-and-copyable so nobody hands out a key they never saw. */}
      {dataKey && keyOpen && (
        <div className="pd-datakey" data-testid="data-key">
          <p className="hint">
            An outside system - a timing service, a results feed, your own script - writes this
            tree over HTTPS with this key. It writes data only: it cannot play, stop, take or
            clear a graphic. Keep it in server-side config, never in a web page.
          </p>
          <div className="pd-datakey-row">
            <code data-testid="data-key-value">{keyShown ? dataKey : '•'.repeat(24)}</code>
            <button onClick={() => setKeyShown((shown) => !shown)} data-testid="data-key-reveal">
              {keyShown ? 'Hide' : 'Reveal'}
            </button>
            <button
              onClick={() => {
                void copyLink(dataKey).then((ok) => {
                  setNote(ok ? '✓ Data key copied' : 'The key could not be copied. Reveal it and copy by hand.');
                });
              }}
              data-testid="data-key-copy"
            >
              Copy
            </button>
          </div>
          <p className="hint">
            Publishing again mints a new key and the old one stops working. The endpoints, the
            payload shapes and a worked example are in the{' '}
            <a href="/docs#data-api" target="_blank" rel="noreferrer">
              Live data guide
            </a>
            .
          </p>
        </div>
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
            No values yet. Add one below, or open Raw JSON and paste a whole payload, nested as
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
            {/* ARMED, like the entry delete on the graphic control page. This is typed-in data
                with no undo behind it, on a row someone drives live, and a stray click took it
                with no way back - "if I close one of those, how can I reopen it?" (owner,
                2026-08-21). The answer used to be: retype the path and the value from memory. */}
            <button
              className={`pd-live-del${armed === `leaf:${leaf.path}` ? ' reset-armed' : ''}`}
              title={armed === `leaf:${leaf.path}` ? `Click again to delete ${leaf.path}` : 'Delete this value'}
              onClick={() => {
                if (armed === `leaf:${leaf.path}`) {
                  setArmed(null);
                  write(deletePath(liveData, leaf.path));
                } else setArmed(`leaf:${leaf.path}`);
              }}
              data-testid={`data-delete-${leaf.path}`}
            >
              {/* A GLYPH, not the word the other armed buttons use: this row's last grid column
                  is a fixed 28px, so "Delete?" would overflow its own track - the defect §2d of
                  docs/PLAYOUT_DASHBOARD.md is about, one panel over. The amber and the tooltip
                  carry the meaning instead. */}
              {armed === `leaf:${leaf.path}` ? '✓' : '✕'}
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
/** Every unbound, unambiguous title-to-leaf suggestion the given descriptors would bind, keyed
 *  by field id, the same computation the per-row suggestion and the two bulk buttons share. */
function unambiguousSuggestions(
  descriptors: FieldDescriptor[],
  bound: Record<string, string> | undefined,
  leaves: DataLeaf[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of descriptors) {
    if (bound?.[d.key]) continue; // already bound, never overwritten by a bulk press
    const suggestion = suggestPath(d.label, leaves);
    if (suggestion) out[d.key] = suggestion;
  }
  return out;
}

/** Which "Bind all by title" button produced the last note - the whole production, or one
 *  named graphic. A bare string would collide with a graphic actually named "production"
 *  (nothing stops that rename), so the scope is tagged rather than compared by string equality. */
type BindAllScope = { kind: 'production' } | { kind: 'graphic'; name: string };

function scopesMatch(a: BindAllScope, b: BindAllScope): boolean {
  return a.kind === 'production' ? b.kind === 'production' : b.kind === 'graphic' && b.name === a.name;
}

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
  /** The one ✕ whose second click unbinds, or null — the same one-slot arming as above. */
  const [armed, setArmed] = useState<string | null>(null);
  /** The last "Bind all by title" outcome, per button. Cleared by the next press of any. */
  const [bindAllNote, setBindAllNote] = useState<{ scope: BindAllScope; text: string } | null>(null);

  const graphicsWithFields = show.graphics
    .map((g) => ({ g, descriptors: fieldDescriptors(g.template.fields ?? [], { includeHidden: true }) }))
    .filter(({ descriptors }) => descriptors.length > 0);

  /** Apply every unambiguous suggestion across one or more graphics in ONE write to the show
   *  record. This is the operator's press, never a load-time effect (the suggestion above is
   *  only ever offered) - and one press writing N fields costs one write, not N. */
  const bindAllByTitle = (
    scope: BindAllScope,
    targets: { g: Show['graphics'][number]; descriptors: FieldDescriptor[] }[],
  ) => {
    const entries: { graphic: string; fieldId: string; path: string }[] = [];
    for (const { g, descriptors } of targets) {
      const suggestions = unambiguousSuggestions(descriptors, bindings[g.name], leaves);
      for (const fieldId of Object.keys(suggestions)) entries.push({ graphic: g.name, fieldId, path: suggestions[fieldId] });
    }
    if (entries.length > 0) setShows(setFieldBindings(show.id, entries));
    // The second press says WHY it did nothing, because the first press did something and the
    // button looks the same: every field this could fill is already filled, or nothing matches.
    setBindAllNote({
      scope,
      text:
        entries.length > 0
          ? `✓ ${entries.length} field${entries.length === 1 ? '' : 's'} bound`
          : 'Nothing left to bind: no empty field has exactly one matching path.',
    });
  };

  return (
    <div className="pd-bindings" data-testid="production-bindings">
      <div className="pd-bind-head">
        <h3>Bindings</h3>
        {graphicsWithFields.length > 0 && (
          <button
            className="pd-bind-all"
            onClick={() => bindAllByTitle({ kind: 'production' }, graphicsWithFields)}
            data-testid="bind-all-production"
          >
            Bind all by title
          </button>
        )}
      </div>
      {/* What the button does, where the button is. This is `unambiguousSuggestions` in one
          line: empty fields only, one match only, typed paths untouched - so a second press
          finding nothing is the rule working, not the button breaking. */}
      {graphicsWithFields.length > 0 && (
        <p className="hint pd-bind-rule" data-testid="bind-all-rule">
          Fills each empty field whose title matches the end of exactly one path above, like the
          field "Score A" and the path <code>match.scoreA</code>. Paths you typed stay. Pressing
          again changes nothing until the data or the fields change.
        </p>
      )}
      {bindAllNote && scopesMatch(bindAllNote.scope, { kind: 'production' }) && (
        <p className="hint" data-testid="bind-all-note-production">
          {bindAllNote.text}
        </p>
      )}
      {show.graphics.length === 0 && (
        <p className="hint">Add a graphic to this production and its fields appear here.</p>
      )}
      {graphicsWithFields.map(({ g, descriptors }) => {
        return (
          <div className="pd-bind-graphic" key={g.id} data-testid={`bind-graphic-${g.name}`}>
            <div className="pd-bind-graphic-head">
              <h4>{g.name}</h4>
              <button
                className="pd-bind-all"
                onClick={() => bindAllByTitle({ kind: 'graphic', name: g.name }, [{ g, descriptors }])}
                data-testid={`bind-all-${g.name}`}
              >
                Bind this graphic by title
              </button>
            </div>
            {bindAllNote && scopesMatch(bindAllNote.scope, { kind: 'graphic', name: g.name }) && (
              <p className="hint" data-testid={`bind-all-note-${g.name}`}>
                {bindAllNote.text}
              </p>
            )}
            {descriptors.map((d) => {
              const path = bindings[g.name]?.[d.key] ?? '';
              const suggestion = path ? null : suggestPath(d.label, leaves);
              // An ambiguous title is never guessed (suggestPath returns null for it too), but
              // the row still owes the operator a reason: name what it matched.
              const ambiguous = path || suggestion ? [] : matchTitle(d.label, leaves);
              const live = resolved[g.name]?.[d.key];
              return (
                <div className="pd-bind-row" key={d.key}>
                  <span className="pd-bind-field">
                    <code>{d.key}</code> {d.label}
                  </span>
                  <input
                    value={path}
                    placeholder={suggestion ? `suggested: ${suggestion}` : 'pick or type a path'}
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
                  {ambiguous.length > 1 && (
                    <span className="pd-bind-ambiguous" data-testid={`bind-ambiguous-${g.name}-${d.key}`}>
                      {ambiguous.length} paths match, pick one: {ambiguous.join(', ')}
                    </span>
                  )}
                  {/* What the field is ACTUALLY showing, so a typo in a path reads as a blank
                      here rather than as a mystery on air. */}
                  {path && (
                    <span
                      className={live === undefined ? 'pd-bind-miss' : 'pd-bind-live'}
                      data-testid={`bind-value-${g.name}-${d.key}`}
                    >
                      {live === undefined ? 'no value at this path, field left alone' : live}
                    </span>
                  )}
                  {path && (
                    // ARMED for the same reason as the value delete above, and more so: unbinding
                    // CHANGES WHAT AIRS - the field goes back to the cue's own value the next time
                    // it is sent - and the path it forgets was only ever typed here.
                    <button
                      className={`pd-live-del${armed === `bind:${g.name}:${d.key}` ? ' reset-armed' : ''}`}
                      title={
                        armed === `bind:${g.name}:${d.key}`
                          ? `Click again to unbind ${d.key} from ${path}`
                          : "Unbind. The field goes back to the cue's own value"
                      }
                      onClick={() => {
                        if (armed === `bind:${g.name}:${d.key}`) {
                          setArmed(null);
                          setShows(setFieldBinding(show.id, g.name, d.key, null));
                        } else setArmed(`bind:${g.name}:${d.key}`);
                      }}
                      data-testid={`unbind-${g.name}-${d.key}`}
                    >
                      {armed === `bind:${g.name}:${d.key}` ? '✓' : '✕'}
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
