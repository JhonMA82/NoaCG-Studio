import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { fieldDescriptors } from '../../control/controlModel';
import {
  clearCueOnWire,
  controlOutputSeenAt,
  controlPageUrl,
  controlShowBySlug,
  followControlLog,
  hostedControlTail,
  outputPageUrl,
  publishControlShow,
  sendHostedControl,
  takeCueOnWire,
  unpublishControlShow,
} from '../../control/hostedControl';
import { composeDocument } from '../../preview/composeDocument';
import { postPreviewCmd } from '../../preview/previewProtocol';
import { isBackendConfigured } from '../../backend/config';
import { useAuthState } from '../auth/useAuthState';
import { useAuthUi } from '../auth/authUi';
import { downloadShowZip } from '../../export/showExport';
import { FieldRow } from '../fields/FieldControl';
import BrandLogo from '../BrandLogo';
import { copyLink } from './HomePage';

/** The selected cue's UNSAVED edits: local echo for instant typing, flushed to the record on a
 *  300 ms idle (a keystroke must not parse + rewrite the whole shows store — the store embeds
 *  full template snapshots, so that is a visible input-lag class of cost). */
interface CueDraft {
  cueId: string;
  label: string;
  note: string;
  values: Record<string, string>;
}

/**
 * The PRODUCTION page (route `#/production/<id>`, docs/CLOUD_PLAYOUT.md §4-5): one production's
 * cockpit — the cue rundown (add / edit / reorder / notes), the graphic pool, the publish
 * controls with both capability links (control page + browser output), the renderer heartbeat,
 * a LOCAL preview of the selected cue, and the operator verbs (Take / Update / Next / Out).
 *
 * Preview is local by construction: the iframe composes the graphic once and settle-commands
 * carry the cue's values into it — the wire is never touched. The verbs are the ONLY thing
 * that writes to the command log, so previewing or editing another cue cannot modify program.
 * The preview shows the LOCAL (to-be-published) template deliberately — this is the authoring
 * cockpit, and the "changes not yet published" hint names any divergence from the renderer.
 */
export default function ProductionPage({ id }: { id: string }) {
  const navigate = useRouter((s) => s.navigate);
  // The mutators return the fresh list — holding it in state (the ControlPanel pattern) keeps
  // an edit from re-parsing every store on every render.
  const [shows, setShows] = useState<Show[]>(() => loadShows());
  const library = useMemo(() => loadGraphics(), []);
  const show: Show | null = shows.find((s) => s.id === id) ?? null;

  const backendConfigured = isBackendConfigured();
  const { needsSignIn } = useAuthState();
  const openSignIn = useAuthUi((s) => s.openSignIn);

  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<'output' | 'control' | null>(null);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [addPick, setAddPick] = useState('');

  // ── Live status (published productions): the renderer heartbeat + which cue is on air. ──
  const [liveCue, setLiveCue] = useState<{ id: string | null; graphic: string | null }>({ id: null, graphic: null });
  const [outputSeenAt, setOutputSeenAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const hostedSlug = show?.hostedSlug ?? null;

  const cues = useMemo(() => show?.cues ?? [], [show]);
  const graphicByPoolId = useMemo(() => new Map((show?.graphics ?? []).map((g) => [g.id, g] as const)), [show]);
  const selectedCue = cues.find((c) => c.id === selectedCueId) ?? cues[0] ?? null;
  const cueGraphicName = useCallback(
    (cue: ShowCue) => graphicByPoolId.get(cue.sourceId)?.name ?? null,
    [graphicByPoolId],
  );

  // ── The cue draft: edits echo locally, persist on idle / switch / take / unmount. ──
  const [draft, setDraft] = useState<CueDraft | null>(null);
  const draftRef = useRef<CueDraft | null>(null);
  draftRef.current = draft;
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushDraft = useCallback(() => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    const d = draftRef.current;
    if (!d) return;
    setShows(updateShowCue(id, d.cueId, { label: d.label, note: d.note || null, values: d.values }));
  }, [id]);
  useEffect(() => () => flushDraft(), [flushDraft]);
  const editDraft = (patch: Partial<Pick<CueDraft, 'label' | 'note'>> & { values?: Record<string, string> }) => {
    if (!selectedCue) return;
    setDraft((d) => {
      const base: CueDraft =
        d && d.cueId === selectedCue.id
          ? d
          : { cueId: selectedCue.id, label: selectedCue.label, note: selectedCue.note ?? '', values: { ...selectedCue.values } };
      return { ...base, ...patch, values: { ...base.values, ...(patch.values ?? {}) } };
    });
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flushDraft, 300);
  };
  /** The cue as the operator currently sees it — draft over record. */
  const cueView = useCallback(
    (cue: ShowCue): Pick<CueDraft, 'label' | 'note' | 'values'> => {
      const d = draftRef.current;
      return d && d.cueId === cue.id ? d : { label: cue.label, note: cue.note ?? '', values: cue.values };
    },
    [],
  );
  const selectCue = (cueId: string) => {
    flushDraft();
    setDraft(null);
    setSelectedCueId(cueId);
  };

  // ── Live tracking: recover the marker from the log's tail, then follow (shared discipline). ──
  useEffect(() => {
    if (!hostedSlug || !backendConfigured || !show) return;
    let alive = true;
    let unsubscribe: (() => void) | null = null;
    const tail = (after: number) => hostedControlTail(hostedSlug, after);
    void (async () => {
      const resolved = await controlShowBySlug(hostedSlug);
      if (!alive || !resolved) return;
      setOutputSeenAt(resolved.outputSeenAt);
      // The on-air cue comes off the ROW (0031's snapshot) — no log-window scan to miss.
      if (resolved.liveCue) setLiveCue(resolved.liveCue);
      unsubscribe = await followControlLog({
        showId: show.id,
        from: resolved.lastEventId,
        tail,
        onRow: (row) => {
          if (row.msg.t === 'cue') setLiveCue({ id: row.msg.cue, graphic: row.msg.cue ? row.graphic : null });
        },
      });
    })();
    // ONE ticker serves both facts the freshness chip needs: the clock and the heartbeat
    // column (a single-column read — never the resolve RPC, whose row carries the multi-MB
    // pinned payload).
    const seenTimer = setInterval(() => {
      setNow(Date.now());
      void controlOutputSeenAt(show.id).then((at) => {
        if (alive && at !== null) setOutputSeenAt(at);
      });
    }, 30_000);
    return () => {
      alive = false;
      unsubscribe?.();
      clearInterval(seenTimer);
    };
  }, [hostedSlug, backendConfigured, show?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── The local preview: composed ONCE per template, cue values pushed as settle commands
  // (the GraphicControlPage pattern — rebuilding the document per edit re-parses GSAP and
  // reloads every asset on the most common gesture a rundown has). ──
  const previewIframe = useRef<HTMLIFrameElement>(null);
  const previewStage = useRef<HTMLDivElement>(null);
  const poolGraphic = selectedCue ? graphicByPoolId.get(selectedCue.sourceId) ?? null : null;
  // Recompute only when the underlying saved copy actually changes — the pool objects get new
  // identities on every store write, so object identity alone would recompose per keystroke.
  const previewKey = poolGraphic ? `${poolGraphic.id}:${poolGraphic.savedAt}` : '';
  /* eslint-disable react-hooks/exhaustive-deps */
  const previewTemplate = useMemo(
    () => (poolGraphic ? templateForSavedGraphic(poolGraphic, library) : null),
    [previewKey, library],
  );
  const previewDoc = useMemo(
    () => (previewTemplate ? composeDocument(previewTemplate, { liveControl: true }) : ''),
    [previewTemplate],
  );
  /* eslint-enable react-hooks/exhaustive-deps */
  const settleData = selectedCue ? JSON.stringify(cueView(selectedCue).values) : '';
  const settlePreview = useCallback((data: string) => {
    postPreviewCmd(previewIframe.current?.contentWindow, { cmd: 'settle', data });
  }, []);
  useEffect(() => {
    if (!previewDoc || !settleData) return;
    const t = setTimeout(() => settlePreview(settleData), 150);
    return () => clearTimeout(t);
  }, [previewDoc, settleData, settlePreview]);
  // FIT THE GRAPHIC (the GraphicControlPage recipe): the iframe carries the template's own
  // resolution and scales down, so the preview shows the real composition — a lower third at
  // its true share of frame, not the top-left crop a 100%-width iframe of a 1920px document
  // would show.
  const [stageW, setStageW] = useState(0);
  useEffect(() => {
    const el = previewStage.current;
    if (!el) return;
    const measure = () => setStageW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewDoc]);
  const fit = previewTemplate && stageW ? stageW / previewTemplate.resolution.width : 0;

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

  const outputUrl = show.outputSlug ? outputPageUrl(show.outputSlug) : null;
  const controlUrl = show.hostedSlug ? controlPageUrl(show.hostedSlug) : null;
  const unpublishedChanges = !!show.publishedAt && show.updatedAt > show.publishedAt;
  const rendererFresh = outputSeenAt ? now - Date.parse(outputSeenAt) < 90_000 : false;

  const copy = (kind: 'output' | 'control', text: string) => {
    void copyLink(text).then((ok) => {
      if (!ok) return;
      setCopied(kind);
      setTimeout(() => setCopied((c) => (c === kind ? null : c)), 2000);
    });
  };

  const publish = async () => {
    if (needsSignIn) {
      openSignIn('Publishing a production needs an account — the hosted pages live in your cloud space.');
      return;
    }
    flushDraft();
    setBusy(true);
    try {
      const current = loadShows().find((s) => s.id === show.id);
      const published = current ? await publishControlShow(current) : null;
      if (published) {
        setShowHostedSlug(show.id, published.slug);
        setShows(setShowOutputSlug(show.id, published.outputSlug ?? undefined));
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
      setShows(setShowOutputSlug(show.id, undefined));
      setLiveCue({ id: null, graphic: null });
      setNote('Production unpublished — the control link and the output URL no longer work.');
    } catch (e) {
      setNote(`Unpublish failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  // ── The verbs (docs/CLOUD_PLAYOUT.md §4) — one shared wire author, atomic batches. ──
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
    flushDraft();
    try {
      await takeCueOnWire(s, { id: cue.id, graphic, values: cueView(cue).values }, liveCue.graphic);
      setLiveCue({ id: cue.id, graphic });
    } catch (e) {
      setNote(`Take failed: ${(e as Error).message}`);
    }
  };

  const liveCueRow = cues.find((c) => c.id === liveCue.id) ?? null;

  const updateLive = async () => {
    const s = requirePublished();
    if (!s || !liveCueRow) return;
    const graphic = cueGraphicName(liveCueRow);
    if (!graphic) return;
    flushDraft();
    try {
      await sendHostedControl(s, graphic, { t: 'update', data: cueView(liveCueRow).values });
    } catch (e) {
      setNote(`Update failed: ${(e as Error).message}`);
    }
  };

  const nextLive = async () => {
    const s = requirePublished();
    if (!s || !liveCue.graphic) return;
    try {
      await sendHostedControl(s, liveCue.graphic, { t: 'next' });
    } catch (e) {
      setNote(`Next failed: ${(e as Error).message}`);
    }
  };

  const outLive = async () => {
    const s = requirePublished();
    if (!s || !liveCue.graphic) return;
    try {
      await clearCueOnWire(s, liveCue.graphic);
      setLiveCue({ id: null, graphic: null });
    } catch (e) {
      setNote(`Out failed: ${(e as Error).message}`);
    }
  };

  const selectedDescriptors = previewTemplate ? fieldDescriptors(previewTemplate.fields) : [];
  const selectedView = selectedCue ? cueView(selectedCue) : null;

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
            {previewDoc && previewTemplate ? (
              <div
                ref={previewStage}
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  height: fit ? previewTemplate.resolution.height * fit : undefined,
                  aspectRatio: fit ? undefined : '16 / 9',
                  border: '1px solid #26262c',
                  borderRadius: 8,
                  background: '#0a0a0c',
                }}
              >
                <iframe
                  ref={previewIframe}
                  title="Cue preview"
                  sandbox="allow-scripts"
                  srcDoc={previewDoc}
                  onLoad={() => settlePreview(settleData)}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: previewTemplate.resolution.width,
                    height: previewTemplate.resolution.height,
                    border: 0,
                    transformOrigin: '0 0',
                    transform: `scale(${fit || 1})`,
                  }}
                />
              </div>
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
            <button disabled={!liveCueRow || !show.hostedSlug} onClick={() => void updateLive()} data-testid="verb-update" title="Send the live cue's edited values without replaying">
              ✎ Update
            </button>
            <button disabled={!liveCue.id || !show.hostedSlug} onClick={() => void nextLive()} data-testid="verb-next" title="Advance the live graphic's next step">
              » Next
            </button>
            <button disabled={!liveCue.id || !show.hostedSlug} onClick={() => void outLive()} data-testid="verb-out" title="Play the live graphic out">
              ■ Out
            </button>
            <div className="spacer" />
            <span className="muted" data-testid="live-cue-chip">
              {liveCueRow ? `● LIVE: ${liveCueRow.label}` : liveCue.id ? '● LIVE (cue not in this rundown)' : '○ nothing on air'}
            </span>
          </div>

          {note && <p className={note.startsWith('✓') ? 'status-ok' : 'status-bad'} data-testid="production-note">{note}</p>}

          {/* The selected cue's data. */}
          {selectedCue && selectedView && (
            <div className="panel-section" data-testid="cue-editor">
              <label className="save-field">
                <span>Cue name</span>
                <input
                  value={selectedView.label}
                  onChange={(e) => editDraft({ label: e.target.value })}
                  data-testid="cue-label"
                />
              </label>
              <label className="save-field">
                <span>Operator note</span>
                <input
                  value={selectedView.note}
                  placeholder="e.g. after the intro"
                  onChange={(e) => editDraft({ note: e.target.value })}
                  data-testid="cue-note"
                />
              </label>
              {selectedDescriptors.map((d) => (
                <FieldRow
                  key={d.key}
                  descriptor={d}
                  value={String(selectedView.values[d.key] ?? d.defaultValue ?? '')}
                  onChange={(v) => editDraft({ values: { [d.key]: String(v) } })}
                  testIdPrefix="cue-field"
                />
              ))}
            </div>
          )}
        </section>

        <aside className="control-page-side">
          <h3 style={{ margin: 0 }}>Cue rundown</h3>
          <p className="hint">
            A cue is one prepared row of data on one of the production’s graphics — the same lower
            third can carry a different person at cue 2 and cue 7.
          </p>
          {cues.length === 0 && <p className="hint" data-testid="no-cues">No cues yet — add a graphic below, then add cues on it.</p>}
          <div className="control-entries" data-testid="cue-list">
            {cues.map((cue, i) => {
              const view = cueView(cue);
              return (
                <div
                  key={cue.id}
                  className={`control-entry ${cue.id === (selectedCue?.id ?? '') ? 'active' : ''} ${cue.id === liveCue.id ? 'live' : ''}`}
                  data-testid={`cue-${cue.id}`}
                >
                  <button className="control-entry-label" onClick={() => selectCue(cue.id)} data-testid="select-cue">
                    {cue.id === liveCue.id ? '●' : `${i + 1}.`} {view.label}
                    <span className="muted"> · {cueGraphicName(cue) ?? 'missing graphic'}</span>
                    {view.note ? <span className="muted prod-cue-note"> — {view.note}</span> : null}
                  </button>
                  <button onClick={() => { flushDraft(); setShows(moveShowCue(show.id, cue.id, -1)); }} title="Move up" disabled={i === 0}>↑</button>
                  <button onClick={() => { flushDraft(); setShows(moveShowCue(show.id, cue.id, 1)); }} title="Move down" disabled={i === cues.length - 1}>↓</button>
                  <button
                    onClick={() => {
                      flushDraft();
                      const view2 = cueView(cue);
                      const { shows: next, cueId } = addShowCue(show.id, cue.sourceId, {
                        label: `${view2.label} copy`,
                        values: view2.values,
                        note: view2.note || undefined,
                      });
                      setShows(next);
                      if (cueId) selectCue(cueId);
                    }}
                    title="Duplicate this cue"
                  >
                    ⧉
                  </button>
                  <button
                    onClick={() => { setDraft(null); setShows(removeShowCue(show.id, cue.id)); }}
                    title="Remove this cue (the graphic stays in the pool)"
                    data-testid="delete-cue"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          <h3 style={{ margin: '16px 0 0' }}>Graphics</h3>
          <p className="hint">The templates this production can air. Each graphic renders on its own layer of the output.</p>
          {show.graphics.map((g) => (
            <div className="pk-graphic" key={g.id} data-testid={`pool-${g.id}`}>
              <strong>{g.name}</strong>
              <span className="muted">{cues.filter((c) => c.sourceId === g.id).length} cue(s)</span>
              <div className="spacer" />
              <button
                onClick={() => {
                  const { shows: next, cueId } = addShowCue(show.id, g.id);
                  setShows(next);
                  if (cueId) selectCue(cueId);
                }}
                data-testid="add-cue"
              >
                ＋ Cue
              </button>
              <button
                onClick={() => { setDraft(null); setShows(removeShowGraphic(show.id, g.id)); }}
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
                const { shows: next } = addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
                setShows(next);
                setAddPick('');
              }}
              data-testid="add-graphic"
            >
              ＋ Add
            </button>
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <button
              onClick={() => void downloadShowZip(show)}
              disabled={show.graphics.length === 0}
              title="The offline package: one SPX folder per graphic + the standalone control page"
            >
              ⬇ Export package
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
