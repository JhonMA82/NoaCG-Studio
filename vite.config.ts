import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { devPort, writeLaunchConfig } from './scripts/dev-port.mjs';
import { renderApiPlugin } from './scripts/renderDevPlugin.mjs';
import { aiApiPlugin } from './scripts/aiDevPlugin.mjs';
import { adminApiPlugin } from './scripts/adminDevPlugin.mjs';

// NoaCG Studio — dev/build config.
// Three pages: index.html is the static public landing at "/", app.html is the editor at
// "/app", admin.html is the private admin surface at "/admin" (unlinked and noindex — it is
// a 404 for everyone the server does not recognise, see docs/ADMIN.md). Vercel serves the
// clean URLs via cleanUrls (vercel.json); this tiny plugin gives the dev and preview servers
// the same ones. `?raw` imports bundle GSAP + template snippets.
const CLEAN_PAGES = ['/app', '/admin'] as const;

function appCleanUrl(): Plugin {
  const prepare = (
    req: { url?: string },
    res: { setHeader: (name: string, value: string) => void },
  ) => {
    // Preview iframes are deliberately sandboxed without allow-same-origin, so their origin
    // is opaque. Bundled OFL fonts are public static assets and need an explicit CORS response
    // to render there. Keep the allowance scoped to /fonts rather than every app response.
    if (req.url?.startsWith('/fonts/')) res.setHeader('Access-Control-Allow-Origin', '*');
    for (const page of CLEAN_PAGES) {
      if (req.url === page || req.url?.startsWith(page + '?')) {
        req.url = `${page}.html` + (req.url.slice(page.length) || '');
        break;
      }
    }
  };
  return {
    name: 'app-clean-url',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        prepare(req, res);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        prepare(req, res);
        next();
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  // Keep the Claude preview launch config pointing at this checkout's port (worktrees get
  // their own — see scripts/dev-port.mjs). Serve-time only: builds shouldn't touch files.
  if (command === 'serve') writeLaunchConfig();
  if (command === 'serve') {
    // The dev server mounts the REAL api/ handlers (aiDevPlugin/renderApiPlugin), and they
    // read server-only configuration from process.env exactly as they do on Vercel — but
    // Vite loads .env files only into import.meta.env, never process.env. Fill the gap at
    // serve time so `AI_LITE_*`, provider keys, and the render config work locally the way
    // production works. Only MISSING keys are filled: an inline env var (or a Playwright
    // webServer.env override, e.g. the offline suite's blanked Supabase vars) always wins.
    for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) {
      if (!(key in process.env)) process.env[key] = value;
    }
  }
  return {
    // renderApiPlugin mounts the real api/render handlers on the dev server, so the cloud
    // render loop runs fully offline (local Remotion executor) during development.
    plugins: [react(), appCleanUrl(), renderApiPlugin(), aiApiPlugin(), adminApiPlugin()],
    // strictPort: the port is this checkout's identity (playwright + the dev scripts derive
    // the same number), so failing loudly beats silently drifting onto a neighbour's port.
    // open: skipped on CI runners — there is no browser to open, only Playwright's.
    server: { port: devPort(), strictPort: true, open: !process.env.CI },
    build: {
      target: 'es2020',
      outDir: 'dist',
      rollupOptions: {
        input: { landing: 'index.html', app: 'app.html', admin: 'admin.html' },
      },
    },
  };
});
