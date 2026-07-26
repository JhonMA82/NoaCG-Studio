import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseSecretKey } from './jobStore.js';
import type {
  LiteGenerationRecord,
  LiteGenerationStore,
  LiteReservation,
  LiteUsageSnapshot,
} from './aiLiteStore.js';

interface GenerationRow {
  id: string;
  user_id: string;
  ip_hash: string;
  idempotency_key: string;
  profile: 'lite';
  status: LiteGenerationRecord['status'];
  prompt_version: string;
  requested_category: string | null;
  resolved_category: string | null;
  provider: string | null;
  model: string | null;
  attempt_count: number;
  repair_count: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  reasoning_tokens: number;
  provider_cost_usd: number;
  validation_rule_codes: string[];
  runtime_ms: number | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

function fromRow(row: GenerationRow): LiteGenerationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    ipHash: row.ip_hash,
    idempotencyKey: row.idempotency_key,
    profile: row.profile,
    status: row.status,
    promptVersion: row.prompt_version,
    requestedCategory: row.requested_category,
    resolvedCategory: row.resolved_category,
    provider: row.provider,
    model: row.model,
    attemptCount: row.attempt_count,
    repairCount: row.repair_count,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cachedInputTokens: row.cached_input_tokens,
    reasoningTokens: row.reasoning_tokens,
    providerCostUsd: Number(row.provider_cost_usd),
    validationRuleCodes: row.validation_rule_codes ?? [],
    runtimeMs: row.runtime_ms,
    rejectionReason: row.rejection_reason,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    expiresAt: Date.parse(row.expires_at),
  };
}

function patchRow(patch: Partial<LiteGenerationRecord>): Partial<GenerationRow> {
  const row: Partial<GenerationRow> = {};
  const mapping: [keyof LiteGenerationRecord, keyof GenerationRow][] = [
    ['status', 'status'], ['resolvedCategory', 'resolved_category'], ['provider', 'provider'], ['model', 'model'],
    ['attemptCount', 'attempt_count'], ['repairCount', 'repair_count'], ['inputTokens', 'input_tokens'],
    ['outputTokens', 'output_tokens'], ['cachedInputTokens', 'cached_input_tokens'],
    ['reasoningTokens', 'reasoning_tokens'], ['providerCostUsd', 'provider_cost_usd'],
    ['validationRuleCodes', 'validation_rule_codes'], ['runtimeMs', 'runtime_ms'],
    ['rejectionReason', 'rejection_reason'], ['expiresAt', 'expires_at'],
  ];
  for (const [source, target] of mapping) {
    if (patch[source] !== undefined) {
      const value = source === 'expiresAt' ? new Date(patch.expiresAt as number).toISOString() : patch[source];
      (row as Record<string, unknown>)[target] = value;
    }
  }
  return row;
}

let client: SupabaseClient | null = null;
async function sb(): Promise<SupabaseClient> {
  if (client) return client;
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
  const key = supabaseSecretKey();
  if (!url || !key) throw new Error('Lite generations require Supabase URL and secret key.');
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export class SupabaseLiteGenerationStore implements LiteGenerationStore {
  async usage(userId: string, now: number): Promise<LiteUsageSnapshot> {
    const { data, error } = await (await sb()).rpc('ai_lite_usage', {
      p_user_id: userId,
      p_now: new Date(now).toISOString(),
    });
    if (error) throw new Error('Lite usage lookup failed: ' + error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      dailyStarts: Number(row?.daily_starts ?? 0),
      monthlyStarts: Number(row?.monthly_starts ?? 0),
      dailySuccesses: Number(row?.daily_successes ?? 0),
      monthlySuccesses: Number(row?.monthly_successes ?? 0),
      activeForUser: Number(row?.active_for_user ?? 0),
      activeGlobal: Number(row?.active_global ?? 0),
      dailyFleetSpendUsd: Number(row?.daily_fleet_spend_usd ?? 0),
    };
  }

  async reserve(input: Parameters<LiteGenerationStore['reserve']>[0]): Promise<LiteReservation> {
    const { data, error } = await (await sb()).rpc('reserve_ai_lite_generation', {
      p_user_id: input.userId,
      p_ip_hash: input.ipHash,
      p_idempotency_key: input.idempotencyKey,
      p_prompt_version: input.profile.promptVersion,
      p_requested_category: input.requestedCategory,
      p_expires_at: new Date(input.now + input.profile.expiryMs).toISOString(),
      p_daily_starts: input.profile.dailyStarts,
      p_monthly_starts: input.profile.monthlyStarts,
      p_daily_successes: input.profile.dailySuccesses,
      p_monthly_successes: input.profile.monthlySuccesses,
      p_user_concurrency: input.profile.maxConcurrentPerUser,
      p_fleet_concurrency: input.profile.maxConcurrentFleet,
      p_fleet_daily_spend_usd: input.profile.dailyFleetSpendUsd,
      p_session_cost_ceiling_usd: input.profile.maxProviderCostUsd,
    });
    if (error) throw new Error('Lite reservation failed: ' + error.message);
    const result = Array.isArray(data) ? data[0] : data;
    const status = result?.reservation_status as LiteReservation['status'];
    if (status === 'created' || status === 'duplicate') {
      const record = await this.get(String(result.generation_id));
      if (!record) throw new Error('Lite reservation did not return its generation.');
      return { status, record };
    }
    return { status };
  }

  async get(id: string): Promise<LiteGenerationRecord | null> {
    const { data, error } = await (await sb()).from('ai_generations').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error('Lite generation lookup failed: ' + error.message);
    return data ? fromRow(data as GenerationRow) : null;
  }

  async update(id: string, patch: Partial<LiteGenerationRecord>): Promise<LiteGenerationRecord | null> {
    const { error } = await (await sb()).from('ai_generations').update(patchRow(patch)).eq('id', id);
    if (error) throw new Error('Lite generation update failed: ' + error.message);
    return this.get(id);
  }
}
