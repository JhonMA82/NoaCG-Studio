// Hosted control (Phase 5): the client side of migration 0008. A local SHOW publishes as a
// control_shows row (id = the local Show.id); operating it is capability-addressed — the
// unguessable slug opens the hosted page at ?control=<slug>, no account needed. Commands
// are INSERTS into the control_events log (DB-ordered, recoverable); staging and the
// graphics' applied-state reports ride the same log as meta rows.
//
// The published `panel` spec also carries each graphic's saved ENTRIES, read out of the
// library at publish time (docs/SAVED_CONTENT_MODEL.md §4) — the hosted page renders them as
// a read-only switcher, so picking one stages its data and airing it stays a deliberate take.

import { getSupabase } from '../backend/supabase';
import type { Show } from '../model/shows';
import { loadGraphics, entriesForSavedGraphic, templateForSavedGraphic, type GraphicDoc } from '../model/library';
import type { Resolution, SpxField, SpxTemplate } from '../model/types';
import { DEFAULT_GRAPHICS_RESOLUTION } from '../model/projectFormat';
import { fileToDataUrl, isImageAsset } from '../assets/assetUtils';
import type { ControlMessage } from './controlModel';

/** The operator page's URL for a control slug — the one shape every surface mints. */
export function controlPageUrl(slug: string): string {
  return `${window.location.origin}/app?control=${encodeURIComponent(slug)}`;
}

/** The browser-output URL for an output slug (docs/CLOUD_PLAYOUT.md §3). */
export function outputPageUrl(outputSlug: string): string {
  return `${window.location.origin}/output?production=${encodeURIComponent(outputSlug)}`;
}

/** A saved data row published with the panel (model/library.ts ControlEntry, values only). */
export interface PanelEntry {
  id: string;
  label: string;
  values: Record<string, string>;
}

/** What the hosted page needs to render one graphic's card — never the full template. */
export interface PanelGraphicSpec {
  name: string;
  fields: SpxField[];
  js: string;
  images: { value: string; label: string }[];
  /**
   * The graphic's saved entries, published READ-ONLY (docs/SAVED_CONTENT_MODEL.md §4): the
   * operator picks one, its values STAGE like any typed edit, and nothing airs until a take.
   * Authoring entries stays in the app (`#/control/<id>`) — the hosted page never writes back.
   * Additive: `panel` is jsonb with no version of its own, so a row published by an older
   * build simply carries no entries and is normalized to `[]` on read.
   */
  entries: PanelEntry[];
}

export interface ControlShowRow {
  id: string;
  slug: string;
  outputSlug: string | null;
  title: string;
}

// ── The browser-output payload (docs/CLOUD_PLAYOUT.md §2) ────────────────────
// PINNED at publish: the renderer's templates are a snapshot, deliberately inverting the
// panel spec's live resolution — a renderer on air must never change under the operator.

/** One renderer instance: everything the output page needs to compose the graphic. The key
 *  is the 0008 graphic NAME — the same routing key the log, staged and live maps use. */
export interface OutputGraphicSpec {
  key: string;
  html: string;
  css: string;
  js: string;
  /** Serialized assets — Blob data converted to data URLs at publish so the payload is JSON. */
  assets: { path: string; data: string }[];
  resolution: Resolution;
  fps: number;
}

/** One cue as published — ShowCue re-keyed by graphic name (the wire key). */
export interface OutputCue {
  id: string;
  graphic: string;
  label: string;
  values: Record<string, string>;
  note?: string;
}

export interface OutputPayload {
  v: 1;
  /** The production canvas — the stage the output page scales to the viewport. */
  resolution: Resolution;
  graphics: OutputGraphicSpec[];
  cues: OutputCue[];
}

/** Per graphic: the renderer's last reported truth, plus (0033) `event` — the log row it had
 *  applied when the report was written. `event` is the graphic's RECOVERY BASELINE: on boot the
 *  renderer rebuilds from `data`/`state` and replays only rows after it. Absent on a pre-0033
 *  server or from a pre-0033 renderer, which degrades to the old "start at the log head". */
export type LiveReportMap = Record<
  string,
  {
    data?: Record<string, string>;
    state?: { groups: Record<string, string> } | null;
    at?: string;
    event?: number;
  }
>;

/** Which cue is on air — the row-persisted snapshot (0031; null on a pre-0031 server or
 *  before any take, degrading to "nothing on air" until the next cue row arrives). */
export interface LiveCueSnapshot {
  id: string | null;
  graphic: string | null;
}

export interface ResolvedControlShow {
  id: string;
  title: string;
  panel: PanelGraphicSpec[];
  staged: Record<string, Record<string, string>>;
  live: LiveReportMap;
  /** The log baseline — follow live rows after it, tail-fill gaps (0008 contract). */
  lastEventId: number;
  /** The published output payload (null before the first output publish). */
  output: OutputPayload | null;
  /** The renderer's last heartbeat — staleness is the "renderer connected" indicator. */
  outputSeenAt: string | null;
  liveCue: LiveCueSnapshot | null;
}

/** What the output renderer resolves — payload + live snapshot, never panel/staged/slug. */
export interface ResolvedOutputShow {
  id: string;
  title: string;
  output: OutputPayload | null;
  live: LiveReportMap;
  lastEventId: number;
}

/** The cue STATUS row (docs/CLOUD_PLAYOUT.md §4): written on Take/Out so every open surface
 *  agrees on which cue is live. Receivers ignore it — pages render it. `cue: null` = off air. */
export interface CueStatusMsg {
  t: 'cue';
  cue: string | null;
}

/** A log row as delivered by Realtime / the tail RPC. */
export interface ControlEventRow {
  id: number;
  graphic: string;
  msg:
    | ControlMessage
    | CueStatusMsg
    | { t: 'staged'; data: Record<string, string> }
    | { t: 'live'; data?: Record<string, string>; state?: { groups: Record<string, string> } | null };
}

/** The stored operator spec for a show — one entry per graphic, no template payload. The
 *  entries come from the library via the shared resolver (model/library.ts), by `graphicId`
 *  with a unique-name fallback, so hosted publish and show export agree on the lookup. */
export function buildPanelSpec(show: Show, library: GraphicDoc[] = loadGraphics()): PanelGraphicSpec[] {
  return show.graphics.map((g) => {
    // The LIVE template (templateForSavedGraphic), not the snapshot embedded when the graphic
    // was added — publishing a show that carried the stale fields/js would drive the hosted
    // operator page against a design the graphic no longer has.
    const template = templateForSavedGraphic(g, library);
    return {
      name: g.name,
      fields: template.fields,
      js: template.js,
      images: template.assets
        .filter((a) => isImageAsset(a.path))
        .map((a) => ({ value: a.path, label: a.path })),
      entries: entriesForSavedGraphic(g, library).map((e) => ({ id: e.id, label: e.label, values: e.values })),
    };
  });
}

/** Normalize a stored panel row to the current shape (additive fields defaulted, never a crash). */
function readPanel(panel: unknown): PanelGraphicSpec[] {
  if (!Array.isArray(panel)) return [];
  return (panel as PanelGraphicSpec[]).map((g) => ({
    ...g,
    images: Array.isArray(g.images) ? g.images : [],
    entries: Array.isArray(g.entries) ? g.entries : [],
  }));
}

/** Normalize a stored output payload — unknown/absent shapes degrade to null, never a crash. */
export function readOutputPayload(output: unknown): OutputPayload | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as OutputPayload;
  if (o.v !== 1 || !Array.isArray(o.graphics)) return null;
  return {
    v: 1,
    resolution: o.resolution ?? DEFAULT_GRAPHICS_RESOLUTION,
    graphics: o.graphics.map((g) => ({ ...g, assets: Array.isArray(g.assets) ? g.assets : [] })),
    cues: Array.isArray(o.cues) ? o.cues : [],
  };
}

/** Serialize one template's assets for the JSON payload (Blob bytes become data URLs). */
async function serializeAssets(template: SpxTemplate): Promise<{ path: string; data: string }[]> {
  return Promise.all(
    template.assets.map(async (a) => ({
      path: a.path,
      data: typeof a.data === 'string' ? a.data : await fileToDataUrl(a.data as File),
    })),
  );
}

/** The PINNED renderable payload written at publish (docs/CLOUD_PLAYOUT.md §2): the pool
 *  graphics' live library templates snapshotted, plus the cue rundown re-keyed by the wire
 *  graphic name. Async because Blob assets serialize to data URLs. */
export async function buildOutputPayload(show: Show, library: GraphicDoc[] = loadGraphics()): Promise<OutputPayload> {
  const byId = new Map(show.graphics.map((g) => [g.id, g] as const));
  const graphics: OutputGraphicSpec[] = await Promise.all(
    show.graphics.map(async (g) => {
      const template = templateForSavedGraphic(g, library);
      return {
        key: g.name,
        html: template.html,
        css: template.css,
        js: template.js,
        assets: await serializeAssets(template),
        resolution: template.resolution,
        fps: template.fps,
      };
    }),
  );
  // The stage: big enough for every graphic (they render 1:1 inside it, the page scales it).
  const resolution = graphics.reduce<Resolution>(
    (r, g) => ({
      width: Math.max(r.width, g.resolution.width),
      height: Math.max(r.height, g.resolution.height),
      label: r.label,
    }),
    DEFAULT_GRAPHICS_RESOLUTION,
  );
  const cues: OutputCue[] = (show.cues ?? [])
    .filter((c) => byId.has(c.sourceId))
    .map((c) => ({
      id: c.id,
      graphic: byId.get(c.sourceId)!.name,
      label: c.label,
      values: c.values,
      ...(c.note ? { note: c.note } : {}),
    }));
  return { v: 1, resolution, graphics, cues };
}

/** Publish (or update) a production's hosted pages: the operator panel spec (live-resolved,
 *  entries included) AND the pinned output payload, in one write (docs/CLOUD_PLAYOUT.md §2 —
 *  the two surfaces must agree on the cue list). Prunes log rows older than 7 days (the 0029
 *  owner DELETE policy) so a 24/7 output URL never grows the log without bound.
 *  Returns both capability slugs, or null offline. */
export async function publishControlShow(show: Show): Promise<{ slug: string; outputSlug: string | null } | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const library = loadGraphics();
  const output = await buildOutputPayload(show, library);
  const { error } = await sb.from('control_shows').upsert(
    { id: show.id, title: show.name, panel: buildPanelSpec(show, library), output },
    { onConflict: 'id' },
  );
  if (error) throw new Error(error.message);
  // The prune result is deliberately unread (best-effort retention; the 0029 owner DELETE
  // policy may not exist on an older instance) — run it beside the slug read-back.
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const [, readBack] = await Promise.all([
    sb.from('control_events').delete().eq('show_id', show.id).lt('created_at', cutoff),
    sb.from('control_shows').select('slug, outputSlug:output_slug').eq('id', show.id).single(),
  ]);
  if (readBack.error) throw new Error(readBack.error.message);
  return readBack.data as { slug: string; outputSlug: string | null };
}

/** The signed-in owner's hosted control pages. */
export async function myControlShows(): Promise<ControlShowRow[]> {
  const sb = await getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('control_shows')
    .select('id, slug, outputSlug:output_slug, title')
    .order('created_at');
  if (error) return [];
  return (data ?? []) as ControlShowRow[];
}

/** The renderer's last heartbeat, read as ONE column (the owner's cheap 30 s poll — resolving
 *  the whole row would re-download the multi-MB pinned payload to read a timestamp). */
export async function controlOutputSeenAt(showId: string): Promise<string | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('control_shows').select('output_seen_at').eq('id', showId).single();
  if (error) return null;
  return (data as { output_seen_at: string | null }).output_seen_at ?? null;
}

export async function unpublishControlShow(id: string): Promise<void> {
  const sb = await getSupabase();
  if (!sb) return;
  await sb.from('control_shows').delete().eq('id', id);
}

// ── The operator side (capability-addressed; works signed-out) ───────────────

export async function controlShowBySlug(slug: string): Promise<ResolvedControlShow | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc('control_show_by_slug', { p_slug: slug });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    id: row.id as string,
    title: row.title as string,
    panel: readPanel(row.panel),
    staged: (row.staged ?? {}) as ResolvedControlShow['staged'],
    live: (row.live ?? {}) as ResolvedControlShow['live'],
    // The log baseline (0008 returns it; the client used to drop it and start at 0, which
    // made the first live row look like a hole and tail-replay from the log's very start).
    lastEventId: Number(row.last_event_id ?? 0),
    output: readOutputPayload(row.output),
    outputSeenAt: (row.output_seen_at as string | null) ?? null,
    liveCue: readLiveCue(row.live_cue),
  };
}

/** Normalize the row-persisted cue snapshot (absent on a pre-0031 server → null). */
function readLiveCue(value: unknown): LiveCueSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { cue?: string | null; graphic?: string | null };
  return { id: v.cue ?? null, graphic: v.graphic ?? null };
}

/** Resolve the RENDERER's view by the output capability — payload + live snapshot only. */
export async function controlOutputBySlug(outputSlug: string): Promise<ResolvedOutputShow | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc('control_output_by_slug', { p_output_slug: outputSlug });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    id: row.id as string,
    title: row.title as string,
    output: readOutputPayload(row.output),
    live: (row.live ?? {}) as LiveReportMap,
    lastEventId: Number(row.last_event_id ?? 0),
  };
}

/** The renderer's gap fill — control_tail addressed by the output capability. */
export async function controlOutputTail(outputSlug: string, afterId: number): Promise<ControlEventRow[]> {
  const sb = await getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc('control_output_tail', { p_output_slug: outputSlug, p_after: afterId });
  if (error) return [];
  return (data ?? []) as ControlEventRow[];
}

/** The renderer's applied-state report (the output-slug sibling of control_report). */
export async function controlOutputReport(
  outputSlug: string,
  graphic: string,
  data: Record<string, string>,
  state: { groups: Record<string, string> } | null,
  /** The last log row applied when this truth was captured — the graphic's recovery baseline. */
  lastEventId: number | null = null,
): Promise<void> {
  const sb = await getSupabase();
  if (!sb) return;
  await sb.rpc('control_output_report', {
    p_output_slug: outputSlug,
    p_graphic: graphic,
    p_data: data,
    p_state: state,
    p_last_event_id: lastEventId,
  });
}

/** The renderer's heartbeat — operator surfaces read output_seen_at staleness. */
export async function controlOutputSeen(outputSlug: string): Promise<void> {
  const sb = await getSupabase();
  if (!sb) return;
  await sb.rpc('control_output_seen', { p_output_slug: outputSlug });
}

/** Send one command — the INSERT is the send. */
export async function sendHostedControl(slug: string, graphic: string, msg: ControlMessage | CueStatusMsg): Promise<void> {
  const sb = await getSupabase();
  if (!sb) return;
  const { error } = await sb.rpc('control_send', { p_slug: slug, p_graphic: graphic, p_msg: msg });
  if (error) throw new Error(error.message);
}

/** One wire item of a batched send. */
export interface ControlSendItem {
  graphic: string;
  msg: ControlMessage | CueStatusMsg;
}

/** Send several commands as ONE atomic, log-ordered insert (`control_send_many`, 0029) —
 *  a multi-part verb must not pay one RPC round-trip per command or fail halfway through. */
export async function sendHostedControlBatch(slug: string, items: ControlSendItem[]): Promise<void> {
  const sb = await getSupabase();
  if (!sb) return;
  const { error } = await sb.rpc('control_send_many', { p_slug: slug, p_items: items });
  if (error) throw new Error(error.message);
}

// ── The cue verbs (docs/CLOUD_PLAYOUT.md §4) — ONE author for the wire sequence. ─────────────

/** Take a cue: its data, the previous graphic played out (one live layer), this graphic in,
 *  and the shared cue status row — atomically, in log order. */
export function takeCueOnWire(
  slug: string,
  cue: { id: string; graphic: string; values: Record<string, string> },
  prevGraphic: string | null,
): Promise<void> {
  return sendHostedControlBatch(slug, [
    { graphic: cue.graphic, msg: { t: 'update', data: cue.values } },
    ...(prevGraphic && prevGraphic !== cue.graphic
      ? [{ graphic: prevGraphic, msg: { t: 'stop' } satisfies ControlMessage }]
      : []),
    { graphic: cue.graphic, msg: { t: 'play' } },
    { graphic: cue.graphic, msg: { t: 'cue', cue: cue.id } },
  ]);
}

/** Out: play the live graphic off and clear the cue status. */
export function clearCueOnWire(slug: string, liveGraphic: string): Promise<void> {
  return sendHostedControlBatch(slug, [
    { graphic: liveGraphic, msg: { t: 'stop' } },
    { graphic: liveGraphic, msg: { t: 'cue', cue: null } },
  ]);
}

/**
 * Follow the command log with the FULL recovery discipline, owned once (docs/CLOUD_PLAYOUT.md
 * §3; previously hand-rolled per surface, which is how the same hole-handling bug shipped
 * three times): dedupe by row id; on an id hole recover from the tail INSTEAD of applying the
 * holed row (applying it would advance the cursor past the gap and the tail's older rows
 * would then be dropped as duplicates — a failed tail retries on the next row); tail-fill on
 * every (re)subscribe, because rows inserted while the socket was down produce no replay.
 * `tail` is injected — the control and output capabilities read the log through different RPCs.
 */
/** The tail RPCs' page size (0008/0029: `limit 500`) — a full page means "there is more". */
export const CONTROL_TAIL_PAGE = 500;
/** Runaway guard on the catch-up walk: 20k rows is far past any real outage after pruning. */
const MAX_TAIL_PAGES = 40;

export async function followControlLog(opts: {
  showId: string;
  /** The log baseline from the resolve call — rows after it follow live. */
  from: number;
  tail: (afterId: number) => Promise<ControlEventRow[]>;
  onRow: (row: ControlEventRow) => void;
}): Promise<() => void> {
  let lastId = opts.from;
  const apply = (row: ControlEventRow) => {
    if (row.id <= lastId) return;
    lastId = row.id;
    opts.onRow(row);
  };
  // The tail RPC answers at most CONTROL_TAIL_PAGE rows, so ONE call only ever recovers that much of
  // the gap. A renderer booting after an outage can be much further behind than a reconnecting
  // socket ever is, so keep pulling while pages come back full. Every page advances `lastId`
  // (the RPC returns rows AFTER it), so the walk always terminates; the page ceiling is a
  // runaway guard, not a design limit.
  const refill = () =>
    void (async () => {
      for (let page = 0; page < MAX_TAIL_PAGES; page += 1) {
        const rows = await opts.tail(lastId);
        rows.forEach(apply);
        if (rows.length < CONTROL_TAIL_PAGE) return;
      }
    })();
  return subscribeControlEvents(
    opts.showId,
    (row) => {
      if (row.id > lastId + 1) {
        refill();
        return;
      }
      apply(row);
    },
    refill,
  );
}

/** Stage PREPARED data — shared with every operator page on this slug. */
export async function stageHostedData(slug: string, graphic: string, data: Record<string, string>): Promise<void> {
  const sb = await getSupabase();
  if (!sb) return;
  await sb.rpc('control_stage', { p_slug: slug, p_graphic: graphic, p_data: data });
}

/** The command tail after a known id — a reconnecting side fills its gap from here. */
export async function hostedControlTail(slug: string, afterId: number, graphic?: string): Promise<ControlEventRow[]> {
  const sb = await getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc('control_tail', { p_slug: slug, p_graphic: graphic ?? null, p_after: afterId });
  if (error) return [];
  return (data ?? []) as ControlEventRow[];
}

/**
 * Live log rows for one show (the show-chat pattern: Realtime nudges, the durable table is
 * the truth). Returns an unsubscribe. Rows arrive in id order per the DB; the caller keeps
 * its own last-seen id and uses hostedControlTail after a gap.
 */
export async function subscribeControlEvents(
  showId: string,
  onRow: (row: ControlEventRow) => void,
  onSubscribed?: () => void,
): Promise<() => void> {
  const sb = await getSupabase();
  if (!sb) return () => {};
  const channel = sb
    .channel(`control-${showId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'control_events', filter: `show_id=eq.${showId}` },
      (payload) => onRow(payload.new as ControlEventRow),
    )
    // SUBSCRIBED fires on every (re)join, not only the first — the callback is where a
    // consumer tail-fills the gap a dropped socket left (rows inserted while away produce no
    // postgres_changes replay, so without this a sleeping tab misses commands until the NEXT
    // row happens to arrive with a visible id hole).
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onSubscribed?.();
    });
  return () => {
    void sb.removeChannel(channel);
  };
}
