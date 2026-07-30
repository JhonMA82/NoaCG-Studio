// Which templates a given caller may NOT see.
//
// The admin surface writes `template_admin` rows; before this module nothing read them, so
// marking a design beta or internal changed a row and had no effect. This is the read side.
//
// It answers with the keys to HIDE rather than the keys to show, for one reason: the catalog is
// CODE and ships in the browser bundle. A "which may I see" answer would have to enumerate a
// couple of hundred ids the client already has, and would silently hide everything the moment
// the endpoint failed. A hide-list degrades the safe way - an unreachable database hides
// nothing, and the free-forever catalog stays whole.
//
// The rules, in one place so the browser cannot hold a second copy:
//   public    visible to everyone (and needs no row at all - absence IS public)
//   beta      visible with the templates.beta entitlement, or membership of the beta cohort
//   internal  visible with the templates.internal entitlement
//   hidden    visible to nobody
//
// The beta cohort is checked HERE and never sent to the browser: a caller learns whether THEY
// can see a template, never who else can.

import { adminConfigured, adminDb } from './adminAuth.js';
import { systemSettings } from './systemSettings.js';
import { allows, type Entitlement } from '../../src/entitlements/contract.js';

interface Row {
  template_key: string;
  visibility: string;
}

/** Template keys this caller must not be shown. Empty whenever nothing is restricted, the
 *  backend is absent, or the lookup fails - see the degradation note above. */
export async function hiddenTemplateKeys(entitlement: Entitlement): Promise<string[]> {
  if (!adminConfigured()) return [];
  try {
    const db = await adminDb();
    // Only non-public rows exist to be read; a public template needs no row, so this query is
    // the size of the restriction list rather than the size of the catalog.
    const { data, error } = await db
      .from('template_admin')
      .select('template_key, visibility')
      .neq('visibility', 'public');
    if (error) return [];

    const rows = (data ?? []) as Row[];
    if (rows.length === 0) return [];

    const settings = await systemSettings();
    const inBetaCohort = entitlement.userId !== null && settings.betaUserIds.includes(entitlement.userId);
    const seesBeta = allows(entitlement, 'templates.beta') || inBetaCohort;
    const seesInternal = allows(entitlement, 'templates.internal');

    return rows
      .filter((row) => {
        if (row.visibility === 'hidden') return true;
        if (row.visibility === 'beta') return !seesBeta;
        if (row.visibility === 'internal') return !seesInternal;
        // An unrecognised visibility is treated as hidden. The column has a CHECK constraint,
        // so this is only reachable through a future value an older deploy does not know - and
        // showing something a newer admin surface deliberately restricted is the worse mistake.
        return true;
      })
      .map((row) => row.template_key);
  } catch {
    return [];
  }
}
