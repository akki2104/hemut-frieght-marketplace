"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

import { Badge, EmptyState, Spinner } from "@/components/ui";
import { swrFetcher } from "@/lib/api";
import { bidStatusMeta, dateTime, money } from "@/lib/format";
import type { Bid, BidStatus, Page } from "@/lib/types";

const METHOD_LABEL: Record<string, string> = {
  email: "Email",
  call: "Call",
};

// Buckets over the finer-grained BidStatus enum, matching the reference's
// In Progress / Accepted / Rejected grouping.
type Bucket = "in_progress" | "accepted" | "rejected";
const BUCKET_STATUSES: Record<Bucket, BidStatus[]> = {
  in_progress: ["draft", "sent", "recorded"],
  accepted: ["accepted"],
  rejected: ["rejected", "failed"],
};
const BUCKET_LABEL: Record<Bucket, string> = {
  in_progress: "In Progress",
  accepted: "Accepted",
  rejected: "Rejected",
};

export function BidsView() {
  const { data, error, isLoading } = useSWR<Page<Bid>>(
    "/bids?limit=100",
    swrFetcher
  );
  const [bucket, setBucket] = useState<Bucket>("in_progress");

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { in_progress: 0, accepted: 0, rejected: 0 };
    for (const b of data?.items ?? []) {
      for (const key of Object.keys(BUCKET_STATUSES) as Bucket[]) {
        if (BUCKET_STATUSES[key].includes(b.status)) c[key]++;
      }
    }
    return c;
  }, [data]);

  const filtered = useMemo(
    () => (data?.items ?? []).filter((b) => BUCKET_STATUSES[bucket].includes(b.status)),
    [data, bucket]
  );

  if (isLoading) return <Spinner label="Loading bids…" />;
  if (error)
    return <EmptyState title="Couldn't load bids" hint="Is the API running?" />;
  if (!data || data.items.length === 0)
    return (
      <EmptyState
        title="No bids yet"
        hint="Place a bid on a load and it will show up here."
      />
    );

  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg bg-zinc-100 p-1">
        {(Object.keys(BUCKET_STATUSES) as Bucket[]).map((b) => (
          <button
            key={b}
            onClick={() => setBucket(b)}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
              bucket === b
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {BUCKET_LABEL[b]}
            <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600">
              {counts[b]}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={`No ${BUCKET_LABEL[bucket].toLowerCase()} bids`} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Lane</th>
                <th className="px-4 py-2.5 font-medium">Method</th>
                <th className="px-4 py-2.5 font-medium">Target</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((bid) => {
                const status = bidStatusMeta(bid.status);
                return (
                  <tr key={bid.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      {bid.load ? (
                        <div>
                          <div className="font-medium text-zinc-900">
                            {bid.load.origin_city}, {bid.load.origin_state} →{" "}
                            {bid.load.destination_city}, {bid.load.destination_state}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {bid.load.shipper_name}{" "}
                            <span className="font-mono text-zinc-400">
                              #{bid.load.order_id}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-zinc-700">
                        {METHOD_LABEL[bid.method] ?? bid.method}
                      </span>
                      {bid.rate_type && (
                        <span className="ml-1 text-xs text-zinc-400">
                          ({bid.rate_type === "all_in" ? "All-In" : "RPM"})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-900">
                      {money(bid.target_amount)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={status.className}>{status.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {dateTime(bid.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
