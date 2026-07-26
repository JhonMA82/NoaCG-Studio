interface WindowEntry {
  startedAt: number;
  count: number;
}

const windows = new Map<string, WindowEntry>();

/** Coarse pre-body burst protection. User allowances remain the entitlement authority. */
export function admitLiteIp(ipHash: string, now = Date.now()): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const windowMs = 60_000;
  const limit = 60; // Deliberately classroom-NAT friendly.
  const current = windows.get(ipHash);
  if (!current || now - current.startedAt >= windowMs) {
    windows.set(ipHash, { startedAt: now, count: 1 });
    return { allowed: true };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.startedAt + windowMs - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true };
}

export function resetLiteRateLimitForTests(): void {
  windows.clear();
}
