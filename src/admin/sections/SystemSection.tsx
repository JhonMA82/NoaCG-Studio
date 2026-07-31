// Operational controls: the switches that exist so a 9pm incident is a click, not a deploy.
//
// Each block states what it overrides, because these are the only controls on this surface
// that beat a plan and a manual override. An operator switching a feature off should know
// they are switching it off for everyone, including the account they just granted it to.

import { useEffect, useState } from 'react';
import {
  ENFORCED_FEATURE_KEYS,
  FEATURE_ENFORCEMENT_NOTES,
  FEATURE_KEYS,
  FEATURE_LABELS,
} from '../../entitlements/contract';
import type { FeatureKey } from '../../entitlements/contract';
import type { AdminSessionResponse, AdminSystemState } from '../types';
import { adminPost } from '../client';
import { AsyncState, Field, SectionHeader, Toggle, useAdminData } from '../ui';

export function SystemSection({ session }: { session: AdminSessionResponse }) {
  const state = useAdminData<AdminSystemState>('system');
  const [problem, setProblem] = useState('');
  const readOnly = session.role === 'support';

  const [notice, setNotice] = useState({ message: '', level: 'info' as 'info' | 'warning', until: '' });
  useEffect(() => {
    if (!state.data) return;
    setNotice({
      message: state.data.maintenanceNotice?.message ?? '',
      level: state.data.maintenanceNotice?.level ?? 'info',
      until: state.data.maintenanceNotice?.until?.slice(0, 10) ?? '',
    });
  }, [state.data]);

  async function send(body: Record<string, unknown>) {
    setProblem('');
    try {
      await adminPost('system', body);
      state.reload();
    } catch {
      setProblem('That change did not go through.');
    }
  }

  if (!state.data) {
    return (
      <section className="admin-section admin-section-wide">
        <SectionHeader title="System" />
        <AsyncState state={state} />
      </section>
    );
  }

  const disabled = new Set(state.data.disabledFeatures);
  const disabledRoutes = new Set(
    state.data.models.filter((model) => !model.enabled).map((model) => `${model.provider}:${model.model}`),
  );

  return (
    <section className="admin-section admin-section-wide">
      <SectionHeader title="System" lede="Incident controls. These take effect within seconds and need no deploy." />
      {problem ? <p className="admin-problem">{problem}</p> : null}

      <section className="admin-block">
        <h3>Feature switches</h3>
        <p className="admin-muted">
          Switching a feature off disables it for <strong>everyone</strong> - plans, temporary grants and manual
          overrides included. That is deliberate: a switch an override could defeat would be useless during the
          incident it exists for.
        </p>
        {FEATURE_KEYS.map((key: FeatureKey) => (
          <Toggle
            key={key}
            label={FEATURE_LABELS[key]}
            // Say plainly which switches do not bite yet. A switch reached for during an
            // incident that turns out to stop nothing is worse than no switch at all.
            hint={
              !ENFORCED_FEATURE_KEYS.has(key)
                ? ' not enforced yet - this records the setting but does not stop the feature'
                : FEATURE_ENFORCEMENT_NOTES[key]
                  ? ` ${FEATURE_ENFORCEMENT_NOTES[key]}${disabled.has(key) ? ' - currently off' : ''}`
                  : disabled.has(key)
                    ? ' currently off for everyone'
                    : undefined
            }
            checked={!disabled.has(key)}
            onChange={(enabled) => {
              if (readOnly) return;
              const next = new Set(disabled);
              if (enabled) next.delete(key);
              else next.add(key);
              void send({ action: 'set-features', features: [...next] });
            }}
          />
        ))}
      </section>

      <section className="admin-block">
        <h3>Model routes</h3>
        <p className="admin-muted">
          Turning a route off stops it serving traffic. Routes cannot be added here - the catalog is audited and
          benchmarked when a route is promoted, and adding one from a settings page would send paid traffic to an
          unreviewed model.
        </p>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Route</th>
              <th>Serving</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {state.data.models.map((model) => {
              const routeKey = `${model.provider}:${model.model}`;
              return (
                <tr key={routeKey} className={model.enabled ? '' : 'admin-row-dim'}>
                  <td className="admin-mono">{routeKey}</td>
                  <td>
                    <Toggle
                      label={model.enabled ? 'on' : 'off'}
                      checked={model.enabled}
                      onChange={(enabled) => {
                        if (readOnly) return;
                        const next = new Set(disabledRoutes);
                        if (enabled) next.delete(routeKey);
                        else next.add(routeKey);
                        void send({ action: 'set-routes', routes: [...next] });
                      }}
                    />
                  </td>
                  <td className="admin-muted">{model.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="admin-block">
        <h3>Maintenance notice</h3>
        <p className="admin-muted">Shown to every visitor, signed in or not. Clear the message to remove it.</p>
        <Field label="Message">
          <input
            value={notice.message}
            disabled={readOnly}
            onChange={(event) => setNotice({ ...notice, message: event.target.value })}
            placeholder="Cloud rendering is paused while we fix an upstream issue."
          />
        </Field>
        <Field label="Tone">
          <select
            value={notice.level}
            disabled={readOnly}
            onChange={(event) => setNotice({ ...notice, level: event.target.value === 'warning' ? 'warning' : 'info' })}
          >
            <option value="info">Information</option>
            <option value="warning">Warning</option>
          </select>
        </Field>
        <Field label="Clears on" hint="Optional. The notice stops showing by itself after this date.">
          <input
            type="date"
            value={notice.until}
            disabled={readOnly}
            onChange={(event) => setNotice({ ...notice, until: event.target.value })}
          />
        </Field>
        {!readOnly ? (
          <div className="admin-row">
            <button
              type="button"
              className="primary"
              onClick={() =>
                void send({
                  action: 'set-notice',
                  notice: {
                    message: notice.message,
                    level: notice.level,
                    until: notice.until ? new Date(`${notice.until}T23:59:59Z`).toISOString() : null,
                  },
                })
              }
            >
              Publish notice
            </button>
            <button type="button" onClick={() => void send({ action: 'set-notice', notice: null })}>
              Clear
            </button>
          </div>
        ) : null}
      </section>

      <BetaCohort
        ids={state.data.betaUserIds}
        readOnly={readOnly}
        onChange={(userIds) => void send({ action: 'set-beta', userIds })}
      />
    </section>
  );
}

/** The beta cohort, edited by user id.
 *
 *  By id rather than by email because ids are what the ledgers and the audit log carry, so
 *  the value pasted here is the value that appears everywhere else. The Users list shows an
 *  account's id, which is where an operator copies it from. */
function BetaCohort({
  ids,
  readOnly,
  onChange,
}: {
  ids: string[];
  readOnly: boolean;
  onChange: (ids: string[]) => void;
}) {
  const [candidate, setCandidate] = useState('');
  return (
    <section className="admin-block">
      <h3>Beta cohort</h3>
      <p className="admin-muted">
        These accounts see beta-marked features and templates regardless of their plan. For anything narrower,
        use a per-user grant on the account itself - that one records a reason and can expire.
      </p>
      {ids.length === 0 ? <p className="admin-muted">Nobody yet.</p> : null}
      <ul className="admin-idlist">
        {ids.map((id) => (
          <li key={id}>
            <span className="admin-mono">{id}</span>
            {!readOnly ? (
              <button type="button" onClick={() => onChange(ids.filter((entry) => entry !== id))}>
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {!readOnly ? (
        <div className="admin-row">
          <input
            value={candidate}
            onChange={(event) => setCandidate(event.target.value)}
            placeholder="User id"
            aria-label="User id to add to the beta cohort"
          />
          <button
            type="button"
            onClick={() => {
              const next = candidate.trim();
              if (!next || ids.includes(next)) return;
              onChange([...ids, next]);
              setCandidate('');
            }}
          >
            Add
          </button>
        </div>
      ) : null}
    </section>
  );
}
