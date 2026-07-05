"""Stop ORM model — a pickup or delivery point on a load's route."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UuidPkMixin
from app.models.enums import StopType

if TYPE_CHECKING:
    from app.models.load import Load


class Stop(UuidPkMixin, TimestampMixin, Base):
    __tablename__ = "stops"

    # CASCADE: a stop is meaningless without its parent load.
    load_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("loads.id", ondelete="CASCADE"), index=True
    )

    sequence: Mapped[int] = mapped_column()
    stop_type: Mapped[StopType] = mapped_column(Enum(StopType, name="stop_type"))
    city: Mapped[str] = mapped_column(String(128))
    state: Mapped[str] = mapped_column(String(2))
    lat: Mapped[float] = mapped_column()
    lng: Mapped[float] = mapped_column()

    scheduled_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # The actual "tracking" mechanism — set by the Mark Arrived action.
    actual_arrival_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)

    load: Mapped["Load"] = relationship(back_populates="stops")
