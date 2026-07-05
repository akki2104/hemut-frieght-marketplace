"""Application settings, loaded from environment variables.

Single source of configuration truth (CLAUDE.md §7.8): typed, validated at import,
instantiated once via ``get_settings()``. Never read ``os.environ`` elsewhere.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # SQLite for local/dev; the async driver is aiosqlite. Swappable to Postgres
    # (asyncpg) later by changing only this URL.
    database_url: str = "sqlite+aiosqlite:///./freight.db"

    # Real email sending. When unset, bids are still recorded — the send just
    # falls back to a logged no-op (see integrations/email_provider.py).
    resend_api_key: str | None = None
    resend_from_email: str = "onboarding@resend.dev"

    # CORS origin for the Next.js frontend.
    frontend_origin: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    return Settings()
