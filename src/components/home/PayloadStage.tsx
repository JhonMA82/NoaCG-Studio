import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { ControlSendItem, OutputPayload } from '../../control/hostedControl';
import { createOutputStage, type OutputStage } from '../../output/stage';

/**
 * A MONITOR over a rendered production (docs/PLAYOUT_DASHBOARD.md §2): `createOutputStage` over
 * an `OutputPayload` — the same two functions the published output URL is built from — fed the
 * same `ControlSendItem[]` the verbs send.
 *
 * That identity is the whole point. A monitor that agreed with air only because both were
 * written to agree would be worth nothing; this one cannot disagree without the renderer itself
 * being wrong. It serves BOTH monitors on both surfaces: PROGRAM is one of these driven by what
 * reaches air, PREVIEW is one driven locally by the selected cue.
 */
export interface PayloadStageHandle {
  /** Apply commands, exactly as the published renderer would apply them off the log. */
  apply(items: ControlSendItem[]): void;
}

const PayloadStage = forwardRef<
  PayloadStageHandle,
  { payload: OutputPayload | null; error?: string | null; emptyLabel?: string; testId?: string }
>(function PayloadStage({ payload, error, emptyLabel, testId }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<OutputStage | null>(null);

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
    <div className="prod-monitor-stage" ref={host} data-testid={testId ?? 'program-stage'}>
      {!payload && !error && <p className="hint prod-monitor-note">Building the output…</p>}
      {error && <p className="status-bad prod-monitor-note">Could not build the output: {error}</p>}
      {/* An empty frame is the CORRECT picture with nothing up, and it looks identical to a
          broken one. The caption goes the moment any layer is on. */}
      {payload && emptyLabel && <p className="hint prod-monitor-empty">{emptyLabel}</p>}
    </div>
  );
});

export default PayloadStage;
