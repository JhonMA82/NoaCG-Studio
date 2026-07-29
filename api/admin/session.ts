// GET /api/admin/session - the admin page's first and only bootstrap call.
//
// It answers exactly two things: are you allowed here, and what may you do. Everything the
// page renders afterwards is a separate authorized request; nothing about a user, a plan or
// this instance rides along in the answer, so this is safe as the one endpoint a stranger is
// guaranteed to be able to reach.
//
// For anyone who is not an admin this is a plain 404, identical to a route that does not
// exist (api/_lib/adminAuth.ts explains why that is the only refusal shape). NOTE the
// ordering: the gate runs BEFORE the method check, because a 405 would confirm the route is
// real to a caller who is not allowed to know that.

import { json, methodGuard } from '../_lib/http.js';
import { requireAdmin } from '../_lib/adminAuth.js';
import type { AdminSessionResponse } from '../../src/admin/types.js';

export default {
  async fetch(req: Request): Promise<Response> {
    const gate = await requireAdmin(req, 'support');
    if (!gate.ok) return gate.response;

    const guard = methodGuard(req, 'GET');
    if (guard) return guard;

    const response: AdminSessionResponse = {
      email: gate.actor.email,
      role: gate.actor.role,
    };
    return json(response);
  },
};
