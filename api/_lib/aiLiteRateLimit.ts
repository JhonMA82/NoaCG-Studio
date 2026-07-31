interface WindowEntry {
  startedAt: number;
  count: number;
}

const windows = new Map<string, WindowEntry>();

/** Coarse pre-body burst protection, one window per (task, network). User allowances
 *  remain the entitlement authority - admission here is never a spend handle. */
export function admitTaskIp(taskId: string, ipHash: string, now = Date.now()): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const windowMs = 60_000;
  const limit = 60; // Deliberately classroom-NAT friendly.
  const key = `${taskId}:${ipHash}`;
  const current = windows.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    windows.set(key, { startedAt: now, count: 1 });
    return { allowed: true };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.startedAt + windowMs - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true };
}

export function resetTaskRateLimitForTests(): void {
  windows.clear();
}
