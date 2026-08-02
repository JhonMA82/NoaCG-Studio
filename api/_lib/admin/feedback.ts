// GET/POST /api/admin/feedback - what people actually said, and what has been done about it.
//
// Every other reporting surface here counts things the product wrote about itself. This one
// carries what a person chose to tell us, which makes it the only admin section that is not
// content-free - and the reason the boundary is drawn at the TABLE rather than at the page:
// `user_feedback` (0028) is a separate table precisely so the generation ledger and
// `admin_overview_*` can keep promising that no free text can reach them.
//
// IT IS EVIDENCE, NOT A VERDICT. A model or a chassis attracting complaints is a reason to go
// and look, never a reason to change a route: quality on this project is established by the
// NoaCG benchmarks and by nothing else (docs/AI_LITE_PROMOTION.md), and the Models section
// deliberately refuses to rank. So this page counts and groups, and there is no score, no
// league table of models, and nothing that reads as a recommendation. The per-model column
// exists to answer "where do I look first", which is a different question from "which is best".
//
// AGGREGATION IS IN JAVASCRIPT, the §6 pattern, and here it is clearly right: feedback arrives
// at human speed, so a bounded slice is the whole table for a long time. `truncated` is the
// tripwire for when that stops being true.

import { apiError, json, readJson } from '../http.js';
import { adminDb, adminNotFound, requireAdmin, writeAudit } from '../adminAuth.js';
import { inScope, readScope } from './scope.js';
import { FEEDBACK_STATUSES, FEEDBACK_MESSAGE_MAX } from '../../../src/feedback/contract.js';
import type {
  AdminFeedbackBreakdown,
  AdminFeedbackItem,
  AdminFeedbackOverview,
} from '../../../src/admin/types.js';

const MAX_ROWS = 2_000;
const MAX_BODY_BYTES = 4_000;

interface Row {
  id: string;
  kind: string;
  sentiment: string;
  reasons: string[] | null;
  message: string;
  user_id: string | null;
  visitor_id: string | null;
  area: string | null;
  generation_id: string | null;
  tier: string | null;
  model: string | null;
  variant_id: string | null;
  intent_kind: string | null;
  prompt_version: string | null;
  status: string;
  admin_note: string;
  reviewed_at: string | null;
  created_at: string;
}

/** Counted by DIMENSION, and only where a dimension has a value. A null model is "we do not
 *  know which model", which is a different row from any particular model and must not be
 *  folded into one called "unknown" that then sorts to the top of a complaints table. */
function breakdown(rows: Row[], pick: (row: Row) => string | null): AdminFeedbackBreakdown[] {
  const counts = new Map<string, { positive: number; negative: number }>();
  for (const row of rows) {
    const key = pick(row);
    if (!key) continue;
    const entry = counts.get(key) ?? { positive: 0, negative: 0 };
    if (row.sentiment === 'positive') entry.positive += 1;
    else entry.negative += 1;
    counts.set(key, entry);
  }
  return [...counts.entries()]
    .map(([key, entry]) => ({ key, ...entry, total: entry.positive + entry.negative }))
    // Most NEGATIVE first, then by volume. This is an inbox: the point is to find what is going
    // wrong, and sorting by total would bury three complaints under thirty compliments.
    .sort((a, b) => b.negative - a.negative || b.total - a.total)
    .slice(0, 20);
}

async function read(req: Request): Promise<Response> {
  const scope = readScope(req);
  const params = new URL(req.url).searchParams;
  const requested = Number(params.get('days') ?? 90);
  const days = Number.isFinite(requested) ? Math.min(365, Math.max(1, Math.floor(requested))) : 90;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const db = await adminDb();
  const internalIds = await db.rpc('admin_internal_user_ids');
  const internal = new Set<string>(
    ((internalIds.data ?? []) as (string | { admin_internal_user_ids: string })[]).map((entry) =>
      typeof entry === 'string' ? entry : entry.admin_internal_user_ids,
    ),
  );

  const { data, error } = await db
    .from('user_feedback')
    .select(
      'id, kind, sentiment, reasons, message, user_id, visitor_id, area, generation_id, tier, model, '
      + 'variant_id, intent_kind, prompt_version, status, admin_note, reviewed_at, created_at',
    )
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);
  if (error) return apiError('internal', 'Could not read the feedback.', 500);

  const all = (data ?? []) as unknown as Row[];
  // Anonymous feedback has no account, so it can never be internal - `coalesce(..., false)`,
  // the same rule 0027 applies in SQL. Someone with no account is exactly who this page is for.
  const rows = all.filter((row) => inScope(scope, row.user_id !== null && internal.has(row.user_id)));

  // Emails resolved one call per DISTINCT account, not per row: a single frustrated user can
  // easily be twenty rows, and the auth directory has no batch lookup.
  const emails = new Map<string, string>();
  await Promise.all(
    [...new Set(rows.map((row) => row.user_id).filter((id): id is string => Boolean(id)))].map(async (id) => {
      const { data: found } = await db.auth.admin.getUserById(id);
      emails.set(id, found?.user?.email ?? '');
    }),
  );

  const items: AdminFeedbackItem[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind as AdminFeedbackItem['kind'],
    sentiment: row.sentiment as AdminFeedbackItem['sentiment'],
    reasons: row.reasons ?? [],
    message: row.message,
    userId: row.user_id,
    email: row.user_id ? emails.get(row.user_id) ?? '' : '',
    internal: row.user_id !== null && internal.has(row.user_id),
    visitorId: row.visitor_id,
    area: row.area,
    generationId: row.generation_id,
    tier: row.tier,
    model: row.model,
    variantId: row.variant_id,
    intentKind: row.intent_kind,
    promptVersion: row.prompt_version,
    status: row.status as AdminFeedbackItem['status'],
    adminNote: row.admin_note,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  }));

  const positive = rows.filter((row) => row.sentiment === 'positive').length;
  const reasons = new Map<string, number>();
  for (const row of rows) for (const reason of row.reasons ?? []) {
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }

  const response: AdminFeedbackOverview = {
    scope,
    internalAccounts: internal.size,
    days,
    items,
    totals: {
      all: rows.length,
      positive,
      negative: rows.length - positive,
      unresolved: rows.filter((row) => row.status !== 'resolved').length,
      withMessage: rows.filter((row) => row.message.length > 0).length,
      generationRatings: rows.filter((row) => row.kind === 'generation').length,
      betaNotes: rows.filter((row) => row.kind === 'beta').length,
    },
    // Ranked by how often a reason is given. Reason codes are enumerated
    // (src/feedback/contract.ts), so this is a distribution over a fixed vocabulary rather than
    // an attempt to cluster free text.
    reasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    byModel: breakdown(rows, (row) => row.model),
    byTier: breakdown(rows, (row) => row.tier),
    byVariant: breakdown(rows, (row) => row.variant_id),
    byArea: breakdown(rows, (row) => row.area),
    truncated: all.length >= MAX_ROWS,
  };

  return json(response);
}

async function write(req: Request, actor: Awaited<ReturnType<typeof requireAdmin>>): Promise<Response> {
  if (!actor.ok) return actor.response;
  let body: { id?: unknown; status?: unknown; note?: unknown };
  try {
    body = await readJson(req, MAX_BODY_BYTES);
  } catch {
    return apiError('invalid', 'Malformed request.', 400);
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return apiError('invalid', 'A feedback id is required.', 400);
  const status = typeof body.status === 'string' && (FEEDBACK_STATUSES as readonly string[]).includes(body.status)
    ? body.status
    : null;
  const note = typeof body.note === 'string' ? body.note.slice(0, FEEDBACK_MESSAGE_MAX) : null;
  if (status === null && note === null) return apiError('invalid', 'Nothing to change.', 400);

  const db = await adminDb();
  // Only the triage columns are writable, and there is no DELETE grant at all (0028): an admin
  // surface that can edit or remove what somebody said about the product is a surface that
  // eventually will. What a person wrote stays exactly as they wrote it.
  const patch: Record<string, unknown> = {
    reviewed_by: actor.actor.userId,
    reviewed_at: new Date().toISOString(),
  };
  if (status !== null) patch.status = status;
  if (note !== null) patch.admin_note = note;

  const { error } = await db.from('user_feedback').update(patch).eq('id', id);
  if (error) return apiError('internal', 'The feedback could not be updated.', 500);

  await writeAudit(req, actor.actor, {
    action: 'feedback.triage',
    targetType: 'feedback',
    targetId: id,
    summary: status !== null ? `marked ${status}` : 'note updated',
    // The note is an operator's own words about an item, not the user's - it is already
    // admin-authored, so recording it in the audit trail discloses nothing new.
    detail: { status, noteLength: note?.length ?? null },
  });
  return json({ ok: true });
}

export default {
  async fetch(req: Request): Promise<Response> {
    // Reading is 'support', triaging is 'admin' - the same split every other section uses, and
    // for the same reason: a read-only role should be able to see what users are saying without
    // being able to mark it handled.
    const gate = await requireAdmin(req, req.method === 'GET' ? 'support' : 'admin');
    if (!gate.ok) return gate.response;
    if (req.method === 'GET') return read(req);
    if (req.method === 'POST') return write(req, gate);
    return adminNotFound();
  },
};
