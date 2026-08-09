interface WindowEntry {
  startedAt: number;
  count: number;
}

const windows = new Map<string, WindowEntry>();
const TASK_IP_WINDOW_MS = 60_000;
const CLASSROOM_NAT_REQUESTS_PER_WINDOW = 60;

/** Measured over the first production Lite round (docs/AI_LITE_BENCHMARK.md):
 * 18 generations averaged 17.8 s. Keep retry timing tied to a measured turnover,
 * rather than inventing a short polling interval that only creates another burst. */
export const LITE_MEASURED_MEAN_LATENCY_MS = 17_800;

export interface LiteCapacityRetryPlan {
  maxAttempts: number;
  retrySpacingMs: number;
  activeLeaseMs: number;
}

/** One classroom behind a NAT may submit 60 requests/minute. The default 20-slot
 * fleet therefore has room for three admission observations per seat. The paid
 * provider path is bounded to two attempts, so reservation polling may never be
 * less bounded than the model work it protects. */
export function liteCapacityRetryPlan(
  fleetConcurrency: number,
  providerAttempts: number,
  providerTimeoutMs: number,
): LiteCapacityRetryPlan {
  const slots = Math.max(1, Math.floor(fleetConcurrency));
  const providerBound = Math.max(1, Math.floor(providerAttempts)) + 1;
  const classroomHeadroom = Math.max(1, Math.floor(CLASSROOM_NAT_REQUESTS_PER_WINDOW / slots));
  const maxAttempts = Math.max(1, Math.min(providerBound, classroomHeadroom));
  const retries = maxAttempts - 1;
  return {
    maxAttempts,
    retrySpacingMs: retries > 0 ? Math.ceil(LITE_MEASURED_MEAN_LATENCY_MS / retries) : 0,
    // A killed function must stop owning capacity shortly after the longest legal
    // provider session. One measured turnover is the non-guessed scheduling margin.
    activeLeaseMs: Math.max(1, Math.floor(providerTimeoutMs)) * Math.max(1, Math.floor(providerAttempts))
      + LITE_MEASURED_MEAN_LATENCY_MS,
  };
}

/** Symmetric jitter keeps a classroom retry from becoming a second synchronized spike. */
export function jitteredCapacityDelay(baseMs: number, random = Math.random): number {
  return Math.max(1, Math.round(baseMs * (0.75 + random() * 0.5)));
}

/** Coarse pre-body burst protection, one window per (task, network). User allowances
 *  remain the entitlement authority - admission here is never a spend handle. */
export function admitTaskIp(taskId: string, ipHash: string, now = Date.now()): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const key = `${taskId}:${ipHash}`;
  const current = windows.get(key);
  if (!current || now - current.startedAt >= TASK_IP_WINDOW_MS) {
    windows.set(key, { startedAt: now, count: 1 });
    return { allowed: true };
  }
  if (current.count >= CLASSROOM_NAT_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.startedAt + TASK_IP_WINDOW_MS - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true };
}

export function resetTaskRateLimitForTests(): void {
  windows.clear();
}
