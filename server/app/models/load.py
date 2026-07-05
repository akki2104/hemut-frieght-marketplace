"""Load ORM model — a freight load posted on the marketplace."""

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Enum, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UuidPkMixin
from app.models.enums import LoadDirection, LoadStatus

if TYPE_CHECKING:
    from app.models.bid import Bid
    from app.models.stop import Stop


class Load(UuidPkMixin, TimestampMixin, Base):
    __tablename__ = "loads"

    direction: Mapped[LoadDirection] = mapped_column(
        Enum(LoadDirection, name="load_direction"), index=True
    )
    order_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    # Lane / route. lat/lng are stored so the map renders without a runtime geocode.
    origin_city: Mapped[str] = mapped_column(String(128))
    origin_state: Mapped[str] = mapped_column(String(2))
    origin_lat: Mapped[float] = mapped_column()
    origin_lng: Mapped[float] = mapped_column()
    destination_city: Mapped[str] = mapped_column(String(128))
    destination_state: Mapped[str] = mapped_column(String(2))
    destination_lat: Mapped[float] = mapped_column()
    destination_lng: Mapped[float] = mapped_column()

    # Shipment details.
    shipper_name: Mapped[str] = mapped_column(String(255))
    distance_miles: Mapped[int] = mapped_column()
    weight_lbs: Mapped[int] = mapped_column()
    equipment_type: Mapped[str] = mapped_column(String(64))
    posted_rate: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    pickup_deadhead_miles: Mapped[int] = mapped_column()
    source: Mapped[str] = mapped_column(String(64))

    # Broker contact — arrives with the load, pre-fills the bid form.
    broker_email: Mapped[str] = mapped_column(String(255))
    broker_phone: Mapped[str] = mapped_column(String(32))

    status: Mapped[LoadStatus] = mapped_column(
        Enum(LoadStatus, name="load_status"),
        default=LoadStatus.available,
        index=True,
    )

    # Customer (embedded — no cross-load reuse described; see plan trade-offs).
    customer_company_name: Mapped[str] = mapped_column(String(255))
    customer_contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Assigned driver (nullable until dispatched).
    driver_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    driver_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)

    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)

    stops: Mapped[list["Stop"]] = relationship(
        back_populates="load",
        cascade="all, delete-orphan",
        order_by="Stop.sequence",
        lazy="selectin",
    )
    bids: Mapped[list["Bid"]] = relationship(
        back_populates="load", lazy="selectin"
    )
