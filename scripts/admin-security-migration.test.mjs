// Pins the authorization posture of the admin/suspension predicates so a later edit cannot
// quietly reopen arbitrary-user probing. Static assertions over the migration text, in the same
// spirit as ai-lite-migration.test.mjs: they run offline, in every checkout, with no database.
//
// The behavioural half of this proof lives INSIDE 0020 as a self-check that impersonates an
// ordinary authenticated caller and aborts the migration unless the lockdown actually holds.
// These tests guard the source; that block guards every instance it is applied to. Neither one
// is sufficient alone - text can drift from behaviour, and a self-check nobody reads can be
// deleted in a diff that looks like cleanup.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file) => readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');

const entitlements = await read('0018_entitlements.sql');
const selfScoped = await read('0020_self_scoped_predicates.sql');

test('the suspension predicate takes no argument, so there is nothing to point at another user', () => {
  assert.match(
    selfScoped,
    /create or replace function public\.is_suspended\(\)\s*\nreturns boolean/i,
    'expected a zero-argument public.is_suspended()',
  );
  // It must resolve the subject itself rather than accepting one.
  assert.match(selfScoped, /where a\.user_id = \(select auth\.uid\(\)\) and a\.state = 'suspended'/i);
  // And the old probe must actually be removed, not merely left ungranted.
  assert.match(selfScoped, /drop function if exists public\.is_suspended\(uuid\)/i);
});

test('no policy passes a user id into is_suspended', () => {
  // 0018 wrote `is_suspended((select auth.uid()))`. Every policy 0020 creates must instead call
  // the zero-arg form. Scoped to the CREATE POLICY statements: the file legitimately names the
  // old signature elsewhere (the drop, the header comment, and the self-check that probes for it).
  const policies = [...selfScoped.matchAll(/create policy "[^"]+"[\s\S]*?;/gi)].map((m) => m[0]);
  assert.ok(policies.length >= 9, `expected at least 9 policies, found ${policies.length}`);
  for (const policy of policies) {
    const name = policy.match(/create policy "([^"]+)"/i)[1];
    const calls = policy.match(/is_suspended\([^)]*\)/gi) ?? [];
    assert.ok(calls.length > 0, `${name} no longer gates on is_suspended at all`);
    for (const call of calls) {
      assert.equal(
        call.toLowerCase(),
        'is_suspended()',
        `${name} passes an argument to is_suspended (${call}) - that is the probe being removed`,
      );
    }
  }
});

test('authenticated KEEPS execute on the zero-arg predicate - the policies cannot work without it', () => {
  // A policy expression is evaluated with the QUERYING role's privileges, so revoking this grant
  // would make every signed-in write fail with 42501 instead of simply being allowed through.
  // Verified against a live database; see the comment header in 0020.
  assert.match(selfScoped, /grant execute on function public\.is_suspended\(\) to authenticated/i);
  assert.match(selfScoped, /revoke execute on function public\.is_suspended\(\) from public, anon/i);
});

test('every suspension policy from 0018 is recreated, none silently dropped', () => {
  const policyNames = [...entitlements.matchAll(/create policy "([a-z_]*not_suspended[a-z_]*)"/gi)]
    .map((match) => match[1]);
  assert.equal(policyNames.length, 9, 'expected 0018 to define nine suspension policies');
  for (const name of policyNames) {
    assert.match(
      selfScoped,
      new RegExp(`create policy "${name}"`, 'i'),
      `0020 drops ${name} without recreating it - that write path would lose its suspension gate`,
    );
  }
});

test('probing another account is admin-only and refuses before reading anything', () => {
  const body = selfScoped.match(
    /create or replace function public\.admin_user_suspended\(p_user uuid\)[\s\S]*?\$\$;/i,
  );
  assert.ok(body, 'expected an admin_user_suspended(uuid) function');
  const source = body[0];
  assert.match(source, /security definer/i);
  assert.match(source, /set search_path = ''/i);

  const guardAt = source.search(/if not public\.is_admin\('support'\) then/i);
  const readAt = source.search(/from public\.user_accounts/i);
  assert.notEqual(guardAt, -1, 'the function must verify the caller is an admin');
  assert.notEqual(readAt, -1);
  assert.ok(guardAt < readAt, 'the admin check must come BEFORE the table read');
  assert.match(source, /raise exception[\s\S]*?errcode = '42501'/i);

  assert.match(
    selfScoped,
    /revoke execute on function public\.admin_user_suspended\(uuid\) from public, anon/i,
  );
});

test('the unused admin predicates are off the REST surface', () => {
  assert.match(selfScoped, /revoke execute on function public\.is_admin\(text\) from authenticated/i);
  assert.match(
    selfScoped,
    /revoke execute on function public\.admin_role_rank\(text\) from authenticated/i,
  );
});

test('0020 refuses to apply unless the lockdown demonstrably holds', () => {
  // Each branch below was mutation-tested against the live schema: removing the corresponding
  // statement makes the matching check fire. Losing any of them turns the migration into a
  // change that only claims to have closed the hole.
  for (const check of ['(a)', '(b)', '(c)', '(d)']) {
    assert.ok(
      selfScoped.includes(`0020 self-check ${check} FAILED`),
      `0020 lost its self-check ${check}`,
    );
  }
  // It must read the real ACL, not just re-read its own SQL.
  assert.match(selfScoped, /has_function_privilege\('authenticated', 'public\.is_suspended\(\)'/i);
  assert.match(selfScoped, /has_function_privilege\('authenticated', 'public\.is_admin\(text\)'/i);
  assert.match(selfScoped, /to_regprocedure\('public\.is_suspended\(uuid\)'\)/i);
});

test('no migration changes the session role', () => {
  // `supabase db push` connects as an unprivileged cli_login_postgres and elevates with
  // SET SESSION ROLE postgres. A RESET ROLE (or a bare SET ROLE) inside a migration drops the
  // session back down, and the CLI then fails to write supabase_migrations.schema_migrations -
  // rolling the whole migration back on an error that looks unrelated. Cost one failed apply.
  // Comments are stripped first: 0020 documents this trap at length, and the write-up naming
  // RESET ROLE must not read as the statement itself.
  const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');
  for (const [name, sql] of [['0018', entitlements], ['0020', selfScoped]]) {
    const code = stripComments(sql);
    assert.doesNotMatch(code, /\breset\s+role\b/i, `${name} resets the session role`);
    assert.doesNotMatch(code, /\bset\s+(local\s+|session\s+)?role\b/i, `${name} sets the session role`);
  }
});
