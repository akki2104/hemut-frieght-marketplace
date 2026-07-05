"""Data access for bids. Queries only — no business logic (CLAUDE.md §5.8)."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.bid import Bid
from app.models.enums import BidMethod, BidStatus


class BidRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, bid_id: uuid.UUID) -> Bid | None:
        return await self._session.scalar(
            select(Bid).where(Bid.id == bid_id).options(selectinload(Bid.load))
        )

    async def list(
        self,
        *,
        method: BidMethod | None,
        status: BidStatus | None,
        limit: int,
        offset: int,
    ) -> tuple[list[Bid], int]:
        conditions = []
        if method is not None:
            conditions.append(Bid.method == method)
        if status is not None:
            conditions.append(Bid.status == status)

        base = select(Bid)
        for cond in conditions:
            base = base.where(cond)

        total = await self._session.scalar(
            select(func.count()).select_from(base.subquery())
        )
        rows = await self._session.scalars(
            base.options(selectinload(Bid.load))
            .order_by(Bid.created_at.desc(), Bid.id)
            .limit(limit)
            .offset(offset)
        )
        return list(rows), int(total or 0)

    def add(self, bid: Bid) -> None:
        self._session.add(bid)
