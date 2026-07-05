"""Bid routes — the My Bids list."""

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import BidServiceDep
from app.models.enums import BidMethod, BidStatus
from app.schemas.bid import BidResponse
from app.schemas.common import Page

router = APIRouter(prefix="/bids", tags=["bids"])

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
