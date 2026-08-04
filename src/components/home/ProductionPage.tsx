import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '../../app/router';
import {
  addGraphicToShow,
  addShowCue,
  loadShows,
  moveShowCue,
  moveShowGraphic,
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
  clearAllCueBatches,
  clearCueItems,
  controlOutputSeenAt,
  controlPageUrl,
  controlShowBySlug,
  followControlLog,
  hostedControlTail,
  outputPageUrl,
  publishControlShow,
  sendHostedControlBatch,
  takeCueItems,
  unpublishControlShow,
  withLiveCue,
  type ControlSendItem,
  type LiveCueMap,
} from '../../control/hostedControl';
import { appendLogEntries, describeLogRow, logTime, type LogEntry } from '../../control/eventLog';
import RehearsalStage, { type RehearsalStageHandle } from './RehearsalStage';
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

/** How far behind the log head the action log seeds its history. Global ids mean this is a
 *  ceiling on rows READ, not on rows shown — a busy instance yields fewer of this show's. */
const LOG_HISTORY_SPAN = 400;

/**
 * The PRODUCTION page (route `#/production/<id>`, docs/CLOUD_PLAYOUT.md §4-5): one production's
 * cockpit — the cue rundown (add / edit / reorder / notes), the LAYER STACK (the graphic pool,
 * listed front to back and reorderable), the publish controls with both capability links
 * (control page + browser output), the renderer heartbeat, a LOCAL preview of the selected cue,
 * and the operator verbs (Take / Update / Next / Out / All out).
 *
 * Every graphic is a layer holding its OWN on-air cue, so several are up at once and Take never
 * clears another layer. That is why `liveCue` is a MAP and why every verb but Take addresses
 * the selected cue's layer: with three graphics on air there is no "the live graphic" left for
 * a button to mean.
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

  // ── Live status (published productions): the renderer heartbeat + which cue is on air ON
  // EACH LAYER. Several graphics are up at once by design, so this is a map keyed by graphic
  // name, never a single "the live cue" (docs/CLOUD_PLAYOUT.md §4). ──
  const [liveCue, setLiveCue] = useState<LiveCueMap>({});
  const [outputSeenAt, setOutputSeenAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const hostedSlug = show?.hostedSlug ?? null;

  // ── REHEARSE vs SHOW (docs/CLOUD_PLAYOUT.md §4a). Rehearsal is this operator's own choice,
  // never the production's: it only ever takes the wire AWAY, so a rehearsing operator cannot
  // reach anybody else's air, and the mistake that matters — believing you were rehearsing
  // while you were live — is the one it cannot cause.
  //
  // It is always OPT-IN, including before publishing. Making an unpublished production rehearse
  // by default looked tidy and was wrong: the cue preview is how a rundown gets BUILT, and
  // swapping it for a rehearsal output took that away from everyone still authoring. ──
  const [rehearsing, setRehearsing] = useState(false);
  const rehearsalRef = useRef<RehearsalStageHandle>(null);
  /** What is on air IN THE REHEARSAL — a second live map, because a rehearsal must never be
   *  able to make the production page report something about the real output. */
  const [rehearsalCue, setRehearsalCue] = useState<LiveCueMap>({});

  // ── The operator ACTION LOG (docs/CLOUD_PLAYOUT.md §4b). Two sources, one vocabulary: the
  // shared command log in Show mode, this page's own verbs in Rehearse. Rehearsal entries carry
  // NEGATIVE ids so they can never collide with a real row's id in the dedupe. ──
  const [wireLog, setWireLog] = useState<LogEntry[]>([]);
  const [rehearsalLog, setRehearsalLog] = useState<LogEntry[]>([]);
  const localLogId = useRef(0);

  // Entering or leaving rehearsal builds a fresh stage with nothing up, so the map and the
  // rehearsal's own log both start empty either way. Without this, a previous rehearsal's
  // leftovers would still read as live, and its actions as this one's.
  useEffect(() => {
    setRehearsalCue({});
    setRehearsalLog([]);
  }, [rehearsing]);

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

  // The log names cues by the LABEL the operator wrote, and it is read from long-lived
  // callbacks (a Realtime subscription that must not be torn down every time a cue is renamed),
  // so the lookup goes through a ref rather than a dependency.
  const cuesRef = useRef(cues);
  cuesRef.current = cues;
  const cueLabel = useCallback((cueId: string) => {
    // The DRAFT wins, exactly as it does for the values a Take sends. A verb runs in the same
    // tick as the `flushDraft()` before it, so the record behind `cuesRef` has not re-rendered
    // yet — reading it alone logged the name the cue had BEFORE the rename the operator just
    // made, which is the one moment the log is most likely to be read.
    const d = draftRef.current;
    if (d && d.cueId === cueId) return d.label;
    return cuesRef.current.find((c) => c.id === cueId)?.label ?? null;
  }, []);

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
      // The on-air cues come off the ROW (0031's snapshot, per-layer since 0034) — no
      // log-window scan to miss.
      setLiveCue(resolved.liveCue);
      // Seed the action log with what already happened. `followControlLog` starts at the log
      // HEAD by design (it is a recovery mechanism, not a history reader), so without this the
      // panel would open empty on a production that has been on air all afternoon. One tail
      // read behind the head is enough: the RPC filters by slug, so a window measured in
      // GLOBAL ids simply returns fewer rows on a busy instance rather than the wrong ones.
      const history = await hostedControlTail(hostedSlug, Math.max(0, resolved.lastEventId - LOG_HISTORY_SPAN));
      if (!alive) return;
      setWireLog((l) =>
        appendLogEntries(
          l,
          history.map((r) => describeLogRow(r, cueLabel)).filter((e): e is LogEntry => !!e),
        ),
      );
      unsubscribe = await followControlLog({
        showId: show.id,
        from: resolved.lastEventId,
        tail,
        onRow: (row) => {
          // A cue row names its own graphic, so it only ever speaks for that ONE layer.
          const msg = row.msg;
          if (msg.t === 'cue') setLiveCue((m) => withLiveCue(m, row.graphic, msg.cue));
          const entry = describeLogRow(row, cueLabel);
          if (entry) setWireLog((l) => appendLogEntries(l, [entry]));
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
      setLiveCue({});
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

  /**
   * THE ONE PLACE a verb's commands go somewhere. Both destinations take the very same
   * `ControlSendItem` batches (control/hostedControl.ts builds them), so rehearsing and airing
   * cannot drift into two behaviours; only the destination differs. Returns whether it ran, so
   * a verb knows whether to move its live map.
   */
  const runVerb = async (batches: ControlSendItem[][], label: string): Promise<boolean> => {
    if (rehearsing) {
      for (const batch of batches) rehearsalRef.current?.apply(batch);
      // A rehearsal writes no log row, so it keeps its own — same rows through the same
      // describeLogRow, which is what lets the panel work identically in both modes (and is
      // the only reason any of this is provable offline).
      const now = new Date().toISOString();
      const entries = batches
        .flat()
        .map((item) => describeLogRow({ id: (localLogId.current -= 1), graphic: item.graphic, msg: item.msg, created_at: now }, cueLabel))
        .filter((e): e is LogEntry => !!e);
      setRehearsalLog((l) => appendLogEntries(l, entries));
      return true;
    }
    const s = requirePublished();
    if (!s) return false;
    try {
      for (const batch of batches) await sendHostedControlBatch(s, batch);
      return true;
    } catch (e) {
      setNote(`${label} failed: ${(e as Error).message}`);
      return false;
    }
  };

  /** The live map the surface is currently about — the rehearsal's, or the real output's. */
  const liveNow = rehearsing ? rehearsalCue : liveCue;
  const setLiveNow = rehearsing ? setRehearsalCue : setLiveCue;
  /** A rehearsal needs no publish; airing does. This is the only thing publishing gates now —
   *  before rehearsal the verbs were simply dead on an unpublished production. */
  const canRunVerbs = rehearsing || !!show.hostedSlug;
  /** The log the surface is currently about, for the same reason `liveNow` exists. */
  const logNow = rehearsing ? rehearsalLog : wireLog;

  // Every verb below Take addresses ONE LAYER — the layer of the SELECTED cue. That is the
  // whole difference multi-layer makes to the operator: there is no longer a single "the live
  // graphic" to act on, so the surface has to say which one it means, and the selection is
  // already the thing the operator is pointing at.
  const takeCue = async (cue: ShowCue) => {
    const graphic = cueGraphicName(cue);
    if (!graphic) return;
    flushDraft();
    if (await runVerb([takeCueItems({ id: cue.id, graphic, values: cueView(cue).values })], 'Take')) {
      setLiveNow((m) => withLiveCue(m, graphic, cue.id));
    }
  };

  /** The layers that are up, in stack order, each with the cue that put it there. A pool graphic
   *  is a layer; a live_cue key naming a graphic the pool no longer has is simply not shown. */
  const liveLayers = show.graphics
    .map((g, i) => ({ layer: i + 1, graphic: g.name, cueId: liveNow[g.name] ?? null }))
    .filter((l): l is { layer: number; graphic: string; cueId: string } => !!l.cueId)
    .map((l) => ({ ...l, label: cues.find((c) => c.id === l.cueId)?.label ?? l.graphic }));

  const selectedGraphic = selectedCue ? cueGraphicName(selectedCue) : null;
  /** What is on air on the SELECTED cue's layer — its own cue, another cue, or nothing. */
  const selectedLayerCueId = selectedGraphic ? liveNow[selectedGraphic] ?? null : null;
  const selectedLayerLive = !!selectedLayerCueId;
  // Update pushes the SELECTED cue's values, so it may only run when that cue is the one on
  // air: pushing a different cue's data onto a live layer would be a take nobody asked for.
  const selectedIsLive = !!selectedCue && selectedLayerCueId === selectedCue.id;

  const updateLive = async () => {
    if (!selectedCue || !selectedGraphic || !selectedIsLive) return;
    flushDraft();
    await runVerb([[{ graphic: selectedGraphic, msg: { t: 'update', data: cueView(selectedCue).values } }]], 'Update');
  };

  const nextLive = async () => {
    if (!selectedGraphic || !selectedLayerLive) return;
    await runVerb([[{ graphic: selectedGraphic, msg: { t: 'next' } }]], 'Next');
  };

  const outLive = async () => {
    if (!selectedGraphic || !selectedLayerLive) return;
    if (await runVerb([clearCueItems(selectedGraphic)], 'Out')) {
      setLiveNow((m) => withLiveCue(m, selectedGraphic, null));
    }
  };

  /** Clear the screen. With per-layer Out there is no single verb that empties the frame any
   *  more, and "get everything off" is the one an operator reaches for under pressure. */
  const outAll = async () => {
    if (liveLayers.length === 0) return;
    const cleared = liveLayers.map((l) => l.graphic);
    if (await runVerb(clearAllCueBatches(cleared), 'All out')) {
      // Clear exactly what was sent, not the whole map: a key naming a graphic the pool no
      // longer has was never in `liveLayers`, so nothing cleared it on the wire either.
      setLiveNow((m) => cleared.reduce((acc, g) => withLiveCue(acc, g, null), m));
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

          {/* The mode strip. It is the loudest thing on the page on purpose: the one mistake
              this feature could introduce is believing you were rehearsing while you were live,
              so the mode says which it is in the on-air colour and never hides. Three states,
              because "not rehearsing" and "airing" are not the same thing on a production that
              was never published — claiming SHOW there would be a lie about dead buttons. */}
          <div className={`prod-mode prod-mode-${rehearsing ? 'rehearse' : hostedSlug ? 'show' : 'idle'}`} data-testid="production-mode">
            <strong>{rehearsing ? '● REHEARSE' : hostedSlug ? '● SHOW' : '○ NOT PUBLISHED'}</strong>
            <span className="muted">
              {rehearsing
                ? 'The verbs drive the rehearsal below. Nothing reaches the output URL.'
                : hostedSlug
                  ? 'The verbs air on the output URL and every operator’s page.'
                  : 'Nothing to air yet. Rehearse to practise the rundown, or Start production to go live.'}
            </span>
            <div className="spacer" />
            <button
              onClick={() => setRehearsing((r) => !r)}
              data-testid="toggle-rehearsal"
              title={
                rehearsing
                  ? hostedSlug
                    ? 'Go live: the verbs write the shared command log again'
                    : 'Back to authoring: the cue preview returns'
                  : 'Practise the rundown against a local copy of the output — nothing airs'
              }
            >
              {rehearsing ? (hostedSlug ? '▶ Go live' : '✎ Back to authoring') : '⟲ Rehearse'}
            </button>
          </div>

          {/* Preview — LOCAL, never the wire. In rehearsal the whole output stands here
              instead of one cue, because layering and stepping are what you rehearse. */}
          <div className="prod-preview" data-testid="production-preview">
            {rehearsing ? (
              <>
                <RehearsalStage ref={rehearsalRef} show={show} library={library} empty={liveLayers.length === 0} />
                <p className="hint" style={{ marginTop: 4 }}>
                  A local copy of the production’s own output, driven by the verbs below.
                </p>
              </>
            ) : previewDoc && previewTemplate ? (
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
            {!rehearsing && (
              <p className="hint" style={{ marginTop: 4 }}>
                Preview only — nothing changes on air until <strong>Take</strong>.
              </p>
            )}
          </div>

          {/* The verbs. */}
          <div className="prod-verbs row" data-testid="production-verbs">
            <button
              className="primary"
              disabled={!selectedCue || !canRunVerbs}
              onClick={() => selectedCue && void takeCue(selectedCue)}
              data-testid="verb-take"
              title="Air the selected cue"
            >
              ⟳ Take
            </button>
            <button
              disabled={!selectedIsLive || !canRunVerbs}
              onClick={() => void updateLive()}
              data-testid="verb-update"
              title="Send this cue's edited values to its layer, without replaying it"
            >
              ✎ Update
            </button>
            <button
              disabled={!selectedLayerLive || !canRunVerbs}
              onClick={() => void nextLive()}
              data-testid="verb-next"
              title={selectedGraphic ? `Advance ${selectedGraphic} to its next step` : 'Advance the layer to its next step'}
            >
              » Next
            </button>
            <button
              disabled={!selectedLayerLive || !canRunVerbs}
              onClick={() => void outLive()}
              data-testid="verb-out"
              title={selectedGraphic ? `Play ${selectedGraphic} off — the other layers stay up` : 'Play this layer off'}
            >
              ■ Out
            </button>
            <button
              disabled={liveLayers.length === 0 || !canRunVerbs}
              onClick={() => void outAll()}
              data-testid="verb-out-all"
              title="Play every live layer off — clear the frame"
            >
              ■■ All out
            </button>
            <div className="spacer" />
            {/* One chip per LIVE LAYER, in stack order: with several graphics up at once, a
                single "● LIVE: …" line can only ever name one of them. */}
            <span className="muted" data-testid="live-cue-chip">
              {liveLayers.length === 0
                ? '○ nothing on air'
                : liveLayers.map((l) => `● L${l.layer} ${l.label}`).join(' · ')}
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

          {/* The action log (docs/CLOUD_PLAYOUT.md §4b) — what this production was ASKED to do,
              newest first. Collapsed by default: it answers a question you only ask when
              something looks wrong, and an always-open feed under the cue editor would push the
              fields off a laptop screen. */}
          <details className="panel-section prod-log" data-testid="action-log">
            <summary>
              Activity <span className="muted">{rehearsing ? '· this rehearsal' : '· this production'}</span>
            </summary>
            {logNow.length === 0 ? (
              <p className="hint" data-testid="action-log-empty">
                {rehearsing
                  ? 'Nothing rehearsed yet — the verbs above will show up here.'
                  : backendConfigured
                    ? 'Nothing yet. Every Take, Update, Next and Out lands here, whoever sends it.'
                    : 'The shared log needs the cloud backend — this build runs offline. Rehearse to see the verbs logged locally.'}
              </p>
            ) : (
              <ol className="prod-log-list">
                {logNow.map((e) => (
                  <li key={e.id} className={`prod-log-row prod-log-${e.kind}`} data-testid="action-log-row">
                    <span className="prod-log-time">{logTime(e.at)}</span>
                    <span className="prod-log-text">{e.text}</span>
                    <span className="muted prod-log-graphic">{e.graphic}</span>
                  </li>
                ))}
              </ol>
            )}
          </details>
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
              // A cue is live when it is the cue on air on ITS OWN layer — several rows can
              // carry the mark at once, one per graphic that is up.
              const cueGraphic = cueGraphicName(cue);
              const cueIsLive = !!cueGraphic && liveNow[cueGraphic] === cue.id;
              return (
                <div
                  key={cue.id}
                  className={`control-entry ${cue.id === (selectedCue?.id ?? '') ? 'active' : ''} ${cueIsLive ? 'live' : ''}`}
                  data-testid={`cue-${cue.id}`}
                >
                  <button className="control-entry-label" onClick={() => selectCue(cue.id)} data-testid="select-cue">
                    {cueIsLive ? '●' : `${i + 1}.`} {view.label}
                    <span className="muted"> · {cueGraphic ?? 'missing graphic'}</span>
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

          <h3 style={{ margin: '16px 0 0' }}>Layers</h3>
          <p className="hint">
            Each graphic is its own layer and holds its own cue, so several are on air together —
            taking a cue on one leaves the others alone. Listed <strong>front to back</strong>:
            the top row paints over everything below it.
          </p>
          {/* Front-to-back, the layer-panel convention: the stored pool is in PAINT order
              (index 0 furthest back, which is what the published payload and the output stage
              read), so the list reverses it and ↑/↓ move toward the front and the back. */}
          {[...show.graphics].reverse().map((g, rowIndex) => {
            const layer = show.graphics.length - rowIndex;
            const live = !!liveNow[g.name];
            return (
              <div className={`pk-graphic prod-layer${live ? ' live' : ''}`} key={g.id} data-testid={`pool-${g.id}`}>
                <span className="prod-layer-no" title={`Layer ${layer} of ${show.graphics.length}`}>L{layer}</span>
                <strong className="prod-layer-name" title={g.name}>{g.name}</strong>
                <span className="muted prod-layer-count">
                  {cues.filter((c) => c.sourceId === g.id).length === 1
                    ? '1 cue'
                    : `${cues.filter((c) => c.sourceId === g.id).length} cues`}
                </span>
                {live && <span className="prod-layer-live" data-testid="layer-live">● on air</span>}
                {/* The flexbox line break: nothing on desktop, and on a phone the one element
                    that puts the controls on their own row under the layer's identity. */}
                <span className="prod-layer-break" aria-hidden="true" />
                <button
                  onClick={() => { flushDraft(); setShows(moveShowGraphic(show.id, g.id, 1)); }}
                  title="Bring this layer forward — it paints over the one above it"
                  data-testid="layer-forward"
                  disabled={rowIndex === 0}
                >
                  ↑
                </button>
                <button
                  onClick={() => { flushDraft(); setShows(moveShowGraphic(show.id, g.id, -1)); }}
                  title="Send this layer back — the one below it paints over it"
                  data-testid="layer-back"
                  disabled={rowIndex === show.graphics.length - 1}
                >
                  ↓
                </button>
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
            );
          })}
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
