import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { buildOutputPayload, type ControlSendItem, type OutputPayload } from '../../control/hostedControl';
import { createOutputStage, type OutputStage } from '../../output/stage';
import type { GraphicDoc } from '../../model/library';
import type { Show } from '../../model/shows';

/**
 * The PROGRAM monitor (docs/PLAYOUT_DASHBOARD.md §2): what is on air, rendered locally.
 *
 * It is deliberately the REAL renderer — `createOutputStage` over `buildOutputPayload`, the same
 * two functions the published output URL is built from — fed the same `ControlSendItem[]` the
 * verbs send. A monitor that agreed with air only because both were written to agree would be
 * worth nothing; this one cannot disagree without the renderer itself being wrong.
 *
 * It follows EVERY command that reaches air, not only this operator's: on a published production
 * the page hands it the rows arriving on the shared log, so a take from someone else's phone
 * shows up here too.
 *
 * This was the rehearsal stage. Rehearsal is gone (§6): preview is local and always available,
 * so a separate "practise" mode was a second way to do what the surface already does — and the
 * one mistake it could cause, believing you were rehearsing while you were live, went with it.
 */
export interface ProgramStageHandle {
  /** Apply commands, exactly as the published renderer would apply them off the log. */
  apply(items: ControlSendItem[]): void;
}

const ProgramStage = forwardRef<ProgramStageHandle, { show: Show; library: GraphicDoc[]; empty: boolean }>(
  function ProgramStage({ show, library, empty }, ref) {
    const host = useRef<HTMLDivElement>(null);
    const stage = useRef<OutputStage | null>(null);
    const [payload, setPayload] = useState<OutputPayload | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Rebuild only when the pool's own content changes. The show object gets a new identity on
    // every store write (renaming a cue, typing a field), and rebuilding here re-inlines every
    // asset as a data URL and reloads every iframe — which would restart the monitor under the
    // operator on a keystroke. Cue VALUES deliberately do not appear in the signature: they ride
    // each take as `update` data, so a rebuild is never needed to pick them up. The LAYER does:
    // it is the stage's paint order.
    const poolSignature = show.graphics.map((g) => `${g.id}:${g.savedAt}:${g.layer ?? ''}`).join('|');
    useEffect(() => {
      let alive = true;
      setError(null);
      void buildOutputPayload(show, library)
        .then((p) => {
          if (alive) setPayload(p);
        })
        .catch((e: Error) => {
          if (alive) setError(e.message);
        });
      return () => {
        alive = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [poolSignature, library]);

    useEffect(() => {
      const root = host.current;
      if (!root || !payload) return;
      const built = createOutputStage(root, payload, {
        // Scale into the MONITOR, not the viewport — the /output page keeps the window default.
        fit: () => ({ width: root.clientWidth, height: root.clientHeight }),
      });
      stage.current = built;
      const ro = new ResizeObserver(() => built.rescale());
      ro.observe(root);
      return () => {
        ro.disconnect();
        stage.current = null;
        built.destroy();
      };
    }, [payload]);

    useImperativeHandle(
      ref,
      () => ({
        apply(items: ControlSendItem[]) {
          // Status rows ('cue') are not renderer commands; the stage ignores them by contract,
          // so the whole batch can be handed over untouched.
          for (const item of items) stage.current?.apply(item.graphic, item.msg);
        },
      }),
      [],
    );

    return (
      <div className="prod-monitor-stage" ref={host} data-testid="program-stage">
        {!payload && !error && <p className="hint prod-monitor-note">Building the output…</p>}
        {error && <p className="status-bad prod-monitor-note">Could not build the output: {error}</p>}
        {/* An empty frame is the CORRECT picture with nothing on air, and it looks identical to
            a broken one. The caption goes the moment any layer is up. */}
        {payload && empty && <p className="hint prod-monitor-empty">Nothing on air</p>}
      </div>
    );
  },
);

export default ProgramStage;
