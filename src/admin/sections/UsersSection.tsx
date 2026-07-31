// The account list, and the door to one account's detail.
//
// Search is a plain substring over email plus an exact match on user id, because those are
// the two things an operator actually has when a support message arrives.

import { useState } from 'react';
import type { AdminPlanListResponse, AdminSessionResponse, AdminUserDetail, AdminUserListResponse } from '../types';
import { adminPost } from '../client';
import { AsyncState, Pill, SectionHeader, formatDate, formatUsd, relative, useAdminData, useDebounced } from '../ui';
import { UserDetail } from './UserDetail';

export function UsersSection({ session }: { session: AdminSessionResponse }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteProblem, setInviteProblem] = useState('');

  const debounced = useDebounced(query);
  const list = useAdminData<AdminUserListResponse>(`users?query=${encodeURIComponent(debounced)}`);
  const plans = useAdminData<AdminPlanListResponse>('plans');
  const detail = useAdminData<AdminUserDetail>(selected ? `user?id=${encodeURIComponent(selected)}` : null);

  const readOnly = session.role === 'support';

  return (
    <section className="admin-section admin-section-wide">
      <SectionHeader
        title="Users"
        lede="Search by email or paste a user id."
        actions={
          readOnly ? null : (
            <button type="button" className="primary" onClick={() => setInviting((open) => !open)}>
              Invite someone
            </button>
          )
        }
      />

      {inviting ? (
        <form
          className="admin-invite"
          onSubmit={(event) => {
            event.preventDefault();
            setInviteProblem('');
            void adminPost('users', { email: inviteEmail })
              .then(() => {
                setInviteEmail('');
                setInviting(false);
                list.reload();
              })
              .catch(() => setInviteProblem('The invitation was not sent. The address may already have an account.'));
          }}
        >
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="name@example.com"
            aria-label="Email to invite"
          />
          <button type="submit" className="primary">
            Send invitation
          </button>
          <span className="admin-muted">Signup stays open to everyone; this just pre-creates the account.</span>
          {inviteProblem ? <p className="admin-problem">{inviteProblem}</p> : null}
        </form>
      ) : null}

      <input
        className="admin-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search accounts…"
        aria-label="Search accounts"
      />

      {list.data && list.data.users.length > 0 ? (
        <>
          {list.data.truncated ? (
            <p className="admin-problem">
              The directory is longer than this page can walk. Narrow the search - some accounts are not shown.
            </p>
          ) : null}
          <table className="admin-table admin-table-hover">
            <thead>
              <tr>
                <th>Email</th>
                <th>Registered</th>
                <th>Last seen</th>
                <th>Plan</th>
                <th>State</th>
                <th className="admin-num">AI 30 d</th>
                <th className="admin-num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {list.data.users.map((user) => (
                <tr
                  key={user.id}
                  className={user.id === selected ? 'admin-row-selected' : ''}
                  onClick={() => setSelected(user.id)}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelected(user.id);
                    }
                  }}
                >
                  <td>
                    {user.email || <span className="admin-muted">(no email)</span>}
                    {user.isAdmin ? <Pill tone="warn">{user.isAdmin}</Pill> : null}
                    {user.pendingInvite ? <Pill tone="muted">invited</Pill> : null}
                  </td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>{relative(user.lastSignInAt)}</td>
                  <td>{user.planName}</td>
                  <td>
                    {user.state === 'suspended' ? <Pill tone="danger">suspended</Pill> : <Pill tone="ok">active</Pill>}
                  </td>
                  <td className="admin-num">{user.aiGenerations30d}</td>
                  <td className="admin-num">{formatUsd(user.aiCostUsd30d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="admin-muted">
            {list.data.users.length} of {list.data.total} account(s).
          </p>
        </>
      ) : (
        <AsyncState state={list} empty="No accounts match that." />
      )}

      {selected && detail.data ? (
        <UserDetail
          detail={detail.data}
          plans={plans.data?.plans ?? []}
          session={session}
          onChanged={() => {
            detail.reload();
            list.reload();
          }}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </section>
  );
}
