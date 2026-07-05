"""Data access for loads. Queries only — no business logic (CLAUDE.md §5.8)."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import LoadDirection, LoadStatus
from app.models.load import Load
from app.models.stop import Stop


class LoadRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(
        self,
        *,
        direction: LoadDirection | None,
        status: LoadStatus | None,
        limit: int,
        offset: int,
    ) -> tuple[list[Load], int]:
        conditions = []
        if direction is not None:
            conditions.append(Load.direction == direction)
        if status is not None:
            conditions.append(Load.status == status)

        base = select(Load)
        for cond in conditions:
            base = base.where(cond)

        total = await self._session.scalar(
            select(func.count()).select_from(base.subquery())
        )
        rows = await self._session.scalars(
            base.order_by(Load.created_at.desc(), Load.id).limit(limit).offset(offset)
        )
        return list(rows), int(total or 0)

    async def get(self, load_id: uuid.UUID) -> Load | None:
        return await self._session.get(Load, load_id)

    async def get_by_order_id(self, order_id: str) -> Load | None:
        return await self._session.scalar(
            select(Load).where(Load.order_id == order_id)
        )

    async def get_stop(self, load_id: uuid.UUID, stop_id: uuid.UUID) -> Stop | None:
        return await self._session.scalar(
            select(Stop).where(Stop.id == stop_id, Stop.load_id == load_id)
        )

    def add(self, load: Load) -> None:
        self._session.add(load)

    async def delete(self, load: Load) -> None:
        await self._session.delete(load)
