"""Load routes. Thin handlers: parse → one service call → response schema."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import BidServiceDep, LoadServiceDep, get_current_user
from app.models.enums import LoadDirection, LoadStatus
from app.schemas.bid import BidResponse, PlaceBidRequest
from app.schemas.common import Page
from app.schemas.load import (
    LoadCreate,
    LoadDetail,
    LoadSummary,
    LoadUpdate,
    RateSuggestionResponse,
)
from app.schemas.stop import StopArrivalUpdate

# Auth applied once at the router level (CLAUDE.md §7.6) rather than per-route.
router = APIRouter(
    prefix="/loads", tags=["loads"], dependencies=[Depends(get_current_user)]
)

MAX_LIMIT = 100


@router.get("", response_model=Page[LoadSummary], summary="List loads")
async def list_loads(
    service: LoadServiceDep,
    direction: LoadDirection | None = None,
    status_filter: Annotated[LoadStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[LoadSummary]:
    loads, total = await service.list_loads(
        direction=direction, status=status_filter, limit=limit, offset=offset
    )
    return Page(
        items=[LoadSummary.model_validate(l) for l in loads],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{load_id}", response_model=LoadDetail, summary="Get a load's full detail")
async def get_load(load_id: uuid.UUID, service: LoadServiceDep) -> LoadDetail:
    load = await service.get_load(load_id)
    return LoadDetail.model_validate(load)


@router.post(
    "",
    response_model=LoadDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Create a load (Create Order)",
)
async def create_load(payload: LoadCreate, service: LoadServiceDep) -> LoadDetail:
    load = await service.create_load(payload)
    return LoadDetail.model_validate(load)


@router.patch("/{load_id}", response_model=LoadDetail, summary="Edit a load")
async def update_load(
    load_id: uuid.UUID, payload: LoadUpdate, service: LoadServiceDep
) -> LoadDetail:
    load = await service.update_load(load_id, payload)
    return LoadDetail.model_validate(load)


@router.delete(
    "/{load_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a load (409 if it has bids)",
)
async def delete_load(load_id: uuid.UUID, service: LoadServiceDep) -> Response:
    await service.delete_load(load_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch(
    "/{load_id}/stops/{stop_id}",
    response_model=LoadDetail,
    summary="Record a stop's actual arrival (Mark Arrived)",
)
async def mark_stop_arrival(
    load_id: uuid.UUID,
    stop_id: uuid.UUID,
    payload: StopArrivalUpdate,
    service: LoadServiceDep,
) -> LoadDetail:
    load = await service.mark_stop_arrival(
        load_id, stop_id, payload.actual_arrival_time
    )
    return LoadDetail.model_validate(load)


@router.get(
    "/{load_id}/rate-suggestion",
    response_model=RateSuggestionResponse,
    summary="Get an AI-estimated historical rate suggestion for this load",
)
async def get_rate_suggestion(
    load_id: uuid.UUID, service: LoadServiceDep
) -> RateSuggestionResponse:
    suggested_rate = await service.suggest_rate(load_id)
    return RateSuggestionResponse(suggested_rate=suggested_rate)


@router.post(
    "/{load_id}/bids",
    response_model=BidResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Place a bid on a load",
)
async def place_bid(
    load_id: uuid.UUID, payload: PlaceBidRequest, service: BidServiceDep
) -> BidResponse:
    bid = await service.place_bid(load_id, payload)
    return BidResponse.model_validate(bid)
