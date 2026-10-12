/**
 * Server-side API access. Pages render on the server and call the API over the
 * internal network (API_BASE_URL); the browser talks to the same API through the
 * /api/remi proxy route, so only the console port has to be reachable.
 */
const DEFAULT_API_BASE_URL = "http://127.0.0.1:4001";

export function apiBaseUrl(): string {
  return (process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, { cache: "no-store" });
    if (!response.ok) {
      return { ok: false, error: `The API answered ${response.status} for ${path}.` };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, error: `The API at ${apiBaseUrl()} is not reachable.` };
  }
}
