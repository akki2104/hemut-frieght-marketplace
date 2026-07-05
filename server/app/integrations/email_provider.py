"""Email sending via Resend.

Env-gated: when ``RESEND_API_KEY`` is unset the send is a logged no-op and the
caller records the bid as ``recorded`` rather than ``sent`` — the app works with
no credentials and goes live the moment a key is added.
"""

import logging
from dataclasses import dataclass

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"


@dataclass
class EmailResult:
    delivered: bool
    provider_id: str | None = None
    error: str | None = None


class EmailProvider:
    def __init__(self, settings: Settings) -> None:
        self._api_key = settings.resend_api_key
        self._from_email = settings.resend_from_email

    @property
    def is_live(self) -> bool:
        return bool(self._api_key)

    async def send(self, *, to: str, subject: str, body: str) -> EmailResult:
        if not self.is_live:
            logger.info("RESEND_API_KEY unset — recording email bid without sending (to=%s)", to)
            return EmailResult(delivered=False)

        payload = {
            "from": self._from_email,
            "to": [to],
            "subject": subject,
            # Body is plain text from the bid form; send as text to avoid HTML injection.
            "text": body,
        }
        headers = {"Authorization": f"Bearer {self._api_key}"}
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(RESEND_ENDPOINT, json=payload, headers=headers)
            if resp.status_code >= 400:
                logger.warning("Resend send failed (%s): %s", resp.status_code, resp.text)
                return EmailResult(delivered=False, error=f"resend {resp.status_code}")
            provider_id = resp.json().get("id")
            logger.info("Resend email sent to %s (id=%s)", to, provider_id)
            return EmailResult(delivered=True, provider_id=provider_id)
        except httpx.HTTPError as exc:
            logger.warning("Resend request error: %s", exc)
            return EmailResult(delivered=False, error=str(exc))
