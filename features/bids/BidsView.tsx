"use client";

import useSWR from "swr";

import { Badge, EmptyState, Spinner } from "@/components/ui";
import { swrFetcher } from "@/lib/api";
import { bidStatusMeta, dateTime, money } from "@/lib/format";
import type { Bid, Page } from "@/lib/types";

const METHOD_LABEL: Record<string, string> = {
  email: "Email",
  call: "Call",
};

export function BidsView() {
  const { data, error, isLoading } = useSWR<Page<Bid>>(
    "/bids?limit=100",
    swrFetcher
  );

  if (isLoading) return <Spinner label="Loading bids…" />;
  if (error)
    return <EmptyState title="Couldn't load bids" hint="Is the API running?" />;
  if (!data || data.items.length === 0)
    return (
      <EmptyState
        title="No bids yet"
        hint="Place a bid on an outbound load and it will show up here."
      />
    );

  return (
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
          {data.items.map((bid) => {
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
  );
}
