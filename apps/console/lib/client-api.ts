"use client";

/** Browser-side calls go through the console's /api/remi proxy. */
export async function remiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/remi${path}`, {
    ...init,
    headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers }
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new Error(payload?.error ?? payload?.message ?? `Request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return remiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
}
