"""BidEmail ORM model — one row per email actually sent for a bid.

The Bid's own subject/body/broker_email columns still hold the original bid
email (unchanged, for backward compatibility); this table is the full
conversation history, including that original message plus any follow-ups
(acceptance/rejection notices, manual replies) sent afterward.
"""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UuidPkMixin
from app.models.enums import EmailDeliveryStatus

if TYPE_CHECKING:
    from app.models.bid import Bid


class BidEmail(UuidPkMixin, TimestampMixin, Base):
    __tablename__ = "bid_emails"

    # CASCADE: a bid's email history is meaningless without the bid; bids
    # themselves are never deleted in this app, so this never fires in practice.
    bid_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bids.id", ondelete="CASCADE"), index=True
    )

    to_email: Mapped[str] = mapped_column(String(255))
    subject: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[EmailDeliveryStatus] = mapped_column(
        Enum(EmailDeliveryStatus, name="email_delivery_status")
    )

    bid: Mapped["Bid"] = relationship()
