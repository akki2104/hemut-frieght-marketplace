"use client";

import { useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { Button, Modal } from "@/components/ui";
import { api } from "@/lib/api";
import { miles, money } from "@/lib/format";
import type { BidMethod, LoadDetail, LoadSummary, RateType } from "@/lib/types";

// Accepts either a summary or a full detail — only lane/broker fields are needed.
type BidTarget = LoadSummary & Partial<LoadDetail>;

export function PlaceBidModal({
  load,
  onClose,
  onPlaced,
}: {
  load: BidTarget;
  onClose: () => void;
  onPlaced: () => void;
}) {
  const { mutate } = useSWRConfig();
  const [method, setMethod] = useState<BidMethod>("email");
  const [amount, setAmount] = useState("");
  const [rateType, setRateType] = useState<RateType>("all_in");
  const [brokerEmail, setBrokerEmail] = useState(load.broker_email);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI-estimated historical rate for this lane (Groq) — null if no key is
  // configured or the estimate call failed; the amount field works either way.
  const { data: rateSuggestion, isLoading: suggestionLoading } = useSWR(
    `/loads/${load.id}/rate-suggestion`,
    () => api.getRateSuggestion(load.id)
  );

  const amountNum = parseFloat(amount);
  const validAmount = !Number.isNaN(amountNum) && amountNum > 0;

  // Live All-In ⇄ RPM conversion (pure display).
  const allInRate = useMemo(() => {
    if (!validAmount) return null;
    return rateType === "per_mile" ? amountNum * load.distance_miles : amountNum;
  }, [validAmount, amountNum, rateType, load.distance_miles]);

  const perMileRate = useMemo(() => {
    if (!validAmount || !load.distance_miles) return null;
    return rateType === "per_mile" ? amountNum : amountNum / load.distance_miles;
  }, [validAmount, amountNum, rateType, load.distance_miles]);

  const emailReady = validAmount && brokerEmail && subject && body;
  // Call bidding (the negotiation agent) isn't built yet — the tab stays
  // visible for discoverability but never becomes submittable.
  const canSubmit = method === "email" && emailReady;

  async function submit() {
    if (method !== "email") return;
    setSubmitting(true);
    setError(null);
    try {
      await api.placeBid(load.id, {
        method: "email",
        target_amount: amountNum,
        rate_type: rateType,
        broker_email: brokerEmail,
        subject,
        body,
      });
      // Refresh loads + bids lists.
      await mutate(
        (key) =>
          typeof key === "string" &&
          (key.startsWith("/loads") || key.startsWith("/bids"))
      );
      onPlaced();
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Failed to place bid.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} width="max-w-md">
      <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
        <h2 className="text-lg font-semibold">Place Bid</h2>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          ✕
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
        {/* Load summary */}
        <div className="mb-4 rounded-xl bg-zinc-50 p-4 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-zinc-400">
              Load Details
            </span>
            <span className="font-mono text-xs text-zinc-500">#{load.order_id}</span>
          </div>
          <p className="font-medium text-zinc-900">
            {load.origin_city}, {load.origin_state} → {load.destination_city},{" "}
            {load.destination_state}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-zinc-600">
            <span>Shipper: {load.shipper_name}</span>
            <span>Distance: {miles(load.distance_miles)}</span>
            <span>Posted: {money(load.posted_rate)}</span>
            <span>Deadhead: {miles(load.pickup_deadhead_miles)}</span>
          </div>
        </div>

        {/* Method toggle */}
        <Toggle
          options={[
            { value: "email", label: "Email" },
            { value: "call", label: "Call" },
          ]}
          value={method}
          onChange={(v) => setMethod(v as BidMethod)}
        />

        {/* Target amount */}
        <label className="mt-4 block text-sm font-medium text-zinc-700">
          Target Bid Amount (USD)
        </label>
        <input
          type="number"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Enter target bid amount…"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
        {suggestionLoading && (
          <p className="mt-1.5 text-xs text-zinc-400">✨ Getting an AI rate suggestion…</p>
        )}
        {!suggestionLoading && rateSuggestion?.suggested_rate != null && (
          <p className="mt-1.5 text-xs text-zinc-500">
            ✨ AI suggestion:{" "}
            <button
              type="button"
              onClick={() => setAmount(String(rateSuggestion.suggested_rate))}
              className="font-medium text-amber-700 underline decoration-dotted underline-offset-2 hover:text-amber-800"
            >
              {money(rateSuggestion.suggested_rate)} — use this
            </button>
          </p>
        )}

        {method === "email" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl bg-zinc-50 p-3">
              <Toggle
                options={[
                  { value: "all_in", label: "All-In" },
                  { value: "per_mile", label: "RPM" },
                ]}
                value={rateType}
                onChange={(v) => setRateType(v as RateType)}
              />
              <div className="mt-2 grid grid-cols-2 text-sm">
                <div>
                  <span className="text-xs text-zinc-400">Target All-In Rate</span>
                  <p className="font-semibold text-zinc-900">
                    {allInRate !== null ? money(allInRate) : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-zinc-400">Rate / Mile</span>
                  <p className="font-semibold text-zinc-900">
                    {perMileRate !== null ? `$${perMileRate.toFixed(2)}` : "—"}
                  </p>
                </div>
              </div>
            </div>

            <TextField label="Broker email" value={brokerEmail} onChange={setBrokerEmail} />
            <TextField
              label="Subject"
              value={subject}
              onChange={setSubject}
              placeholder="Bid on this load"
            />
            <div>
              <label className="block text-sm font-medium text-zinc-700">Body</label>
              <textarea
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your bid message to the broker…"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {method === "call" && (
          <div className="mt-4 flex flex-col items-center gap-2 rounded-xl bg-zinc-50 px-4 py-8 text-center">
            <span className="text-2xl">📞</span>
            <p className="text-sm font-medium text-zinc-700">
              AI voice negotiation is coming soon
            </p>
            <p className="max-w-xs text-xs text-zinc-500">
              {`Calling ${load.broker_phone} with an AI negotiation agent isn't available yet — check back soon, or place this bid by email in the meantime.`}
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-6 py-3">
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={!canSubmit || submitting}>
          {method === "call" ? "Coming Soon" : submitting ? "Submitting…" : "Send Email Bid"}
        </Button>
      </div>
    </Modal>
  );
}

function Toggle({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-zinc-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            value === o.value
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700">{label}</label>
      <input
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none ${
          readOnly ? "bg-zinc-50 text-zinc-500" : ""
        }`}
      />
    </div>
  );
}
