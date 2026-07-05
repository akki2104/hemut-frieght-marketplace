"use client";

import { useState } from "react";
import useSWR from "swr";

import { Badge, Button, Modal, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { Bid, BidEmail, EmailDeliveryStatus } from "@/lib/types";

const STATUS_META: Record<EmailDeliveryStatus, { label: string; className: string }> = {
  sent: { label: "Sent", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  recorded: { label: "Recorded", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  failed: { label: "Failed", className: "bg-red-50 text-red-700 ring-red-200" },
};

export function ViewEmailModal({ bid, onClose }: { bid: Bid; onClose: () => void }) {
  const { data: emails, isLoading, mutate } = useSWR<BidEmail[]>(
    `/bids/${bid.id}/emails`,
    () => api.listBidEmails(bid.id)
  );

  const defaultTo = bid.broker_email ?? bid.load?.broker_email ?? "";
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      await api.sendBidEmail(bid.id, { to_email: to, subject, body });
      setSubject("");
      setBody("");
      await mutate();
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Failed to send email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open onClose={onClose} width="max-w-xl">
      <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">Email Conversation</h2>
          <p className="text-xs text-zinc-500">
            #{bid.load?.order_id ?? bid.id.slice(0, 8)}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          ✕
        </button>
      </div>

      {/* Thread */}
      <div className="max-h-[45vh] space-y-3 overflow-y-auto px-6 py-4">
        {isLoading && <Spinner label="Loading conversation…" />}
        {!isLoading && (!emails || emails.length === 0) && (
          <p className="py-6 text-center text-sm text-zinc-400">
            No emails sent yet for this bid.
          </p>
        )}
        {emails?.map((email) => {
          const status = STATUS_META[email.status];
          return (
            <div key={email.id} className="rounded-lg border border-zinc-200 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-zinc-500">
                  To <span className="font-medium text-zinc-700">{email.to_email}</span>
                </span>
                <div className="flex items-center gap-2">
                  <Badge className={status.className}>{status.label}</Badge>
                  <span className="text-xs text-zinc-400">{dateTime(email.created_at)}</span>
                </div>
              </div>
              <p className="text-sm font-medium text-zinc-900">{email.subject}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{email.body}</p>
            </div>
          );
        })}
      </div>

      {/* Compose */}
      <div className="space-y-2 border-t border-zinc-200 px-6 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Send another email
        </p>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Broker email"
          className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
        />
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Write a message…"
          className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
        />
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}
        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={send}
            disabled={sending || !to || !subject || !body}
          >
            {sending ? "Sending…" : "Send Email"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
