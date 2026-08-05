import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '../../app/router';
import { useTemplateStore } from '../../store/templateStore';
import {
  addGraphicToShow,
  addShowCue,
  duplicateLayers,
  graphicLayer,
  loadShows,
  MAX_PLAYOUT_LAYER,
  MIN_PLAYOUT_LAYER,
  moveShowCue,
  nextFreeLayer,
  removeShowCue,
  removeShowGraphic,
  setShowGraphicLayer,
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
import ProgramStage, { type ProgramStageHandle } from './ProgramStage';
import { composeDocument } from '../../preview/composeDocument';
import { postPreviewCmd } from '../../preview/previewProtocol';
import { isBackendConfigured } from '../../backend/config';
import { useAuthState } from '../auth/useAuthState';
import { useAuthUi } from '../auth/authUi';
import ProductionExportDialog from './ProductionExportDialog';
import { FieldRow } from '../fields/FieldControl';
import BrandLogo from '../BrandLogo';
import { copyLink } from './copyLink';
import { IconDownload, IconLink, IconTv } from '../icons';

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

/** Elapsed-time formatting for the header clock: how long this session has been in SHOW. */
function elapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** "A, B and C" — a warning an operator reads under pressure has to be a sentence. */
function nameList(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** True when the keystroke belongs to whatever the operator is typing into, not to the verbs. */
function typingInto(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return (
    el.isContentEditable ||
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT'
  );
}

/**
 * THE PLAYOUT DASHBOARD (route `#/production/<id>`) — the surface an operator runs a production
 * from. Its design contract is **docs/PLAYOUT_DASHBOARD.md**; the hosted control page and the
 * exported controller render the same one, and a change here that is not in that doc is a
 * divergence.
 *
 * The job, in one line: **choose a cue → look at it on PREVIEW → TAKE**. Selecting a cue in the
 * rundown IS the preview gesture; nothing about it touches air. Take airs what is on preview.
 *
 * Two monitors, both real: PREVIEW composes the selected cue's graphic locally and settles the
 * cue's values into it; PROGRAM is the actual output renderer (ProgramStage), fed every command
 * that reaches air — this operator's and, on a published production, everyone else's off the
 * shared log.
 *
 * Every graphic is a LAYER holding its OWN on-air cue, so several are up at once and Take never
 * clears another layer. That is why `liveCue` is a MAP and why every verb but Take addresses the
 * selected cue's layer. The layer is a NUMBER the operator types (§5), defaulting to 20.
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
  const [exportOpen, setExportOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<'output' | 'control' | null>(null);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [addPick, setAddPick] = useState('');
  const [menuCueId, setMenuCueId] = useState<string | null>(null);
  /** Which cue the editor is pointed at: the one on PREVIEW (the default — edits air on Take),
   *  or the one already ON AIR on that layer, where ✎ Update pushes edits live (§2). */
  const [editTarget, setEditTarget] = useState<'preview' | 'air'>('preview');

  // ── Live status: the renderer heartbeat + which cue is on air ON EACH LAYER. Several
  // graphics are up at once by design, so this is a map keyed by graphic name. ──
  const [liveCue, setLiveCue] = useState<LiveCueMap>({});
  const [outputSeenAt, setOutputSeenAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [openedAt] = useState(() => Date.now());
  const hostedSlug = show?.hostedSlug ?? null;

  const programRef = useRef<ProgramStageHandle>(null);
  const [wireLog, setWireLog] = useState<LogEntry[]>([]);
  const localLogId = useRef(0);

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
  /** The cue as the operator currently sees it — draft over record. */
  const cueView = useCallback(
    (cue: ShowCue): Pick<CueDraft, 'label' | 'note' | 'values'> => {
      const d = draftRef.current;
      return d && d.cueId === cue.id ? d : { label: cue.label, note: cue.note ?? '', values: cue.values };
    },
    [],
  );

  // The log names cues by the LABEL the operator wrote, and it is read from long-lived
  // callbacks, so the lookup goes through a ref rather than a dependency.
  const cuesRef = useRef(cues);
  cuesRef.current = cues;
  const cueLabel = useCallback((cueId: string) => {
    // The DRAFT wins: a verb runs in the same tick as the `flushDraft()` before it, so reading
    // the record alone logged the name the cue had BEFORE the rename just made.
    const d = draftRef.current;
    if (d && d.cueId === cueId) return d.label;
    return cuesRef.current.find((c) => c.id === cueId)?.label ?? null;
  }, []);

  // ── Live tracking: recover the marker from the log's tail, then follow. Rows also drive the
  // PROGRAM monitor, so it shows what is really on air — including another operator's take. ──
  useEffect(() => {
    if (!hostedSlug || !backendConfigured || !show) return;
    let alive = true;
    let unsubscribe: (() => void) | null = null;
    const tail = (after: number) => hostedControlTail(hostedSlug, after);
    void (async () => {
      const resolved = await controlShowBySlug(hostedSlug);
      if (!alive || !resolved) return;
      setOutputSeenAt(resolved.outputSeenAt);
      setLiveCue(resolved.liveCue);
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
          const msg = row.msg;
          if (msg.t === 'cue') setLiveCue((m) => withLiveCue(m, row.graphic, msg.cue));
          // Mirror air locally: the PROGRAM monitor follows the wire, not just this page's own
          // buttons, so a take from another operator's phone shows here too. Only RENDERER
          // commands go through — 'staged' and 'live' are bookkeeping rows the stage has no
          // meaning for (staged data has not aired; a 'live' row is a graphic REPORTING).
          else if (msg.t !== 'staged' && msg.t !== 'live') {
            programRef.current?.apply([{ graphic: row.graphic, msg }]);
          }
          const entry = describeLogRow(row, cueLabel);
          if (entry) setWireLog((l) => appendLogEntries(l, [entry]));
        },
      });
    })();
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

  // BOOT RECOVERY for the PROGRAM monitor (docs/CLOUD_PLAYOUT.md's recovery discipline). The log
  // follower only sees rows that arrive AFTER this page opened, so reopening a production that
  // has been on air showed an empty PROGRAM box beside a rundown row marked ON AIR — the surface
  // contradicting itself. Replay each live layer's last reported data. It drives nothing but the
  // local monitor, which is why this is safe here and was not in an exported package.
  const recoveredRef = useRef(false);
  useEffect(() => {
    if (recoveredRef.current) return;
    const up = Object.entries(liveCue).filter(([, cueId]) => !!cueId);
    if (up.length === 0) return;
    recoveredRef.current = true;
    for (const [graphic] of up) programRef.current?.apply([{ graphic, msg: { t: 'play' } }]);
  }, [liveCue]);

  // The header clock ticks on its own — the heartbeat poll above is every 30 s, far too slow
  // for a running timer.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── PREVIEW: the selected cue's graphic, composed ONCE per template, its values pushed as
  // settle commands (rebuilding the document per edit re-parses GSAP and reloads every asset on
  // the most common gesture a rundown has). Local by construction — it never touches the wire. ──
  const previewIframe = useRef<HTMLIFrameElement>(null);
  const previewStage = useRef<HTMLDivElement>(null);
  const poolGraphic = selectedCue ? graphicByPoolId.get(selectedCue.sourceId) ?? null : null;
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
  // The frame sizes itself in CSS from the graphic's own aspect ratio; the measurement drives
  // ONE number, the inner scale. (Sizing the frame from the measurement made the observed box
  // depend on the value it produced — a late observer left a right-sized frame around a
  // wrongly scaled graphic.)
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

  const selectCue = useCallback(
    (cueId: string) => {
      flushDraft();
      setDraft(null);
      setSelectedCueId(cueId);
      setEditTarget('preview');
    },
    [flushDraft],
  );

  // ── The verbs. ONE place a verb's commands go somewhere: the wire when published, the local
  // PROGRAM monitor always, so the two can never drift into two behaviours. ──
  const runVerb = useCallback(
    async (batches: ControlSendItem[][], label: string): Promise<boolean> => {
      if (!hostedSlug) {
        // Not published: the verbs still drive the local PROGRAM monitor, which is what makes
        // the whole surface usable (and provable) offline. Nothing leaves the machine.
        for (const batch of batches) programRef.current?.apply(batch);
        const at = new Date().toISOString();
        const entries = batches
          .flat()
          .map((item) =>
            describeLogRow({ id: (localLogId.current -= 1), graphic: item.graphic, msg: item.msg, created_at: at }, cueLabel),
          )
          .filter((e): e is LogEntry => !!e);
        setWireLog((l) => appendLogEntries(l, entries));
        return true;
      }
      try {
        for (const batch of batches) await sendHostedControlBatch(hostedSlug, batch);
        // The published path mirrors through the log follower above, so nothing is applied
        // locally here — that would double-apply every command this page sends.
        return true;
      } catch (e) {
        setNote(`${label} failed: ${(e as Error).message}`);
        return false;
      }
    },
    [hostedSlug, cueLabel],
  );

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
  const clashes = duplicateLayers(show.graphics);

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
        setLinksOpen(true);
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

  /** The layers that are up, each with the cue that put it there, front to back. */
  const liveLayers = show.graphics
    .map((g) => ({ layer: graphicLayer(g), graphic: g.name, cueId: liveCue[g.name] ?? null }))
    .filter((l): l is { layer: number; graphic: string; cueId: string } => !!l.cueId)
    .map((l) => ({ ...l, label: cues.find((c) => c.id === l.cueId)?.label ?? l.graphic }))
    .sort((a, b) => b.layer - a.layer);

  const selectedGraphic = selectedCue ? cueGraphicName(selectedCue) : null;
  /** What is on air on the SELECTED cue's layer — its own cue, another cue, or nothing. */
  const selectedLayerCueId = selectedGraphic ? liveCue[selectedGraphic] ?? null : null;
  const selectedLayerLive = !!selectedLayerCueId;
  /** The cue the editor is actually pointed at (§2): the previewed one, or the live one. */
  const airCue = selectedLayerCueId ? cues.find((c) => c.id === selectedLayerCueId) ?? null : null;
  const editingCue = editTarget === 'air' && airCue ? airCue : selectedCue;
  const editingIsLive = !!editingCue && !!selectedGraphic && liveCue[selectedGraphic] === editingCue.id;

  const editDraft = (patch: Partial<Pick<CueDraft, 'label' | 'note'>> & { values?: Record<string, string> }) => {
    if (!editingCue) return;
    setDraft((d) => {
      const base: CueDraft =
        d && d.cueId === editingCue.id
          ? d
          : { cueId: editingCue.id, label: editingCue.label, note: editingCue.note ?? '', values: { ...editingCue.values } };
      return { ...base, ...patch, values: { ...base.values, ...(patch.values ?? {}) } };
    });
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flushDraft, 300);
  };

  const takeCue = async (cue: ShowCue) => {
    const graphic = cueGraphicName(cue);
    if (!graphic) return;
    flushDraft();
    if (await runVerb([takeCueItems({ id: cue.id, graphic, values: cueView(cue).values })], 'Take')) {
      setLiveCue((m) => withLiveCue(m, graphic, cue.id));
    }
  };

  const updateLive = async () => {
    if (!editingCue || !selectedGraphic || !editingIsLive) return;
    flushDraft();
    await runVerb([[{ graphic: selectedGraphic, msg: { t: 'update', data: cueView(editingCue).values } }]], 'Update');
  };

  const nextLive = async () => {
    if (!selectedGraphic || !selectedLayerLive) return;
    await runVerb([[{ graphic: selectedGraphic, msg: { t: 'next' } }]], 'Next');
  };

  const outLive = async () => {
    if (!selectedGraphic || !selectedLayerLive) return;
    if (await runVerb([clearCueItems(selectedGraphic)], 'Out')) {
      setLiveCue((m) => withLiveCue(m, selectedGraphic, null));
    }
  };

  /** Clear the screen — the one an operator reaches for under pressure, which is why it sits
   *  apart from the others, in the header. */
  const outAll = async () => {
    if (liveLayers.length === 0) return;
    const cleared = liveLayers.map((l) => l.graphic);
    if (await runVerb(clearAllCueBatches(cleared), 'All out')) {
      setLiveCue((m) => cleared.reduce((acc, g) => withLiveCue(acc, g, null), m));
    }
  };

  const descriptors = previewTemplate ? fieldDescriptors(previewTemplate.fields) : [];
  const editingView = editingCue ? cueView(editingCue) : null;
  const canTake = !!selectedCue;

  return (
    <ProductionShell
      show={show}
      now={now}
      openedAt={openedAt}
      hostedSlug={hostedSlug}
      rendererFresh={rendererFresh}
      outputSeenAt={outputSeenAt}
      liveLayers={liveLayers}
      onHome={() => navigate({ view: 'home', section: null })}
      onBack={() => navigate({ view: 'home', section: 'productions' })}
      onAllOut={() => void outAll()}
      onExport={() => setExportOpen(true)}
      onKey={(key) => {
        if (key === 'take' && canTake && selectedCue) void takeCue(selectedCue);
        if (key === 'preview' && selectedCue) selectCue(selectedCue.id);
        if (key === 'update' && editingIsLive) void updateLive();
        if (key === 'next' && selectedLayerLive) void nextLive();
        if (key === 'out' && selectedLayerLive) void outLive();
      }}
      links={
        <ProductionLinks
          show={show}
          open={linksOpen}
          onToggle={() => setLinksOpen((o) => !o)}
          backendConfigured={backendConfigured}
          busy={busy}
          outputUrl={outputUrl}
          controlUrl={controlUrl}
          copied={copied}
          unpublishedChanges={unpublishedChanges}
          onCopy={copy}
          onPublish={() => void publish()}
          onUnpublish={() => void unpublish()}
        />
      }
    >
      <section className="pd-main">
        <div className="pd-monitors">
          <div className="pd-monitor pd-pvw">
            <h2>
              <span className="pd-dot" aria-hidden="true" />
              PREVIEW
              <span className="pd-what">{selectedCue ? cueView(selectedCue).label : 'nothing selected'}</span>
            </h2>
            <div className="pd-screen">
              {previewDoc && previewTemplate ? (
                <div
                  className="pd-frame"
                  ref={previewStage}
                  style={{ aspectRatio: `${previewTemplate.resolution.width} / ${previewTemplate.resolution.height}` }}
                  data-testid="production-preview"
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
                <div className="pd-frame pd-frame-empty" style={{ aspectRatio: '16 / 9' }}>
                  <p className="hint">Add a cue to preview it here.</p>
                </div>
              )}
            </div>
          </div>

          <div className="pd-monitor pd-pgm">
            <h2>
              <span className="pd-dot" aria-hidden="true" />
              PROGRAM — ON AIR
              <span className="pd-what">
                {liveLayers.length === 0 ? 'nothing on air' : liveLayers.map((l) => l.label).join(' · ')}
              </span>
              {liveLayers[0] && <span className="pd-layer-badge">L{liveLayers[0].layer}</span>}
            </h2>
            <div className="pd-screen">
              <div className="pd-frame pd-frame-pgm" style={{ aspectRatio: '16 / 9' }}>
                <ProgramStage ref={programRef} show={show} library={library} empty={liveLayers.length === 0} />
              </div>
            </div>
          </div>
        </div>

        {/* The verbs, with the keys that fire them. All out lives in the header — it is the
            panic control and must not sit beside the ones used every minute. */}
        <div className="pd-verbs" data-testid="production-verbs">
          <button
            className="pd-verb pd-verb-preview"
            disabled={!selectedCue}
            onClick={() => selectedCue && selectCue(selectedCue.id)}
            title="Show the selected cue on PREVIEW — nothing airs"
            data-testid="verb-preview"
          >
            → Preview <kbd>P</kbd>
          </button>
          <button
            className="pd-verb pd-verb-take"
            disabled={!canTake}
            onClick={() => selectedCue && void takeCue(selectedCue)}
            title="Air the previewed cue"
            data-testid="verb-take"
          >
            ⟳ TAKE <kbd>SPACE</kbd>
          </button>
          <button
            className="pd-verb pd-verb-update"
            disabled={!editingIsLive}
            onClick={() => void updateLive()}
            title="Send the edited values to the live layer, without replaying it"
            data-testid="verb-update"
          >
            ✎ Update <kbd>U</kbd>
          </button>
          <button
            className="pd-verb"
            disabled={!selectedLayerLive}
            onClick={() => void nextLive()}
            title={selectedGraphic ? `Advance ${selectedGraphic} to its next step` : 'Advance the layer'}
            data-testid="verb-next"
          >
            » Next <kbd>N</kbd>
          </button>
          <button
            className="pd-verb"
            disabled={!selectedLayerLive}
            onClick={() => void outLive()}
            title={selectedGraphic ? `Play ${selectedGraphic} off — the other layers stay up` : 'Play this layer off'}
            data-testid="verb-out"
          >
            ■ Out <kbd>0</kbd>
          </button>
          <span className="pd-onair-line" data-testid="live-cue-chip">
            {liveLayers.length === 0 ? (
              <span className="muted">○ nothing on air</span>
            ) : (
              <>
                on air: <span className="pd-onair">● {liveLayers.map((l) => l.label).join(' · ')}</span>
              </>
            )}
          </span>
        </div>

        {note && <p className={note.startsWith('✓') ? 'status-ok' : 'status-bad'} data-testid="production-note">{note}</p>}

        {/* The editor. It edits the PREVIEW cue by default and says so; the switch points it at
            the cue already on air on that layer, where ✎ Update pushes edits live. */}
        {editingCue && editingView && poolGraphic && (
          <div className={`pd-editor${editingIsLive ? ' live' : ''}`} data-testid="cue-editor">
            <div className="pd-editor-head">
              <span className="pd-editor-kicker">
                EDITING {editingIsLive ? 'ON-AIR CUE' : 'PREVIEW CUE'}
              </span>
              {/* The cue's own title, editable HERE: mislabelling "Guest lower third" as "Host"
                  is a live-show mistake and must be fixable without leaving the surface. */}
              <input
                className="pd-cue-title"
                value={editingView.label}
                onChange={(e) => editDraft({ label: e.target.value })}
                aria-label="Cue name"
                data-testid="cue-label"
              />
              <span className="muted pd-editor-fate">
                {editingIsLive ? 'changes push live on ✎ Update' : 'changes air on ⟳ Take'}
              </span>
              {/* Phone only (the bottom bar carries TAKE/Next/Out): Update belongs beside the
                  line that names it rather than hidden from the operator entirely. */}
              {editingIsLive && (
                <button className="pd-editor-update" onClick={() => void updateLive()} data-testid="editor-update">
                  ✎ Update
                </button>
              )}
              <div className="spacer" />
              {airCue && airCue.id !== selectedCue?.id && (
                <button
                  className="pd-editor-switch"
                  onClick={() => setEditTarget((t) => (t === 'preview' ? 'air' : 'preview'))}
                  data-testid="cue-editor-switch"
                >
                  {editTarget === 'preview' ? 'switch to on-air cue ▾' : 'switch to preview cue ▾'}
                </button>
              )}
            </div>

            <div className="pd-fields">
              {descriptors.map((d) => (
                <FieldRow
                  key={d.key}
                  descriptor={{ ...d, label: `${d.key.toUpperCase()} · ${d.label}` }}
                  value={String(editingView.values[d.key] ?? d.defaultValue ?? '')}
                  onChange={(v) => editDraft({ values: { [d.key]: String(v) } })}
                  testIdPrefix="cue-field"
                />
              ))}
              <label className="pd-field pd-field-note">
                <span>Operator note</span>
                <input
                  value={editingView.note}
                  placeholder="e.g. after the intro"
                  onChange={(e) => editDraft({ note: e.target.value })}
                  data-testid="cue-note"
                />
              </label>
              {/* The layer, beside the content — where the operator already is when they decide
                  a graphic needs its own (docs/PLAYOUT_DASHBOARD.md §5). */}
              <label className="pd-field pd-field-layer">
                <span>Playout layer</span>
                <input
                  type="number"
                  min={MIN_PLAYOUT_LAYER}
                  max={MAX_PLAYOUT_LAYER}
                  value={graphicLayer(poolGraphic)}
                  onChange={(e) => setShows(setShowGraphicLayer(show.id, poolGraphic.id, Number(e.target.value)))}
                  data-testid="graphic-layer"
                />
              </label>
            </div>

            {clashes.has(graphicLayer(poolGraphic)) && (
              <p className="status-warn pd-layer-clash" data-testid="layer-clash">
                {nameList(clashes.get(graphicLayer(poolGraphic))!.map((g) => g.name))} share layer{' '}
                {graphicLayer(poolGraphic)} — on air they replace each other.
                <button
                  onClick={() => setShows(setShowGraphicLayer(show.id, poolGraphic.id, nextFreeLayer(show.graphics)))}
                  data-testid="layer-clash-fix"
                >
                  Move to layer {nextFreeLayer(show.graphics)}
                </button>
              </p>
            )}
          </div>
        )}

        <details className="pd-activity" data-testid="action-log">
          <summary>
            Activity
            {wireLog[0] && (
              <span className="muted">
                {' '}
                {logTime(wireLog[0].at)} {wireLog[0].text}
              </span>
            )}
          </summary>
          {wireLog.length === 0 ? (
            <p className="hint" data-testid="action-log-empty">
              Nothing yet. Every Take, Update, Next and Out lands here, whoever sends it.
            </p>
          ) : (
            <ol className="prod-log-list">
              {wireLog.map((e) => (
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

      <aside className="pd-rail">
        <div className="pd-rail-head">
          <h2>Cue rundown</h2>
          <span className="muted">{cues.length}</span>
          <div className="spacer" />
          <button
            className="pd-icon"
            title="Add a cue on the selected graphic"
            disabled={!poolGraphic}
            onClick={() => {
              if (!poolGraphic) return;
              const { shows: next, cueId } = addShowCue(show.id, poolGraphic.id);
              setShows(next);
              if (cueId) selectCue(cueId);
            }}
            data-testid="add-cue"
          >
            ＋
          </button>
        </div>

        {cues.length === 0 && (
          <p className="hint" data-testid="no-cues">
            No cues yet — add a graphic below, then add cues on it.
          </p>
        )}

        <div className="pd-cues" data-testid="cue-list">
          {cues.map((cue, i) => {
            const view = cueView(cue);
            const cueGraphic = cueGraphicName(cue);
            const poolEntry = graphicByPoolId.get(cue.sourceId);
            const cueIsLive = !!cueGraphic && liveCue[cueGraphic] === cue.id;
            const isSelected = cue.id === (selectedCue?.id ?? '');
            return (
              <div
                key={cue.id}
                className={`pd-cue${isSelected ? ' selected' : ''}${cueIsLive ? ' on-air' : isSelected ? ' on-pvw' : ''}`}
                data-testid={`cue-${cue.id}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/noacg-cue', cue.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = e.dataTransfer.getData('text/noacg-cue');
                  const fromIndex = cues.findIndex((c) => c.id === from);
                  if (fromIndex < 0 || fromIndex === i) return;
                  flushDraft();
                  // moveShowCue steps by one, so walk it to the drop position — the store keeps
                  // one mutation shape and the drag stays a pure view concern.
                  let next = shows;
                  const step = fromIndex < i ? 1 : -1;
                  for (let k = fromIndex; k !== i; k += step) next = moveShowCue(show.id, from, step);
                  setShows(next);
                }}
              >
                <span className="pd-grip" aria-hidden="true">⣿</span>
                <span className="pd-cue-no">{cueIsLive ? '●' : i + 1}</span>
                <button className="pd-cue-label" onClick={() => selectCue(cue.id)} data-testid="select-cue">
                  <strong>{view.label}</strong>
                  <span className="muted">
                    {poolEntry ? `L${graphicLayer(poolEntry)} · ` : ''}
                    {view.note || cueGraphic || 'missing graphic'}
                  </span>
                </button>
                {cueIsLive ? (
                  <span className="pd-tag air">ON AIR</span>
                ) : isSelected ? (
                  <span className="pd-tag pvw">PVW</span>
                ) : null}
                <div className="pd-cue-menu-host">
                  <button
                    className="pd-icon pd-cue-more"
                    onClick={() => setMenuCueId((m) => (m === cue.id ? null : cue.id))}
                    title="More"
                    aria-label={`More actions for ${view.label}`}
                    data-testid="cue-menu"
                  >
                    ⋯
                  </button>
                  {menuCueId === cue.id && (
                    <>
                      <div className="lib-menu-backdrop" onClick={() => setMenuCueId(null)} />
                      <div className="lib-menu" role="menu">
                        <button
                          role="menuitem"
                          onClick={() => {
                            flushDraft();
                            const v = cueView(cue);
                            const { shows: next, cueId } = addShowCue(show.id, cue.sourceId, {
                              label: `${v.label} copy`,
                              values: v.values,
                              note: v.note || undefined,
                            });
                            setShows(next);
                            setMenuCueId(null);
                            if (cueId) selectCue(cueId);
                          }}
                        >
                          Duplicate
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setDraft(null);
                            setShows(removeShowCue(show.id, cue.id));
                            setMenuCueId(null);
                          }}
                          data-testid="delete-cue"
                        >
                          Remove cue
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pd-rail-foot">
          <div className="pd-layers-head">
            <h3>Layers</h3>
            <span className="muted">higher number in front</span>
          </div>
          <div className="pd-layer-chips">
            {[...show.graphics]
              .sort((a, b) => graphicLayer(b) - graphicLayer(a))
              .map((g) => (
                <span
                  key={g.id}
                  className={`pd-layer-chip${liveCue[g.name] ? ' live' : ''}${clashes.has(graphicLayer(g)) ? ' clash' : ''}`}
                  title={
                    clashes.has(graphicLayer(g))
                      ? `Layer ${graphicLayer(g)} is shared — these graphics replace each other on air`
                      : `${g.name} airs on layer ${graphicLayer(g)}`
                  }
                  data-testid={`pool-${g.id}`}
                >
                  <b>L{graphicLayer(g)}</b> {g.name}
                  {liveCue[g.name] && <i className="pd-layer-live" data-testid="layer-live" />}
                  <button
                    onClick={() => {
                      setDraft(null);
                      setShows(removeShowGraphic(show.id, g.id));
                    }}
                    title={`Remove ${g.name} and its cues from the production`}
                    aria-label={`Remove ${g.name}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
          </div>
          <div className="row">
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
          <button
            className="pd-new-graphic"
            onClick={() => {
              useTemplateStore.setState({ pendingProductionId: show.id });
              navigate({ view: 'new' });
            }}
            title="Create a new graphic for this production — the wizard uses its look and adds it here"
            data-testid="production-new-graphic"
          >
            ＋ New graphic for this production…
          </button>
        </div>
      </aside>
      {exportOpen && <ProductionExportDialog show={show} onClose={() => setExportOpen(false)} />}
    </ProductionShell>
  );
}

/** The shell: header + the two-column body, plus the keyboard verbs. Split out so the page body
 *  above reads as the surface it is rather than as chrome wrapped around a surface. */
function ProductionShell({
  show,
  now,
  openedAt,
  hostedSlug,
  rendererFresh,
  outputSeenAt,
  liveLayers,
  onHome,
  onBack,
  onAllOut,
  onExport,
  onKey,
  links,
  children,
}: {
  show: Show;
  now: number;
  openedAt: number;
  hostedSlug: string | null;
  rendererFresh: boolean;
  outputSeenAt: string | null;
  liveLayers: { layer: number }[];
  onHome: () => void;
  onBack: () => void;
  onAllOut: () => void;
  onExport: () => void;
  onKey: (key: 'preview' | 'take' | 'update' | 'next' | 'out') => void;
  links: React.ReactNode;
  children: React.ReactNode;
}) {
  // The verb keys (docs/PLAYOUT_DASHBOARD.md §2). Never while typing — the cue title and the
  // fields live on this same surface, and SPACE inside a name must stay a space.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typingInto(e.target)) return;
      const map: Record<string, Parameters<typeof onKey>[0]> = {
        p: 'preview',
        ' ': 'take',
        u: 'update',
        n: 'next',
        '0': 'out',
      };
      const verb = map[e.key.toLowerCase()];
      if (!verb) return;
      e.preventDefault();
      onKey(verb);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKey]);

  return (
    <div className="app playout-dashboard" data-testid="production-page">
      <header className="pd-header">
        <button className="brand brand-home" onClick={onHome} title="Home">
          <BrandLogo size={22} />
        </button>
        <button className="pd-back" onClick={onBack} data-testid="production-back">
          ←
        </button>
        <h1><IconTv /> {show.name}</h1>
        <span className={`pd-mode pd-mode-${hostedSlug ? 'show' : 'idle'}`} data-testid="production-mode">
          {hostedSlug ? '● SHOW' : '○ NOT PUBLISHED'}
        </span>
        <span className="pd-clock mono">{elapsed(now - openedAt)}</span>
        <div className="spacer" />
        {/* The renderer heartbeat — only once published. Unpublished, the mode chip already
            says so and a second "not published" beside it is noise, not status. */}
        {hostedSlug && (
          <span className={`pd-status${rendererFresh ? ' ok' : ''}`} data-testid="renderer-status">
            {rendererFresh ? '● output connected' : outputSeenAt ? '○ output not seen lately' : '○ output never connected'}
          </span>
        )}
        {links}
        <button onClick={onExport} title="Export this production as a package" data-testid="export-production">
          <IconDownload /> Export…
        </button>
        <button
          className="pd-allout"
          disabled={liveLayers.length === 0}
          onClick={onAllOut}
          title="Play every live layer off — clear the frame"
          data-testid="verb-out-all"
        >
          ■ All out
        </button>
      </header>
      <main className="pd-body">{children}</main>
    </div>
  );
}

/** Publishing and the two capability links (docs/PLAYOUT_DASHBOARD.md §7) — the dashboard's
 *  other job, one click from the operator rather than a page they must navigate away to. */
function ProductionLinks({
  show,
  open,
  onToggle,
  backendConfigured,
  busy,
  outputUrl,
  controlUrl,
  copied,
  unpublishedChanges,
  onCopy,
  onPublish,
  onUnpublish,
}: {
  show: Show;
  open: boolean;
  onToggle: () => void;
  backendConfigured: boolean;
  busy: boolean;
  outputUrl: string | null;
  controlUrl: string | null;
  copied: 'output' | 'control' | null;
  unpublishedChanges: boolean;
  onCopy: (kind: 'output' | 'control', text: string) => void;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  if (!show.hostedSlug) {
    return (
      <button
        className="primary"
        onClick={onPublish}
        disabled={busy || !backendConfigured}
        title={
          backendConfigured
            ? 'Publish: one persistent output URL for CasparCG/OBS/vMix and one control page for operating'
            : 'Publishing needs the cloud backend — this build runs offline'
        }
        data-testid="production-publish"
      >
        ▶ Start production
      </button>
    );
  }
  return (
    <div className="pd-links-host">
      <button onClick={onToggle} aria-expanded={open} data-testid="production-links-toggle">
        <IconLink /> Links{unpublishedChanges ? ' •' : ''}
      </button>
      {open && (
        <>
          <div className="lib-menu-backdrop" onClick={onToggle} />
          <div className="pd-links" data-testid="production-links">
            <div className="prod-link-row">
              <span className="mono muted">Output URL</span>
              <code className="prod-url">{outputUrl}</code>
              <button onClick={() => outputUrl && onCopy('output', outputUrl)} data-testid="copy-output-url">
                {copied === 'output' ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <p className="hint">
              Add this once as a browser source (OBS / vMix) or a CasparCG HTML template. It keeps working
              across re-publishes; graphics and cues update in place.
            </p>
            <div className="prod-link-row">
              <span className="mono muted">Control page</span>
              <code className="prod-url">{controlUrl}</code>
              <button onClick={() => controlUrl && onCopy('control', controlUrl)} data-testid="copy-control-url">
                {copied === 'control' ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <p className="hint">
              Operate from a phone or tablet, no account needed. Keep the link private: holding it is the
              permission to operate.
            </p>
            {unpublishedChanges && (
              <p className="status-warn" data-testid="publish-freshness">
                The production changed after the last publish — the output and control pages run the older
                snapshot until you publish changes.
              </p>
            )}
            <div className="row">
              <button className="primary" onClick={onPublish} disabled={busy} data-testid="production-republish">
                ⟳ Publish changes
              </button>
              <button onClick={onUnpublish} disabled={busy}>Unpublish</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
