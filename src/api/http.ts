/** Fetch helpers shared by every data source, with readable errors. */

export type ApiErrorKind = "network" | "rate" | "server" | "bad-request" | "timeout";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: ApiErrorKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const MESSAGES: Record<ApiErrorKind, string> = {
  network: "Couldn't reach the weather service. Check your connection and try again.",
  rate: "Too many requests from your network right now. Wait a minute and try again.",
  server: "The weather service had a problem. Try again in a moment.",
  "bad-request": "The weather service couldn't answer for this place.",
  timeout: "The weather service took too long to answer. Try again.",
};

export function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return MESSAGES.network;
}

export async function getJSON<T>(url: string, signal?: AbortSignal, timeoutMs = 20000): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  // AbortSignal.any is recent; older browsers simply keep the caller's signal.
  const combined = signal ? (typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeout]) : signal) : timeout;
  let response: Response;
  try {
    response = await fetch(url, { signal: combined, headers: { accept: "application/json" } });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted) throw new ApiError(MESSAGES.timeout, "timeout");
    throw new ApiError(MESSAGES.network, "network");
  }
  if (response.status === 429) throw new ApiError(MESSAGES.rate, "rate", 429);
  if (response.status >= 500) throw new ApiError(MESSAGES.server, "server", response.status);
  if (!response.ok) {
    // Open-Meteo explains bad requests in a "reason" field.
    let reason = "";
    try {
      reason = ((await response.json()) as { reason?: string }).reason ?? "";
    } catch {
      // Not JSON: keep the generic message.
    }
    throw new ApiError(reason ? `${MESSAGES["bad-request"]} (${reason})` : MESSAGES["bad-request"], "bad-request", response.status);
  }
  return (await response.json()) as T;
}

/** Builds a query string, joining arrays with commas the way Open-Meteo expects. */
export function query(params: Record<string, string | number | boolean | readonly (string | number)[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  // Open-Meteo accepts literal commas, which keeps URLs readable in the network panel.
  return search.toString().replace(/%2C/g, ",");
}

/** Coordinates rounded to ~100 m: enough for weather, and it helps caching. */
export function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Converts an API column (with nulls) to numbers, NaN marking missing values. */
export function column(values: readonly (number | null)[] | undefined, length: number): number[] {
  if (!values) return new Array<number>(length).fill(Number.NaN);
  return Array.from({ length }, (_, i) => {
    const value = values[i];
    return typeof value === "number" ? value : Number.NaN;
  });
}
