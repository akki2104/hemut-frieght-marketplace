// Hardcoded acceptance/rejection notice templates, fired automatically when
// a bid is marked Accepted/Rejected from the My Bids kebab menu. Deliberately
// not user-editable (unlike the compose box for manual follow-ups) — these
// are the carrier's standard notices.

import type { Bid } from "@/lib/types";

function laneText(bid: Bid): string {
  if (!bid.load) return "your load";
  return `${bid.load.origin_city}, ${bid.load.origin_state} → ${bid.load.destination_city}, ${bid.load.destination_state} (${bid.load.order_id})`;
}

export function acceptanceEmail(bid: Bid): { subject: string; body: string } {
  return {
    subject: `Bid Accepted — ${bid.load?.order_id ?? bid.id.slice(0, 8)}`,
    body:
      `Hi,\n\n` +
      `We're confirming acceptance of the bid for ${laneText(bid)} at ` +
      `$${Number(bid.target_amount).toLocaleString()}. Please send over the ` +
      `rate confirmation and we'll get this scheduled.\n\n` +
      `Thanks,\nDispatch`,
  };
}

export function rejectionEmail(bid: Bid): { subject: string; body: string } {
  return {
    subject: `Bid Declined — ${bid.load?.order_id ?? bid.id.slice(0, 8)}`,
    body:
      `Hi,\n\n` +
      `Thank you for the opportunity on ${laneText(bid)}. We're not able to ` +
      `move forward with this bid at this time, but please keep us in mind ` +
      `for future loads on this lane.\n\n` +
      `Thanks,\nDispatch`,
  };
}
