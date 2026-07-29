import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { trackPageVisit } from './backend/events';

// One report per page load, before React mounts so a slow first render cannot cost the
// datapoint. Inert without a backend and inert for a visitor who opted out or sends DNT.
trackPageVisit();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
