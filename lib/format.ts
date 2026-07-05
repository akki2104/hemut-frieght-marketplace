// Presentation helpers — formatting and status → label/color maps.

import type { BidStatus, LoadStatus } from "./types";

export function money(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function miles(n: number): string {
  return `${n.toLocaleString("en-US")} mi`;
}

export function weight(lbs: number): string {
  return `${lbs.toLocaleString("en-US")} LB`;
}

export function phone(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = raw.replace(/[^\d]/g, "").replace(/^1/, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const LOAD_STATUS_META: Record<LoadStatus, { label: string; className: string }> = {
  available: { label: "Available", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  bid_placed: { label: "Bid Placed", className: "bg-amber-50 text-amber-700 ring-amber-200" },
  booked: { label: "Booked", className: "bg-blue-50 text-blue-700 ring-blue-200" },
  in_transit: { label: "In Transit", className: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  delivered: { label: "Delivered", className: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
};

export function loadStatusMeta(s: LoadStatus) {
  return LOAD_STATUS_META[s];
}

const BID_STATUS_META: Record<BidStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
  sent: { label: "Sent", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  recorded: { label: "Recorded", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  accepted: { label: "Accepted", className: "bg-green-50 text-green-700 ring-green-200" },
  rejected: { label: "Rejected", className: "bg-red-50 text-red-700 ring-red-200" },
  failed: { label: "Failed", className: "bg-red-50 text-red-700 ring-red-200" },
};

export function bidStatusMeta(s: BidStatus) {
  return BID_STATUS_META[s];
}
