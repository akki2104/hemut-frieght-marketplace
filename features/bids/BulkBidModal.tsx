"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";

import { Button, Modal } from "@/components/ui";
import { api } from "@/lib/api";
import { miles, money } from "@/lib/format";
import type { BidMethod, LoadSummary, RateType } from "@/lib/types";

interface Row {
  amount: string;
  method: BidMethod;
  rateType: RateType;
  brokerEmail: string;
  result?: "ok" | "error";
  error?: string;
}

export function BulkBidModal({
  loads,
  onClose,
  onDone,
}: {
  loads: LoadSummary[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { mutate } = useSWRConfig();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      loads.map((l) => [
        l.id,
        { amount: "", method: "email" as BidMethod, rateType: "all_in" as RateType, brokerEmail: l.broker_email },
      ])
    )
  );
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function update(id: string, patch: Partial<Row>) {
    setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  }

  // Call bidding (the negotiation agent) isn't built yet — those rows are
  // excluded from submission even if an amount was entered for them.
  const validRows = loads.filter((l) => {
    const r = rows[l.id];
    const n = parseFloat(r.amount);
    return !Number.isNaN(n) && n > 0 && r.method === "email";
  });
  const emailCount = validRows.length;
  const callPendingCount = loads.filter((l) => {
    const r = rows[l.id];
    const n = parseFloat(r.amount);
    return !Number.isNaN(n) && n > 0 && r.method === "call";
  }).length;

  async function submitAll() {
    setSubmitting(true);
    for (const load of validRows) {
      const r = rows[load.id];
      const amount = parseFloat(r.amount);
      try {
        await api.placeBid(load.id, {
          method: "email",
          target_amount: amount,
          rate_type: r.rateType,
          broker_email: r.brokerEmail,
          subject: `Bid on ${load.origin_city}, ${load.origin_state} → ${load.destination_city}, ${load.destination_state} (${load.order_id})`,
          body: `Hi, we can cover load ${load.order_id} (${load.origin_city}, ${load.origin_state} → ${load.destination_city}, ${load.destination_state}) at ${money(amount)} ${r.rateType === "all_in" ? "all-in" : "per mile"}. Please confirm.`,
        });
        update(load.id, { result: "ok" });
      } catch (e) {
        update(load.id, {
          result: "error",
          error: (e as { message?: string })?.message ?? "Failed",
        });
      }
    }
    await mutate(
      (key) =>
        typeof key === "string" &&
        (key.startsWith("/loads") || key.startsWith("/bids"))
    );
    setSubmitting(false);
    setDone(true);
  }

  return (
    <Modal open onClose={onClose} width="max-w-2xl">
      <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
        <h2 className="text-lg font-semibold">Generate Bids · {loads.length} loads</h2>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          ✕
        </button>
      </div>

      <div className="max-h-[62vh] space-y-3 overflow-y-auto px-6 py-4">
        {loads.map((load) => {
          const r = rows[load.id];
          const n = parseFloat(r.amount);
          const allIn =
            !Number.isNaN(n) && n > 0
              ? r.rateType === "per_mile"
                ? n * load.distance_miles
                : n
              : null;
          return (
            <div key={load.id} className="rounded-xl border border-zinc-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-zinc-900">
                    {load.origin_city}, {load.origin_state} → {load.destination_city},{" "}
                    {load.destination_state}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {load.shipper_name} ({load.order_id}) · {miles(load.distance_miles)}
                  </p>
                </div>
                {r.result === "ok" && (
                  <span className="text-xs font-medium text-emerald-600">✓ Sent</span>
                )}
                {r.result === "error" && (
                  <span className="text-xs font-medium text-red-600">✕ {r.error}</span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="text-xs text-zinc-500">Bid amount</label>
                  <input
                    type="number"
                    value={r.amount}
                    onChange={(e) => update(load.id, { amount: e.target.value })}
                    placeholder="Enter amount…"
                    className="mt-0.5 w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                  {allIn !== null && (
                    <p className="mt-0.5 text-xs text-zinc-400">
                      All-in: {money(allIn)}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Rate type</label>
                  <select
                    value={r.rateType}
                    onChange={(e) =>
                      update(load.id, { rateType: e.target.value as RateType })
                    }
                    className="mt-0.5 w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm"
                  >
                    <option value="all_in">All-In</option>
                    <option value="per_mile">RPM</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Method</label>
                  <select
                    value={r.method}
                    onChange={(e) =>
                      update(load.id, { method: e.target.value as BidMethod })
                    }
                    className="mt-0.5 w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm"
                  >
                    <option value="email">Email</option>
                    <option value="call">Call</option>
                  </select>
                </div>
              </div>

              {r.method === "email" ? (
                <div className="mt-2">
                  <label className="text-xs text-zinc-500">Broker email</label>
                  <input
                    value={r.brokerEmail}
                    onChange={(e) => update(load.id, { brokerEmail: e.target.value })}
                    className="mt-0.5 w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              ) : (
                <p className="mt-2 text-xs text-zinc-400">
                  📞 AI voice negotiation is coming soon — this row won&apos;t be sent.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-6 py-3">
        <span className="text-xs text-zinc-500">
          {validRows.length} of {loads.length} ready
        </span>
        {done ? (
          <Button variant="primary" onClick={onDone}>
            Done
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={submitAll}
            disabled={validRows.length === 0 || submitting}
          >
            {submitting
              ? "Sending…"
              : `Send ${emailCount} email${emailCount === 1 ? "" : "s"}`}
            {!submitting && callPendingCount > 0 && (
              <span className="ml-1 font-normal text-zinc-300">
                ({callPendingCount} call{callPendingCount === 1 ? "" : "s"} skipped)
              </span>
            )}
          </Button>
        )}
      </div>
    </Modal>
  );
}
