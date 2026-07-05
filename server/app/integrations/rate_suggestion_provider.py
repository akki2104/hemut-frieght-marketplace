"""AI-generated historical rate suggestion via Groq's chat completions API.

Env-gated like EmailProvider: when GROQ_API_KEY is unset, ``suggest`` returns
None rather than erroring — the bid form works with no key, and suggestions
appear the moment a key is added. This is an LLM estimate, not a real market-
data lookup (no live rate-index integration exists in this build).
"""

import logging
import re

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)

GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"

_SYSTEM_PROMPT = (
    "You are a freight rate analyst. Given a truckload lane's details, respond "
    "with ONLY a single floating point number: your best estimate of a fair "
    "historical market rate in USD for this load. Output the number alone — "
    "no currency symbol, no words, no explanation."
)

# Matches the first number in the reply, tolerating stray text/currency
# symbols the model may add despite the system prompt.
_NUMBER_PATTERN = re.compile(r"[-+]?\d[\d,]*\.?\d*")


class RateSuggestionProvider:
    def __init__(self, settings: Settings) -> None:
        self._api_key = settings.groq_api_key
        self._model = settings.groq_model

    @property
    def is_live(self) -> bool:
        return bool(self._api_key)

    async def suggest(
        self,
        *,
        origin_city: str,
        origin_state: str,
        destination_city: str,
        destination_state: str,
        distance_miles: int,
        weight_lbs: int,
        equipment_type: str,
    ) -> float | None:
        if not self.is_live:
            logger.info("GROQ_API_KEY unset — skipping rate suggestion")
            return None

        user_prompt = (
            f"Lane: {origin_city}, {origin_state} -> {destination_city}, {destination_state}\n"
            f"Distance: {distance_miles} miles\n"
            f"Weight: {weight_lbs} lbs\n"
            f"Equipment: {equipment_type}"
        )
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 20,
        }
        headers = {"Authorization": f"Bearer {self._api_key}"}
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(GROQ_ENDPOINT, json=payload, headers=headers)
            if resp.status_code >= 400:
                logger.warning("Groq request failed (%s): %s", resp.status_code, resp.text)
                return None
            text = resp.json()["choices"][0]["message"]["content"]
            return self._parse_float(text)
        except (httpx.HTTPError, KeyError, IndexError) as exc:
            logger.warning("Groq rate suggestion error: %s", exc)
            return None

    @staticmethod
    def _parse_float(text: str) -> float | None:
        match = _NUMBER_PATTERN.search(text)
        if match is None:
            logger.warning("Could not parse a number from Groq response: %r", text)
            return None
        return float(match.group().replace(",", ""))
