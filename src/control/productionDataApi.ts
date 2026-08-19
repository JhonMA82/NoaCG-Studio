// The operator surface as a CLIENT of the Production Data API (docs/DATA_API.md).
//
// Once a production is published, `control_shows.data` is the tree's authority: a feed writes
// it server-side, and the app must not keep a second copy that drifts. So the Data workspace
// stops talking to localStorage and starts talking to the same two endpoints an external
// integrator uses - `/api/data/patch` and `/api/data/state`.
//
// WHY THE HTTP API AND NOT A TABLE WRITE. A patch has to be a MERGE, and a merge has to be
// atomic with the row lock or an operator's edit and a feed's tick lose one of the two
// (docs/PRODUCTION_DATA_PLAN.md §4). That merge lives in `control_data_patch`, which is
// service-role only - so the honest route from a browser is the endpoint that already fronts
// it. The side benefit is that the operator surface dogfoods the integrator's contract: if
// this works, the documented API works.
//
// ABOUT THE KEY. The owner reads their OWN production's `data_key` over RLS (0047 grants it to
// the owner and the service role, nobody else) and presents it here. That is not the "never a
// web page" case the integrator doc warns about - that warning is about shipping the key to
// viewers or embedding it in a public page. This is the owner's own key, in the owner's own
// authenticated session, sent to our own origin; and it is strictly WEAKER than the control
// slug the very same page already holds, which can play, stop and clear graphics. It grants no
// capability the operator does not already have.

import { getSupabase } from '../backend/supabase';

/** The owner's own data key for a production, or null (not published, no backend, not owner). */
export async function productionDataKey(showId: string): Promise<string | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('control_shows').select('data_key').eq('id', showId).maybeSingle();
  if (error || !data) return null;
  return ((data as { data_key: string | null }).data_key ?? null) || null;
}

/** The shape both endpoints answer with; `writes` is empty on a read. */
export interface ProductionDataState {
  data: Record<string, unknown>;
  bindings: Record<string, Record<string, string>>;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body?.error?.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

/** GET the production's current tree and bindings. Null = the key was refused. */
export async function fetchProductionData(key: string): Promise<ProductionDataState | null> {
  const response = await fetch('/api/data/state', { headers: { authorization: `Bearer ${key}` } });
  if (!response.ok) return null;
  const body = (await response.json()) as ProductionDataState;
  return { data: body.data ?? {}, bindings: body.bindings ?? {} };
}

/**
 * PATCH the production's tree. Returns the tree as it is AFTER the merge, which is what the
 * caller should hold - never the object it hoped for. A feed tick that landed in the same
 * moment is already merged into that answer, so the operator's surface cannot silently
 * overwrite it.
 */
export async function patchProductionData(key: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch('/api/data/patch', {
    method: 'PATCH',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data?: Record<string, unknown> };
  return body.data ?? {};
}
