"""Shared FastAPI dependency providers (CLAUDE.md §5.7/§7.3).

The composition root: repositories and services are built via Depends, never
constructed ad hoc inside route handlers.
"""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db_session
from app.domain.bids.service import BidService
from app.domain.loads.service import LoadService
from app.integrations.email_provider import EmailProvider
from app.repositories.bid_repository import BidRepository
from app.repositories.load_repository import LoadRepository

SessionDep = Annotated[AsyncSession, Depends(get_db_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_load_repository(session: SessionDep) -> LoadRepository:
    return LoadRepository(session)


def get_bid_repository(session: SessionDep) -> BidRepository:
    return BidRepository(session)


def get_email_provider(settings: SettingsDep) -> EmailProvider:
    return EmailProvider(settings)


def get_load_service(
    session: SessionDep,
    repo: Annotated[LoadRepository, Depends(get_load_repository)],
) -> LoadService:
    return LoadService(session, repo)


def get_bid_service(
    session: SessionDep,
    bid_repo: Annotated[BidRepository, Depends(get_bid_repository)],
    load_repo: Annotated[LoadRepository, Depends(get_load_repository)],
    email_provider: Annotated[EmailProvider, Depends(get_email_provider)],
) -> BidService:
    return BidService(session, bid_repo, load_repo, email_provider)


LoadServiceDep = Annotated[LoadService, Depends(get_load_service)]
BidServiceDep = Annotated[BidService, Depends(get_bid_service)]
