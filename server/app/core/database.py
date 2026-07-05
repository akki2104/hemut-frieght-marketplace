"""Async SQLAlchemy engine, session factory, and the FastAPI session dependency.

One ``AsyncSession`` per request (CLAUDE.md §7.10), guaranteed closed and rolled
back on error by the ``get_db_session`` generator.
"""

from collections.abc import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

_settings = get_settings()

engine = create_async_engine(_settings.database_url, echo=False, future=True)


# SQLite disables foreign-key enforcement by default, so ON DELETE RESTRICT
# would be silently ignored (a load with bids could be deleted). Turn it on for
# every connection. No-op on other backends where FKs are already enforced.
if _settings.database_url.startswith("sqlite"):

    @event.listens_for(engine.sync_engine, "connect")
    def _enable_sqlite_fk(dbapi_conn, _record):  # noqa: ANN001
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

AsyncSessionLocal = async_sessionmaker(
    engine, expire_on_commit=False, autoflush=False
)


async def get_db_session() -> AsyncIterator[AsyncSession]:
    """Yield a request-scoped session; roll back on exception, always close."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
