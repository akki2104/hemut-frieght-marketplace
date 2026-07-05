"""Bid business logic: place a bid via email (real send) or call (recorded),
plus the email conversation history (original bid email, acceptance/rejection
notices, manual follow-ups).

Email flow (CLAUDE.md §7.11): persist first and commit, THEN make the
external HTTP call, then update status — an external call is never held
inside an open transaction.
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
from app.models.bid_email import BidEmail
from app.models.enums import (
    BidMethod,
    BidStatus,
    EmailDeliveryStatus,
    LoadDirection,
    LoadStatus,
)
from app.models.load import Load
from app.repositories.bid_email_repository import BidEmailRepository
from app.repositories.bid_repository import BidRepository
from app.repositories.load_repository import LoadRepository
from app.schemas.bid import BidDecision, PlaceBidRequest, SendBidEmailRequest


class BidService:
    def __init__(
        self,
        session: AsyncSession,
        bid_repo: BidRepository,
        load_repo: LoadRepository,
        bid_email_repo: BidEmailRepository,
        email_provider: EmailProvider,
    ) -> None:
        self._session = session
        self._bid_repo = bid_repo
        self._load_repo = load_repo
        self._bid_email_repo = bid_email_repo
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
        """Carrier-initiated decision: accept, reject, or cancel a placed bid.

        Sending a notice email for the decision is the caller's job (the
        frontend fires a separate `send_email` call with its own hardcoded
        template) — this method only changes the bid's status.
        """
        bid = await self._bid_repo.get(bid_id)
        if bid is None:
            raise BidNotFoundError(f"Bid {bid_id} was not found.")
        bid.status = BidStatus(decision)
        await self._session.commit()
        return bid

    async def list_emails(self, bid_id: uuid.UUID) -> list[BidEmail]:
        bid = await self._bid_repo.get(bid_id)
        if bid is None:
            raise BidNotFoundError(f"Bid {bid_id} was not found.")
        return await self._bid_email_repo.list_for_bid(bid_id)

    async def send_email(
        self, bid_id: uuid.UUID, payload: SendBidEmailRequest
    ) -> BidEmail:
        """Send (and record) a follow-up email in the bid's conversation —
        used for acceptance/rejection notices and manual replies from the
        My Bids compose box."""
        bid = await self._bid_repo.get(bid_id)
        if bid is None:
            raise BidNotFoundError(f"Bid {bid_id} was not found.")
        # Prefer whichever address the original bid conversation used (it may
        # have overridden the load's default broker_email) over silently
        # switching back to the load's default.
        to_email = payload.to_email or bid.broker_email or bid.load.broker_email
        return await self._send_and_record_email(
            bid_id=bid.id, to_email=to_email, subject=payload.subject, body=payload.body
        )

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

        email = await self._send_and_record_email(
            bid_id=bid.id,
            to_email=to_email,
            subject=payload.subject or "",
            body=payload.body or "",
        )
        bid.status = (
            BidStatus.sent if email.status is EmailDeliveryStatus.sent else BidStatus.recorded
        )
        await self._session.commit()

    async def _send_and_record_email(
        self, *, bid_id: uuid.UUID, to_email: str, subject: str, body: str
    ) -> BidEmail:
        result = await self._email.send(to=to_email, subject=subject, body=body)
        status = EmailDeliveryStatus.sent if result.delivered else EmailDeliveryStatus.recorded
        email = BidEmail(
            bid_id=bid_id, to_email=to_email, subject=subject, body=body, status=status
        )
        self._bid_email_repo.add(email)
        await self._session.commit()
        await self._session.refresh(email)
        return email
