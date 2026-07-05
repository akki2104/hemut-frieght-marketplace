// Typed fetch client for the FastAPI backend. All requests go through here so
// error handling and the base URL live in one place.

import type {
  ApiErrorBody,
  Bid,
  LoadCreateInput,
  LoadDetail,
  LoadSummary,
  Page,
  PlaceBidInput,
} from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export class ApiError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.details = body.details ?? {};
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const body: ApiErrorBody = data?.error ?? {
      code: "UNKNOWN",
      message: `Request failed (${res.status})`,
      details: {},
      correlation_id: null,
    };
    throw new ApiError(res.status, body);
  }
  return data as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== ""
  );
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");
}

export const api = {
  listLoads: (params: {
    direction?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) => request<Page<LoadSummary>>(`/loads${qs(params)}`),

  getLoad: (id: string) => request<LoadDetail>(`/loads/${id}`),

  createLoad: (payload: LoadCreateInput) =>
    request<LoadDetail>("/loads", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateLoad: (id: string, payload: Record<string, unknown>) =>
    request<LoadDetail>(`/loads/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteLoad: (id: string) =>
    request<void>(`/loads/${id}`, { method: "DELETE" }),

  markStopArrival: (loadId: string, stopId: string, actual: string | null) =>
    request<LoadDetail>(`/loads/${loadId}/stops/${stopId}`, {
      method: "PATCH",
      body: JSON.stringify({ actual_arrival_time: actual }),
    }),

  placeBid: (loadId: string, payload: PlaceBidInput) =>
    request<Bid>(`/loads/${loadId}/bids`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listBids: (params: { method?: string; status?: string; limit?: number; offset?: number }) =>
    request<Page<Bid>>(`/bids${qs(params)}`),
};

// SWR fetcher keyed by a tuple [path, params].
export const swrFetcher = <T>(key: string): Promise<T> => request<T>(key);
