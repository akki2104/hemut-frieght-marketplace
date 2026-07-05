"""FastAPI application: assembly, CORS, routers, and global error handlers.

Domain exceptions raised in services are translated to the consistent error
envelope here (CLAUDE.md §9.6/§16.1) — routers contain no try/except for that.
"""

import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import auth, bids, loads
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.domain.exceptions import DomainError

configure_logging()
logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(
    title="Freight Marketplace API",
    version="0.1.0",
    description="Loads, bids, and per-stop tracking for a freight marketplace.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(loads.router, prefix="/api/v1")
app.include_router(bids.router, prefix="/api/v1")


def _error_response(status_code: int, code: str, message: str, details: dict) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "details": details,
                "correlation_id": str(uuid.uuid4()),
            }
        },
    )


@app.exception_handler(DomainError)
async def handle_domain_error(_request: Request, exc: DomainError) -> JSONResponse:
    return _error_response(exc.http_status, exc.code, exc.message, exc.details)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    # Keep only JSON-safe fields — raw errors() can carry the original exception.
    safe = [
        {"loc": list(e.get("loc", [])), "msg": e.get("msg"), "type": e.get("type")}
        for e in exc.errors()
    ]
    return _error_response(
        422, "VALIDATION_ERROR", "Request validation failed.", {"errors": safe}
    )


@app.exception_handler(Exception)
async def handle_unexpected_error(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error")
    # Never leak internals to the client (CLAUDE.md §9.6/§10).
    return _error_response(500, "INTERNAL_ERROR", "An unexpected error occurred.", {})


@app.get("/health", tags=["meta"], summary="Liveness check")
async def health() -> dict:
    return {"status": "ok", "email_live": bool(settings.resend_api_key)}
