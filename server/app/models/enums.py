"""Domain enums shared by models and schemas.

Mirrored in the frontend's TypeScript types (features/loads/types.ts,
features/bids/types.ts) — keep the two in sync (CLAUDE.md §2.1).
"""

import enum


class LoadDirection(str, enum.Enum):
    outbound = "outbound"
    inbound = "inbound"


class LoadStatus(str, enum.Enum):
    available = "available"
    bid_placed = "bid_placed"
    booked = "booked"
    in_transit = "in_transit"
    delivered = "delivered"


class StopType(str, enum.Enum):
    pickup = "pickup"
    delivery = "delivery"


class BidMethod(str, enum.Enum):
    email = "email"
    call = "call"


class BidStatus(str, enum.Enum):
    draft = "draft"
    sent = "sent"          # email actually delivered via Resend
    recorded = "recorded"  # persisted but the external action didn't fire (no key / call agent deferred)
    accepted = "accepted"
    rejected = "rejected"
    failed = "failed"


class RateType(str, enum.Enum):
    all_in = "all_in"
    per_mile = "per_mile"


class CallMode(str, enum.Enum):
    auto_agent = "auto_agent"
    manual = "manual"
