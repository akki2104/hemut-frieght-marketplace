"""Data access for the bid email conversation history. Queries only (CLAUDE.md §5.8)."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bid_email import BidEmail


class BidEmailRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_for_bid(self, bid_id: uuid.UUID) -> list[BidEmail]:
        rows = await self._session.scalars(
            select(BidEmail)
            .where(BidEmail.bid_id == bid_id)
            .order_by(BidEmail.created_at, BidEmail.id)
        )
        return list(rows)

    def add(self, email: BidEmail) -> None:
        self._session.add(email)
