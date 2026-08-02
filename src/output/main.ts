// The browser-output renderer's entry (docs/CLOUD_PLAYOUT.md §3). Boot: resolve the
// production by its OUTPUT capability, build the stage (every graphic preloaded), rebuild each
// graphic from its last report (the data half, then the visual half — recovery is both), then
// follow the command log live with tail-fill on every (re)subscribe.
//
// Nothing but graphics ever renders on air: no connection text, no UI. A disconnected renderer
// keeps its last applied state and recovers silently; `&debug=1` overlays a status readout for
// setup and rehearsal. The "not available" card exists only for a wrong URL or an offline
// build — states a live production can never be in.

import { isBackendConfigured } from '../backend/config';
import type { ControlMessage } from '../control/controlModel';
import {
  controlOutputBySlug,
  controlOutputReport,
  controlOutputSeen,
  controlOutputTail,
  subscribeControlEvents,
  type ControlEventRow,
} from '../control/hostedControl';
import { createOutputStage, type OutputStage } from './stage';

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

  const stage: OutputStage = createOutputStage(document.body, resolved.output);
  dbg('graphics', stage.graphics.join(', '));

  // ── Applied-truth bookkeeping (the panel event-log pattern, parent-side): the sandbox has
  // no DOM to harvest across, so the renderer reports what it FORWARDED — update data merged
  // per graphic, event payloads merged optimistically (the same rule the standalone panel's
  // log applies), machine state from the documents' own replies. ──
  const mergedData = new Map<string, Record<string, string>>();
  const reportTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const scheduleReport = (graphic: string) => {
    clearTimeout(reportTimers.get(graphic));
    reportTimers.set(
      graphic,
      setTimeout(() => {
        void controlOutputReport(outputSlug, graphic, mergedData.get(graphic) ?? {}, stage.states.get(graphic) ?? null);
      }, 800),
    );
  };
  stage.onState((graphic) => scheduleReport(graphic));
  // Timer-driven machine changes reply through the same state channel — a light poll keeps
  // the reported truth honest between commands (receiverScript's 1 s watcher, renderer-side).
  setInterval(() => stage.graphics.forEach((g) => stage.requestState(g)), 1000);

  let lastId = resolved.lastEventId;
  const apply = (row: ControlEventRow) => {
    if (row.id <= lastId) return;
    lastId = row.id;
    const msg = row.msg as ControlMessage | { t: string };
    if (msg.t === 'update') {
      const m = msg as Extract<ControlMessage, { t: 'update' }>;
      mergedData.set(row.graphic, { ...mergedData.get(row.graphic), ...m.data });
    } else if (msg.t === 'event') {
      const m = msg as Extract<ControlMessage, { t: 'event' }>;
      if (m.payload) mergedData.set(row.graphic, { ...mergedData.get(row.graphic), ...m.payload });
    }
    stage.apply(row.graphic, msg as ControlMessage);
    scheduleReport(row.graphic);
    dbg('last row', String(lastId));
  };
  const fillTail = () => {
    void controlOutputTail(outputSlug, lastId).then((rows) => rows.forEach(apply));
  };

  // ── Boot recovery, per graphic: the data half, then the visual half (snap arms timers). ──
  for (const key of stage.graphics) {
    const mine = resolved.live[key];
    if (!mine) continue;
    if (mine.data) {
      mergedData.set(key, { ...mine.data });
      stage.apply(key, { t: 'update', data: mine.data });
    }
    if (mine.state?.groups) stage.apply(key, { t: 'snap', snap: mine.state.groups });
  }

  // ── Follow the log live; every (re)subscribe tail-fills the gap it can't see. ──
  await subscribeControlEvents(
    resolved.id,
    (row) => {
      if (row.id > lastId + 1) fillTail();
      apply(row);
    },
    () => {
      dbg('realtime', 'subscribed');
      fillTail();
    },
  );

  // ── Heartbeat: operator surfaces read output_seen_at staleness as "renderer connected". ──
  void controlOutputSeen(outputSlug);
  setInterval(() => void controlOutputSeen(outputSlug), 60_000);
}

void boot();
