import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/0010_ai_generations.sql', import.meta.url);
const sql = await readFile(migrationUrl, 'utf8');
const qualityMigrationUrl = new URL('../supabase/migrations/0011_ai_lite_quality_feedback.sql', import.meta.url);
const qualitySql = await readFile(qualityMigrationUrl, 'utf8');

test('Lite accounting migration is content-free and inaccessible to browser roles', () => {
  assert.match(sql, /alter table public\.ai_generations enable row level security/i);
  assert.match(
    sql,
    /revoke all on table public\.ai_generations from public, anon, authenticated/i,
  );
  assert.doesNotMatch(sql, /create policy/i);
  assert.doesNotMatch(
    sql,
    /\b(prompt|conversation|design_spec|template|generated_code|provider_response|raw_ip)\b/i,
  );
});

test('Lite quota RPCs fail closed to service-role-only execution', () => {
  assert.equal((sql.match(/security definer/gi) ?? []).length, 2);
  assert.equal((sql.match(/set search_path = ''/gi) ?? []).length, 3);
  assert.match(
    sql,
    /revoke all on function public\.ai_lite_usage\(uuid, timestamptz\) from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.ai_lite_usage\(uuid, timestamptz\) to service_role/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.reserve_ai_lite_generation[\s\S]+from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.reserve_ai_lite_generation[\s\S]+to service_role/i,
  );
  assert.match(sql, /pg_advisory_xact_lock\(73190001\)/i);
  assert.match(
    sql,
    /requested_category, provider_cost_usd, expires_at[\s\S]+p_session_cost_ceiling_usd/i,
  );
});

test('Lite quality priors store only non-content facets and stay server-only', () => {
  assert.match(qualitySql, /resolved_variant_id text/i);
  assert.match(qualitySql, /intent_kind text/i);
  assert.match(qualitySql, /feedback_reason text/i);
  assert.doesNotMatch(
    qualitySql,
    /\b(prompt|conversation|design_spec|template|screenshot|generated_code|provider_response|raw_ip)\b/i,
  );
  assert.match(
    qualitySql,
    /revoke all on function public\.ai_lite_variant_quality\(timestamptz, integer\)[\s\S]+from public, anon, authenticated/i,
  );
  assert.match(
    qualitySql,
    /grant execute on function public\.ai_lite_variant_quality\(timestamptz, integer\)[\s\S]+to service_role/i,
  );
  assert.doesNotMatch(qualitySql, /security definer/i);
  assert.match(qualitySql, /having count\(\*\) >= pg_catalog\.greatest\(p_min_samples, 4\)/i);
});
