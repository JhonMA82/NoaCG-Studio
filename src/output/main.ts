// The browser-output renderer's entry (docs/CLOUD_PLAYOUT.md §3). Boot: resolve the
// production by its OUTPUT capability, build the stage (every graphic preloaded), rebuild each
// graphic from its last report (the data half, then the visual half — recovery is both), then
// follow the command log live through the shared recovery discipline (followControlLog).
//
// Nothing but graphics ever renders on air: no connection text, no UI. A disconnected renderer
// keeps its last applied state and recovers silently; `&debug=1` overlays a status readout for
// setup and rehearsal. The "not available" card exists only for a wrong URL or an offline
// build — states a live production can never be in.

import { isBackendConfigured } from '../backend/config';
import {
  controlOutputBySlug,
  controlOutputReport,
  controlOutputSeen,
  controlOutputTail,
  followControlLog,
  type ControlEventRow,
} from '../control/hostedControl';
import { createOutputStage } from './stage';

const params = new URLSearchParams(window.location.search);
const outputSlug = params.get('production');
const debug = params.get('debug') === '1';

const debugEl = debug ? document.createElement('pre') : null;
const debugState: Record<string, string> = {};
if (debugEl) {
  debugEl.style.cssText =
    'position:fixed;left:8px;bottom:8px;margin:0;padding:8px 10px;z-index:10;' +
    'font:12px/1.5 monospace;color:#ffb84d;background:rgba(10,10,12,0.82);border-radius:6px;';
  document.body.appendChild(debugEl);
}
function dbg(key: string, value: string): void {
  if (!debugEl) return;
  debugState[key] = value;
  debugEl.textContent = Object.entries(debugState)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

/** The wrong-URL / offline card. Never part of a live production's air. */
function unavailable(reason: string): void {
  const card = document.createElement('div');
  card.style.cssText =
    'position:fixed;inset:0;display:grid;place-items:center;background:#0a0a0c;color:#8a8a92;' +
    'font:15px/1.6 system-ui,sans-serif;text-align:center;';
  card.innerHTML = `<div><div style="font-size:18px;color:#c9c9cf;margin-bottom:6px">Output not available</div>${reason}</div>`;
  document.body.appendChild(card);
}

async function boot(): Promise<void> {
  if (!outputSlug) {
    unavailable('This URL is missing its <code>?production=</code> token.');
    return;
  }
  if (!isBackendConfigured()) {
    unavailable('This build runs offline — browser output needs the cloud backend.');
    return;
  }
  const resolved = await controlOutputBySlug(outputSlug);
  if (!resolved) {
    unavailable('This link is invalid or the production was unpublished.');
    return;
  }
  dbg('production', resolved.title);
  if (!resolved.output || resolved.output.graphics.length === 0) {
    // Published before the payload existed (an older build) or an empty rundown: stay
    // transparent and honest — the operator page will say "re-publish".
    dbg('payload', 'none — re-publish the production');
    return;
  }

  const stage = createOutputStage(document.body, resolved.output);
  dbg('graphics', stage.graphics.join(', '));

  // ── Recovery baselines (0033): each live entry records the log row the renderer had applied
  // when it wrote that report, so a graphic's rebuilt state accounts for everything up to its
  // own baseline and nothing after it. Follow from the OLDEST baseline and skip, per graphic,
  // what its own snapshot already contains — reports are per graphic and debounced, so one can
  // be seconds fresher than another, and a single show-wide cursor would drop the difference.
  // An entry with no baseline (a pre-0033 server or renderer) is replayed from the oldest
  // baseline instead: replaying a command the snapshot already holds costs one re-animation,
  // skipping one loses the picture. Nothing reported at all (no renderer has ever run) starts
  // at the log head, because there is no snapshot the history would be filling in. ──
  const snapshotAt = new Map<string, number>();
  for (const key of stage.graphics) {
    const at = resolved.live[key]?.event;
    if (typeof at === 'number') snapshotAt.set(key, at);
  }
  const baselines = [...snapshotAt.values()];
  const followFrom = baselines.length > 0 ? Math.min(...baselines) : resolved.lastEventId;
  let lastAppliedId = followFrom;

  // ── Applied-truth bookkeeping (the panel event-log pattern, parent-side): the sandbox has
  // no DOM to harvest across, so the renderer reports what it FORWARDED — update data merged
  // per graphic, event payloads merged optimistically (the same rule the standalone panel's
  // log applies), machine state from the documents' own replies. Reports fire ONLY for
  // forwarded renderer commands and observed state changes — never for the log's status rows,
  // because control_output_report itself inserts a {t:'live'} status row, and reporting on it
  // would make the renderer feed its own subscription forever. ──
  const mergedData = new Map<string, Record<string, string>>();
  const lastReported = new Map<string, string>();
  const reportTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const scheduleReport = (graphic: string) => {
    clearTimeout(reportTimers.get(graphic));
    reportTimers.set(
      graphic,
      setTimeout(() => {
        const data = mergedData.get(graphic) ?? {};
        const state = stage.states.get(graphic) ?? null;
        // Byte-identical truth needs no second write (the 1 s state poll answers every second).
        const key = JSON.stringify([data, state]);
        if (key === lastReported.get(graphic)) return;
        lastReported.set(graphic, key);
        void controlOutputReport(outputSlug, graphic, data, state, lastAppliedId);
      }, 800),
    );
  };
  stage.onState((graphic) => scheduleReport(graphic));

  // ── Which graphics are LIVE (played/snapped and not yet stopped): only those can change
  // state on a timer, so only those need the 1 s machine-state poll — an idle stacked
  // graphic's machine cannot move without a command, and the renderer's main thread is the
  // one that must not miss frames. ──
  const liveGraphics = new Set<string>();
  setInterval(() => liveGraphics.forEach((g) => stage.requestState(g)), 1000);

  const apply = (row: ControlEventRow) => {
    lastAppliedId = Math.max(lastAppliedId, row.id);
    const snapshot = snapshotAt.get(row.graphic);
    // Already inside the state this graphic was rebuilt from — replaying it would re-air it.
    if (snapshot !== undefined && row.id <= snapshot) return;
    const msg = row.msg;
    if (msg.t === 'update') {
      mergedData.set(row.graphic, { ...mergedData.get(row.graphic), ...msg.data });
    } else if (msg.t === 'event' && msg.payload) {
      mergedData.set(row.graphic, { ...mergedData.get(row.graphic), ...msg.payload });
    } else if (msg.t === 'play' || msg.t === 'snap') {
      liveGraphics.add(row.graphic);
    } else if (msg.t === 'stop') {
      liveGraphics.delete(row.graphic);
    }
    stage.apply(row.graphic, msg);
    // Status rows ('cue'/'staged'/'live') are for the operator pages; the stage ignored them
    // and so does the report path.
    const forwarded = msg.t === 'update' || msg.t === 'play' || msg.t === 'stop' || msg.t === 'next' || msg.t === 'event' || msg.t === 'snap';
    if (forwarded) scheduleReport(row.graphic);
    dbg('last row', String(row.id));
  };

  // ── Boot recovery, per graphic: the data half, then the visual half (snap arms timers). ──
  for (const key of stage.graphics) {
    const mine = resolved.live[key];
    if (!mine) continue;
    if (mine.data) {
      mergedData.set(key, { ...mine.data });
      stage.apply(key, { t: 'update', data: mine.data });
    }
    if (mine.state?.groups) {
      stage.apply(key, { t: 'snap', snap: mine.state.groups });
      liveGraphics.add(key);
    }
  }

  // ── Follow the log live (shared discipline: dedupe, hole → tail, refill on resubscribe). ──
  await followControlLog({
    showId: resolved.id,
    // The oldest per-graphic baseline, NOT the log head: everything commanded while this
    // renderer was down lives between the two, and `apply` drops only what a snapshot holds.
    from: followFrom,
    tail: (after) => controlOutputTail(outputSlug, after),
    onRow: apply,
  });
  dbg('realtime', 'following');

  // ── Heartbeat: operator surfaces read output_seen_at staleness as "renderer connected". ──
  void controlOutputSeen(outputSlug);
  setInterval(() => void controlOutputSeen(outputSlug), 60_000);
}

void boot();
