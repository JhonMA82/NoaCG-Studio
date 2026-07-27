// The benchmark failure taxonomy: one primary machine-readable code per failed
// generation, ordered by pipeline stage so classification picks the EARLIEST failure
// (a wrong category has failed before compilation matters). Secondary findings ride the
// result row; the primary code is what reports aggregate on.

export const FAILURE_CODES = [
  'SCHEMA_INVALID',
  'OUTPUT_TRUNCATED',
  'UNSUPPORTED_FORCED',
  'CATEGORY_WRONG',
  'VARIANT_INVALID',
  'FIELD_CONTRACT_INVALID',
  'COMPILE_FAILED',
  'STATIC_VALIDATION_FAILED',
  'RUNTIME_ERROR',
  'TIMELINE_INVALID',
  'STATE_INVALID',
  'STATE_UPDATE_FAILED',
  'REFLOW_FAILED',
  'ALPHA_FAILED',
  'PERFORMANCE_FAILED',
  'EXPORT_FAILED',
  'VISUAL_REJECTED',
  'REPAIR_FAILED',
  'PROVIDER_ERROR',
  'RATE_LIMITED',
  'TIMEOUT',
  'COST_LIMIT_EXCEEDED',
];

const VALIDATION_RULE_MAP = [
  // Earliest, most specific mappings first - validateTemplate/runtimeBench rule ids.
  [/^anim-data|^timeline/, 'TIMELINE_INVALID'],
  [/^machine|^state/, 'STATE_INVALID'],
  [/^bench-(runtime|lifecycle|console|preplay|entrance|stop|replay)/, 'RUNTIME_ERROR'],
  [/^bench-(overlap|overflow|stress)/, 'REFLOW_FAILED'],
  [/^bench-(field|binding)|^field/, 'FIELD_CONTRACT_INVALID'],
  [/^safety|^unsafe/, 'STATIC_VALIDATION_FAILED'],
];

/**
 * Classify one result row into its primary failure code, or null for a success.
 * `row` is the shape the runners record: decision/semanticErrors/validation/etc.
 */
export function classifyFailure(row) {
  if (row.providerErrorCode === 'rate_limited') return 'RATE_LIMITED';
  if (row.providerErrorCode === 'timeout') return 'TIMEOUT';
  if (row.providerErrorCode === 'cost_ceiling') return 'COST_LIMIT_EXCEEDED';
  if (row.providerErrorCode) return 'PROVIDER_ERROR';
  if (row.truncated) return 'OUTPUT_TRUNCATED';
  if (row.schemaInvalid) return 'SCHEMA_INVALID';

  const expected = row.expect;
  const decision = row.decision;
  if (expected?.decision === 'unsupported' && decision?.status === 'ready') return 'UNSUPPORTED_FORCED';
  if (expected?.decision === 'ready' && decision?.status === 'unsupported') return 'CATEGORY_WRONG';
  if (decision?.status === 'ready' && expected?.aiCategory && row.aiCategory && row.aiCategory !== expected.aiCategory) {
    return 'CATEGORY_WRONG';
  }
  const semantic = row.semanticErrors ?? [];
  if (semantic.some((code) => code === 'variant_not_allowed' || code === 'category_variant_mismatch')) {
    return 'VARIANT_INVALID';
  }
  if (semantic.length) return 'FIELD_CONTRACT_INVALID';
  if (row.repairFailed) return 'REPAIR_FAILED';
  if (row.compileError) return 'COMPILE_FAILED';

  const rules = row.validationRuleCodes ?? [];
  for (const rule of rules) {
    for (const [pattern, code] of VALIDATION_RULE_MAP) {
      if (pattern.test(rule)) return code;
    }
  }
  if (rules.length) return 'STATIC_VALIDATION_FAILED';
  if (row.exportError) return 'EXPORT_FAILED';
  if (row.review === 'no') return 'VISUAL_REJECTED';
  return null;
}
