"""Bid routes — the My Bids list."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from fastapi import status as http_status

from app.api.deps import BidServiceDep, get_current_user
from app.models.enums import BidMethod, BidStatus
from app.schemas.bid import (
    BidEmailResponse,
    BidResponse,
    SendBidEmailRequest,
    UpdateBidStatusRequest,
)
from app.schemas.common import Page

router = APIRouter(
    prefix="/bids", tags=["bids"], dependencies=[Depends(get_current_user)]
)

MAX_LIMIT = 100


@router.get("", response_model=Page[BidResponse], summary="List placed bids")
async def list_bids(
    service: BidServiceDep,
    method: BidMethod | None = None,
    status_filter: Annotated[BidStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[BidResponse]:
    bids, total = await service.list_bids(
        method=method, status=status_filter, limit=limit, offset=offset
    )
    return Page(
        items=[BidResponse.model_validate(b) for b in bids],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.patch(
    "/{bid_id}/status",
    response_model=BidResponse,
    summary="Mark a bid accepted, rejected, or cancelled",
)
async def update_bid_status(
    bid_id: uuid.UUID, payload: UpdateBidStatusRequest, service: BidServiceDep
) -> BidResponse:
    bid = await service.update_status(bid_id, payload.status)
    return BidResponse.model_validate(bid)


@router.get(
    "/{bid_id}/emails",
    response_model=list[BidEmailResponse],
    summary="List the email conversation history for a bid",
)
async def list_bid_emails(
    bid_id: uuid.UUID, service: BidServiceDep
) -> list[BidEmailResponse]:
    emails = await service.list_emails(bid_id)
    return [BidEmailResponse.model_validate(e) for e in emails]


@router.post(
    "/{bid_id}/emails",
    response_model=BidEmailResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="Send a follow-up email for a bid (acceptance/rejection notice, or a manual reply)",
)
async def send_bid_email(
    bid_id: uuid.UUID, payload: SendBidEmailRequest, service: BidServiceDep
) -> BidEmailResponse:
    email = await service.send_email(bid_id, payload)
    return BidEmailResponse.model_validate(email)
