"use client";

import { Badge, Button } from "@/components/ui";
import { loadStatusMeta, miles, money, weight } from "@/lib/format";
import type { LoadSummary } from "@/lib/types";

export function LoadCard({
  load,
  onOpen,
  onPlaceBid,
  selectable,
  selected,
  onToggleSelect,
}: {
  load: LoadSummary;
  onOpen: (load: LoadSummary) => void;
  onPlaceBid?: (load: LoadSummary) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (load: LoadSummary) => void;
}) {
  const status = loadStatusMeta(load.status);
  return (
    <div
      onClick={() => onOpen(load)}
      className={`group flex cursor-pointer items-center gap-3 rounded-xl border bg-white px-4 py-3.5 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 ${
        selected ? "border-brand-strong ring-1 ring-brand-strong" : "border-zinc-200"
      }`}
    >
      {selectable && (
        <input
          type="checkbox"
          checked={Boolean(selected)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect?.(load)}
          className="h-4 w-4 shrink-0 accent-amber-500"
          aria-label={`Select load ${load.order_id}`}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-zinc-900">
            {load.shipper_name}
          </span>
          <span className="font-mono text-xs text-zinc-400">#{load.order_id}</span>
          <Badge className={status.className}>{status.label}</Badge>
          <Badge
            className={
              load.direction === "outbound"
                ? "bg-zinc-100 text-zinc-600 ring-zinc-200"
                : "bg-violet-50 text-violet-700 ring-violet-200"
            }
          >
            {load.direction === "outbound" ? "Outbound" : "Inbound"}
          </Badge>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-700">
          <span className="font-medium">
            {load.origin_city}, {load.origin_state}
          </span>
          <span className="text-zinc-400">→</span>
          <span className="font-medium">
            {load.destination_city}, {load.destination_state}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
          <span>{load.num_stops} stops</span>
          <span>{miles(load.distance_miles)}</span>
          <span>{load.pickup_deadhead_miles} mi DH-O</span>
          <span>{weight(load.weight_lbs)}</span>
          <span>{load.equipment_type}</span>
          <span className="text-zinc-400">·</span>
          <span>{load.source}</span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <span className="text-sm font-semibold text-zinc-900">
          {money(load.posted_rate)}
        </span>
        {onPlaceBid && (
          <Button
            variant="primary"
            className="px-3 py-1.5 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onPlaceBid(load);
            }}
          >
            Place Bid
          </Button>
        )}
      </div>
    </div>
  );
}
