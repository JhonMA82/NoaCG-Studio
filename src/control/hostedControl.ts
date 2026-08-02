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
import { loadGraphics, entriesForSavedGraphic, templateForSavedGraphic } from '../model/library';
import type { Resolution, SpxField, SpxTemplate } from '../model/types';
import { fileToDataUrl, isImageAsset } from '../assets/assetUtils';
import type { ControlMessage } from './controlModel';

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

export type LiveReportMap = Record<
  string,
  { data?: Record<string, string>; state?: { groups: Record<string, string> } | null; at?: string }
>;

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
export function buildPanelSpec(show: Show): PanelGraphicSpec[] {
  const library = loadGraphics();
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
    resolution: o.resolution ?? { w: 1920, h: 1080 },
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
export async function buildOutputPayload(show: Show): Promise<OutputPayload> {
  const library = loadGraphics();
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
    (r, g) =>
      g.resolution.width > r.width || g.resolution.height > r.height
        ? {
            width: Math.max(r.width, g.resolution.width),
            height: Math.max(r.height, g.resolution.height),
            label: r.label,
          }
        : r,
    { width: 1920, height: 1080, label: 'Full HD 1080p' },
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
  const output = await buildOutputPayload(show);
  const { error } = await sb.from('control_shows').upsert(
    { id: show.id, title: show.name, panel: buildPanelSpec(show), output },
    { onConflict: 'id' },
  );
  if (error) throw new Error(error.message);
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  await sb.from('control_events').delete().eq('show_id', show.id).lt('created_at', cutoff);
  const { data, error: readError } = await sb
    .from('control_shows')
    .select('slug, output_slug')
    .eq('id', show.id)
    .single();
  if (readError) throw new Error(readError.message);
  const row = data as { slug: string; output_slug: string | null };
  return { slug: row.slug, outputSlug: row.output_slug };
}

/** The signed-in owner's hosted control pages. */
export async function myControlShows(): Promise<ControlShowRow[]> {
  const sb = await getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from('control_shows').select('id, slug, output_slug, title').order('created_at');
  if (error) return [];
  return ((data ?? []) as { id: string; slug: string; output_slug: string | null; title: string }[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    outputSlug: r.output_slug ?? null,
    title: r.title,
  }));
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
  };
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
): Promise<void> {
  const sb = await getSupabase();
  if (!sb) return;
  await sb.rpc('control_output_report', { p_output_slug: outputSlug, p_graphic: graphic, p_data: data, p_state: state });
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
