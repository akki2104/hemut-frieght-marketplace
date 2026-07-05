"""Load business logic: CRUD, stop arrival tracking, delete guarding.

The router calls one method per request; all rules live here (CLAUDE.md §5.9).
"""

import uuid
from datetime import datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.exceptions import (
    DuplicateOrderIdError,
    LoadHasBidsError,
    LoadNotFoundError,
    StopNotFoundError,
)
from app.integrations.rate_suggestion_provider import RateSuggestionProvider
from app.models.enums import LoadDirection, LoadStatus
from app.models.load import Load
from app.models.stop import Stop
from app.repositories.load_repository import LoadRepository
from app.schemas.load import LoadCreate, LoadUpdate


class LoadService:
    def __init__(
        self,
        session: AsyncSession,
        repo: LoadRepository,
        rate_suggestion_provider: RateSuggestionProvider,
    ) -> None:
        self._session = session
        self._repo = repo
        self._rate_suggestion = rate_suggestion_provider

    async def list_loads(
        self,
        *,
        direction: LoadDirection | None,
        status: LoadStatus | None,
        limit: int,
        offset: int,
    ) -> tuple[list[Load], int]:
        return await self._repo.list(
            direction=direction, status=status, limit=limit, offset=offset
        )

    async def get_load(self, load_id: uuid.UUID) -> Load:
        load = await self._repo.get(load_id)
        if load is None:
            raise LoadNotFoundError(f"Load {load_id} was not found.")
        return load

    async def create_load(self, payload: LoadCreate) -> Load:
        existing = await self._repo.get_by_order_id(payload.order_id)
        if existing is not None:
            raise DuplicateOrderIdError(
                f"A load with order_id {payload.order_id!r} already exists."
            )

        data = payload.model_dump(exclude={"stops"})
        load = Load(**data)
        load.stops = [Stop(**s.model_dump()) for s in payload.stops]
        self._repo.add(load)
        await self._session.commit()
        await self._session.refresh(load)
        return load

    async def update_load(self, load_id: uuid.UUID, payload: LoadUpdate) -> Load:
        load = await self.get_load(load_id)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(load, field, value)
        await self._session.commit()
        await self._session.refresh(load)
        return load

    async def delete_load(self, load_id: uuid.UUID) -> None:
        load = await self.get_load(load_id)
        # Fast, explicit guard so the common case gives a clean domain error
        # rather than relying solely on the DB integrity error below.
        if load.bids:
            raise LoadHasBidsError(
                "This load has bids and cannot be deleted.",
                details={"bid_count": len(load.bids)},
            )
        await self._repo.delete(load)
        try:
            await self._session.commit()
        except IntegrityError as exc:  # defense in depth: FK RESTRICT
            await self._session.rollback()
            raise LoadHasBidsError(
                "This load has bids and cannot be deleted."
            ) from exc

    async def mark_stop_arrival(
        self,
        load_id: uuid.UUID,
        stop_id: uuid.UUID,
        actual_arrival_time: datetime | None,
    ) -> Load:
        stop = await self._repo.get_stop(load_id, stop_id)
        if stop is None:
            raise StopNotFoundError(
                f"Stop {stop_id} was not found on load {load_id}."
            )
        stop.actual_arrival_time = actual_arrival_time
        self._advance_status_from_stops(await self.get_load(load_id))
        await self._session.commit()
        return await self.get_load(load_id)

    async def suggest_rate(self, load_id: uuid.UUID) -> float | None:
        """AI-estimated historical rate for this load's lane, or None if no
        suggestion is available (no Groq key configured, or the call failed).
        """
        load = await self.get_load(load_id)
        return await self._rate_suggestion.suggest(
            origin_city=load.origin_city,
            origin_state=load.origin_state,
            destination_city=load.destination_city,
            destination_state=load.destination_state,
            distance_miles=load.distance_miles,
            weight_lbs=load.weight_lbs,
            equipment_type=load.equipment_type,
        )

    @staticmethod
    def _advance_status_from_stops(load: Load) -> None:
        """Roll the load status up from its stops' actual arrivals."""
        deliveries = [s for s in load.stops if s.stop_type.value == "delivery"]
        any_actual = any(s.actual_arrival_time for s in load.stops)
        all_delivered = deliveries and all(s.actual_arrival_time for s in deliveries)
        if all_delivered:
            load.status = LoadStatus.delivered
        elif any_actual and load.status in (
            LoadStatus.available,
            LoadStatus.bid_placed,
            LoadStatus.booked,
        ):
            load.status = LoadStatus.in_transit
