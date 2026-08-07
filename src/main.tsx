import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { trackPageVisit } from './backend/events';
import { hydrateDurableStore } from './model/durableStore';

// One report per page load, before React mounts so a slow first render cannot cost the
// datapoint. Inert without a backend and inert for a visitor who opted out or sends DNT.
trackPageVisit();

// The saved documents live in IndexedDB behind a synchronous mirror (model/durableStore.ts).
// Loading that mirror is the one asynchronous step in the boot, and it MUST finish before the
// app is imported: module scope reads the autosaved project as it loads (store/templateStore.ts
// computes the initial template and Reset baseline from it), so importing App first would give
// a returning user a blank studio and then autosave over their work. Hence the dynamic import -
// a static one is hoisted above this await and would run at exactly the wrong moment.
async function boot(): Promise<void> {
  await hydrateDurableStore();
  const { default: App } = await import('./App');
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void boot();
