import { API_BASE_URL } from "./constants";
export class ApiError extends Error {
  status: number;
  code?: string;
  historyId?: string;
  constructor(message: string, status: number, code?: string, historyId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.historyId = historyId;
  }
}
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  )
    headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const payload = data as {
      error?: { message?: string; code?: string; historyId?: string };
    } | null;
    throw new ApiError(
      payload?.error?.message ?? "Request failed",
      response.status,
      payload?.error?.code,
      payload?.error?.historyId,
    );
  }
  return data as T;
}
