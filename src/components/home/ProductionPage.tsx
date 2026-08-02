import { useEffect, useMemo, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import { useRouter } from '../../app/router';
import {
  addGraphicToShow,
  addShowCue,
  loadShows,
  moveShowCue,
  removeShowCue,
  removeShowGraphic,
  setShowHostedSlug,
  setShowOutputSlug,
  updateShowCue,
  type Show,
  type ShowCue,
} from '../../model/shows';
import { loadGraphics, templateForSavedGraphic } from '../../model/library';
import type { SavedGraphic } from '../../model/packets';
import { fieldDescriptors } from '../../control/controlModel';
import {
  controlShowBySlug,
  hostedControlTail,
  publishControlShow,
  sendHostedControl,
  subscribeControlEvents,
  unpublishControlShow,
  type ControlEventRow,
} from '../../control/hostedControl';
import { composeDocument } from '../../preview/composeDocument';
import { isBackendConfigured } from '../../backend/config';
import { useAuthState } from '../auth/useAuthState';
import { useAuthUi } from '../auth/authUi';
import { buildShowZip } from '../../export/showExport';
import { slug as slugify } from '../../export/common';
import { FieldRow } from '../fields/FieldControl';
import BrandLogo from '../BrandLogo';

/**
 * The PRODUCTION page (route `#/production/<id>`, docs/CLOUD_PLAYOUT.md §4-5): one production's
 * cockpit — the cue rundown (add / edit / reorder / notes), the graphic pool, the publish
 * controls with both capability links (control page + browser output), the renderer heartbeat,
 * a LOCAL preview of the selected cue, and the operator verbs (Take / Update / Next / Out).
 *
 * Preview is local by construction: the iframe composes the graphic with the selected cue's
 * values and never touches the wire — the five verbs are the ONLY thing that writes to the
 * command log, so previewing or editing another cue cannot modify program. The output page and
 * every other operator surface follow the same log, so what airs here airs everywhere.
 */
export default function ProductionPage({ id }: { id: string }) {
  const navigate = useRouter((s) => s.navigate);
  const [rev, setRev] = useState(0);
  const refresh = () => setRev((r) => r + 1);
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  const show: Show | null = useMemo(() => loadShows().find((s) => s.id === id) ?? null, [id, rev]);
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  const library = useMemo(() => loadGraphics(), [rev]);

  const backendConfigured = isBackendConfigured();
  const { needsSignIn } = useAuthState();
  const openSignIn = useAuthUi((s) => s.openSignIn);

  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<'output' | 'control' | null>(null);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [addPick, setAddPick] = useState('');

  // ── Live status (published productions): the renderer heartbeat + which cue is on air. ──
  const [liveCueId, setLiveCueId] = useState<string | null>(null);
  const [outputSeenAt, setOutputSeenAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const liveGraphicRef = useRef<string | null>(null);
  const lastIdRef = useRef(0);
  const hostedSlug = show?.hostedSlug ?? null;

  const cues = show?.cues ?? [];
  const graphicByPoolId = useMemo(() => new Map((show?.graphics ?? []).map((g) => [g.id, g] as const)), [show]);
  const selectedCue = cues.find((c) => c.id === selectedCueId) ?? cues[0] ?? null;
  const cueGraphicName = (cue: ShowCue) => graphicByPoolId.get(cue.sourceId)?.name ?? null;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!hostedSlug || !backendConfigured || !show) return;
    let alive = true;
    let unsubscribe: (() => void) | null = null;
    const applyRow = (row: ControlEventRow) => {
      if (row.id <= lastIdRef.current) return;
      lastIdRef.current = row.id;
      if (row.msg.t === 'cue') {
        setLiveCueId(row.msg.cue);
        liveGraphicRef.current = row.msg.cue ? row.graphic : null;
      }
    };
    void (async () => {
      const resolved = await controlShowBySlug(hostedSlug);
      if (!alive || !resolved) return;
      setOutputSeenAt(resolved.outputSeenAt);
      // Which cue is live survives a page load through the log: scan the recent tail for the
      // last cue status row (the marker rides the log, not the row — §4).
      const tail = await hostedControlTail(hostedSlug, Math.max(0, resolved.lastEventId - 100));
      if (!alive) return;
      lastIdRef.current = Math.max(0, resolved.lastEventId - 100);
      tail.forEach(applyRow);
      lastIdRef.current = Math.max(lastIdRef.current, resolved.lastEventId);
      unsubscribe = await subscribeControlEvents(show.id, applyRow, () => {
        void hostedControlTail(hostedSlug, lastIdRef.current).then((rows) => rows.forEach(applyRow));
      });
    })();
    // The heartbeat column is a plain row stamp — poll it at the same cadence it advances.
    const seenTimer = setInterval(() => {
      void controlShowBySlug(hostedSlug).then((r) => {
        if (alive && r) setOutputSeenAt(r.outputSeenAt);
      });
    }, 30_000);
    return () => {
      alive = false;
      unsubscribe?.();
      clearInterval(seenTimer);
    };
  }, [hostedSlug, backendConfigured, show?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── The local preview: the selected cue's graphic settled with the cue's values. ──
  const previewTemplate = useMemo(() => {
    if (!show || !selectedCue) return null;
    const pool = graphicByPoolId.get(selectedCue.sourceId);
    return pool ? templateForSavedGraphic(pool, library) : null;
  }, [show, selectedCue, graphicByPoolId, library]);
  const [previewDoc, setPreviewDoc] = useState('');
  useEffect(() => {
    if (!previewTemplate || !selectedCue) {
      setPreviewDoc('');
      return;
    }
    // Debounced: typing into a cue field re-renders the settled preview, not per keystroke.
    const t = setTimeout(() => {
      setPreviewDoc(
        composeDocument(previewTemplate, { settleWithData: JSON.stringify(selectedCue.values) }),
      );
    }, 350);
    return () => clearTimeout(t);
  }, [previewTemplate, selectedCue]);

  if (!show) {
    return (
      <div className="app home-page" data-testid="production-page">
        <header className="topbar">
          <button className="brand brand-home" onClick={() => navigate({ view: 'home', section: null })} title="Home">
            <BrandLogo size={24} />
          </button>
          <span className="tpl-name">Production not found</span>
        </header>
        <main className="home-content" style={{ padding: 24 }}>
          <p className="hint">This production no longer exists.</p>
          <button onClick={() => navigate({ view: 'home', section: 'productions' })}>← Back to productions</button>
        </main>
      </div>
    );
  }

  const outputUrl = show.outputSlug
    ? `${window.location.origin}/output?production=${encodeURIComponent(show.outputSlug)}`
    : null;
  const controlUrl = show.hostedSlug
    ? `${window.location.origin}/app?control=${encodeURIComponent(show.hostedSlug)}`
    : null;
  const unpublishedChanges = !!show.publishedAt && show.updatedAt > show.publishedAt;
  const rendererFresh = outputSeenAt ? now - Date.parse(outputSeenAt) < 90_000 : false;

  const copy = (kind: 'output' | 'control', text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(kind);
        setTimeout(() => setCopied((c) => (c === kind ? null : c)), 2000);
      },
      () => {},
    );
  };

  const publish = async () => {
    if (needsSignIn) {
      openSignIn('Publishing a production needs an account — the hosted pages live in your cloud space.');
      return;
    }
    setBusy(true);
    try {
      const published = await publishControlShow(show);
      if (published) {
        setShowHostedSlug(show.id, published.slug);
        setShowOutputSlug(show.id, published.outputSlug ?? undefined);
        refresh();
        setNote('✓ Published. Load the output URL in your browser source once — it stays the same across re-publishes.');
      } else {
        setNote('Publishing needs the cloud backend — this build runs offline.');
      }
    } catch (e) {
      setNote(`Publish failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    setBusy(true);
    try {
      await unpublishControlShow(show.id);
      setShowHostedSlug(show.id, undefined);
      setShowOutputSlug(show.id, undefined);
      refresh();
      setLiveCueId(null);
      liveGraphicRef.current = null;
      setNote('Production unpublished — the control link and the output URL no longer work.');
    } catch (e) {
      setNote(`Unpublish failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const exportZip = async () => {
    const zip = await buildShowZip(show);
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `${slugify(show.name)}_production.zip`);
  };

  // ── The verbs (docs/CLOUD_PLAYOUT.md §4). Every send is explicit; nothing airs on edit. ──
  const requirePublished = (): string | null => {
    if (!hostedSlug) {
      setNote('Publish the production first — the verbs drive the shared command log.');
      return null;
    }
    return hostedSlug;
  };

  const takeCue = async (cue: ShowCue) => {
    const s = requirePublished();
    const graphic = cueGraphicName(cue);
    if (!s || !graphic) return;
    try {
      await sendHostedControl(s, graphic, { t: 'update', data: cue.values });
      // One live layer: taking a cue on ANOTHER graphic plays the previous one out first.
      const prev = liveGraphicRef.current;
      if (prev && prev !== graphic) await sendHostedControl(s, prev, { t: 'stop' });
      await sendHostedControl(s, graphic, { t: 'play' });
      await sendHostedControl(s, graphic, { t: 'cue', cue: cue.id });
      setLiveCueId(cue.id);
      liveGraphicRef.current = graphic;
    } catch (e) {
      setNote(`Take failed: ${(e as Error).message}`);
    }
  };

  const liveCue = cues.find((c) => c.id === liveCueId) ?? null;

  const updateLive = async () => {
    const s = requirePublished();
    if (!s || !liveCue) return;
    const graphic = cueGraphicName(liveCue);
    if (!graphic) return;
    try {
      await sendHostedControl(s, graphic, { t: 'update', data: liveCue.values });
    } catch (e) {
      setNote(`Update failed: ${(e as Error).message}`);
    }
  };

  const nextLive = async () => {
    const s = requirePublished();
    const graphic = liveGraphicRef.current;
    if (!s || !graphic) return;
    try {
      await sendHostedControl(s, graphic, { t: 'next' });
    } catch (e) {
      setNote(`Next failed: ${(e as Error).message}`);
    }
  };

  const outLive = async () => {
    const s = requirePublished();
    const graphic = liveGraphicRef.current;
    if (!s || !graphic) return;
    try {
      await sendHostedControl(s, graphic, { t: 'stop' });
      await sendHostedControl(s, graphic, { t: 'cue', cue: null });
      setLiveCueId(null);
      liveGraphicRef.current = null;
    } catch (e) {
      setNote(`Out failed: ${(e as Error).message}`);
    }
  };

  const selectedDescriptors = previewTemplate ? fieldDescriptors(previewTemplate.fields) : [];

  return (
    <div className="app home-page control-page production-page" data-testid="production-page">
      <header className="topbar">
        <button className="brand brand-home" onClick={() => navigate({ view: 'home', section: null })} title="Home">
          <BrandLogo size={24} />
        </button>
        <button onClick={() => navigate({ view: 'home', section: 'productions' })} data-testid="production-back">
          ← Productions
        </button>
        <span className="divider-dot" aria-hidden="true">·</span>
        <span className="tpl-name">📺 {show.name}</span>
        <span className="topbar-meta mono muted">production</span>
        <div className="spacer" />
        {show.hostedSlug ? (
          <>
            <span className={`prod-status ${rendererFresh ? 'ok' : ''}`} data-testid="renderer-status">
              {rendererFresh ? '● output connected' : outputSeenAt ? '○ output not seen lately' : '○ output never connected'}
            </span>
            <button onClick={() => void publish()} disabled={busy} data-testid="production-republish">
              ⟳ Publish changes{unpublishedChanges ? ' •' : ''}
            </button>
            <button onClick={() => void unpublish()} disabled={busy}>Unpublish</button>
          </>
        ) : (
          <button className="primary" onClick={() => void publish()} disabled={busy || !backendConfigured} data-testid="production-publish">
            ▶ Start production
          </button>
        )}
      </header>

      <div className="control-page-body production-body">
        <section className="control-page-main">
          {/* Links: the two capabilities, clearly separated (§2 — output renders, control operates). */}
          {show.hostedSlug ? (
            <div className="panel-section prod-links" data-testid="production-links">
              <div className="prod-link-row">
                <span className="mono muted">Output URL</span>
                <code className="prod-url">{outputUrl}</code>
                <button onClick={() => outputUrl && copy('output', outputUrl)} data-testid="copy-output-url">
                  {copied === 'output' ? '✓ Copied' : '🔗 Copy'}
                </button>
              </div>
              <p className="hint">
                Add this once as a browser source (OBS / vMix) or a CasparCG HTML template — 1920×1080,
                transparent. It keeps working across re-publishes; graphics and cues update in place.
              </p>
              <div className="prod-link-row">
                <span className="mono muted">Control page</span>
                <code className="prod-url">{controlUrl}</code>
                <button onClick={() => controlUrl && copy('control', controlUrl)} data-testid="copy-control-url">
                  {copied === 'control' ? '✓ Copied' : '🔗 Copy'}
                </button>
              </div>
              <p className="hint">
                The operator page — works on a phone or tablet, no account needed. Keep the link private:
                holding it is the permission to operate.
              </p>
              {unpublishedChanges && (
                <p className="status-warn" data-testid="publish-freshness">
                  The production changed after the last publish — the output and control pages run the
                  older snapshot until you publish changes.
                </p>
              )}
            </div>
          ) : (
            <p className="hint">
              <strong>Start production</strong> publishes this rundown: you get one persistent transparent
              <strong> output URL</strong> for CasparCG/OBS/vMix and one <strong>control page</strong> for
              operating — nothing goes on air until you Take a cue.
              {!backendConfigured && ' (This build runs offline — publishing needs the cloud backend.)'}
            </p>
          )}

          {/* Preview — LOCAL, never the wire. */}
          <div className="prod-preview" data-testid="production-preview">
            {previewDoc ? (
              <iframe
                title="Cue preview"
                sandbox="allow-scripts"
                srcDoc={previewDoc}
                style={{ width: '100%', aspectRatio: '16 / 9', border: '1px solid #26262c', borderRadius: 8, background: '#0a0a0c' }}
              />
            ) : (
              <p className="hint">Add a cue to preview it here.</p>
            )}
            <p className="hint" style={{ marginTop: 4 }}>
              Preview only — nothing changes on air until <strong>Take</strong>.
            </p>
          </div>

          {/* The verbs. */}
          <div className="prod-verbs row" data-testid="production-verbs">
            <button
              className="primary"
              disabled={!selectedCue || !show.hostedSlug}
              onClick={() => selectedCue && void takeCue(selectedCue)}
              data-testid="verb-take"
              title="Air the selected cue"
            >
              ⟳ Take
            </button>
            <button disabled={!liveCue || !show.hostedSlug} onClick={() => void updateLive()} data-testid="verb-update" title="Send the live cue's edited values without replaying">
              ✎ Update
            </button>
            <button disabled={!liveCueId || !show.hostedSlug} onClick={() => void nextLive()} data-testid="verb-next" title="Advance the live graphic's next step">
              » Next
            </button>
            <button disabled={!liveCueId || !show.hostedSlug} onClick={() => void outLive()} data-testid="verb-out" title="Play the live graphic out">
              ■ Out
            </button>
            <div className="spacer" />
            <span className="muted" data-testid="live-cue-chip">
              {liveCue ? `● LIVE: ${liveCue.label}` : liveCueId ? '● LIVE (cue not in this rundown)' : '○ nothing on air'}
            </span>
          </div>

          {note && <p className={note.startsWith('✓') ? 'status-ok' : 'status-bad'} data-testid="production-note">{note}</p>}

          {/* The selected cue's data. */}
          {selectedCue && (
            <div className="panel-section" data-testid="cue-editor">
              <label className="save-field">
                <span>Cue name</span>
                <input
                  value={selectedCue.label}
                  onChange={(e) => {
                    updateShowCue(show.id, selectedCue.id, { label: e.target.value });
                    refresh();
                  }}
                  data-testid="cue-label"
                />
              </label>
              <label className="save-field">
                <span>Operator note</span>
                <input
                  value={selectedCue.note ?? ''}
                  placeholder="e.g. after the intro"
                  onChange={(e) => {
                    updateShowCue(show.id, selectedCue.id, { note: e.target.value || null });
                    refresh();
                  }}
                  data-testid="cue-note"
                />
              </label>
              {selectedDescriptors.map((d) => (
                <FieldRow
                  key={d.key}
                  descriptor={d}
                  value={String(selectedCue.values[d.key] ?? d.defaultValue ?? '')}
                  onChange={(v) => {
                    updateShowCue(show.id, selectedCue.id, { values: { [d.key]: String(v) } });
                    refresh();
                  }}
                  testIdPrefix="cue-field"
                />
              ))}
            </div>
          )}
        </section>

        <aside className="control-page-side">
          <div className="row" style={{ alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Cue rundown</h3>
            <div className="spacer" />
          </div>
          <p className="hint">
            A cue is one prepared row of data on one of the production’s graphics — the same lower
            third can carry a different person at cue 2 and cue 7.
          </p>
          {cues.length === 0 && <p className="hint" data-testid="no-cues">No cues yet — add a graphic below, then add cues on it.</p>}
          <div className="control-entries" data-testid="cue-list">
            {cues.map((cue, i) => (
              <div
                key={cue.id}
                className={`control-entry ${cue.id === (selectedCue?.id ?? '') ? 'active' : ''} ${cue.id === liveCueId ? 'live' : ''}`}
                data-testid={`cue-${cue.id}`}
              >
                <button className="control-entry-label" onClick={() => setSelectedCueId(cue.id)} data-testid="select-cue">
                  {cue.id === liveCueId ? '●' : `${i + 1}.`} {cue.label}
                  <span className="muted"> · {cueGraphicName(cue) ?? 'missing graphic'}</span>
                  {cue.note ? <span className="muted prod-cue-note"> — {cue.note}</span> : null}
                </button>
                <button onClick={() => { moveShowCue(show.id, cue.id, -1); refresh(); }} title="Move up" disabled={i === 0}>↑</button>
                <button onClick={() => { moveShowCue(show.id, cue.id, 1); refresh(); }} title="Move down" disabled={i === cues.length - 1}>↓</button>
                <button
                  onClick={() => {
                    const { cueId } = addShowCue(show.id, cue.sourceId, { label: `${cue.label} copy`, values: cue.values, note: cue.note });
                    if (cueId) setSelectedCueId(cueId);
                    refresh();
                  }}
                  title="Duplicate this cue"
                >
                  ⧉
                </button>
                <button
                  onClick={() => { removeShowCue(show.id, cue.id); refresh(); }}
                  title="Remove this cue (the graphic stays in the pool)"
                  data-testid="delete-cue"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="row" style={{ alignItems: 'center', marginTop: 16 }}>
            <h3 style={{ margin: 0 }}>Graphics</h3>
            <div className="spacer" />
          </div>
          <p className="hint">The templates this production can air. Each graphic renders on its own layer of the output.</p>
          {show.graphics.map((g: SavedGraphic) => (
            <div className="pk-graphic" key={g.id} data-testid={`pool-${g.id}`}>
              <strong>{g.name}</strong>
              <span className="muted">{cues.filter((c) => c.sourceId === g.id).length} cue(s)</span>
              <div className="spacer" />
              <button
                onClick={() => {
                  const { cueId } = addShowCue(show.id, g.id);
                  if (cueId) setSelectedCueId(cueId);
                  refresh();
                }}
                data-testid="add-cue"
              >
                ＋ Cue
              </button>
              <button
                onClick={() => { removeShowGraphic(show.id, g.id); refresh(); }}
                title="Remove this graphic and its cues from the production"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="row" style={{ marginTop: 8 }}>
            <select value={addPick} onChange={(e) => setAddPick(e.target.value)} data-testid="add-graphic-pick">
              <option value="">Add a graphic from your library…</option>
              {library.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              disabled={!addPick}
              onClick={() => {
                const doc = library.find((g) => g.id === addPick);
                if (!doc) return;
                addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
                setAddPick('');
                refresh();
              }}
              data-testid="add-graphic"
            >
              ＋ Add
            </button>
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <button onClick={() => void exportZip()} disabled={show.graphics.length === 0} title="The offline package: one SPX folder per graphic + the standalone control page">
              ⬇ Export package
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
