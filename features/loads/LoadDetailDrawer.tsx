"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import useSWR from "swr";

import { Badge, Button, Spinner } from "@/components/ui";
import { api, swrFetcher } from "@/lib/api";
import {
  dateShort,
  dateTime,
  loadStatusMeta,
  miles,
  money,
  phone,
  weight,
} from "@/lib/format";
import type { LoadDetail } from "@/lib/types";

// Map is client-only (Leaflet uses window); load it lazily.
const RouteMap = dynamic(
  () => import("./RouteMap").then((m) => m.RouteMap),
  { ssr: false, loading: () => <Spinner label="Loading map…" /> }
);

type Tab = "load" | "stops" | "customer" | "lane" | "map";
const TABS: { key: Tab; label: string }[] = [
  { key: "load", label: "Load" },
  { key: "stops", label: "Stop Information" },
  { key: "customer", label: "Customer" },
  { key: "lane", label: "Lane" },
  { key: "map", label: "Map" },
];

export function LoadDetailDrawer({
  loadId,
  onClose,
  onPlaceBid,
  onEdit,
  onDeleted,
}: {
  loadId: string;
  onClose: () => void;
  onPlaceBid: (load: LoadDetail) => void;
  onEdit: (load: LoadDetail) => void;
  onDeleted: () => void;
}) {
  const { data: load, error, isLoading, mutate } = useSWR<LoadDetail>(
    `/loads/${loadId}`,
    swrFetcher
  );
  const [tab, setTab] = useState<Tab>("load");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleDelete() {
    if (!load) return;
    if (!confirm(`Delete load #${load.order_id}? This cannot be undone.`)) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.deleteLoad(load.id);
      onDeleted();
    } catch (e) {
      setActionError(
        (e as { message?: string })?.message ?? "Failed to delete load."
      );
    } finally {
      setBusy(false);
    }
  }

  async function markArrived(stopId: string, current: string | null) {
    if (!load) return;
    setBusy(true);
    try {
      await api.markStopArrival(
        load.id,
        stopId,
        current ? null : new Date().toISOString()
      );
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <Spinner label="Loading load…" />;
  if (error || !load)
    return (
      <div className="p-6 text-sm text-red-600">
        Couldn&apos;t load this order.
        <button className="ml-2 underline" onClick={onClose}>
          Close
        </button>
      </div>
    );

  const status = loadStatusMeta(load.status);
  const canBid = load.direction === "outbound";

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between border-b border-zinc-200 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            {load.shipper_name}
          </h2>
          <p className="text-sm text-zinc-500">
            {load.origin_city}, {load.origin_state} → {load.destination_city},{" "}
            {load.destination_state}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={status.className}>{status.label}</Badge>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200 px-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {actionError && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {actionError}
          </div>
        )}

        {tab === "load" && <LoadTab load={load} />}
        {tab === "stops" && (
          <StopsTab load={load} busy={busy} onMarkArrived={markArrived} />
        )}
        {tab === "customer" && <CustomerTab load={load} />}
        {tab === "lane" && <LaneTab load={load} />}
        {tab === "map" && (
          <div className="h-[60vh]">
            <RouteMap stops={load.stops} />
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-6 py-3">
        <div className="flex gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => onEdit(load)}>
            Edit
          </Button>
          <Button variant="danger" disabled={busy} onClick={handleDelete}>
            Delete
          </Button>
        </div>
        {canBid && (
          <Button variant="primary" onClick={() => onPlaceBid(load)}>
            Place Bid
          </Button>
        )}
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-zinc-800">{value ?? "—"}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-sm font-semibold text-zinc-900">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-zinc-50 p-4">
        {children}
      </dl>
    </div>
  );
}

function LoadTab({ load }: { load: LoadDetail }) {
  return (
    <>
      <Section title="Load Information">
        <Field label="Order ID" value={<span className="font-mono">#{load.order_id}</span>} />
        <Field label="Source" value={load.source} />
        <Field label="Equipment" value={load.equipment_type} />
        <Field label="Weight" value={weight(load.weight_lbs)} />
        <Field label="Posted Rate" value={money(load.posted_rate)} />
        <Field label="Stops" value={load.num_stops} />
      </Section>
      <Section title="Driver">
        <Field label="Driver" value={load.driver_name} />
        <Field label="Driver Phone" value={phone(load.driver_phone)} />
      </Section>
      {load.instructions && (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="mb-1 font-semibold">Instructions</p>
          {load.instructions}
        </div>
      )}
    </>
  );
}

function StopsTab({
  load,
  busy,
  onMarkArrived,
}: {
  load: LoadDetail;
  busy: boolean;
  onMarkArrived: (stopId: string, current: string | null) => void;
}) {
  return (
    <ol className="space-y-3">
      {load.stops.map((s, i) => {
        const arrived = Boolean(s.actual_arrival_time);
        const isPickup = s.stop_type === "pickup";
        return (
          <li
            key={s.id}
            className="rounded-xl border border-zinc-200 p-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${
                    isPickup ? "bg-emerald-600" : "bg-red-600"
                  }`}
                >
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium text-zinc-900">
                    {s.city}, {s.state}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {isPickup ? "Pickup" : "Delivery"} · Scheduled{" "}
                    {dateShort(s.scheduled_time)}
                  </p>
                  {s.instructions && (
                    <p className="mt-1 text-xs text-zinc-500">{s.instructions}</p>
                  )}
                </div>
              </div>
              <div className="text-right">
                {arrived ? (
                  <p className="text-xs font-medium text-emerald-700">
                    Arrived {dateTime(s.actual_arrival_time)}
                  </p>
                ) : (
                  <p className="text-xs text-zinc-400">Not yet arrived</p>
                )}
                <button
                  disabled={busy}
                  onClick={() => onMarkArrived(s.id, s.actual_arrival_time)}
                  className="mt-1 text-xs font-medium text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50"
                >
                  {arrived ? "Undo arrival" : "Mark arrived"}
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function CustomerTab({ load }: { load: LoadDetail }) {
  return (
    <Section title="Customer Information">
      <Field label="Company" value={load.customer_company_name} />
      <Field label="Contact" value={load.customer_contact_name} />
      <Field label="Contact Phone" value={phone(load.customer_contact_phone)} />
      <Field label="Broker Email" value={load.broker_email} />
      <Field label="Broker Phone" value={phone(load.broker_phone)} />
    </Section>
  );
}

function LaneTab({ load }: { load: LoadDetail }) {
  const rate = parseFloat(load.posted_rate);
  const rpm = load.distance_miles ? rate / load.distance_miles : 0;
  return (
    <Section title="Lane Information">
      <Field label="Origin" value={`${load.origin_city}, ${load.origin_state}`} />
      <Field
        label="Destination"
        value={`${load.destination_city}, ${load.destination_state}`}
      />
      <Field label="Distance" value={miles(load.distance_miles)} />
      <Field label="Pickup Deadhead" value={miles(load.pickup_deadhead_miles)} />
      <Field label="Posted Rate" value={money(load.posted_rate)} />
      <Field label="Rate / Mile" value={`$${rpm.toFixed(2)}`} />
    </Section>
  );
}
