// The record of what admins did.
//
// Read-only, and read-only all the way down: the table has no update or delete grant for any
// role, so there is no button here that could exist. The filters narrow what is shown; they
// never change what was written.

import { useState } from 'react';
import type { AdminAuditResponse } from '../types';
import { AsyncState, Pill, SectionHeader, formatDateTime, useAdminData, useDebounced } from '../ui';

export function AuditSection() {
  const [action, setAction] = useState('');
  const [targetId, setTargetId] = useState('');
  const debouncedAction = useDebounced(action);
  const debouncedTarget = useDebounced(targetId);

  const query = new URLSearchParams();
  if (debouncedAction) query.set('action', debouncedAction);
  if (debouncedTarget) query.set('targetId', debouncedTarget);
  const log = useAdminData<AdminAuditResponse>(`audit${query.toString() ? `?${query}` : ''}`);

  return (
    <section className="admin-section admin-section-wide">
      <SectionHeader
        title="Audit"
        lede="Every admin action, with who did it and when. Nothing on this surface can edit or delete an entry."
      />

      <div className="admin-row">
        <input
          value={action}
          onChange={(event) => setAction(event.target.value)}
          placeholder="Action prefix, e.g. user. or plan."
          aria-label="Filter by action"
        />
        <input
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
          placeholder="Target id"
          aria-label="Filter by target"
        />
      </div>

      {log.data && log.data.entries.length > 0 ? (
        <table className="admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>What happened</th>
            </tr>
          </thead>
          <tbody>
            {log.data.entries.map((entry) => (
              <tr key={entry.id}>
                <td className="admin-mono">{formatDateTime(entry.at)}</td>
                <td>
                  {entry.actorEmail || <span className="admin-muted">(unknown)</span>}
                  {entry.actorRole ? <Pill tone="muted">{entry.actorRole}</Pill> : null}
                </td>
                <td className="admin-mono">{entry.action}</td>
                <td>
                  {entry.summary}
                  {entry.targetId ? <div className="admin-muted admin-mono">{entry.targetId}</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <AsyncState state={log} empty="Nothing recorded yet." />
      )}

      {log.data?.nextBefore ? (
        <p className="admin-muted">
          Older entries exist. Narrow the filters to reach them - this view shows the most recent page.
        </p>
      ) : null}
    </section>
  );
}
