"""Shared FastAPI dependency providers (CLAUDE.md §5.7/§7.3).

The composition root: repositories and services are built via Depends, never
constructed ad hoc inside route handlers.
"""

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db_session
from app.core.security import decode_access_token
from app.domain.auth.service import AuthService
from app.domain.bids.service import BidService
from app.domain.exceptions import NotAuthenticatedError
from app.domain.loads.service import LoadService
from app.integrations.email_provider import EmailProvider
from app.integrations.rate_suggestion_provider import RateSuggestionProvider
from app.models.user import User
from app.repositories.bid_email_repository import BidEmailRepository
from app.repositories.bid_repository import BidRepository
from app.repositories.load_repository import LoadRepository
from app.repositories.user_repository import UserRepository

SessionDep = Annotated[AsyncSession, Depends(get_db_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]

_bearer_scheme = HTTPBearer(auto_error=False)


def get_user_repository(session: SessionDep) -> UserRepository:
    return UserRepository(session)


def get_auth_service(
    session: SessionDep,
    repo: Annotated[UserRepository, Depends(get_user_repository)],
    settings: SettingsDep,
) -> AuthService:
    return AuthService(session, repo, settings)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


async def get_current_user(
    settings: SettingsDep,
    user_repo: Annotated[UserRepository, Depends(get_user_repository)],
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)
    ],
) -> User:
    """The only place a bearer token is decoded (CLAUDE.md §7.6)."""
    if credentials is None:
        raise NotAuthenticatedError("Missing bearer token.")
    user_id = decode_access_token(credentials.credentials, settings)
    if user_id is None:
        raise NotAuthenticatedError("Invalid or expired token.")
    user = await user_repo.get(user_id)
    if user is None:
        raise NotAuthenticatedError("User no longer exists.")
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]


def get_load_repository(session: SessionDep) -> LoadRepository:
    return LoadRepository(session)


def get_bid_repository(session: SessionDep) -> BidRepository:
    return BidRepository(session)


def get_bid_email_repository(session: SessionDep) -> BidEmailRepository:
    return BidEmailRepository(session)


def get_email_provider(settings: SettingsDep) -> EmailProvider:
    return EmailProvider(settings)


def get_rate_suggestion_provider(settings: SettingsDep) -> RateSuggestionProvider:
    return RateSuggestionProvider(settings)


def get_load_service(
    session: SessionDep,
    repo: Annotated[LoadRepository, Depends(get_load_repository)],
    rate_suggestion_provider: Annotated[
        RateSuggestionProvider, Depends(get_rate_suggestion_provider)
    ],
) -> LoadService:
    return LoadService(session, repo, rate_suggestion_provider)


def get_bid_service(
    session: SessionDep,
    bid_repo: Annotated[BidRepository, Depends(get_bid_repository)],
    load_repo: Annotated[LoadRepository, Depends(get_load_repository)],
    bid_email_repo: Annotated[BidEmailRepository, Depends(get_bid_email_repository)],
    email_provider: Annotated[EmailProvider, Depends(get_email_provider)],
) -> BidService:
    return BidService(session, bid_repo, load_repo, bid_email_repo, email_provider)


LoadServiceDep = Annotated[LoadService, Depends(get_load_service)]
BidServiceDep = Annotated[BidService, Depends(get_bid_service)]
