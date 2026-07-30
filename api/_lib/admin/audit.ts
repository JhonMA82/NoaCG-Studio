// GET /api/admin/audit - the record of what admins did.
//
// Read-only by design, and read-only by PRIVILEGE too: the table has no update or delete
// grant for any role (migration 0017), so there is no endpoint that could edit this even if
// one were written. Filters narrow the view; they never change what was recorded.
//
// Keyset paging on created_at rather than an offset: an append-only log grows at the head,
// and an offset would shift every row under the reader between pages.

import { apiError, json, methodGuard } from '../http.js';
import { requireAdmin, adminDb } from '../adminAuth.js';
import type { AdminAuditEntry, AdminAuditResponse } from '../../../src/admin/types.js';

const PAGE = 100;

export default {
  async fetch(req: Request): Promise<Response> {
    const gate = await requireAdmin(req, 'support');
    if (!gate.ok) return gate.response;
    const guard = methodGuard(req, 'GET');
    if (guard) return guard;

    const params = new URL(req.url).searchParams;
    const before = params.get('before');
    const action = params.get('action')?.trim() ?? '';
    const targetId = params.get('targetId')?.trim() ?? '';

    const db = await adminDb();
    let query = db
      .from('admin_audit_log')
      .select('id, created_at, actor_email, actor_role, action, target_type, target_id, summary')
      .order('created_at', { ascending: false })
      .limit(PAGE + 1);

    if (before && Number.isFinite(Date.parse(before))) query = query.lt('created_at', before);
    if (action) query = query.ilike('action', `${action}%`);
    if (targetId) query = query.eq('target_id', targetId);

    const { data, error } = await query;
    if (error) return apiError('internal', 'Could not read the audit log.', 500);

    const rows = (data ?? []) as {
      id: string;
      created_at: string;
      actor_email: string;
      actor_role: string;
      action: string;
      target_type: string;
      target_id: string;
      summary: string;
    }[];

    // One row over the page size tells us whether another page exists without a count query.
    const page = rows.slice(0, PAGE);
    const entries: AdminAuditEntry[] = page.map((row) => ({
      id: row.id,
      at: row.created_at,
      actorEmail: row.actor_email,
      actorRole: row.actor_role,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      summary: row.summary,
    }));

    const response: AdminAuditResponse = {
      entries,
      nextBefore: rows.length > PAGE ? page[page.length - 1].created_at : null,
    };
    return json(response);
  },
};
