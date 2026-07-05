"""Auth business logic: signup and login. All business logic lives here,
never in the router (CLAUDE.md §5.9)."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import create_access_token, hash_password, verify_password
from app.domain.exceptions import EmailAlreadyRegisteredError, InvalidCredentialsError
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.auth import LoginRequest, SignupRequest


class AuthService:
    def __init__(
        self, session: AsyncSession, repo: UserRepository, settings: Settings
    ) -> None:
        self._session = session
        self._repo = repo
        self._settings = settings

    async def signup(self, payload: SignupRequest) -> tuple[User, str]:
        existing = await self._repo.get_by_email(payload.email)
        if existing is not None:
            raise EmailAlreadyRegisteredError(
                f"An account with email {payload.email!r} already exists."
            )
        user = User(email=payload.email, hashed_password=hash_password(payload.password))
        self._repo.add(user)
        await self._session.commit()
        await self._session.refresh(user)
        token = create_access_token(user.id, self._settings)
        return user, token

    async def login(self, payload: LoginRequest) -> tuple[User, str]:
        user = await self._repo.get_by_email(payload.email)
        if user is None or not verify_password(payload.password, user.hashed_password):
            raise InvalidCredentialsError("Incorrect email or password.")
        token = create_access_token(user.id, self._settings)
        return user, token
