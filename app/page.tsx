"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";

import { Button, Drawer } from "@/components/ui";
import { BidsView } from "@/features/bids/BidsView";
import { BulkBidModal } from "@/features/bids/BulkBidModal";
import { PlaceBidModal } from "@/features/bids/PlaceBidModal";
import { LoadDetailDrawer } from "@/features/loads/LoadDetailDrawer";
import { LoadFormModal } from "@/features/loads/LoadFormModal";
import { LoadsView } from "@/features/loads/LoadsView";
import { swrFetcher } from "@/lib/api";
import type { LoadDetail, LoadSummary, Page } from "@/lib/types";

type Tab = "inbound" | "outbound" | "bids";

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("outbound");
  const [search, setSearch] = useState("");

  // Drawer + modal state.
  const [openLoadId, setOpenLoadId] = useState<string | null>(null);
  const [bidTarget, setBidTarget] = useState<LoadSummary | LoadDetail | null>(null);
  const [selected, setSelected] = useState<Map<string, LoadSummary>>(new Map());
  const [showBulk, setShowBulk] = useState(false);
  const [formMode, setFormMode] = useState<
    null | { mode: "create" } | { mode: "edit"; load: LoadDetail }
  >(null);

  // Tab count badges.
  const { data: outboundPage } = useSWR<Page<LoadSummary>>("/loads?direction=outbound&limit=100", swrFetcher);
  const { data: inboundPage } = useSWR<Page<LoadSummary>>("/loads?direction=inbound&limit=100", swrFetcher);
  const { data: bidsPage } = useSWR<Page<unknown>>("/bids?limit=100", swrFetcher);

  const toggleSelect = useCallback((load: LoadSummary) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(load.id)) next.delete(load.id);
      else next.set(load.id, load);
      return next;
    });
  }, []);

  const clearSelection = () => setSelected(new Map());

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-zinc-400">Load Sourcing / Freight Marketplace</p>
          <h1 className="text-2xl font-bold text-zinc-900">Freight Marketplace</h1>
        </div>
        <Button variant="primary" onClick={() => setFormMode({ mode: "create" })}>
          + Create Order
        </Button>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-zinc-200">
        <TabButton active={tab === "inbound"} onClick={() => setTab("inbound")} label="Inbound Loads" count={inboundPage?.total} />
        <TabButton active={tab === "outbound"} onClick={() => setTab("outbound")} label="Outbound Loads" count={outboundPage?.total} />
        <TabButton active={tab === "bids"} onClick={() => setTab("bids")} label="My Bids" count={bidsPage?.total} />
      </div>

      {/* Search (loads tabs only) */}
      {tab !== "bids" && (
        <div className="mb-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search loads by shipper, order ID, city…"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </div>
      )}

      {/* Content */}
      {tab === "outbound" && (
        <LoadsView
          direction="outbound"
          search={search}
          onOpen={(l) => setOpenLoadId(l.id)}
          onPlaceBid={(l) => setBidTarget(l)}
          selectable
          selectedIds={new Set(selected.keys())}
          onToggleSelect={toggleSelect}
        />
      )}
      {tab === "inbound" && (
        <LoadsView direction="inbound" search={search} onOpen={(l) => setOpenLoadId(l.id)} />
      )}
      {tab === "bids" && <BidsView />}

      {/* Bulk-select action bar */}
      {tab === "outbound" && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-full border border-zinc-200 bg-white px-5 py-3 shadow-xl">
          <span className="text-sm font-medium text-zinc-800">
            {selected.size} load{selected.size === 1 ? "" : "s"} selected
          </span>
          <button onClick={clearSelection} className="text-sm text-zinc-500 hover:text-zinc-800">
            Clear
          </button>
          <Button variant="primary" onClick={() => setShowBulk(true)}>
            + Generate Bids
          </Button>
        </div>
      )}

      {/* Load detail drawer */}
      <Drawer open={openLoadId !== null} onClose={() => setOpenLoadId(null)}>
        {openLoadId && (
          <LoadDetailDrawer
            loadId={openLoadId}
            onClose={() => setOpenLoadId(null)}
            onPlaceBid={(l) => setBidTarget(l)}
            onEdit={(l) => {
              setOpenLoadId(null);
              setFormMode({ mode: "edit", load: l });
            }}
            onDeleted={() => setOpenLoadId(null)}
          />
        )}
      </Drawer>

      {/* Single place-bid modal */}
      {bidTarget && (
        <PlaceBidModal
          load={bidTarget}
          onClose={() => setBidTarget(null)}
          onPlaced={() => setBidTarget(null)}
        />
      )}

      {/* Bulk-bid modal */}
      {showBulk && (
        <BulkBidModal
          loads={Array.from(selected.values())}
          onClose={() => setShowBulk(false)}
          onDone={() => {
            setShowBulk(false);
            clearSelection();
          }}
        />
      )}

      {/* Create / Edit form */}
      {formMode && (
        <LoadFormModal
          mode={formMode.mode}
          load={formMode.mode === "edit" ? formMode.load : undefined}
          onClose={() => setFormMode(null)}
          onSaved={() => setFormMode(null)}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "border-zinc-900 text-zinc-900"
          : "border-transparent text-zinc-500 hover:text-zinc-800"
      }`}
    >
      {label}
      {count !== undefined && (
        <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">
          {count}
        </span>
      )}
    </button>
  );
}
