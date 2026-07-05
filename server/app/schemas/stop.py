"""Stop request/response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import StopType


class StopCreate(BaseModel):
    """A stop as supplied when creating/editing a load."""

    sequence: int = Field(ge=1)
    stop_type: StopType
    city: str
    state: str = Field(min_length=2, max_length=2)
    lat: float
    lng: float
    scheduled_time: datetime | None = None
    instructions: str | None = None


class StopResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sequence: int
    stop_type: StopType
    city: str
    state: str
    lat: float
    lng: float
    scheduled_time: datetime | None
    actual_arrival_time: datetime | None
    instructions: str | None


class StopArrivalUpdate(BaseModel):
    """Record (or clear) a stop's actual arrival — the Mark Arrived action."""

    actual_arrival_time: datetime | None
