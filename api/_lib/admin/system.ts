// /api/admin/system - the operational controls.
//
//   GET                              current state, with the approved routes listed
//   POST { action, ... }             set-features | set-routes | set-notice | set-beta
//
// These are INCIDENT controls, not entitlements. A disabled feature is off for everyone,
// plans and manual overrides included, because a kill switch a per-user override could defeat
// is not a kill switch. That precedence lives in the entitlement contract, not here.
//
// A setting can DISABLE an approved model route. It can never introduce one: the catalog is
// audited and benchmarked at promotion time (docs/AI_TASK_REGISTRY.md), and a database row
// that could add a route would send paid traffic to an unreviewed model.

import { apiError, json, readJson } from '../http.js';
import { adminDb, adminNotFound, requireAdmin, writeAudit } from '../adminAuth.js';
import { resetSystemSettingsCache, systemSettings } from '../systemSettings.js';
import { APPROVED_MODEL_CATALOG } from '../aiModelCatalog.js';
import { proGateTerms } from '../pro/gate.js';
import { FEATURE_LABELS, isFeatureKey } from '../../../src/entitlements/contract.js';
import type { AdminSystemState } from '../../../src/admin/types.js';

const MAX_BODY_BYTES = 16_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function write(actorId: string, key: string, value: unknown): Promise<{ error: string | null }> {
  const db = await adminDb();
  const { error } = await db
    .from('system_settings')
    .upsert({ key, value, updated_by: actorId, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  // The read path caches for a few seconds; drop it now so the operator watching the page
  // sees the switch take effect rather than wondering whether it saved.
  resetSystemSettingsCache();
  return { error: error?.message ?? null };
}

export default {
  async fetch(req: Request): Promise<Response> {
    const gate = await requireAdmin(req, req.method === 'GET' ? 'support' : 'admin');
    if (!gate.ok) return gate.response;

    if (req.method === 'GET') {
      const settings = await systemSettings();
      const response: AdminSystemState = {
        disabledFeatures: settings.disabledFeatures,
        models: APPROVED_MODEL_CATALOG.map((entry) => ({
          provider: entry.route.provider,
          model: entry.route.model,
          enabled: !settings.disabledRoutes.includes(`${entry.route.provider}:${entry.route.model}`),
          note: entry.notes,
        })),
        maintenanceNotice: settings.maintenanceNotice,
        betaUserIds: settings.betaUserIds,
        // Which deployment term is vanishing hosted Pro, if any. The public status endpoint
        // collapses these into one `not-configured` (a refusal must not enumerate the
        // server's configuration); the operator gets the term-by-term view.
        hostedPro: await proGateTerms(),
      };
      return json(response);
    }

    if (req.method !== 'POST') return adminNotFound();

    let body: Record<string, unknown>;
    try {
      body = await readJson<Record<string, unknown>>(req, MAX_BODY_BYTES);
    } catch {
      return apiError('invalid', 'Malformed request.', 400);
    }

    if (body.action === 'set-features') {
      const disabled = Array.isArray(body.features)
        ? body.features.filter((value): value is string => typeof value === 'string').filter(isFeatureKey)
        : [];
      const { error } = await write(gate.actor.userId, 'disabled_features', disabled);
      if (error) return apiError('internal', 'The switches could not be saved.', 500);
      await writeAudit(req, gate.actor, {
        action: 'system.features',
        targetType: 'system',
        targetId: 'disabled_features',
        summary: disabled.length
          ? `switched off: ${disabled.map((key) => FEATURE_LABELS[key]).join(', ')}`
          : 'all features switched back on',
        detail: { disabled },
      });
      return json({ ok: true });
    }

    if (body.action === 'set-routes') {
      // Only routes that exist in the audited catalog can be named. A disabled key for a
      // route nobody serves is dead config that later reads as protection.
      const approved = new Set(APPROVED_MODEL_CATALOG.map((entry) => `${entry.route.provider}:${entry.route.model}`));
      const disabled = Array.isArray(body.routes)
        ? body.routes.filter((value): value is string => typeof value === 'string' && approved.has(value))
        : [];
      const { error } = await write(gate.actor.userId, 'disabled_routes', disabled);
      if (error) return apiError('internal', 'The routes could not be saved.', 500);
      await writeAudit(req, gate.actor, {
        action: 'system.routes',
        targetType: 'system',
        targetId: 'disabled_routes',
        summary: disabled.length ? `disabled routes: ${disabled.join(', ')}` : 'all approved routes enabled',
        detail: { disabled },
      });
      return json({ ok: true });
    }

    if (body.action === 'set-notice') {
      const notice = body.notice;
      let value: unknown = null;
      if (notice && typeof notice === 'object' && !Array.isArray(notice)) {
        const row = notice as Record<string, unknown>;
        const message = typeof row.message === 'string' ? row.message.trim().slice(0, 500) : '';
        if (message) {
          const until = typeof row.until === 'string' && row.until && Number.isFinite(Date.parse(row.until))
            ? new Date(row.until).toISOString()
            : null;
          value = { message, level: row.level === 'warning' ? 'warning' : 'info', until };
        }
      }
      const { error } = await write(gate.actor.userId, 'maintenance_notice', value);
      if (error) return apiError('internal', 'The notice could not be saved.', 500);
      await writeAudit(req, gate.actor, {
        action: 'system.notice',
        targetType: 'system',
        targetId: 'maintenance_notice',
        summary: value ? 'published a maintenance notice' : 'cleared the maintenance notice',
        detail: { notice: value },
      });
      return json({ ok: true });
    }

    if (body.action !== 'set-beta') return apiError('invalid', 'Unknown action.', 400);

    const ids = Array.isArray(body.userIds)
      ? body.userIds.filter((value): value is string => typeof value === 'string' && UUID.test(value)).slice(0, 500)
      : [];
    const { error } = await write(gate.actor.userId, 'beta_user_ids', ids);
    if (error) return apiError('internal', 'The beta list could not be saved.', 500);
    await writeAudit(req, gate.actor, {
      action: 'system.beta',
      targetType: 'system',
      targetId: 'beta_user_ids',
      summary: `${ids.length} account(s) in the beta cohort`,
      detail: { count: ids.length },
    });
    return json({ ok: true });
  },
};
