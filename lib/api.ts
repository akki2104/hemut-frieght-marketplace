// Typed fetch client for the FastAPI backend. All requests go through here so
// error handling and the base URL live in one place.

import { clearToken, getToken } from "./auth";
import type {
  ApiErrorBody,
  Bid,
  BidDecision,
  BidEmail,
  LoadCreateInput,
  LoadDetail,
  LoadSummary,
  Page,
  PlaceBidInput,
  RateSuggestion,
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
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
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
    // A dead/invalid token should send the user back to login rather than
    // surface a confusing error on every request.
    if (res.status === 401) clearToken();
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

  getRateSuggestion: (id: string) =>
    request<RateSuggestion>(`/loads/${id}/rate-suggestion`),

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

  updateBidStatus: (bidId: string, status: BidDecision) =>
    request<Bid>(`/bids/${bidId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  listBidEmails: (bidId: string) =>
    request<BidEmail[]>(`/bids/${bidId}/emails`),

  sendBidEmail: (
    bidId: string,
    payload: { to_email?: string; subject: string; body: string }
  ) =>
    request<BidEmail>(`/bids/${bidId}/emails`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  signup: (email: string, password: string) =>
    request<{ access_token: string }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ id: string; email: string }>("/auth/me"),
};

// SWR fetcher keyed by a tuple [path, params].
export const swrFetcher = <T>(key: string): Promise<T> => request<T>(key);
