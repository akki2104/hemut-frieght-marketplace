"use client";

import { useState } from "react";

import { Button } from "@/components/ui";
import { EMPTY_FILTERS, type LoadFilters } from "./LoadsView";

export function LoadSearchPanel({
  onApply,
}: {
  onApply: (filters: LoadFilters) => void;
}) {
  const [draft, setDraft] = useState<LoadFilters>(EMPTY_FILTERS);

  function set<K extends keyof LoadFilters>(key: K, value: LoadFilters[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function reset() {
    setDraft(EMPTY_FILTERS);
    onApply(EMPTY_FILTERS);
  }

  return (
    <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-900">Search Parameters</h3>
          <p className="text-xs text-zinc-500">Filter loads by route, equipment, and weight</p>
        </div>
        <button
          onClick={reset}
          className="text-sm text-zinc-500 underline hover:text-zinc-800"
        >
          Reset Search
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FieldGroup label="Origin">
          <div className="flex gap-2">
            <input
              value={draft.originCity}
              onChange={(e) => set("originCity", e.target.value)}
              placeholder="City"
              className="w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
            />
            <input
              value={draft.originState}
              onChange={(e) => set("originState", e.target.value)}
              placeholder="ST"
              maxLength={2}
              className="w-16 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm uppercase focus:border-zinc-500 focus:outline-none"
            />
          </div>
        </FieldGroup>

        <FieldGroup label="Destination">
          <div className="flex gap-2">
            <input
              value={draft.destCity}
              onChange={(e) => set("destCity", e.target.value)}
              placeholder="City"
              className="w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
            />
            <input
              value={draft.destState}
              onChange={(e) => set("destState", e.target.value)}
              placeholder="ST"
              maxLength={2}
              className="w-16 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm uppercase focus:border-zinc-500 focus:outline-none"
            />
          </div>
        </FieldGroup>

        <FieldGroup label="Equipment">
          <select
            value={draft.equipment}
            onChange={(e) => set("equipment", e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
          >
            <option value="">Any</option>
            <option value="Van">Van</option>
            <option value="Reefer">Reefer</option>
            <option value="Flatbed">Flatbed</option>
          </select>
        </FieldGroup>

        <FieldGroup label="Max Weight (lbs)">
          <input
            type="number"
            value={draft.maxWeight}
            onChange={(e) => set("maxWeight", e.target.value)}
            placeholder="Any"
            className="w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </FieldGroup>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <FieldGroup label="Direction">
          <div className="inline-flex rounded-lg bg-zinc-100 p-1">
            {(["all", "outbound", "inbound"] as const).map((d) => (
              <button
                key={d}
                onClick={() => set("direction", d)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  draft.direction === d
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {d === "all" ? "All" : d === "outbound" ? "Outbound" : "Inbound"}
              </button>
            ))}
          </div>
        </FieldGroup>
        <Button variant="primary" onClick={() => onApply(draft)}>
          Find Loads
        </Button>
      </div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </label>
      {children}
    </div>
  );
}
