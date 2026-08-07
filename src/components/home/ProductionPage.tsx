import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, type ProductionSub } from '../../app/router';
import { useTemplateStore } from '../../store/templateStore';
import {
  addGraphicToShow,
  addShowCue,
  datasetValuesForFields,
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
  setShowAudienceSlugs,
  setShowHostedSlug,
  setShowOutputSlug,
  updateShowCue,
  type Show,
  type ShowCue,
} from '../../model/shows';
import ProductionDataWorkspace from './ProductionDataWorkspace';
import ProductionAudienceWorkspace from './ProductionAudienceWorkspace';
import { loadGraphics, templateForSavedGraphic } from '../../model/library';
import {
  eventButtons,
  eventLegality,
  fieldDescriptors,
  isEventLegal,
  machineStateGroups,
  type ControlButton,
} from '../../control/controlModel';
import {
  clearAllCueBatches,
  clearCueItems,
  controlOutputSeenAt,
  controlPageUrl,
  controlShowBySlug,
  followControlLog,
  hostedControlTail,
  joinPageUrl,
  outputPageUrl,
  publishControlShow,
  sendHostedControlBatch,
  takeCueItems,
  unpublishControlShow,
  withLiveCue,
  type ControlSendItem,
  type LiveCueMap,
  type ResolvedControlShow,
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
import { isImageAsset } from '../../assets/assetUtils';
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
export default function ProductionPage({ id, sub }: { id: string; sub?: ProductionSub | null }) {
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
  const [copied, setCopied] = useState<'output' | 'control' | 'join' | null>(null);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [addPick, setAddPick] = useState('');
  const [menuCueId, setMenuCueId] = useState<string | null>(null);
  /** Which cue the editor is pointed at: the one on PREVIEW (the default — edits air on Take),
   *  or the one already ON AIR on that layer, where ✎ Update pushes edits live (§2). */
  const [editTarget, setEditTarget] = useState<'preview' | 'air'>('preview');
  /** Per cue, the last data row loaded into it (`datasetId:rowId`) — what ↷ Next advances from. */
  const [lastLoaded, setLastLoaded] = useState<Record<string, string>>({});
  /** Which side of a two-team board the next data-row load fills. */
  const [loadSide, setLoadSide] = useState<'A' | 'B'>('A');

  // ── Live status: the renderer heartbeat + which cue is on air ON EACH LAYER. Several
  // graphics are up at once by design, so this is a map keyed by graphic name. ──
  const [liveCue, setLiveCue] = useState<LiveCueMap>({});
  /** Each graphic's last reported MACHINE state, keyed by pool name. Two sources converge on
   *  the same answer: the local PROGRAM monitor's own state replies (fresh — the stage posts
   *  one after every applied command), and the wire's {t:'live'} report rows, which also cover
   *  what happened before this page opened. The event buttons grey against this. */
  const [machineStates, setMachineStates] = useState<Record<string, { groups: Record<string, string> } | null>>({});
  const noteMachineState = useCallback(
    (graphic: string, state: { groups: Record<string, string> } | null) => {
      setMachineStates((m) => {
        if (JSON.stringify(m[graphic] ?? null) === JSON.stringify(state)) return m;
        return { ...m, [graphic]: state };
      });
    },
    [],
  );
  const [outputSeenAt, setOutputSeenAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [openedAt] = useState(() => Date.now());
  const hostedSlug = show?.hostedSlug ?? null;

  const programRef = useRef<ProgramStageHandle>(null);
  /**
   * What each graphic was last SENT locally — the input to rebuilding the PROGRAM monitor after
   * it is unmounted (the Data-workspace round trip). The wire report is a snapshot taken when
   * this page resolved the published show and never moves again, and an unpublished production
   * has no report at all, so after the first take this is the only current answer to "what is
   * on air". Declared up here because the log follower below writes to it.
   *
   * It is STATE as well as a ref, because the same fact answers a second question: whether the
   * values in front of the operator have actually been SENT. An on-air cue whose draft has
   * moved past what air is showing has to say so rather than wait to be noticed.
   */
  const [airedData, setAiredData] = useState<Record<string, Record<string, string>>>({});
  const airedRef = useRef(airedData);
  airedRef.current = airedData;
  const rememberAired = useCallback((items: ControlSendItem[]) => {
    setAiredData((prev) => {
      let next = prev;
      for (const item of items) {
        if (item.msg.t === 'update') next = { ...next, [item.graphic]: item.msg.data };
        else if (item.msg.t === 'stop' && next[item.graphic]) {
          // Taken off air: forget it, or the next rebuild would restore a graphic nobody is
          // running any more.
          next = { ...next };
          delete next[item.graphic];
        }
      }
      return next;
    });
  }, []);
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
      // The boot-recovery effect below replays each live layer's last REPORT into the local
      // monitor, so the reports must be in hand before liveCue commits and fires it.
      liveReportsRef.current = resolved.live;
      setLiveCue(resolved.liveCue);
      // Seed each graphic's machine state from its last published report — the page may be
      // opening onto a production another operator drove mid-sequence.
      for (const [graphic, report] of Object.entries(resolved.live)) {
        if (report && typeof report === 'object' && 'state' in report) {
          noteMachineState(graphic, (report as { state?: { groups: Record<string, string> } | null }).state ?? null);
        }
      }
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
          // A 'live' row is the renderer REPORTING what it applied — machine state included,
          // which is what keeps the action buttons' greying honest about air.
          else if (msg.t === 'live') noteMachineState(row.graphic, msg.state ?? null);
          // Mirror air locally: the PROGRAM monitor follows the wire, not just this page's own
          // buttons, so a take from another operator's phone shows here too. Only RENDERER
          // commands go through — 'staged' and 'live' are bookkeeping rows the stage has no
          // meaning for (staged data has not aired; a 'live' row is a graphic REPORTING).
          else if (msg.t !== 'staged') {
            rememberAired([{ graphic: row.graphic, msg }]);
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

  // RECOVERY for the PROGRAM monitor (docs/CLOUD_PLAYOUT.md's recovery discipline). The log
  // follower only sees rows that arrive AFTER this page opened, so reopening a production that
  // has been on air showed an empty PROGRAM box beside a rundown row marked ON AIR — the surface
  // contradicting itself. Replay each live layer with the full recipe — data, snap to the
  // reported state, data again — never a bare play(): the bare replay left the monitor at the
  // entrance while air sat mid-sequence, and its state reply then OVERWROTE the wire-seeded
  // truth, so the chip claimed the entrance state and greyed the one legal recovery event.
  // (The trailing data write is what lets call-painted looks repaint — the G9 rule.)
  // It drives nothing but the local monitor, which is why this is safe here and was not in an
  // exported package.
  //
  // THIS IS NOT ONLY A BOOT CONCERN, which is what the acceptance pass of 2026-08-06 found:
  // switching to the Data workspace unmounts the monitors, and coming back builds a BLANK
  // stage — so the graphic disappeared from PROGRAM while it was still live on CasparCG. It
  // is the same shape as the Phase 2 defect on this exact round trip (the preview came back
  // unscaled because the measurement was keyed on the unchanged document): the state lives
  // outside the remounted thing and nothing re-established it. So the replay is keyed on the
  // STAGE being fresh, not on the page being new.
  const liveReportsRef = useRef<ResolvedControlShow['live'] | null>(null);
  // Read through refs: the replay must use the FRESHEST answer at the moment a stage comes up,
  // and it must not re-run every time a take changes either of them.
  const liveCueRef = useRef(liveCue);
  liveCueRef.current = liveCue;
  const machineStatesRef = useRef(machineStates);
  machineStatesRef.current = machineStates;
  const restoreProgram = useCallback(() => {
    for (const [graphic, cueId] of Object.entries(liveCueRef.current)) {
      if (!cueId) continue;
      const report = (liveReportsRef.current?.[graphic] ?? null) as { data?: Record<string, string> } | null;
      const data = airedRef.current[graphic] ?? report?.data;
      const groups = machineStatesRef.current[graphic]?.groups;
      const items: ControlSendItem[] = [];
      if (data) items.push({ graphic, msg: { t: 'update', data } });
      if (groups) items.push({ graphic, msg: { t: 'snap', snap: groups } });
      else items.push({ graphic, msg: { t: 'play' } });
      if (data) items.push({ graphic, msg: { t: 'update', data } });
      programRef.current?.apply(items);
    }
  }, []);
  // The boot half: the wire resolve lands after the stage is already up, so the first time any
  // layer is known to be live there is nothing to have signalled.
  const recoveredRef = useRef(false);
  useEffect(() => {
    if (recoveredRef.current) return;
    if (!Object.values(liveCue).some(Boolean)) return;
    recoveredRef.current = true;
    restoreProgram();
  }, [liveCue, restoreProgram]);

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
  // The machine's side of the selected graphic (docs/CONTROL_LAYER.md): its ⚡ buttons, the
  // structural guard they grey by, and its states for the recovery snap picker. All parsed
  // from the same live template the PREVIEW composes, so the panel can never describe a
  // different graphic than the monitor shows. Empty on a template with no explicit machine.
  const events = useMemo(() => (previewTemplate ? eventButtons(previewTemplate.js) : []), [previewTemplate]);
  const legality = useMemo(() => (previewTemplate ? eventLegality(previewTemplate.js) : {}), [previewTemplate]);
  const stateGroups = useMemo(() => (previewTemplate ? machineStateGroups(previewTemplate.js) : []), [previewTemplate]);
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
  // wrongly scaled graphic.) Keyed on the NODE, not the document: the Data tab unmounts this
  // subtree, and an effect keyed on the unchanged previewDoc never measured the remounted
  // frame — the observer's last tick on the detaching node had left stageW at 0, so the
  // returning preview rendered a 1920px document unscaled and showed its empty corner.
  const [stageW, setStageW] = useState(0);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!stageEl) return;
    const measure = () => setStageW(stageEl.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stageEl);
    return () => ro.disconnect();
  }, [stageEl]);
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
        for (const batch of batches) {
          rememberAired(batch);
          programRef.current?.apply(batch);
        }
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
    [hostedSlug, cueLabel, rememberAired],
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
  /** The PUBLIC audience URL. Only a production published against a server carrying migration
   *  0035 has one, so it stays absent rather than showing a link that would not resolve. */
  const joinUrl = show.joinSlug ? joinPageUrl(show.joinSlug) : null;
  const controlUrl = show.hostedSlug ? controlPageUrl(show.hostedSlug) : null;
  const unpublishedChanges = !!show.publishedAt && show.updatedAt > show.publishedAt;
  const rendererFresh = outputSeenAt ? now - Date.parse(outputSeenAt) < 90_000 : false;
  const clashes = duplicateLayers(show.graphics);

  const copy = (kind: 'output' | 'control' | 'join', text: string) => {
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
        // The audience capabilities are minted by the database and read back, never chosen
        // here. A server without migration 0035 hands back nulls, which clears them — the
        // production simply has no join link, and nothing else about publishing changes.
        setShowAudienceSlugs(show.id, {
          joinSlug: published.joinSlug,
          presenterSlug: published.presenterSlug,
        });
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
      setShowAudienceSlugs(show.id, undefined);
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
  /** The SELECTED cue is the one on air (not merely something on its layer) - what SPACE
   *  toggles off, and what makes ⟳ TAKE a deliberate re-take rather than a first airing. */
  const selectedCueIsLive = !!selectedCue && selectedLayerCueId === selectedCue.id;
  /**
   * UNSENT CHANGES on the cue that is on air (acceptance pass, 2026-08-06: "there needs to be
   * an alert when something changes and you need to send that update - I had problems with my
   * CasparCG output but only because I hadn't sent an update").
   *
   * It compares the edited values against what was last SENT, never against the stored cue: the
   * whole point of staged-vs-take is that those legitimately differ, and data still does NOT
   * air by itself - this only says so out loud. A cue that has never been taken is not
   * "unsent"; it is simply not on air, which the rundown already says.
   */
  const unsentFields =
    editingIsLive && selectedGraphic && editingCue
      ? Object.entries(cueView(editingCue).values)
          .filter(([field, value]) => (airedData[selectedGraphic]?.[field] ?? '') !== value)
          .map(([field]) => field)
      : [];
  const hasUnsent = unsentFields.length > 0;

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
  // The graphic's own picture assets, so an IMAGE field is actually pickable here. Without
  // them the control renders a select whose only option is "None" — which is how a match
  // board's two crest slots came to be unreachable from the cockpit while the hosted page
  // could set them, exactly the divergence docs/PLAYOUT_DASHBOARD.md forbids. Derived the same
  // way the published panel derives its own list (control/hostedControl.ts), so the two
  // surfaces offer the same pictures.
  // Uploading is deliberately NOT offered: an upload has to land in the saved graphic's
  // assets, which is the editor's job, and adding it here would be a second write path into a
  // document the production only references.
  const cueImages = previewTemplate
    ? previewTemplate.assets.filter((a) => isImageAsset(a.path)).map((a) => ({ value: a.path }))
    : [];
  const canTake = !!selectedCue;

  // THE SIDE GESTURE. A dataset row is ONE team, but a two-team board titles its fields
  // "Team A" / "Score A" / "Team B" / … — so a row can never match them directly and the whole
  // teams preset bound nothing. Dropping the standalone side token off the FIELD TITLE is what
  // closes it, and it closes cleanly across the board's whole shape:
  //
  //     Team A → Team · Score A → Score · Team A colour → Team colour · Team A logo → Team logo
  //     Period, Clock → unchanged, no column, skipped as before
  //
  // It is done HERE, at the call site, over an unchanged `datasetValuesForFields` — that
  // function already takes {key,label} pairs, so rewriting the labels needs no model change, no
  // persisted-format change and no migration. The plain literal match still runs first, so a
  // column named exactly "Team A" keeps working and the quiz binding is untouched.
  const SIDES = ['A', 'B'] as const;
  const hasSides = descriptors.some((d) => SIDES.some((s) => new RegExp(`\\b${s}\\b`).test(d.label)));
  /** A field title with its side token removed — "Team A colour" → "Team colour". */
  const stripSide = (label: string, side: string) =>
    label.replace(new RegExp(`\\s+${side}\\b`), '').replace(/\s{2,}/g, ' ').trim();
  /** The descriptors a row is matched against: sideless for the CHOSEN side, and the other
   *  side's fields removed entirely so loading team A can never overwrite team B. */
  const sideDescriptors = (side: string) =>
    descriptors
      .filter((d) => !SIDES.some((s) => s !== side && new RegExp(`\\b${s}\\b`).test(d.label)))
      .map((d) => ({ key: d.key, label: stripSide(d.label, side) }));

  /** Rows the edited cue can load (D3's binding): any production dataset with at least one
   *  column whose label matches a field title, each row labelled by its first non-empty cell
   *  in column order — the question, the team, the name. */
  const loadableRows: { value: string; label: string }[] = [];
  const matchLabels = hasSides
    ? SIDES.flatMap((s) => sideDescriptors(s)).concat(descriptors.map((d) => ({ key: d.key, label: d.label })))
    : descriptors.map((d) => ({ key: d.key, label: d.label }));
  for (const ds of show.datasets ?? []) {
    const labels = new Set(ds.columns.map((c) => c.label.trim().toLowerCase()));
    if (!matchLabels.some((d) => labels.has(d.label.trim().toLowerCase()))) continue;
    ds.rows.forEach((row, i) => {
      const first = ds.columns.map((c) => row.values[c.key] ?? '').find((v) => v.trim() !== '');
      loadableRows.push({ value: `${ds.id}:${row.id}`, label: `${ds.name}: ${(first ?? `row ${i + 1}`).slice(0, 60)}` });
    });
  }
  /** Load one row into the edited cue's DRAFT (never air), remembering it per cue so ↷ Next
   *  walks the bank in order. */
  const loadRow = (value: string) => {
    if (!value || !editingCue) return;
    const [datasetId, rowId] = value.split(':');
    const ds = (show.datasets ?? []).find((d) => d.id === datasetId);
    const row = ds?.rows.find((r) => r.id === rowId);
    if (!ds || !row) return;
    // A sided board loads into the CHOSEN side only; everything else matches as before. The
    // plain titles go in as well and win where they exist, so a column named exactly "Team A"
    // still binds literally.
    const fields = hasSides
      ? [...sideDescriptors(loadSide), ...descriptors.map((d) => ({ key: d.key, label: d.label }))]
      : descriptors;
    editDraft({ values: datasetValuesForFields(ds, row, fields) });
    setLastLoaded((m) => ({ ...m, [editingCue.id]: value }));
  };

  // ── Graphic-specific ACTIONS (the ⚡ buttons — docs/PLAYOUT_DASHBOARD.md §8). They act ON
  // AIR the moment they are pressed, like ✎ Update, so they follow Update's legality: live
  // only while the selected cue's graphic is up on its layer. ──
  const machineState = selectedGraphic ? machineStates[selectedGraphic] ?? null : null;
  const stateName = (groupId: string, stateId: string) =>
    stateGroups.find((g) => g.id === groupId)?.states.find((s) => s.id === stateId)?.name ?? stateId;
  const stateLabel = machineState
    ? Object.entries(machineState.groups)
        .map(([gid, sid]) => (Object.keys(machineState.groups).length > 1 ? `${gid}: ${stateName(gid, sid)}` : stateName(gid, sid)))
        .join(' · ')
    : null;
  const eventSections: [string, ControlButton[]][] = [];
  for (const b of events) {
    const key = b.section ?? 'Actions';
    const bucket = eventSections.find(([s]) => s === key);
    if (bucket) bucket[1].push(b);
    else eventSections.push([key, [b]]);
  }

  /** The data that belongs to AIR: the cue live on the selected layer, draft included when it
   *  is also the one being edited. Events and snaps act on the live graphic, so their values
   *  must come from ITS cue — sourcing them from the previewed cue would air unprepared
   *  content the operator never took (staged data airs only on an explicit take). */
  const airValues = (): Record<string, string> => (airCue ? cueView(airCue).values : {});

  /** Fire a machine event on the live graphic. Payload values ride from the ON-AIR cue, and
   *  land only if the machine accepts the event (the structural guard). */
  const fireEvent = async (button: ControlButton) => {
    if (!selectedGraphic || !selectedLayerLive) return;
    flushDraft();
    const values = airValues();
    const payload: Record<string, string> = {};
    for (const key of button.payload ?? []) payload[key] = values[key] ?? '';
    const msg = button.payload?.length
      ? { t: 'event' as const, event: button.event, payload }
      : { t: 'event' as const, event: button.event };
    await runVerb([[{ graphic: selectedGraphic, msg }]], `Event ${button.event}`);
  };

  /** Snap the live graphic straight to a state — recovery, never an animation. A null group
   *  resets EVERY group to its initial. Recovery is BOTH halves (docs/STATE_MACHINE_SCHEMA.md:
   *  reset is two operations), so the snap rides with an update of the ON-AIR cue's values:
   *  the snap replays intermediate states with suppressed callbacks, and it is the trailing
   *  data write that lets their call-painted looks (a quiz's selection under a lock) repaint
   *  from the fields. */
  const snapTo = async (groupId: string | null, stateId: string) => {
    if (!selectedGraphic || !selectedLayerLive) return;
    flushDraft();
    const snap = groupId === null ? null : { [groupId]: stateId };
    await runVerb(
      [
        [
          { graphic: selectedGraphic, msg: { t: 'snap' as const, snap } },
          { graphic: selectedGraphic, msg: { t: 'update' as const, data: airValues() } },
        ],
      ],
      'Snap',
    );
  };

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
        // SPACE IS THE TOGGLE (acceptance pass, 2026-08-06: "you take with space and go out
        // with - is it zero? It should go in and out with space"). One key, one gesture: the
        // selected cue goes on, and the same key takes it off. A RE-TAKE - Take on a cue that
        // is already live, which replays the entrance and is the graphic's reset - stays
        // reachable by the ⟳ button itself, and the button says so when it means that. The KEY
        // is the one that had to become predictable, because it is the one pressed without
        // looking. `0` still means Out, from either state.
        if (key === 'take') {
          if (selectedCueIsLive) void outLive();
          else if (canTake && selectedCue) void takeCue(selectedCue);
        }
        if (key === 'preview' && selectedCue) selectCue(selectedCue.id);
        if (key === 'update' && editingIsLive) void updateLive();
        if (key === 'next' && selectedLayerLive) void nextLive();
        if (key === 'out' && selectedLayerLive) void outLive();
      }}
      sub={sub ?? null}
      onTab={(tab) => navigate(tab === 'playout' ? { view: 'production', id: show.id } : { view: 'production', id: show.id, sub: tab })}
      links={
        <ProductionLinks
          show={show}
          open={linksOpen}
          onToggle={() => setLinksOpen((o) => !o)}
          backendConfigured={backendConfigured}
          busy={busy}
          outputUrl={outputUrl}
          controlUrl={controlUrl}
          joinUrl={joinUrl}
          copied={copied}
          unpublishedChanges={unpublishedChanges}
          onCopy={copy}
          onPublish={() => void publish()}
          onUnpublish={() => void unpublish()}
        />
      }
    >
      {sub === 'data' && <ProductionDataWorkspace show={show} setShows={setShows} />}
      {sub === 'audience' && <ProductionAudienceWorkspace show={show} setShows={setShows} />}
      {!sub && (
      <>
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
                  ref={setStageEl}
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
                <ProgramStage
                  ref={programRef}
                  show={show}
                  library={library}
                  empty={liveLayers.length === 0}
                  onState={noteMachineState}
                  onReady={restoreProgram}
                />
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
            title={
              selectedCueIsLive
                ? 'Re-take: play this cue’s entrance again from the start. SPACE takes it OFF air.'
                : 'Air the previewed cue'
            }
            data-testid="verb-take"
          >
            {/* The key label FOLLOWS the toggle. Leaving SPACE on this button while the cue is
                already live would name the one thing the key no longer does there. */}
            {selectedCueIsLive ? '⟳ RE-TAKE' : <>⟳ TAKE <kbd>SPACE</kbd></>}
          </button>
          <button
            className={`pd-verb pd-verb-update${hasUnsent ? ' pd-unsent' : ''}`}
            disabled={!editingIsLive}
            onClick={() => void updateLive()}
            title={
              hasUnsent
                ? `${unsentFields.length} edited value${unsentFields.length === 1 ? '' : 's'} has not been sent yet — air still shows the previous one`
                : 'Send the edited values to the live layer, without replaying it'
            }
            data-testid="verb-update"
          >
            ✎ Update <kbd>U</kbd>
            {/* The DOT is the whole point of §3c: nothing here airs by itself, so the only way
                an operator learns that air is behind their screen is if the surface says so. */}
            {hasUnsent && <span className="pd-unsent-dot" aria-hidden="true" />}
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
            {selectedCueIsLive && <kbd>SPACE</kbd>}
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
              <span
                className={hasUnsent ? 'pd-editor-fate pd-unsent-note' : 'muted pd-editor-fate'}
                data-testid="cue-unsent"
              >
                {hasUnsent
                  ? `${unsentFields.length} change${unsentFields.length === 1 ? '' : 's'} not on air yet — press ✎ Update`
                  : editingIsLive
                    ? 'changes push live on ✎ Update'
                    : 'changes air on ⟳ Take'}
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
              {/* LOAD A DATA ROW (the Data workspace's other half): a table whose column names
                  match this graphic's field titles offers its rows here. Loading fills the
                  EDITED CUE's draft — data prepares, only Take (or ✎ Update, deliberately)
                  airs. Unmatched columns are skipped; untouched fields keep their values. */}
              {loadableRows.length > 0 && (
                <label className="pd-field pd-field-load">
                  <span>
                    Load data row
                    {/* THE SIDE PICKER. Only a board with A/B fields shows it, and it says
                        which side the next load fills — one row is one team, so without it a
                        teams table can only ever describe half the graphic. */}
                    {hasSides && (
                      <span className="pd-side-pick" data-testid="cue-load-side">
                        {SIDES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            className={loadSide === s ? 'active' : ''}
                            onClick={() => setLoadSide(s)}
                            title={`Load the picked row into side ${s}`}
                            data-testid={`cue-load-side-${s}`}
                          >
                            {s}
                          </button>
                        ))}
                      </span>
                    )}
                  </span>
                  <div className="row">
                    <select className="grow" value="" onChange={(e) => loadRow(e.target.value)} data-testid="cue-load-row">
                      <option value="">Pick a row from the production's data…</option>
                      {loadableRows.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {/* The running-order gesture: next question, next name — one press. Loads
                        the row AFTER the one this cue last loaded (the first, before any). */}
                    <button
                      onClick={() => {
                        const at = editingCue ? loadableRows.findIndex((o) => o.value === lastLoaded[editingCue.id]) : -1;
                        const next = loadableRows[at + 1];
                        if (next) loadRow(next.value);
                      }}
                      disabled={
                        !editingCue ||
                        loadableRows.findIndex((o) => o.value === lastLoaded[editingCue.id]) >= loadableRows.length - 1
                      }
                      title="Load the next row"
                      data-testid="cue-load-next"
                    >
                      ↷ Next
                    </button>
                  </div>
                </label>
              )}
              {descriptors.map((d) => (
                <FieldRow
                  key={d.key}
                  descriptor={{ ...d, label: `${d.key.toUpperCase()} · ${d.label}` }}
                  value={String(editingView.values[d.key] ?? d.defaultValue ?? '')}
                  onChange={(v) => editDraft({ values: { [d.key]: String(v) } })}
                  testIdPrefix="cue-field"
                  images={cueImages}
                  imageHint="Pictures come from the graphic itself — add one in the editor's Assets tab."
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

        {/* GRAPHIC ACTIONS — the machine's own verbs, rendered from the metadata that travels
            inside the template (docs/CONTROL_LAYER.md; the region docs/PLAYOUT_DASHBOARD.md §8
            reserves). Deliberately OUTSIDE the editor's frame: fields up there edit a CUE and
            air on ⟳ Take / ✎ Update, while these act on the LIVE graphic the moment they are
            pressed — so they follow Update's legality and say so in their own header. */}
        {events.length > 0 && selectedGraphic && (
          <div className="pd-actions" data-testid="cue-actions">
            <div className="pd-actions-head">
              <span className="pd-actions-kicker">
                ⚡ GRAPHIC ACTIONS <b className="pd-actions-air">act on air</b>
              </span>
              <span
                className="pd-state-chip"
                data-testid="machine-state-chip"
                // A multi-group graphic's label is longer than the chip, so the full text has
                // to stay reachable on hover — the chip truncates rather than reflowing.
                title={
                  !selectedLayerLive
                    ? "The live graphic's current state — what the greying is judged against"
                    : `${stateLabel ?? 'no state reported yet'} — the live graphic's current state, what the greying is judged against`
                }
              >
                {!selectedLayerLive ? 'not on air' : stateLabel ?? 'no state reported yet'}
              </span>
              <div className="spacer" />
              {stateGroups.length > 0 && (
                <select
                  className="pd-snap"
                  value=""
                  disabled={!selectedLayerLive}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    if (v === '::reset') void snapTo(null, '');
                    else {
                      const i = v.indexOf(':');
                      void snapTo(v.slice(0, i), v.slice(i + 1));
                    }
                  }}
                  title={
                    'RECOVERY. Jumps the live graphic straight to a state with no animation, ' +
                    'and re-sends this cue’s values with it — use it when air and the dashboard ' +
                    'have got out of step (a renderer restart, a missed press). It is not how a ' +
                    'graphic is normally driven: that is the ⚡ actions and » Next.'
                  }
                  data-testid="machine-snap"
                >
                  <option value="">Snap to state…</option>
                  <option value="::reset">⟲ Back to start (visual reset)</option>
                  {stateGroups.map((g) =>
                    g.states.map((s) => (
                      <option key={`${g.id}:${s.id}`} value={`${g.id}:${s.id}`}>
                        {stateGroups.length > 1 ? `${g.id}: ${s.name}` : s.name}
                      </option>
                    )),
                  )}
                </select>
              )}
            </div>
            {/* INLINE HELP, because two of these controls were unreadable to their first real
                operator (acceptance pass, 2026-08-06). It is one line and it says what the
                block IS — a documented control the user has to leave the surface to understand
                is a control they will not use. */}
            <p className="hint pd-actions-help" data-testid="cue-actions-help">
              These fire the graphic’s own beats on the layer that is on air, immediately —
              they carry values from this cue, so type them above first.
              {stateGroups.length > 0 && ' “Snap to state…” is for RECOVERY: it jumps straight to a state with no animation.'}
            </p>
            {eventSections.map(([section, btns]) => (
              <div key={section} className="pd-actions-section">
                {(eventSections.length > 1 || section !== 'Actions') && <h4>{section}</h4>}
                <div className="pd-actions-row">
                  {btns.map((b) => {
                    const legal = isEventLegal(legality, b.event, machineState);
                    return (
                      <button
                        key={b.event}
                        className={`pd-action${b.destructive ? ' destructive' : ''}`}
                        disabled={!selectedLayerLive || !legal}
                        title={
                          !selectedLayerLive
                            ? 'The graphic is not on air — Take the cue first'
                            : !legal
                              ? `"${b.event}" has no arrow out of the current state, so the graphic would drop it`
                              : b.payload?.length
                                ? // The payload in the OPERATOR'S words, not as `f7`. This is
                                  // what makes an action self-explanatory: the acceptance pass
                                  // could not tell what "Show audience result" would do, and
                                  // the answer is "it shows the Audience results field, which
                                  // you type above" — a field id says none of that.
                                  `Fires "${b.event}" on air, carrying this cue's ${b.payload
                                    .map((key) => descriptors.find((d) => d.key === key)?.label ?? key)
                                    .join(', ')}`
                                : `Fires "${b.event}" on air`
                        }
                        onClick={() => void fireEvent(b)}
                        data-testid={`cue-action-${b.event}`}
                      >
                        ⚡ {b.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
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
      </>
      )}
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
  sub,
  onTab,
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
  sub: ProductionSub | null;
  onTab: (tab: 'playout' | ProductionSub) => void;
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
        {/* The workspaces (docs/INTERACTIVE_PLAYOUT_PLAN.md D6): Playout is the operating
            surface, Data the production's own tables. One shared record underneath — a row
            typed on the Data tab is loadable into a cue the moment you switch back. */}
        <nav className="pd-tabs" aria-label="Production workspaces">
          <button className={sub === null ? 'on' : undefined} onClick={() => onTab('playout')} data-testid="tab-playout">
            Playout
          </button>
          <button className={sub === 'data' ? 'on' : undefined} onClick={() => onTab('data')} data-testid="tab-data">
            Data
          </button>
          <button
            className={sub === 'audience' ? 'on' : undefined}
            onClick={() => onTab('audience')}
            data-testid="tab-audience"
          >
            Audience
          </button>
        </nav>
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
  joinUrl,
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
  joinUrl: string | null;
  copied: 'output' | 'control' | 'join' | null;
  unpublishedChanges: boolean;
  onCopy: (kind: 'output' | 'control' | 'join', text: string) => void;
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
            {/* The AUDIENCE link is the one link here meant to be given away — read out on air,
                put on a slide, printed on a QR code. It is listed last and described as public
                so it can never be mistaken for the control page above it. */}
            {joinUrl && (
              <>
                <div className="prod-link-row">
                  <span className="mono muted">Audience link</span>
                  <code className="prod-url">{joinUrl}</code>
                  <button onClick={() => onCopy('join', joinUrl)} data-testid="copy-join-url">
                    {copied === 'join' ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <p className="hint">
                  Public — share it with the room. Viewers send questions and vote here; nothing they send
                  goes on air until you approve it and take it, on the Audience tab.
                </p>
              </>
            )}
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
