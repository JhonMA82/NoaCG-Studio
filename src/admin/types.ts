// The wire contract between api/admin/* and the admin page. Types only - this file is
// imported by both sides, so it must stay free of runtime code, React and browser globals.
//
// What is NOT here is as deliberate as what is: no table names, no column names, no role
// predicate, no route list beyond the calls the page actually makes. The admin bundle is a
// public static asset (docs/ADMIN.md section 1), so anything written here is readable by
// anyone. Identifiers and labels are fine; a description of the schema is not.

export type AdminRole = 'owner' | 'admin' | 'support';

/** GET /api/admin/session. The whole answer: who am I, and what may I do. */
export interface AdminSessionResponse {
  email: string;
  role: AdminRole;
}

/** Every admin endpoint has exactly one failure shape. The page never distinguishes
 *  "not allowed" from "no such route", because the server does not either. */
export interface AdminErrorResponse {
  error: { code: string; message: string };
}
