// Static guards on migration 0048 (the production-data tree's hosted half).
//
// THE ONE THAT EARNS ITS PLACE is the conformance binding: the merge is implemented twice, in
// TypeScript and in plpgsql, and the migration's self-check runs a jsonb literal of the shared
// table from scripts/merge-patch-conformance.mjs. Nothing stops those two copies drifting except
// this file - so adding a case to the shared table fails the build until 0048 carries it too.
//
// The rest are the cheap structural checks the repo has learned to want: a SECURITY DEFINER
// function in `public` is exposed the moment it is created (see definer-grants.test.mjs), and a
// self-check that only reads catalogs proves shape rather than behaviour, so 0048 must actually
// CALL every body it adds.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MERGE_PATCH_CONFORMANCE } from './merge-patch-conformance.mjs';

const sql = await readFile(new URL('../supabase/migrations/0048_production_data_tree.sql', import.meta.url), 'utf8');

test('0048 embeds the SHARED merge-patch conformance table, case for case', () => {
  const block = /\$cases\$([\s\S]*?)\$cases\$/.exec(sql);
  assert.ok(block, '0048 must carry the conformance cases in a $cases$ dollar-quoted literal');
  const embedded = JSON.parse(block[1]);

  // Compared as DATA, not as text: formatting differences between the two files are fine,
  // a missing or altered case is not.
  const shape = (c) => ({ name: c.name, base: c.base, patch: c.patch, expect: c.expect });
  assert.deepEqual(
    embedded.map(shape),
    MERGE_PATCH_CONFORMANCE.map(shape),
    'the plpgsql merge no longer answers the same cases as the TypeScript one - update ' +
      'supabase/migrations/0048_production_data_tree.sql to match scripts/merge-patch-conformance.mjs',
  );
});

test('0048 adds both columns as NOT NULL jsonb with an object default', () => {
  assert.match(sql, /add column if not exists data jsonb not null default '\{\}'::jsonb/i);
  assert.match(sql, /add column if not exists bindings jsonb not null default '\{\}'::jsonb/i);
});

test('every function 0048 creates is closed to the client roles and opened to service_role', () => {
  const created = [...sql.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(/gi)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(created)].sort(),
    ['control_data_patch', 'control_data_read', 'jsonb_merge_patch', 'production_data_format', 'production_data_resolve'],
    '0048 created a different set of functions than this guard knows about',
  );
  for (const name of new Set(created)) {
    const revoke = new RegExp(String.raw`revoke\s+execute\s+on\s+function\s+public\.${name}\s*\([^)]*\)\s+from\s+[^;]*;`, 'i');
    const grant = new RegExp(String.raw`grant\s+execute\s+on\s+function\s+public\.${name}\s*\([^)]*\)\s+to\s+service_role\s*;`, 'i');
    assert.match(sql, revoke, `${name} must revoke execute from the client roles`);
    const revoked = revoke.exec(sql)[0];
    assert.ok(/\banon\b/.test(revoked) && /\bauthenticated\b/.test(revoked), `${name}'s revoke must name anon AND authenticated`);
    assert.match(sql, grant, `${name} must grant execute to service_role`);
  }
});

test('the write path is update-only: no other command type can be emitted', () => {
  // Every `t` this migration can write. A branch emitting 'play'/'stop'/'next' would make the
  // data key an operator credential, which is the one thing docs/DATA_API.md promises it is not.
  const emitted = [...sql.matchAll(/jsonb_build_object\(\s*'t'\s*,\s*'(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(emitted)], ['update'], 'the data path emitted a command other than `update`');
});

test('the patch RPC locks the row before merging', () => {
  // Without FOR UPDATE the merge is a read-modify-write across serverless instances, and two
  // feeds racing on one production silently lose an update - the whole reason the merge is in
  // the database at all (docs/PRODUCTION_DATA_PLAN.md §4).
  const body = /create or replace function public\.control_data_patch[\s\S]*?\$\$;/i.exec(sql);
  assert.ok(body, 'control_data_patch body not found');
  assert.match(body[0], /from public\.control_shows s[\s\S]*?for update/i);
});

test('the patch RPC keeps both rate gates, counted against what it is about to write', () => {
  const body = /create or replace function public\.control_data_patch[\s\S]*?\$\$;/i.exec(sql)[0];
  // A patch can write several rows, so a gate comparing only the trailing count would let one
  // call overshoot the cap by the number of graphics it touches.
  assert.match(body, /v_recent \+ v_pending > 50/, 'the 50-per-5s command cap must account for this call');
  assert.match(body, /v_ingest \+ v_pending > 25/, 'the 25-per-5s ingest budget must account for this call');
});

test('the self-check CALLS every body it adds, not just the catalogs', () => {
  const check = sql.slice(sql.lastIndexOf('do $$'));
  for (const fn of [
    'public.jsonb_merge_patch(',
    'public.production_data_format(',
    'public.production_data_resolve(',
    'public.control_data_patch(',
    'public.control_data_read(',
  ]) {
    assert.ok(check.includes(fn), `the self-check never calls ${fn} - it would prove shape, not behaviour`);
  }
});
