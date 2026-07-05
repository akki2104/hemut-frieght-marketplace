"use client";

import { useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { Badge, Button, EmptyState, Spinner } from "@/components/ui";
import { api, swrFetcher } from "@/lib/api";
import { bidStatusMeta, dateTime, money } from "@/lib/format";
import type { Bid, BidDecision, BidStatus, Page } from "@/lib/types";
import { BidActionsMenu } from "./BidActionsMenu";
import { ViewEmailModal } from "./ViewEmailModal";

const METHOD_LABEL: Record<string, string> = {
  email: "Email",
  call: "Call",
};

// Buckets over the finer-grained BidStatus enum, matching the reference's
// In Progress / Accepted / Rejected grouping, plus a Completed bucket for
// bids whose load has finished delivery (that takes priority over the bid's
// own status — a delivered load is "done" regardless of how the bid closed).
type Bucket = "in_progress" | "accepted" | "rejected" | "completed";
const BUCKET_STATUSES: Record<Exclude<Bucket, "completed">, BidStatus[]> = {
  in_progress: ["draft", "sent", "recorded"],
  accepted: ["accepted"],
  rejected: ["rejected", "failed"],
};
const BUCKET_LABEL: Record<Bucket, string> = {
  in_progress: "In Progress",
  accepted: "Accepted",
  rejected: "Rejected",
  completed: "Completed",
};

function bucketOf(bid: Bid): Bucket {
  if (bid.load?.status === "delivered") return "completed";
  for (const key of Object.keys(BUCKET_STATUSES) as Exclude<Bucket, "completed">[]) {
    if (BUCKET_STATUSES[key].includes(bid.status)) return key;
  }
  return "in_progress";
}

export function BidsView() {
  const { data, error, isLoading } = useSWR<Page<Bid>>(
    "/bids?limit=100",
    swrFetcher
  );
  const { mutate } = useSWRConfig();
  const [bucket, setBucket] = useState<Bucket>("in_progress");
  const [emailBid, setEmailBid] = useState<Bid | null>(null);

  async function handleDecision(bidId: string, decision: BidDecision) {
    await api.updateBidStatus(bidId, decision);
    await mutate(
      (key) => typeof key === "string" && key.startsWith("/bids")
    );
  }

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = {
      in_progress: 0,
      accepted: 0,
      rejected: 0,
      completed: 0,
    };
    for (const b of data?.items ?? []) c[bucketOf(b)]++;
    return c;
  }, [data]);

  const filtered = useMemo(
    () => (data?.items ?? []).filter((b) => bucketOf(b) === bucket),
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
        {(["in_progress", "accepted", "rejected", "completed"] as Bucket[]).map((b) => (
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
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((bid) => {
                const status = bidStatusMeta(bid.status);
                const isCompleted = bucketOf(bid) === "completed";
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
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {bid.method === "email" && (
                          <Button
                            variant="secondary"
                            className="px-2.5 py-1 text-xs"
                            onClick={() => setEmailBid(bid)}
                          >
                            Email
                          </Button>
                        )}
                        <BidActionsMenu
                          disabled={isCompleted}
                          onSelect={(decision) => handleDecision(bid.id, decision)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {emailBid && (
        <ViewEmailModal bid={emailBid} onClose={() => setEmailBid(null)} />
      )}
    </div>
  );
}
