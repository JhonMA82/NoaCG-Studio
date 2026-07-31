// The admin shell.
//
// The whole page is one state machine with three states and only one way forward:
//
//   checking  ->  allowed      (the server said yes)
//             ->  unavailable  (anything else, forever)
//
// It STARTS in `checking`, which renders the same plain 404 as `unavailable`. That ordering
// is the point: a slow, failed or refused authorization can never flash the shell, and a
// visitor who is not an admin sees a page indistinguishable from a mistyped URL. There is no
// retry button and no error text for the same reason.
//
// Sections are registered in SECTIONS below; the rail renders exactly what is built. An
// unbuilt area is absent rather than present-and-empty.

import { useEffect, useState, type ReactElement } from 'react';
import { AdminUnavailable, adminFetch } from './client';
import { NotFound } from './NotFound';
import { AuditSection } from './sections/AuditSection';
import { OverviewSection } from './sections/OverviewSection';
import { PlansSection } from './sections/PlansSection';
import { QualitySection } from './sections/QualitySection';
import { SystemSection } from './sections/SystemSection';
import { TemplatesSection } from './sections/TemplatesSection';
import { UsageSection } from './sections/UsageSection';
import { UsersSection } from './sections/UsersSection';
import type { AdminSessionResponse } from './types';

interface AdminSection {
  id: string;
  label: string;
  render: (session: AdminSessionResponse) => ReactElement;
}

const SECTIONS: AdminSection[] = [
  { id: 'overview', label: 'Overview', render: (session) => <OverviewSection session={session} /> },
  { id: 'users', label: 'Users', render: (session) => <UsersSection session={session} /> },
  { id: 'plans', label: 'Plans', render: (session) => <PlansSection session={session} /> },
  { id: 'usage', label: 'Usage and cost', render: () => <UsageSection /> },
  { id: 'quality', label: 'Output quality', render: () => <QualitySection /> },
  { id: 'system', label: 'System', render: (session) => <SystemSection session={session} /> },
  { id: 'templates', label: 'Templates', render: (session) => <TemplatesSection session={session} /> },
  { id: 'audit', label: 'Audit', render: () => <AuditSection /> },
];

type Gate =
  | { state: 'checking' }
  | { state: 'unavailable' }
  | { state: 'allowed'; session: AdminSessionResponse };

export default function AdminApp() {
  const [gate, setGate] = useState<Gate>({ state: 'checking' });
  const [active, setActive] = useState(SECTIONS[0].id);

  useEffect(() => {
    let cancelled = false;
    adminFetch<AdminSessionResponse>('session')
      .then((session) => {
        if (!cancelled) setGate({ state: 'allowed', session });
      })
      .catch((error: unknown) => {
        // AdminUnavailable is the expected path for every visitor who is not an admin.
        // Anything else is a bug in this page, and it still resolves to the same 404 -
        // the surface must not become more informative because our own code broke.
        if (!cancelled) setGate({ state: 'unavailable' });
        if (!(error instanceof AdminUnavailable)) console.error(error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (gate.state !== 'allowed') return <NotFound />;

  const section = SECTIONS.find((entry) => entry.id === active) ?? SECTIONS[0];

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-brand">
          <span className="admin-brand-mark">NoaCG</span>
          <span className="admin-brand-word">admin</span>
        </div>
        <div className="admin-identity">
          <span className="admin-role" data-role={gate.session.role}>
            {gate.session.role}
          </span>
          <span className="admin-email">{gate.session.email || 'unknown account'}</span>
        </div>
      </header>

      <div className="admin-body">
        <nav className="admin-rail" aria-label="Admin sections">
          {SECTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === active ? 'admin-rail-item active' : 'admin-rail-item'}
              aria-current={entry.id === active ? 'page' : undefined}
              onClick={() => setActive(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        <main className="admin-content">{section.render(gate.session)}</main>
      </div>
    </div>
  );
}
