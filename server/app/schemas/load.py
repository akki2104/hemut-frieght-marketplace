"""Load request/response schemas.

Separate schemas per direction/purpose (CLAUDE.md §7.5): create vs. update vs.
response, never one reused across request and response.
"""

import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import LoadDirection, LoadStatus, StopType
from app.schemas.stop import StopCreate, StopResponse

# Legal U.S. road weight limit — reused across create and update validation.
MAX_WEIGHT_LBS = 80_000


class LoadCreate(BaseModel):
    direction: LoadDirection = LoadDirection.outbound
    order_id: str = Field(min_length=1, max_length=64)

    origin_city: str
    origin_state: str = Field(min_length=2, max_length=2)
    origin_lat: float
    origin_lng: float
    destination_city: str
    destination_state: str = Field(min_length=2, max_length=2)
    destination_lat: float
    destination_lng: float

    shipper_name: str
    distance_miles: int = Field(gt=0)
    weight_lbs: int = Field(gt=0, le=MAX_WEIGHT_LBS)
    equipment_type: str
    posted_rate: Decimal = Field(ge=0)
    pickup_deadhead_miles: int = Field(ge=0)
    source: str

    broker_email: str
    broker_phone: str

    customer_company_name: str
    customer_contact_name: str | None = None
    customer_contact_phone: str | None = None
    driver_name: str | None = None
    driver_phone: str | None = None
    instructions: str | None = None

    stops: list[StopCreate] = Field(min_length=1)

    @field_validator("stops")
    @classmethod
    def stops_have_a_pickup_and_delivery(cls, stops: list[StopCreate]) -> list[StopCreate]:
        types = {s.stop_type for s in stops}
        if StopType.pickup not in types or StopType.delivery not in types:
            raise ValueError("a load needs at least one pickup and one delivery stop")
        return stops


class LoadUpdate(BaseModel):
    """Partial update — every field optional (CLAUDE.md §7.5)."""

    shipper_name: str | None = None
    distance_miles: int | None = Field(default=None, gt=0)
    weight_lbs: int | None = Field(default=None, gt=0, le=MAX_WEIGHT_LBS)
    equipment_type: str | None = None
    posted_rate: Decimal | None = Field(default=None, ge=0)
    pickup_deadhead_miles: int | None = Field(default=None, ge=0)
    source: str | None = None
    broker_email: str | None = None
    broker_phone: str | None = None
    status: LoadStatus | None = None
    customer_company_name: str | None = None
    customer_contact_name: str | None = None
    customer_contact_phone: str | None = None
    driver_name: str | None = None
    driver_phone: str | None = None
    instructions: str | None = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> "LoadUpdate":
        if not self.model_dump(exclude_unset=True):
            raise ValueError("at least one field must be provided")
        return self


class LoadSummary(BaseModel):
    """Row shape for the list view — enough to render a load card."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    direction: LoadDirection
    order_id: str
    origin_city: str
    origin_state: str
    destination_city: str
    destination_state: str
    shipper_name: str
    distance_miles: int
    weight_lbs: int
    equipment_type: str
    posted_rate: Decimal
    pickup_deadhead_miles: int
    source: str
    broker_email: str
    broker_phone: str
    status: LoadStatus
    num_stops: int = Field(description="Derived from the load's stops.")


class LoadDetail(LoadSummary):
    """Full detail — adds customer, driver, coordinates, stops."""

    origin_lat: float
    origin_lng: float
    destination_lat: float
    destination_lng: float
    customer_company_name: str
    customer_contact_name: str | None
    customer_contact_phone: str | None
    driver_name: str | None
    driver_phone: str | None
    instructions: str | None
    stops: list[StopResponse]
