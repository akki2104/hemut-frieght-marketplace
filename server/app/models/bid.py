"""Bid ORM model — a carrier's bid on a load via email or call.

One table with nullable method-specific columns (see plan trade-offs, KISS §5.4).
"""

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UuidPkMixin
from app.models.enums import BidMethod, BidStatus, CallMode, RateType

if TYPE_CHECKING:
    from app.models.load import Load


class Bid(UuidPkMixin, TimestampMixin, Base):
    __tablename__ = "bids"

    # RESTRICT: a load with bid history must not be silently deletable.
    load_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("loads.id", ondelete="RESTRICT"), index=True
    )

    method: Mapped[BidMethod] = mapped_column(Enum(BidMethod, name="bid_method"))
    target_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    status: Mapped[BidStatus] = mapped_column(
        Enum(BidStatus, name="bid_status"), default=BidStatus.draft, index=True
    )

    # Email-only. broker_email is the actual recipient used at send time —
    # stored on the bid itself (not read from load.broker_email later) so the
    # record stays accurate even if the load's contact info is edited after.
    rate_type: Mapped[RateType | None] = mapped_column(
        Enum(RateType, name="rate_type"), nullable=True
    )
    broker_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Call-only.
    call_mode: Mapped[CallMode | None] = mapped_column(
        Enum(CallMode, name="call_mode"), nullable=True
    )

    load: Mapped["Load"] = relationship(back_populates="bids")
