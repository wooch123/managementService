import 'server-only';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000; // 10분

type AttemptRecord = { count: number; lockedUntil: number | null };

// 단일 인스턴스 전제 (CLAUDE.md §7.3). 프로세스 재시작 시 초기화된다.
const attempts = new Map<string, AttemptRecord>();

export function checkLockout(ip: string): { locked: boolean; remainingMs: number } {
  const record = attempts.get(ip);
  if (!record?.lockedUntil) return { locked: false, remainingMs: 0 };

  const remainingMs = record.lockedUntil - Date.now();
  if (remainingMs <= 0) {
    attempts.delete(ip);
    return { locked: false, remainingMs: 0 };
  }
  return { locked: true, remainingMs };
}

export function recordFailure(ip: string): void {
  const record = attempts.get(ip) ?? { count: 0, lockedUntil: null };
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  attempts.set(ip, record);
}

export function resetAttempts(ip: string): void {
  attempts.delete(ip);
}
