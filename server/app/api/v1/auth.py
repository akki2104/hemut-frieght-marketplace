"""Auth routes: signup and login. Public — no auth dependency on this router."""

from fastapi import APIRouter, status

from app.api.deps import AuthServiceDep, CurrentUserDep
from app.schemas.auth import LoginRequest, SignupRequest, TokenResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/signup",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account and receive an access token",
)
async def signup(payload: SignupRequest, service: AuthServiceDep) -> TokenResponse:
    _user, token = await service.signup(payload)
    return TokenResponse(access_token=token)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Log in and receive an access token",
)
async def login(payload: LoginRequest, service: AuthServiceDep) -> TokenResponse:
    _user, token = await service.login(payload)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse, summary="Get the current user")
async def me(current_user: CurrentUserDep) -> UserResponse:
    return UserResponse.model_validate(current_user)
