from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Mapping

import httpx
from cachetools import TTLCache

from app.core.config import get_settings
from app.core.logging import get_logger

_logger = get_logger(__name__)
_cache = TTLCache(maxsize=512, ttl=60 * 60 * 24)
_cache_lock = asyncio.Lock()
_client_lock = asyncio.Lock()
_client: httpx.AsyncClient | None = None


@dataclass(slots=True)
class GeocodeResult:
    latitude: float | None
    longitude: float | None
    confidence: float
    message: str | None = None
    resolved_label: str | None = None


async def geocode_address(
    parsed: Mapping[str, str],
    raw_text: str,
) -> GeocodeResult:
    """Geocode the provided address components using the configured geocoder."""

    if not parsed:
        return GeocodeResult(None, None, 0.0, message="No address components available")

    query = _compose_query(parsed, raw_text)
    _logger.info("Geocoding lookup", query=query)

    async with _cache_lock:
        cached = _cache.get(query)
    if cached:
        _logger.info("Geocoding cache hit", query=query)
        return cached

    try:
        result = await _fetch(query)
    except Exception as exc:  # pragma: no cover - unexpected transport errors
        _logger.warning("Geocoding failed", query=query, error=str(exc))
        return GeocodeResult(None, None, 0.0, message=str(exc))

    async with _cache_lock:
        _cache[query] = result
    _logger.info(
        "Geocoding success",
        query=query,
        latitude=result.latitude,
        longitude=result.longitude,
        confidence=result.confidence,
        message=result.message,
    )
    return result


async def _fetch(query: str) -> GeocodeResult:
    settings = get_settings()
    client = await _get_client()
    url = settings.geocoder_base_url.rstrip("/") + "/search"
    params = {
        "format": "jsonv2",
        "limit": 1,
        "addressdetails": 1,
        "q": query,
    }
    if settings.geocoder_email:
        params["email"] = settings.geocoder_email

    for attempt in range(3):
        response = await client.get(url, params=params)
        if response.status_code == 429:
            retry_after = float(response.headers.get("Retry-After", "1"))
            await asyncio.sleep(retry_after)
            continue
        response.raise_for_status()
        payload = response.json()
        if not payload:
            return GeocodeResult(None, None, 0.0, message="No geocoding candidates")
        candidate = payload[0]
        try:
            lat = float(candidate.get("lat"))
            lon = float(candidate.get("lon"))
        except (TypeError, ValueError):
            return GeocodeResult(None, None, 0.0, message="Invalid geocoder response")

        importance = candidate.get("importance") or 0.0
        try:
            confidence = max(0.0, min(1.0, float(importance)))
        except (TypeError, ValueError):
            confidence = 0.5

    resolved_label = candidate.get("display_name")
    return GeocodeResult(
        lat, lon, confidence, message=None, resolved_label=resolved_label
    )

    raise RuntimeError("Geocoder exhausted retries")


async def _get_client() -> httpx.AsyncClient:
    global _client
    async with _client_lock:
        if _client is None:
            headers = {"User-Agent": "Addris/0.1 (+https://example.com)"}
            _client = httpx.AsyncClient(timeout=15.0, headers=headers)
        return _client


def _compose_query(parsed: Mapping[str, str], raw_text: str) -> str:
    priorities = [
        "house_number",
        "road",
        "unit",
        "level",
        "city",
        "suburb",
        "state",
        "postcode",
        "country",
    ]

    parts = [parsed[key] for key in priorities if key in parsed and parsed[key].strip()]
    if not parts:
        parts = [value for value in parsed.values() if value.strip()]
    query = ", ".join(dict.fromkeys(part.strip() for part in parts if part.strip()))
    return query or raw_text.strip()
