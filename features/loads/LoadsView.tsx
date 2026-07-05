"use client";

import { useMemo } from "react";
import useSWR from "swr";

import { EmptyState, Spinner } from "@/components/ui";
import { swrFetcher } from "@/lib/api";
import type { LoadDirection, LoadSummary, Page } from "@/lib/types";
import { LoadCard } from "./LoadCard";

export function LoadsView({
  direction,
  search = "",
  onOpen,
  onPlaceBid,
  selectable,
  selectedIds,
  onToggleSelect,
}: {
  direction: LoadDirection;
  search?: string;
  onOpen: (load: LoadSummary) => void;
  // Only provided for outbound loads (inbound is read-only tracking).
  onPlaceBid?: (load: LoadSummary) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (load: LoadSummary) => void;
}) {
  const { data, error, isLoading } = useSWR<Page<LoadSummary>>(
    `/loads?direction=${direction}&limit=100`,
    swrFetcher
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.items;
    return data.items.filter((l) =>
      [
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
        .includes(q)
    );
  }, [data, search]);

  if (isLoading) return <Spinner label="Loading loads…" />;
  if (error)
    return (
      <EmptyState title="Couldn't load loads" hint="Is the API running on port 8000?" />
    );
  if (!data || data.items.length === 0)
    return (
      <EmptyState
        title={`No ${direction} loads`}
        hint={
          direction === "outbound"
            ? "Create an order to get started."
            : "Inbound loads will appear here once assigned."
        }
      />
    );
  if (filtered.length === 0)
    return <EmptyState title="No loads match your search" hint="Try a different term." />;

  return (
    <div className="space-y-2.5">
      {filtered.map((load) => (
        <LoadCard
          key={load.id}
          load={load}
          onOpen={onOpen}
          onPlaceBid={onPlaceBid}
          selectable={selectable}
          selected={selectedIds?.has(load.id)}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}
