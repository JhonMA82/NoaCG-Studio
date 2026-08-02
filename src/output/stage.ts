// The output STAGE (docs/CLOUD_PLAYOUT.md §3): one fixed-size surface at the production
// resolution, CSS-scaled to the viewport, holding ONE sandboxed iframe per published graphic —
// all built at load (preload), stacked in rundown order, each composed through the same
// composeDocument the editor previews with. Templates start invisible by the SPX contract, so
// an idle stacked graphic shows nothing.
//
// The stage is deliberately DUMB: it routes ControlMessages to the right iframe as
// previewProtocol commands and reports back what it forwarded. Which cue airs, and stopping the
// previously-live graphic, are the CONTROL surfaces' decisions — they ride the log as ordinary
// commands, whoever wrote them (an operator today, a data connector later).

import { composeDocument } from '../preview/composeDocument';
import {
  postPreviewCmd,
  PREVIEW_STATE_TYPE,
  type PreviewMachineState,
  type PreviewStateMessage,
} from '../preview/previewProtocol';
import type { ControlEventRow, OutputGraphicSpec, OutputPayload } from '../control/hostedControl';
import type { SpxTemplate } from '../model/types';
import { DEFAULT_SETTINGS } from '../model/types';

/** Rebuild a renderable SpxTemplate from the published snapshot. Fields/settings/layers are
 *  parsed views the composer never reads — the html/css/js carry the truth, as always. */
function templateFromSpec(spec: OutputGraphicSpec): SpxTemplate {
  return {
    name: spec.key,
    type: 'blank',
    resolution: spec.resolution,
    fps: spec.fps,
    html: spec.html,
    css: spec.css,
    js: spec.js,
    fields: [],
    settings: DEFAULT_SETTINGS,
    assets: spec.assets.map((a) => ({ path: a.path, data: a.data })),
    layers: [],
  };
}

export interface OutputStage {
  /** Route one command to its graphic's document. Unknown graphics and the log's status rows
   *  ('cue'/'staged'/'live') are ignored, so a caller can feed rows straight through. */
  apply(graphic: string, msg: ControlEventRow['msg']): void;
  /** Ask a graphic's document for its machine state (answers arrive via onState). */
  requestState(graphic: string): void;
  /** The latest machine state each document reported (null = none / not machine-bearing). */
  states: ReadonlyMap<string, PreviewMachineState | null>;
  /** Called whenever a document reports a state that DIFFERS from the last one seen. */
  onState(cb: (graphic: string, state: PreviewMachineState | null) => void): void;
  /** The graphic keys the stage hosts, in payload (rundown/layer) order. */
  graphics: string[];
  destroy(): void;
}

/** Build the stage into `root` and keep it scaled to the viewport. */
export function createOutputStage(root: HTMLElement, payload: OutputPayload): OutputStage {
  const { width, height } = payload.resolution;
  const stage = document.createElement('div');
  stage.style.cssText = [
    `width:${width}px`,
    `height:${height}px`,
    'position:absolute',
    'left:50%',
    'top:50%',
    'transform-origin:0 0',
    'background:transparent',
  ].join(';');
  root.appendChild(stage);

  // Predictable broadcast scaling: the stage is always resolution-exact design pixels,
  // centred and uniformly scaled to fit the window (a 1920×1080 production fills a 1920×1080
  // browser source 1:1; any other viewport letterboxes transparently).
  const rescale = () => {
    const scale = Math.min(window.innerWidth / width, window.innerHeight / height);
    // transform-origin 0 0 + a translate by half the SCALED size: the stage stays centred
    // without percentage translates compounding with the scale.
    stage.style.transform = `translate(${(-width * scale) / 2}px, ${(-height * scale) / 2}px) scale(${scale})`;
  };
  rescale();
  window.addEventListener('resize', rescale);

  const frames = new Map<string, HTMLIFrameElement>();
  const states = new Map<string, PreviewMachineState | null>();
  const stateCbs: ((graphic: string, state: PreviewMachineState | null) => void)[] = [];

  for (const spec of payload.graphics) {
    const iframe = document.createElement('iframe');
    // The same sandbox posture as every preview surface: published template code must never
    // reach the app origin (no allow-same-origin, ever — see preview/previewProtocol.ts).
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('title', spec.key);
    iframe.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      `width:${spec.resolution.width}px`,
      `height:${spec.resolution.height}px`,
      'border:0',
      'background:transparent',
    ].join(';');
    iframe.srcdoc = composeDocument(templateFromSpec(spec), { liveControl: true });
    stage.appendChild(iframe);
    frames.set(spec.key, iframe);
    states.set(spec.key, null);
  }

  // State replies carry no graphic name — the SOURCE window identifies the sender.
  const onMessage = (ev: MessageEvent) => {
    const data = ev.data as PreviewStateMessage | undefined;
    if (!data || data.type !== PREVIEW_STATE_TYPE) return;
    for (const [key, frame] of frames) {
      if (frame.contentWindow === ev.source) {
        const prev = JSON.stringify(states.get(key) ?? null);
        const next = data.state ?? null;
        if (JSON.stringify(next) !== prev) {
          states.set(key, next);
          for (const cb of stateCbs) cb(key, next);
        }
        return;
      }
    }
  };
  window.addEventListener('message', onMessage);

  const apply = (graphic: string, msg: ControlEventRow['msg']) => {
    const win = frames.get(graphic)?.contentWindow;
    if (!win) return;
    switch (msg.t) {
      case 'update':
        postPreviewCmd(win, { cmd: 'update', data: JSON.stringify(msg.data ?? {}) });
        break;
      case 'play':
        postPreviewCmd(win, { cmd: 'play' });
        break;
      case 'stop':
        postPreviewCmd(win, { cmd: 'stop' });
        break;
      case 'next':
        postPreviewCmd(win, { cmd: 'next' });
        break;
      case 'event':
        postPreviewCmd(win, { cmd: 'dispatch', event: msg.event, payload: msg.payload });
        break;
      case 'snap':
        // Recovery semantics stated explicitly — the wire field means opposite things to the
        // editor simulator (parked design view, timers off) and to a renderer (timers arm).
        postPreviewCmd(win, { cmd: 'snap', assignments: msg.snap, timers: true });
        break;
      default:
        return; // 'hello' and status rows ('cue'/'staged'/'live') are not renderer commands
    }
    postPreviewCmd(win, { cmd: 'state' });
  };

  return {
    apply,
    requestState: (graphic) => {
      const win = frames.get(graphic)?.contentWindow;
      if (win) postPreviewCmd(win, { cmd: 'state' });
    },
    states,
    onState: (cb) => stateCbs.push(cb),
    graphics: payload.graphics.map((g) => g.key),
    destroy: () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('resize', rescale);
      stage.remove();
    },
  };
}
