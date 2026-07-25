/**
 * The postMessage command channel a preview document listens for when composeDocument's
 * `liveControl` option is on (composeDocument.ts) — the only way a parent can drive a document
 * that carries no `allow-same-origin` (every preview iframe in this app, since the template being
 * shown can be AI-generated or imported code and must never be able to reach the app's own origin
 * through `parent`/`contentWindow`/`contentDocument`).
 *
 * One shape, so the senders (WizardPreview's Replay/Out/demo-text push, GraphicControlPage's
 * transport + event buttons) and the script serialized into the document (composeDocument.ts)
 * can't drift on the wire. The reply types (`PreviewBoxMessage`, `PreviewStateMessage`) are the
 * matching shapes a listener reads back off `window.addEventListener('message', …)`.
 */

export const PREVIEW_CMD_TYPE = 'spx-preview-cmd';
export const PREVIEW_BOX_TYPE = 'spx-preview-box';
export const PREVIEW_STATE_TYPE = 'spx-preview-state';

export type PreviewCmd =
  | { cmd: 'play'; data?: string }
  | { cmd: 'stop' }
  | { cmd: 'next' }
  | { cmd: 'update'; data: string }
  | { cmd: 'settle'; data: string }
  | { cmd: 'measure' }
  | { cmd: 'dispatch'; event: string; payload?: Record<string, string> }
  | { cmd: 'state' };

/** Post a command into a preview iframe's document. No-op if it hasn't loaded one yet. */
export function postPreviewCmd(win: Window | null | undefined, msg: PreviewCmd): void {
  win?.postMessage({ type: PREVIEW_CMD_TYPE, ...msg }, '*');
}

/** The graphic's machine pointers — what a state chip names and what greys an event button. */
export interface PreviewMachineState {
  groups: Record<string, string>;
}

export interface PreviewBoxMessage {
  type: typeof PREVIEW_BOX_TYPE;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PreviewStateMessage {
  type: typeof PREVIEW_STATE_TYPE;
  state: PreviewMachineState | null;
}
