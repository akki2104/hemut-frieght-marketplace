"use client";

import { Badge, Modal } from "@/components/ui";
import { bidStatusMeta, dateTime, money } from "@/lib/format";
import type { Bid } from "@/lib/types";

export function ViewEmailModal({ bid, onClose }: { bid: Bid; onClose: () => void }) {
  const status = bidStatusMeta(bid.status);
  return (
    <Modal open onClose={onClose} width="max-w-lg">
      <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
        <h2 className="text-lg font-semibold">Email Bid</h2>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4 px-6 py-4">
        <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm">
          <span className="text-zinc-500">
            {bid.status === "sent"
              ? "Delivered via Resend"
              : "Not actually sent (no email provider configured, or send failed)"}
          </span>
          <Badge className={status.className}>{status.label}</Badge>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-400">To</p>
          <p className="text-sm font-medium text-zinc-900">
            {bid.broker_email ?? "—"}
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-400">Subject</p>
          <p className="text-sm font-medium text-zinc-900">{bid.subject ?? "—"}</p>
        </div>

        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-zinc-400">Body</p>
          <div className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-800">
            {bid.body ?? "—"}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Target Amount</p>
            <p className="font-medium text-zinc-900">{money(bid.target_amount)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Placed</p>
            <p className="font-medium text-zinc-900">{dateTime(bid.created_at)}</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
