// Build a single runnable HTML document from a template, for the live preview iframe.
//
// In the editor the HTML references external files (css/template.css, js/template.js,
// js/gsap.min.js). Those don't exist inside an iframe srcdoc, so here we strip those local
// references and inline the CSS, the bundled GSAP, and the template JS instead. The exported
// package keeps the external references (the files are written to disk by the exporter).

import gsapSource from '../assets/gsap.min.js?raw';
import lottieSource from '../assets/lottie.min.js?raw';
import { inlineAssetRefs, isDataUrl } from '../assets/assetUtils';
import { templateUsesLottie } from '../assets/lottieSupport';
import { settleGraphic, reportGraphicBox } from './settleGraphic';
import type { SpxTemplate } from '../model/types';

/** Remove <link>/<script> tags that point at local template files we will inline instead.
 *  (Exported: render/composeRenderDocument composes its own self-contained document.) */
export function stripLocalAssetTags(html: string): string {
  return html
    // <link rel="stylesheet" href="css/..."> and similar relative stylesheets
    .replace(/<link\b[^>]*href=["'](?:\.\/)?(?:css\/|js\/)[^"']*["'][^>]*>/gi, '')
    // <script src="js/..."></script> (gsap, template.js, any local js)
    .replace(/<script\b[^>]*src=["'](?:\.\/)?(?:js\/|css\/)[^"']*["'][^>]*>\s*<\/script>/gi, '');
}

/** Options for the live preview composition. */
export interface ComposeOptions {
  /**
   * Authoring/pasteboard mode — the EDITOR PREVIEW ONLY. Render the canvas inset by this pad
   * (canvas px) inside a larger viewport so content positioned OUTSIDE the canvas (an
   * entrance that starts off the left edge) is still painted and reachable. Pad is a pure
   * editor-view concept: it never enters the template code, keyframes, or any persisted
   * state, and it is NEVER used by exports/renders/thumbnails (those use their own composers).
   */
  authoring?: { padX: number; padY: number };
  /**
   * Park the graphic at its settled on-air state from INSIDE the document, driving it with this
   * data (a JSON string, the shape `update()` takes). Once settled, the document also reports its
   * own bounding box back to `parent` (`{ type: 'spx-preview-box', x, y, w, h }`) — a caller that
   * needs to frame on the graphic (preview/frameGraphic.ts) reads that instead of
   * `measureGraphicBox`'s direct `contentDocument` read, which cross-origin content cannot do.
   *
   * Every other preview surface settles from the OUTSIDE (settleGraphicOnLoad reaches into the
   * iframe), which needs same-origin access. A surface showing UNTRUSTED content — the moderation
   * queue's preview of a stranger's template, or a Home card's thumbnail rendering AI/imported
   * code — runs it with `sandbox="allow-scripts"` and nothing else, so there is no reaching in,
   * and without this it showed a black rectangle for every graphic that is hidden until play():
   * exactly the surface whose only job is to LOOK at the thing. The recipe is not restated here;
   * the shared function is serialized into the document.
   */
  settleWithData?: string;
  /**
   * Install a COMMAND CHANNEL inside the document instead of settling it once: the wizard's
   * persistent live preview (WizardPreview.tsx) needs to play/stop/update the SAME document
   * repeatedly (Replay, Out, a demo-text push) at times the parent can't predict, so a one-shot
   * settle isn't enough — but the template being previewed can be AI-generated or hand-imported
   * code, so the iframe still carries no `allow-same-origin` and the parent still can't reach in
   * directly.
   *
   * The document listens for `{ type: 'spx-preview-cmd', cmd: 'play' | 'stop' | 'update' |
   * 'measure', data?: string }` from `parent` and calls the matching SPX function
   * (`data`, where given, is the JSON string `update()` takes); `'play'` and `'measure'` reply
   * with the document's box exactly like `settleWithData` does, so a caller measuring for the
   * zoom-to-graphic framing never needs `contentDocument`. `'play'` waits (capped) on
   * `document.fonts.ready` first, so a font choice shows on the entrance whether the play comes
   * from the initial auto-play or a later Replay click.
   */
  liveControl?: boolean;
}

/** Inject inline <style>, GSAP, and the template JS into the document <head>/<body>. */
export function composeDocument(template: SpxTemplate, options: ComposeOptions = {}): string {
  // Inline uploaded assets (assets/foo.png -> data URL) so the preview renders media
  // without a server. The exported package keeps the relative paths + real files.
  let html = stripLocalAssetTags(inlineAssetRefs(template.html, template.assets));
  const css = inlineAssetRefs(template.css, template.assets);

  const { width, height } = template.resolution;

  // Base style: ensure the canvas is always exactly the right resolution even if the
  // template CSS doesn't set it (e.g. the blank template). Template CSS can override.
  const baseStyle = `html, body { width: ${width}px; height: ${height}px; overflow: hidden; }`;

  const styleTag = `<style id="spx-base-style">\n${baseStyle}\n</style>\n<style id="spx-inline-css">\n${css}\n</style>`;

  // Authoring/pasteboard mode (editor preview only, never exported): the iframe VIEWPORT is
  // grown to canvas + pad on every side (by PreviewFrame), so painting off-canvas content
  // requires a viewport larger than the canvas. This style — injected AFTER the template CSS
  // so it wins the cascade — insets the canvas by `pad` and stops the body from clipping.
  // `position: relative` is the least-invasive containing block: it keeps the root and every
  // absolutely-positioned descendant resolving against the canvas-sized body, so a 1920x1080
  // template lays out exactly as it does on air (verified by the pasteboard spike). No
  // transform/contain (would add a compositing layer) and no innerWidth shim — the residual
  // divergences (position:fixed, vw/vh, window.innerWidth reflecting the padded viewport) are
  // unused by the house px-based templates and stay honest rather than half-shimmed.
  const authoringStyleTag = options.authoring
    ? `<style id="spx-authoring-style">
html { overflow: hidden; }
body { position: relative; overflow: visible !important; margin: ${options.authoring.padY}px ${options.authoring.padX}px !important; }
</style>`
    : '';
  const gsapTag = `<script id="spx-gsap">\n${gsapSource}\n</script>`;
  // The bundled Lottie player rides along ONLY when the template uses it (unlike GSAP,
  // which every template animates with) — see src/assets/lottieSupport.ts.
  const lottieTag = templateUsesLottie(template) ? `\n<script id="spx-lottie">\n${lottieSource}\n</script>` : '';
  const jsTag = `<script id="spx-template-js">\n${template.js}\n</script>`;

  // Preview-only: uploaded assets exist as in-memory data URLs, so an image path the
  // template sets at RUNTIME (update() writing an <img> src, a rebuild injecting
  // <img src="images/...">) can't resolve inside the srcdoc iframe. This observer swaps
  // any known relative path for its data URL the moment it appears. The exported package
  // has the real files on disk and needs none of this.
  const runtimeAssets = Object.fromEntries(
    template.assets.filter((a) => isDataUrl(a.data)).map((a) => [a.path, a.data as string]),
  );
  const assetShimTag = Object.keys(runtimeAssets).length
    ? `<script id="spx-preview-assets">
(function () {
  var MAP = ${JSON.stringify(runtimeAssets)};
  function fix(img) {
    var src = img.getAttribute('src');
    if (!src) return;
    var clean = src.replace(/^\\.\\//, '');
    if (MAP[clean]) img.src = MAP[clean];
  }
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      if (m.type === 'attributes' && m.target.tagName === 'IMG') fix(m.target);
      if (m.addedNodes) m.addedNodes.forEach(function (n) {
        if (n.tagName === 'IMG') fix(n);
        else if (n.querySelectorAll) n.querySelectorAll('img').forEach(fix);
      });
    });
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
})();
</script>\n`
    : '';

  // Capture runtime errors and report them to the builder (for the validator / inline feedback).
  // Defined before the template JS so it also catches errors thrown there.
  const captureTag = `<script id="spx-error-capture">
window.onerror = function (message, source, lineno) {
  try { parent.postMessage({ type: 'spx-preview-error', message: String(message), line: lineno }, '*'); } catch (e) {}
  return false;
};
window.addEventListener('unhandledrejection', function (ev) {
  try { parent.postMessage({ type: 'spx-preview-error', message: String(ev.reason) }, '*'); } catch (e) {}
});
</script>`;

  // Preview-only: match the editor's color-scheme (styles.css :root). Chromium disables
  // iframe TRANSPARENCY when the embedder's and the iframe's color-schemes disagree — a
  // dark app around an undeclared (light) srcdoc would paint the stage opaque white.
  // Exported packages don't get this tag; playout servers control their own background.
  const colorSchemeTag = `<meta name="color-scheme" content="dark">`;

  // GSAP must load before the template JS. Put both at the end of <head> if possible. The
  // authoring style comes LAST so it overrides the template's own resetCanvasCss.
  const headInjection = `${colorSchemeTag}\n${assetShimTag}${gsapTag}${lottieTag}\n${styleTag}\n${authoringStyleTag ? `${authoringStyleTag}\n` : ''}`;
  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${headInjection}</head>`);
  } else {
    html = headInjection + html;
  }

  // The settle bootstrap: the SHARED recipe (preview/settleGraphic.ts), serialized into the
  // document so it can run where the parent cannot reach. One definition, two places it executes.
  const settleTag = options.settleWithData
    ? `\n<script id="spx-settle">
(function () {
  var settle = ${settleGraphic.toString()};
  var report = ${reportGraphicBox.toString()};
  var run = function () {
    settle(window, ${JSON.stringify(options.settleWithData)});
    report(window);
  };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(run, run);
  else run();
})();
</script>`
    : '';

  // The live-control bootstrap (see ComposeOptions.liveControl): a command channel over
  // postMessage in place of contentWindow/contentDocument access. `waitFonts` mirrors the
  // fonts-ready cap the settle bootstrap folds into `run` above; here it gates every 'play'
  // (not just the first) since a Replay click should also show the chosen font, and awaiting an
  // already-resolved `fonts.ready` costs nothing observable.
  const liveControlTag = options.liveControl
    ? `\n<script id="spx-live-control">
(function () {
  var report = ${reportGraphicBox.toString()};
  function waitFonts(cb) {
    if (document.fonts && document.fonts.ready) {
      var done = false;
      var go = function () { if (done) return; done = true; cb(); };
      document.fonts.ready.then(go, go);
      setTimeout(go, 400);
    } else {
      cb();
    }
  }
  window.addEventListener('message', function (ev) {
    if (ev.source !== window.parent) return;
    var msg = ev.data;
    if (!msg || msg.type !== 'spx-preview-cmd') return;
    if (msg.cmd === 'update') {
      try { window.update && window.update(msg.data); } catch (e) {}
    } else if (msg.cmd === 'play') {
      waitFonts(function () {
        try {
          if (msg.data != null) window.update && window.update(msg.data);
          window.play && window.play();
        } catch (e) {}
        report(window);
      });
    } else if (msg.cmd === 'stop') {
      try { window.stop && window.stop(); } catch (e) {}
    } else if (msg.cmd === 'measure') {
      report(window);
    }
  });
})();
</script>`
    : '';

  // Error capture + template JS go right before </body> so the DOM exists when functions run.
  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${captureTag}\n${jsTag}${settleTag}${liveControlTag}\n</body>`);
  } else {
    html = html + captureTag + jsTag + settleTag + liveControlTag;
  }

  return html;
}
