"""Domain exceptions.

Services raise these; a single set of handlers in main.py maps them to HTTP
responses (CLAUDE.md §5.1/§16.1). Services never import FastAPI.
"""


class DomainError(Exception):
    """Base for all domain errors. Carries a stable code + safe message."""

    code = "DOMAIN_ERROR"
    http_status = 400

    def __init__(self, message: str, details: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class NotFoundError(DomainError):
    code = "NOT_FOUND"
    http_status = 404


class LoadNotFoundError(NotFoundError):
    code = "LOAD_NOT_FOUND"


class StopNotFoundError(NotFoundError):
    code = "STOP_NOT_FOUND"


class DuplicateOrderIdError(DomainError):
    code = "DUPLICATE_ORDER_ID"
    http_status = 409


class LoadHasBidsError(DomainError):
    code = "LOAD_HAS_BIDS"
    http_status = 409


class InboundBidNotAllowedError(DomainError):
    code = "INBOUND_BID_NOT_ALLOWED"
    http_status = 409
