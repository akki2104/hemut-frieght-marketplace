"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";

import { Button, Modal } from "@/components/ui";
import { api } from "@/lib/api";
import type { LoadCreateInput, LoadDetail } from "@/lib/types";

// Compact create/edit form. Create auto-builds a pickup+delivery stop pair from
// the origin/destination so the backend's "needs a pickup and a delivery" rule is
// satisfied without a full multi-stop editor (out of scope for the time budget).

type Mode = "create" | "edit";

const BLANK = {
  order_id: "",
  shipper_name: "",
  origin_city: "",
  origin_state: "",
  origin_lat: "",
  origin_lng: "",
  destination_city: "",
  destination_state: "",
  destination_lat: "",
  destination_lng: "",
  distance_miles: "",
  weight_lbs: "",
  equipment_type: "Van",
  posted_rate: "",
  pickup_deadhead_miles: "0",
  source: "Manual",
  broker_email: "",
  broker_phone: "",
  customer_company_name: "",
};

type FormState = typeof BLANK;

export function LoadFormModal({
  mode,
  load,
  onClose,
  onSaved,
}: {
  mode: Mode;
  load?: LoadDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { mutate } = useSWRConfig();
  const [form, setForm] = useState<FormState>(() =>
    mode === "edit" && load
      ? {
          order_id: load.order_id,
          shipper_name: load.shipper_name,
          origin_city: load.origin_city,
          origin_state: load.origin_state,
          origin_lat: String(load.origin_lat),
          origin_lng: String(load.origin_lng),
          destination_city: load.destination_city,
          destination_state: load.destination_state,
          destination_lat: String(load.destination_lat),
          destination_lng: String(load.destination_lng),
          distance_miles: String(load.distance_miles),
          weight_lbs: String(load.weight_lbs),
          equipment_type: load.equipment_type,
          posted_rate: load.posted_rate,
          pickup_deadhead_miles: String(load.pickup_deadhead_miles),
          source: load.source,
          broker_email: load.broker_email,
          broker_phone: load.broker_phone,
          customer_company_name: load.customer_company_name,
        }
      : { ...BLANK }
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(k: keyof FormState, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "edit" && load) {
        await api.updateLoad(load.id, {
          shipper_name: form.shipper_name,
          distance_miles: Number(form.distance_miles),
          weight_lbs: Number(form.weight_lbs),
          equipment_type: form.equipment_type,
          posted_rate: Number(form.posted_rate),
          pickup_deadhead_miles: Number(form.pickup_deadhead_miles),
          source: form.source,
          broker_email: form.broker_email,
          broker_phone: form.broker_phone,
          customer_company_name: form.customer_company_name,
        });
      } else {
        const oLat = Number(form.origin_lat);
        const oLng = Number(form.origin_lng);
        const dLat = Number(form.destination_lat);
        const dLng = Number(form.destination_lng);
        const payload: LoadCreateInput = {
          direction: "outbound",
          order_id: form.order_id,
          shipper_name: form.shipper_name,
          origin_city: form.origin_city,
          origin_state: form.origin_state.toUpperCase(),
          origin_lat: oLat,
          origin_lng: oLng,
          destination_city: form.destination_city,
          destination_state: form.destination_state.toUpperCase(),
          destination_lat: dLat,
          destination_lng: dLng,
          distance_miles: Number(form.distance_miles),
          weight_lbs: Number(form.weight_lbs),
          equipment_type: form.equipment_type,
          posted_rate: Number(form.posted_rate),
          pickup_deadhead_miles: Number(form.pickup_deadhead_miles),
          source: form.source,
          broker_email: form.broker_email,
          broker_phone: form.broker_phone,
          customer_company_name: form.customer_company_name,
          stops: [
            { sequence: 1, stop_type: "pickup", city: form.origin_city, state: form.origin_state.toUpperCase(), lat: oLat, lng: oLng },
            { sequence: 2, stop_type: "delivery", city: form.destination_city, state: form.destination_state.toUpperCase(), lat: dLat, lng: dLng },
          ],
        };
        await api.createLoad(payload);
      }
      await mutate(
        (key) => typeof key === "string" && key.startsWith("/loads")
      );
      onSaved();
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Failed to save load.");
    } finally {
      setSubmitting(false);
    }
  }

  const isCreate = mode === "create";

  return (
    <Modal open onClose={onClose} width="max-w-2xl">
      <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
        <h2 className="text-lg font-semibold">
          {isCreate ? "Create Order" : `Edit #${load?.order_id}`}
        </h2>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          ✕
        </button>
      </div>

      <div className="max-h-[65vh] overflow-y-auto px-6 py-4">
        <div className="grid grid-cols-2 gap-3">
          {isCreate && <F label="Order ID" v={form.order_id} on={(v) => set("order_id", v)} />}
          <F label="Shipper" v={form.shipper_name} on={(v) => set("shipper_name", v)} />
          <F label="Customer company" v={form.customer_company_name} on={(v) => set("customer_company_name", v)} />
          <F label="Origin city" v={form.origin_city} on={(v) => set("origin_city", v)} disabled={!isCreate} />
          <F label="Origin state" v={form.origin_state} on={(v) => set("origin_state", v)} disabled={!isCreate} />
          {isCreate && <F label="Origin lat" v={form.origin_lat} on={(v) => set("origin_lat", v)} type="number" />}
          {isCreate && <F label="Origin lng" v={form.origin_lng} on={(v) => set("origin_lng", v)} type="number" />}
          <F label="Destination city" v={form.destination_city} on={(v) => set("destination_city", v)} disabled={!isCreate} />
          <F label="Destination state" v={form.destination_state} on={(v) => set("destination_state", v)} disabled={!isCreate} />
          {isCreate && <F label="Destination lat" v={form.destination_lat} on={(v) => set("destination_lat", v)} type="number" />}
          {isCreate && <F label="Destination lng" v={form.destination_lng} on={(v) => set("destination_lng", v)} type="number" />}
          <F label="Distance (mi)" v={form.distance_miles} on={(v) => set("distance_miles", v)} type="number" />
          <F label="Weight (lbs)" v={form.weight_lbs} on={(v) => set("weight_lbs", v)} type="number" />
          <F label="Equipment" v={form.equipment_type} on={(v) => set("equipment_type", v)} />
          <F label="Posted rate ($)" v={form.posted_rate} on={(v) => set("posted_rate", v)} type="number" />
          <F label="Pickup deadhead (mi)" v={form.pickup_deadhead_miles} on={(v) => set("pickup_deadhead_miles", v)} type="number" />
          <F label="Source" v={form.source} on={(v) => set("source", v)} />
          <F label="Broker email" v={form.broker_email} on={(v) => set("broker_email", v)} />
          <F label="Broker phone" v={form.broker_phone} on={(v) => set("broker_phone", v)} />
        </div>
        {isCreate && (
          <p className="mt-3 text-xs text-zinc-400">
            A pickup and delivery stop are created automatically from the origin and
            destination. Tip: Jersey City ≈ 40.72, -74.04; Columbus ≈ 39.96, -82.99.
          </p>
        )}
        {error && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-6 py-3">
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={submitting}>
          {submitting ? "Saving…" : isCreate ? "Create Order" : "Save Changes"}
        </Button>
      </div>
    </Modal>
  );
}

function F({
  label,
  v,
  on,
  type = "text",
  disabled,
}: {
  label: string;
  v: string;
  on: (v: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-zinc-500">{label}</label>
      <input
        type={type}
        value={v}
        disabled={disabled}
        onChange={(e) => on(e.target.value)}
        className="mt-0.5 w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-400"
      />
    </div>
  );
}
