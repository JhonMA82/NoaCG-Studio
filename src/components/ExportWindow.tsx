import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { useRouter, type Route } from '../app/router';
import type { SpxTemplate } from '../model/types';
import ExportSurface from './ExportSurface';
import { useModalGate } from './spaceKey';

/** What the window is exporting. Everything it needs travels in the request, so the caller
 *  can hand it a graphic that is not the open project — a saved record off a Home card, or a
 *  template the wizard has just built and deliberately NOT applied. */
export interface ExportRequest {
  template: SpxTemplate;
  sampleData: Record<string, string>;
  /** The library record, when there is one — its control-panel entries ride into the package. */
  graphicId: string | null;
}

export const useExportUi = create<{
  request: ExportRequest | null;
  openExport: (request: ExportRequest) => void;
  close: () => void;
}>((set) => ({
  request: null,
  openExport: (request) => set({ request }),
  close: () => set({ request: null }),
}));

/**
 * The standalone export window — the SAME surface the editor's Export panel shows, in a
 * modal, for a graphic you are not currently editing. It exists so export is not a reward
 * for opening the editor: the wizard's Finish step ends here, and so does a saved graphic's
 * Export button on Home.
 *
 * Mounted ONCE (App.tsx, beside the routed surface) — the request lives in a module store, so
 * a second mount would render a second modal.
 */
export default function ExportWindow() {
  const request = useExportUi((s) => s.request);
  const close = useExportUi((s) => s.close);
  const route = useRouter((s) => s.route);
  // Declared with the open flag rather than on mount: this component stays mounted for the
  // session and renders null when shut, so a bare gate would kill every editor shortcut for
  // the whole session (see components/CLAUDE.md, spaceKey).
  useModalGate(!!request);

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, close]);

  // The window holds a SNAPSHOT of one graphic, so it must not outlive the surface it was
  // opened from. Browser Back is how that happens: the route walks away while the modal stays
  // up, leaving a package dialog over a page with nothing to do with it.
  //
  // The opening route is recorded on the effect's FIRST run for a request, never before it —
  // the wizard's export door closes the gallery, navigates to Home and opens the window in one
  // batched tick, so the route this window belongs to is the one that arrives WITH it. Reading
  // a route captured earlier would make that hop look like a navigation away and shut the
  // window in the same breath it opened.
  const pressedOnBackdrop = useRef(false);
  const openedAt = useRef<Route | null>(null);
  useEffect(() => {
    if (!request) {
      openedAt.current = null;
      return;
    }
    if (openedAt.current === null) {
      openedAt.current = route;
      return;
    }
    if (route !== openedAt.current) close();
  }, [route, request, close]);

  if (!request) return null;

  return (
    // Click-to-close must only fire on a GENUINE outside click — not when a text selection
    // drag started inside a field (the render section's duration and still-time inputs) and
    // released over the backdrop, which the browser routes here as a click on the nearest
    // common ancestor. Same guard the wizard carries, for the same reason.
    <div
      className="gallery-backdrop"
      onMouseDown={(e) => { pressedOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnBackdrop.current) close();
        pressedOnBackdrop.current = false;
      }}
    >
      <div
        className="wz-modal export-window"
        role="dialog"
        aria-modal="true"
        aria-label="Export graphic"
        data-testid="export-window"
      >
        <div className="wz-header">
          <h2>
            Export <span className="muted">· {request.template.name}</span>
          </h2>
          <button className="gallery-close" onClick={close} title="Close">✕</button>
        </div>
        <div className="export-window-body">
          <ExportSurface
            template={request.template}
            sampleData={request.sampleData}
            graphicId={request.graphicId}
          />
        </div>
      </div>
    </div>
  );
}
