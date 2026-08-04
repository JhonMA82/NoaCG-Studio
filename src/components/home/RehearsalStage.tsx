import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { buildOutputPayload, type ControlSendItem, type OutputPayload } from '../../control/hostedControl';
import { createOutputStage, type OutputStage } from '../../output/stage';
import type { GraphicDoc } from '../../model/library';
import type { Show } from '../../model/shows';

/**
 * The REHEARSAL stage (docs/CLOUD_PLAYOUT.md §4a): the production's own output, rendered locally
 * on the production page and driven by the operator's verbs, with nothing going near the log.
 *
 * It is deliberately the REAL renderer — `createOutputStage` over `buildOutputPayload`, the same
 * two functions the published output URL is built from — and it is fed the same
 * `ControlSendItem[]` the wire verbs send. A rehearsal that agreed with air only because both
 * were written to agree would be worth nothing; this one cannot disagree without the renderer
 * itself being wrong.
 *
 * The payload is built from the LOCAL show, not from what was published, because rehearsing is
 * how you check a change before publishing it.
 */
export interface RehearsalStageHandle {
  /** Apply a verb's commands, exactly as the renderer would apply them off the log. */
  apply(items: ControlSendItem[]): void;
}

const RehearsalStage = forwardRef<RehearsalStageHandle, { show: Show; library: GraphicDoc[]; empty: boolean }>(
  function RehearsalStage({ show, library, empty }, ref) {
    const host = useRef<HTMLDivElement>(null);
    const stage = useRef<OutputStage | null>(null);
    const [payload, setPayload] = useState<OutputPayload | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Rebuild only when the pool's own content changes. The show object gets a new identity on
    // every store write (renaming a cue, typing a field), and rebuilding here re-inlines every
    // asset as a data URL and reloads every iframe — which would restart the rehearsal under
    // the operator on a keystroke. Cue VALUES deliberately do not appear in the signature:
    // they ride each Take as `update` data, so a rebuild is never needed to pick them up.
    const poolSignature = show.graphics.map((g) => `${g.id}:${g.savedAt}`).join('|');
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
        // Scale into the PANEL, not the viewport — the /output page keeps the window default.
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
          // so the whole verb can be handed over untouched.
          for (const item of items) stage.current?.apply(item.graphic, item.msg);
        },
      }),
      [],
    );

    return (
      <div className="prod-rehearsal-stage" ref={host} data-testid="rehearsal-stage">
        {!payload && !error && <p className="hint prod-rehearsal-note">Building the rehearsal output…</p>}
        {error && <p className="status-bad prod-rehearsal-note">Could not build the rehearsal output: {error}</p>}
        {/* An empty frame is the CORRECT picture with nothing on air, and it looks identical to
            a broken one. The caption is chrome on a local rehearsal, so it costs the fidelity
            nothing, and it goes the moment any layer is up. */}
        {payload && empty && <p className="hint prod-rehearsal-empty">Nothing on air — Take a cue.</p>}
      </div>
    );
  },
);

export default RehearsalStage;
