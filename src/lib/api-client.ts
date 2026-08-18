import type { ApiResult } from '@/types/auth';

export async function apiCall<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  return res.json();
}
