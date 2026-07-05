"use client";

import { useMemo } from "react";
import useSWR from "swr";

import { EmptyState, Spinner } from "@/components/ui";
import { swrFetcher } from "@/lib/api";
import type { LoadDirection, LoadSummary, Page } from "@/lib/types";
import { LoadCard } from "./LoadCard";

export interface LoadFilters {
  direction: LoadDirection | "all";
  originCity: string;
  originState: string;
  destCity: string;
  destState: string;
  equipment: string;
  maxWeight: string;
}

export const EMPTY_FILTERS: LoadFilters = {
  direction: "all",
  originCity: "",
  originState: "",
  destCity: "",
  destState: "",
  equipment: "",
  maxWeight: "",
};

export function LoadsView({
  search = "",
  filters = EMPTY_FILTERS,
  excludeLoadIds,
  onOpen,
  onPlaceBid,
  selectable,
  selectedIds,
  onToggleSelect,
}: {
  search?: string;
  filters?: LoadFilters;
  /** Loads whose bid has already been decided (accepted/rejected) — tracked under My Bids instead. */
  excludeLoadIds?: Set<string>;
  onOpen: (load: LoadSummary) => void;
  // Only invoked for outbound loads — inbound rows never render a bid button.
  onPlaceBid?: (load: LoadSummary) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (load: LoadSummary) => void;
}) {
  const { data, error, isLoading } = useSWR<Page<LoadSummary>>(
    "/loads?limit=100",
    swrFetcher
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const maxW = filters.maxWeight ? parseFloat(filters.maxWeight) : null;

    return data.items.filter((l) => {
      if (excludeLoadIds?.has(l.id)) return false;
      if (filters.direction !== "all" && l.direction !== filters.direction) return false;
      if (
        filters.originCity &&
        !l.origin_city.toLowerCase().includes(filters.originCity.toLowerCase())
      )
        return false;
      if (
        filters.originState &&
        l.origin_state.toLowerCase() !== filters.originState.toLowerCase()
      )
        return false;
      if (
        filters.destCity &&
        !l.destination_city.toLowerCase().includes(filters.destCity.toLowerCase())
      )
        return false;
      if (
        filters.destState &&
        l.destination_state.toLowerCase() !== filters.destState.toLowerCase()
      )
        return false;
      if (
        filters.equipment &&
        !l.equipment_type.toLowerCase().includes(filters.equipment.toLowerCase())
      )
        return false;
      if (maxW !== null && !Number.isNaN(maxW) && l.weight_lbs > maxW) return false;

      if (!q) return true;
      return [
        l.shipper_name,
        l.order_id,
        l.origin_city,
        l.origin_state,
        l.destination_city,
        l.destination_state,
        l.equipment_type,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [data, search, filters, excludeLoadIds]);

  if (isLoading) return <Spinner label="Loading loads…" />;
  if (error)
    return (
      <EmptyState title="Couldn't load loads" hint="Is the API running on port 8000?" />
    );
  if (!data || data.items.length === 0)
    return <EmptyState title="No loads" hint="Create an order to get started." />;
  if (filtered.length === 0)
    return (
      <EmptyState
        title="No loads match your filters"
        hint="Try a broader search or reset the filters."
      />
    );

  return (
    <div className="space-y-2.5">
      {filtered.map((load) => {
        const canBid = load.direction === "outbound";
        return (
          <LoadCard
            key={load.id}
            load={load}
            onOpen={onOpen}
            onPlaceBid={canBid ? onPlaceBid : undefined}
            selectable={selectable && canBid}
            selected={selectedIds?.has(load.id)}
            onToggleSelect={onToggleSelect}
          />
        );
      })}
    </div>
  );
}
