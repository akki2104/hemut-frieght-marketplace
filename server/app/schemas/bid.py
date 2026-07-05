"""Bid request/response schemas.

The place-bid request is one schema with method-specific fields validated by a
model_validator (payload-only checks belong in Pydantic, CLAUDE.md §7.4).
"""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import BidMethod, BidStatus, CallMode, LoadDirection, LoadStatus, RateType


class PlaceBidRequest(BaseModel):
    method: BidMethod
    target_amount: Decimal = Field(gt=0)

    # Email-only.
    rate_type: RateType | None = None
    broker_email: str | None = Field(
        default=None, description="Overrides the load's broker_email if provided."
    )
    subject: str | None = None
    body: str | None = None

    # Call-only.
    call_mode: CallMode | None = None

    @model_validator(mode="after")
    def method_fields_match(self) -> "PlaceBidRequest":
        if self.method is BidMethod.email:
            if self.rate_type is None:
                raise ValueError("email bids require rate_type (all_in or per_mile)")
            if not self.subject or not self.body:
                raise ValueError("email bids require subject and body")
        elif self.method is BidMethod.call:
            if self.call_mode is None:
                raise ValueError("call bids require call_mode (auto_agent or manual)")
        return self


class BidLoadRef(BaseModel):
    """Minimal load context shown alongside a bid in the My Bids list."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: str
    direction: LoadDirection
    status: LoadStatus
    origin_city: str
    origin_state: str
    destination_city: str
    destination_state: str
    shipper_name: str


class BidResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    load_id: uuid.UUID
    method: BidMethod
    target_amount: Decimal
    status: BidStatus
    rate_type: RateType | None
    subject: str | None
    body: str | None
    call_mode: CallMode | None
    created_at: datetime = Field(description="Timestamp the bid was placed.")
    load: BidLoadRef | None = None
