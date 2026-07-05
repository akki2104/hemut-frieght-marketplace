"use client";

import { useState } from "react";

import type { BidDecision } from "@/lib/types";

const OPTIONS: { decision: BidDecision; label: string; className: string }[] = [
  { decision: "accepted", label: "Mark Accepted", className: "text-emerald-700" },
  { decision: "rejected", label: "Mark Rejected", className: "text-red-700" },
  { decision: "cancelled", label: "Cancel", className: "text-zinc-700" },
];

export function BidActionsMenu({
  disabled,
  onSelect,
}: {
  disabled?: boolean;
  onSelect: (decision: BidDecision) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block text-left">
      <button
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
        aria-label="Bid actions"
      >
        ⋮
      </button>

      {open && (
        <>
          {/* Invisible click-catcher to close the menu on outside click. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
            {OPTIONS.map((o) => (
              <button
                key={o.decision}
                onClick={() => {
                  setOpen(false);
                  onSelect(o.decision);
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-50 ${o.className}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
