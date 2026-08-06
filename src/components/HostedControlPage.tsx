import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  eventButtons,
  eventLegality,
  fieldDescriptors,
  isEventLegal,
  machineStateGroups,
} from '../control/controlModel';
import {
  clearAllCuesOnWire,
  clearCueOnWire,
  controlShowBySlug,
  followControlLog,
  hostedControlTail,
  sendHostedControl,
  stageHostedData,
  takeCueOnWire,
  withLiveCue,
  type LiveCueMap,
  type OutputCue,
  type PanelGraphicSpec,
  type ResolvedControlShow,
} from '../control/hostedControl';
import { isBackendConfigured } from '../backend/config';
import { FieldControl } from './fields/FieldControl';
import PayloadStage, { type PayloadStageHandle } from './home/PayloadStage';

/**
 * The HOSTED control page — the operator surface at `<app-url>?control=<slug>`. No login, no
 * builder shell; the unguessable slug is the capability (the ?chat= pattern).
 *
 * It renders THE PLAYOUT DASHBOARD: docs/PLAYOUT_DASHBOARD.md is the binding design, shared with
 * the in-app production page and the exported controller. Before that contract this page was a
 * FORM — no monitors at all, one tall card per graphic stacked down a narrow column, so an
 * operator could neither see what they were about to air nor what was on it. A student who
 * learned the exported controller could not operate this.
 *
 * BOTH MONITORS ARE REAL, and neither needs anything new from the backend: the published payload
 * already carries every graphic's code, so PREVIEW is a local stage this page drives itself and
 * PROGRAM is a second local stage driven by the shared LOG — which means it shows what is really
 * on air, including a take from somebody else's device.
 *
 * Multi-operator by construction: field edits go to the SHARED staging buffer (every open page
 * follows them), a take publishes them as an update command, and each graphic reports what it
 * actually applied. All of it rides the one durable log, so a refresh of any participant
 * recovers.
 */
export default function HostedControlPage({ slug }: { slug: string }) {
  const [show, setShow] = useState<ResolvedControlShow | null | 'loading'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [liveCue, setLiveCue] = useState<LiveCueMap>({});
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  const previewRef = useRef<PayloadStageHandle>(null);
  const programRef = useRef<PayloadStageHandle>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!isBackendConfigured()) {
      setShow(null);
      return;
    }
    let live = true;
    let unsubscribe: (() => void) | null = null;
    void (async () => {
      const resolved = await controlShowBySlug(slug);
      if (!live) return;
      setShow(resolved);
      if (!resolved) return;
      const tail = (after: number) => hostedControlTail(slug, after);
      // Which cues were already on air comes off the ROW (0031's snapshot, per-layer since
      // 0034), seeded before following so old rows can never overwrite a newer fact.
      setLiveCue(resolved.liveCue);
      unsubscribe = await followControlLog({
        showId: resolved.id,
        from: resolved.lastEventId,
        tail,
        onRow: (row) => {
          const msg = row.msg;
          if (msg.t === 'staged') {
            setShow((s) => (s && s !== 'loading' ? { ...s, staged: { ...s.staged, [row.graphic]: msg.data } } : s));
          } else if (msg.t === 'live') {
            setShow((s) =>
              s && s !== 'loading' ? { ...s, live: { ...s.live, [row.graphic]: { data: msg.data, state: msg.state } } } : s,
            );
          } else if (msg.t === 'cue') {
            // A cue row names its own graphic, so it only ever speaks for that ONE layer.
            setLiveCue((m) => withLiveCue(m, row.graphic, msg.cue));
          } else {
            // A RENDERER command: mirror it onto the PROGRAM monitor, so this page shows what
            // actually reached air rather than only what its own buttons sent.
            programRef.current?.apply([{ graphic: row.graphic, msg }]);
          }
        },
      });
    })();
    return () => {
      live = false;
      unsubscribe?.();
    };
  }, [slug]);

  const resolved = show && show !== 'loading' ? show : null;
  const cues: OutputCue[] = useMemo(() => resolved?.output?.cues ?? [], [resolved]);
  const payload = resolved?.output ?? null;
  const selectedCue = cues.find((c) => c.id === selectedCueId) ?? cues[0] ?? null;
  const specByName = useMemo(
    () => new Map((resolved?.panel ?? []).map((g) => [g.name, g] as const)),
    [resolved],
  );
  const layerOf = useCallback(
    (graphic: string) => payload?.graphics.find((g) => g.key === graphic)?.layer ?? null,
    [payload],
  );

  /** Show the selected cue on PREVIEW — local only, never the wire (§1: selection IS preview). */
  const previewCue = useCallback(
    (cue: OutputCue | null, values?: Record<string, string>) => {
      if (!cue) return;
      previewRef.current?.apply([
        { graphic: cue.graphic, msg: { t: 'update', data: values ?? cue.values } },
        { graphic: cue.graphic, msg: { t: 'play' } },
      ]);
    },
    [],
  );
  // The first cue previews as soon as the payload's stage exists, so the surface is never two
  // empty boxes on arrival.
  const previewedOnce = useRef(false);
  useEffect(() => {
    if (!payload || !selectedCue || previewedOnce.current) return;
    previewedOnce.current = true;
    const t = setTimeout(() => previewCue(selectedCue), 400);
    return () => clearTimeout(t);
  }, [payload, selectedCue, previewCue]);

  // BOOT RECOVERY for the PROGRAM monitor. The log follower only sees rows that arrive AFTER
  // this page opened, so a production that has been on air all afternoon would show an empty
  // PROGRAM box beside a rundown row marked ON AIR — the surface contradicting itself. Each
  // graphic's last REPORTED data is on the resolved row (what it says it actually applied), so
  // replay that for every layer the row says is up.
  //
  // Safe here in a way it was NOT in an exported package: this stage drives nothing but itself.
  // The round-1 bug was a baked log follower snapping a REAL playout graphic to its last
  // reported (off) state one round-trip after the host's play().
  const recoveredRef = useRef(false);
  useEffect(() => {
    if (!payload || !resolved || recoveredRef.current) return;
    const up = Object.entries(liveCue).filter(([, cueId]) => !!cueId);
    if (up.length === 0) return;
    recoveredRef.current = true;
    for (const [graphic] of up) {
      const data = resolved.live[graphic]?.data;
      programRef.current?.apply([
        ...(data ? [{ graphic, msg: { t: 'update' as const, data } }] : []),
        { graphic, msg: { t: 'play' as const } },
      ]);
    }
  }, [payload, resolved, liveCue]);

  if (show === 'loading') {
    return (
      <div className="sendin">
        <div className="sendin-card"><p className="muted">Loading…</p></div>
      </div>
    );
  }
  if (!show) {
    return (
      <div className="sendin">
        <div className="sendin-card">
          <div className="sendin-title">Control page not found</div>
          <p className="muted">
            {isBackendConfigured()
              ? 'This link is invalid or the page was unpublished.'
              : 'Hosted control needs the cloud backend — this build runs offline.'}
          </p>
          {error && <p className="muted">{error}</p>}
        </div>
      </div>
    );
  }

  const surfaceSendError = (e: Error) =>
    setError(/slow down/i.test(e.message) ? 'Too many commands — slow down a moment.' : `Send failed: ${e.message}`);

  /** The layers that are up, front to back. */
  const liveLayers = (payload?.graphics ?? [])
    .map((g) => ({ graphic: g.key, layer: g.layer ?? 1, cueId: liveCue[g.key] ?? null }))
    .filter((l): l is { graphic: string; layer: number; cueId: string } => !!l.cueId)
    .map((l) => ({ ...l, label: cues.find((c) => c.id === l.cueId)?.label ?? l.graphic }))
    .sort((a, b) => b.layer - a.layer);

  const selectedGraphic = selectedCue?.graphic ?? null;
  const selectedLayerCueId = selectedGraphic ? liveCue[selectedGraphic] ?? null : null;
  const selectedIsLive = !!selectedCue && selectedLayerCueId === selectedCue.id;
  const spec: PanelGraphicSpec | null = selectedGraphic ? specByName.get(selectedGraphic) ?? null : null;

  /** The values the operator sees for the selected cue: the cue's own, with the SHARED staged
   *  buffer over them (another operator typing is visible here, by design). */
  const cueValues = (cue: OutputCue): Record<string, string> => ({
    ...cue.values,
    ...(resolved?.staged[cue.graphic] ?? {}),
  });

  const takeCue = (cue: OutputCue) =>
    takeCueOnWire(slug, { id: cue.id, graphic: cue.graphic, values: cueValues(cue) }).catch(surfaceSendError);
  const nextLayer = () => {
    if (selectedGraphic) void sendHostedControl(slug, selectedGraphic, { t: 'next' }).catch(surfaceSendError);
  };
  const outLayer = () => {
    if (selectedGraphic) void clearCueOnWire(slug, selectedGraphic).catch(surfaceSendError);
  };
  const updateLive = () => {
    if (selectedGraphic && selectedCue && selectedIsLive) {
      void sendHostedControl(slug, selectedGraphic, { t: 'update', data: cueValues(selectedCue) }).catch(surfaceSendError);
    }
  };
  const outAll = () => void clearAllCuesOnWire(slug, liveLayers.map((l) => l.graphic)).catch(surfaceSendError);

  const selectCue = (cue: OutputCue) => {
    setSelectedCueId(cue.id);
    previewCue(cue, cueValues(cue));
  };

  const elapsedText = (() => {
    const total = Math.max(0, Math.floor((now - openedAt) / 1000));
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  })();

  return (
    <div className="app playout-dashboard hosted-dashboard" data-testid="hosted-control-page">
      <header className="pd-header">
        <h1>{show.title}</h1>
        <span className="pd-mode pd-mode-show">● SHOW</span>
        <span className="pd-clock mono">{elapsedText}</span>
        <div className="spacer" />
        <button
          className="pd-allout"
          disabled={liveLayers.length === 0}
          onClick={outAll}
          title="Play every live layer off — clear the frame"
          data-testid="hosted-out-all"
        >
          ■ All out
        </button>
      </header>

      <main className="pd-body">
        <section className="pd-main">
          <div className="pd-monitors">
            <div className="pd-monitor pd-pvw">
              <h2>
                <span className="pd-dot" aria-hidden="true" />
                PREVIEW
                <span className="pd-what">{selectedCue?.label ?? 'nothing selected'}</span>
              </h2>
              <div className="pd-screen">
                <div className="pd-frame" style={{ aspectRatio: '16 / 9' }}>
                  <PayloadStage ref={previewRef} payload={payload} testId="hosted-preview-stage" />
                </div>
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
                  <PayloadStage
                    ref={programRef}
                    payload={payload}
                    emptyLabel={liveLayers.length === 0 ? 'Nothing on air' : undefined}
                    testId="hosted-program-stage"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pd-verbs" data-testid="hosted-verbs">
            <button
              className="pd-verb pd-verb-preview"
              disabled={!selectedCue}
              onClick={() => selectedCue && selectCue(selectedCue)}
              title="Show the selected cue on PREVIEW — nothing airs"
            >
              → Preview
            </button>
            <button
              className="pd-verb pd-verb-take"
              disabled={!selectedCue}
              onClick={() => selectedCue && void takeCue(selectedCue)}
              title="Air the previewed cue"
              data-testid="hosted-take-cue"
            >
              ⟳ TAKE
            </button>
            <button
              className="pd-verb pd-verb-update"
              disabled={!selectedIsLive}
              onClick={updateLive}
              title="Push the staged values to air without replaying"
            >
              ✎ Update
            </button>
            <button
              className="pd-verb"
              disabled={!selectedLayerCueId}
              onClick={nextLayer}
              title="Advance the on-air graphic one step"
              data-testid="hosted-next-cue"
            >
              » Next
            </button>
            <button
              className="pd-verb"
              disabled={!selectedLayerCueId}
              onClick={outLayer}
              title="Play this layer off — the others stay up"
              data-testid="hosted-out-cue"
            >
              ■ Out
            </button>
            <span className="pd-onair-line" data-testid="hosted-live-chip">
              {liveLayers.length === 0 ? (
                <span className="muted">○ nothing on air</span>
              ) : (
                <>
                  on air: <span className="pd-onair">● {liveLayers.map((l) => l.label).join(' · ')}</span>
                </>
              )}
            </span>
          </div>

          {selectedCue && spec && (
            <HostedCueEditor
              slug={slug}
              cue={selectedCue}
              spec={spec}
              values={cueValues(selectedCue)}
              live={selectedIsLive}
              layer={layerOf(selectedCue.graphic)}
              liveState={resolved?.live[selectedCue.graphic]?.state ?? null}
              onPreview={(values) => previewCue(selectedCue, values)}
              onError={setError}
            />
          )}
          {error && <p className="status-bad" data-testid="hosted-error">{error}</p>}
        </section>

        <aside className="pd-rail">
          <div className="pd-rail-head">
            <h2>Cue rundown</h2>
            <span className="muted">{cues.length}</span>
          </div>
          {cues.length === 0 && <p className="hint">This production has no cues yet.</p>}
          <div className="pd-cues" data-testid="hosted-cues">
            {cues.map((cue, i) => {
              const cueIsLive = liveCue[cue.graphic] === cue.id;
              const isSelected = cue.id === (selectedCue?.id ?? '');
              const layer = layerOf(cue.graphic);
              return (
                <div
                  key={cue.id}
                  className={`pd-cue${isSelected ? ' selected' : ''}${cueIsLive ? ' on-air' : isSelected ? ' on-pvw' : ''}`}
                  data-testid={`hosted-cue-${cue.id}`}
                >
                  <span className="pd-cue-no">{cueIsLive ? '●' : i + 1}</span>
                  <button className="pd-cue-label" onClick={() => selectCue(cue)} data-testid="hosted-select-cue">
                    <strong>{cue.label}</strong>
                    <span className="muted">
                      {layer !== null ? `L${layer} · ` : ''}
                      {cue.note || cue.graphic}
                    </span>
                  </button>
                  {cueIsLive ? (
                    <span className="pd-tag air">ON AIR</span>
                  ) : isSelected ? (
                    <span className="pd-tag pvw">PVW</span>
                  ) : null}
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
              {[...(payload?.graphics ?? [])]
                .sort((a, b) => (b.layer ?? 1) - (a.layer ?? 1))
                .map((g) => (
                  <span key={g.key} className={`pd-layer-chip${liveCue[g.key] ? ' live' : ''}`}>
                    <b>L{g.layer ?? 1}</b> {g.key}
                    {liveCue[g.key] && <i className="pd-layer-live" />}
                  </span>
                ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

/**
 * The selected cue's editor. Field edits go to the SHARED staging buffer, so every operator's
 * page follows them; nothing airs until an explicit take (or ✎ Update on a live layer). The
 * graphic's saved ENTRIES ride the panel spec read-only — picking one stages its values exactly
 * as typing them would.
 */
function HostedCueEditor({
  slug,
  cue,
  spec,
  values,
  live,
  layer,
  liveState,
  onPreview,
  onError,
}: {
  slug: string;
  cue: OutputCue;
  spec: PanelGraphicSpec;
  values: Record<string, string>;
  live: boolean;
  layer: number | null;
  liveState: { groups: Record<string, string> } | null;
  onPreview: (values: Record<string, string>) => void;
  onError: (message: string) => void;
}) {
  const descriptors = useMemo(() => fieldDescriptors(spec.fields), [spec.fields]);
  const events = useMemo(() => eventButtons(spec.js), [spec.js]);
  const legality = useMemo(() => eventLegality(spec.js), [spec.js]);
  /** Local echo for instant typing; the shared buffer reconciles it as its rows arrive. */
  const [echo, setEcho] = useState<Record<string, string>>({});
  const [entryId, setEntryId] = useState('');
  useEffect(() => {
    setEcho({});
    setEntryId('');
  }, [cue.id]);

  const valueOf = (key: string) => echo[key] ?? values[key] ?? '';
  const currentValues = () => {
    const out: Record<string, string> = {};
    for (const d of descriptors) out[d.key] = valueOf(d.key);
    return out;
  };

  // Debounced shared staging: a typing operator sends a few rows, not one per keystroke.
  const pending = useRef<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageSoon = (key: string, value: string) => {
    pending.current[key] = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const batch = pending.current;
      pending.current = {};
      void stageHostedData(slug, cue.graphic, batch).catch((e: Error) => onError(e.message));
    }, 400);
  };
  const edit = (key: string, value: string) => {
    setEcho((v) => ({ ...v, [key]: value }));
    setEntryId('');
    stageSoon(key, value);
    // Typing refreshes the PREVIEW monitor — locally, so nothing near air moves.
    onPreview({ ...currentValues(), [key]: value });
  };
  const loadEntry = (id: string) => {
    setEntryId(id);
    const entry = spec.entries.find((e) => e.id === id);
    if (!entry) return;
    const data: Record<string, string> = {};
    for (const d of descriptors) if (entry.values[d.key] !== undefined) data[d.key] = entry.values[d.key];
    setEcho((v) => ({ ...v, ...data }));
    if (timer.current) clearTimeout(timer.current);
    void stageHostedData(slug, cue.graphic, data).catch((e: Error) => onError(e.message));
    onPreview({ ...currentValues(), ...data });
  };

  // The chip names states the way the AUTHOR named them, exactly as the in-app cockpit does
  // (ProductionPage's `stateName`). This page used to print the raw state ids off the wire, so
  // the same graphic on the same dashboard design read "sealed" here and "Locked, choice
  // hidden" there — and this is the surface a student operates WITHOUT the app, where the id
  // is the one vocabulary nobody has seen. The names travel inside the template already
  // (`machine.controls`), so nothing new is fetched or published to say them.
  const stateGroups = useMemo(() => machineStateGroups(spec.js), [spec.js]);
  const stateName = (groupId: string, stateId: string) =>
    stateGroups.find((g) => g.id === groupId)?.states.find((s) => s.id === stateId)?.name ?? stateId;
  const stateLabel = liveState
    ? Object.entries(liveState.groups)
        .map(([gid, sid]) =>
          Object.keys(liveState.groups).length > 1 ? `${gid}: ${stateName(gid, sid)}` : stateName(gid, sid),
        )
        .join(' · ')
    : null;

  return (
    <div className={`pd-editor${live ? ' live' : ''}`} data-testid="hosted-cue-editor">
      <div className="pd-editor-head">
        <span className="pd-editor-kicker">EDITING {live ? 'ON-AIR CUE' : 'PREVIEW CUE'}</span>
        {/* Read-only here: cues are authored in the app and published with the production. */}
        <strong className="pd-cue-title-static">{cue.label}</strong>
        <span className="muted pd-editor-fate">
          {layer !== null ? `L${layer} · ` : ''}
          {live ? 'changes push live on ✎ Update' : 'changes air on ⟳ TAKE'}
        </span>
        {stateLabel && <span className="hosted-state-chip">{stateLabel}</span>}
        <div className="spacer" />
        {spec.entries.length > 0 && (
          <select
            value={entryId}
            onChange={(e) => loadEntry(e.target.value)}
            title="Saved data rows published with this graphic"
            data-testid="hosted-entry-select"
          >
            <option value="">Entry…</option>
            {spec.entries.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        )}
      </div>

      <div className="pd-fields">
        {descriptors.map((d) => (
          <label key={d.key} className="pd-field">
            <span>{d.key.toUpperCase()} · {d.label}</span>
            <FieldControl
              descriptor={d}
              value={valueOf(d.key)}
              onChange={(v: string | number) => edit(d.key, String(v))}
              images={spec.images.map((i) => ({ value: i.value }))}
            />
          </label>
        ))}
      </div>

      {events.length > 0 && (
        <div className="pd-editor-events">
          {events.map((e) => (
            <button
              key={e.event}
              disabled={!isEventLegal(legality, e.event, liveState)}
              className={e.destructive ? 'ctl-event-destructive' : undefined}
              onClick={() => {
                const payload: Record<string, string> = {};
                for (const key of e.payload ?? []) payload[key] = valueOf(key);
                void sendHostedControl(
                  slug,
                  cue.graphic,
                  e.payload?.length ? { t: 'event', event: e.event, payload } : { t: 'event', event: e.event },
                ).catch((err: Error) => onError(err.message));
              }}
              title={`Fires "${e.event}" — only where the graph allows it`}
            >
              ⚡ {e.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
