"""Bid business logic: place a bid via email (real send) or call (recorded).

Email flow (CLAUDE.md §7.11): persist the bid and commit first, THEN make the
external HTTP call, then update status — an external call is never held inside
an open transaction.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.exceptions import (
    BidNotFoundError,
    InboundBidNotAllowedError,
    LoadNotFoundError,
)
from app.integrations.email_provider import EmailProvider
from app.models.bid import Bid
from app.models.enums import BidMethod, BidStatus, LoadDirection, LoadStatus
from app.models.load import Load
from app.repositories.bid_repository import BidRepository
from app.repositories.load_repository import LoadRepository
from app.schemas.bid import BidDecision, PlaceBidRequest


class BidService:
    def __init__(
        self,
        session: AsyncSession,
        bid_repo: BidRepository,
        load_repo: LoadRepository,
        email_provider: EmailProvider,
    ) -> None:
        self._session = session
        self._bid_repo = bid_repo
        self._load_repo = load_repo
        self._email = email_provider

    async def list_bids(self, *, method, status, limit, offset):
        return await self._bid_repo.list(
            method=method, status=status, limit=limit, offset=offset
        )

    async def place_bid(self, load_id: uuid.UUID, payload: PlaceBidRequest) -> Bid:
        load = await self._load_repo.get(load_id)
        if load is None:
            raise LoadNotFoundError(f"Load {load_id} was not found.")
        if load.direction is LoadDirection.inbound:
            raise InboundBidNotAllowedError(
                "Bids can only be placed on outbound loads."
            )

        # Assign the relationship (not just load_id) so BidResponse can serialize
        # bid.load without a lazy DB hit after the session commits.
        bid = Bid(
            load=load,
            method=payload.method,
            target_amount=payload.target_amount,
            rate_type=payload.rate_type,
            subject=payload.subject,
            body=payload.body,
            call_mode=payload.call_mode,
            status=BidStatus.draft,
        )
        self._bid_repo.add(bid)
        # Mark the load as bid-placed if it was still open.
        if load.status is LoadStatus.available:
            load.status = LoadStatus.bid_placed

        if payload.method is BidMethod.email:
            await self._place_email_bid(bid, payload, load)
        else:
            # Call: the negotiation agent is deferred — record the intent.
            bid.status = BidStatus.recorded
            await self._session.commit()

        return bid

    async def update_status(self, bid_id: uuid.UUID, decision: BidDecision) -> Bid:
        """Carrier-initiated decision: accept, reject, or cancel a placed bid."""
        bid = await self._bid_repo.get(bid_id)
        if bid is None:
            raise BidNotFoundError(f"Bid {bid_id} was not found.")
        bid.status = BidStatus(decision)
        await self._session.commit()
        return bid

    async def _place_email_bid(
        self, bid: Bid, payload: PlaceBidRequest, load: Load
    ) -> None:
        to_email = payload.broker_email or load.broker_email
        # Persisted on the bid itself, not re-derived from load.broker_email
        # later, so "what email was sent" stays accurate even if the load's
        # contact info is edited afterward.
        bid.broker_email = to_email
        # Commit the bid first so a failed/slow send never rolls back the record.
        await self._session.commit()

        result = await self._email.send(
            to=to_email, subject=payload.subject or "", body=payload.body or ""
        )
        bid.status = BidStatus.sent if result.delivered else BidStatus.recorded
        await self._session.commit()
