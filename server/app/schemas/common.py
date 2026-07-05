"""Shared schema building blocks (pagination, error envelope)."""

from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    """A paginated list response (offset-based; fine at this data scale)."""

    items: list[T]
    total: int = Field(description="Total rows matching the filter, ignoring paging.")
    limit: int
    offset: int


class ErrorBody(BaseModel):
    code: str = Field(description="Stable machine-readable error code.")
    message: str = Field(description="Human-readable, safe-to-display message.")
    details: dict = Field(default_factory=dict)
    correlation_id: str | None = None


class ErrorResponse(BaseModel):
    """The consistent error envelope returned by every endpoint (CLAUDE.md §9.6)."""

    error: ErrorBody
