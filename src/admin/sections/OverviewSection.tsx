// The landing section. In this first cut it states the two facts the session endpoint
// returns and nothing else - an operator opening the page should be able to confirm WHICH
// account they are acting as before they change anything, and that confirmation is worth a
// section on its own even before the dashboards land.

import type { AdminSessionResponse } from '../types';

const ROLE_MEANING: Record<AdminSessionResponse['role'], string> = {
  owner: 'Full access, including granting and removing admin roles.',
  admin: "Can change any user's access, plans and system controls.",
  support: 'Read-only across the admin surface.',
};

export function OverviewSection({ session }: { session: AdminSessionResponse }) {
  return (
    <section className="admin-section">
      <h1>Overview</h1>
      <p className="admin-lede">
        You are signed in as <strong>{session.email || 'an account with no email on file'}</strong>{' '}
        with the <strong>{session.role}</strong> role. {ROLE_MEANING[session.role]}
      </p>
      <p className="admin-note">
        Every action taken here is recorded with your account, the time and a summary. The record
        cannot be edited or deleted from this page.
      </p>
    </section>
  );
}
