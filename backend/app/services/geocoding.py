from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from typing import Mapping, TYPE_CHECKING, cast

from cachetools import TTLCache
from geopy.exc import (
    GeocoderQuotaExceeded,
    GeocoderServiceError,
    GeocoderTimedOut,
    GeocoderUnavailable,
    GeopyError,
)
from geopy.geocoders import get_geocoder_for_service
from geopy.geocoders.base import Geocoder

from app.core.config import get_settings
from app.core.logging import get_logger

if TYPE_CHECKING:  # pragma: no cover - typing helpers only
    from app.core.config import Settings
    from geopy.location import Location

_logger = get_logger(__name__)
_cache = TTLCache(maxsize=512, ttl=60 * 60 * 24)
_cache_lock = asyncio.Lock()
_geocoder_lock = asyncio.Lock()
_geocode_call_lock = asyncio.Lock()
_geocoder: Geocoder | None = None


class GeocodeConfigurationError(RuntimeError):
    """Raised when the geocoder cannot be configured with provided settings."""


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

    queries = _compose_queries(parsed, raw_text)
    last_result: GeocodeResult | None = None

    for query in queries:
        if not query:
            continue

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
            last_result = GeocodeResult(None, None, 0.0, message=str(exc))
            continue

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

        if result.latitude is not None and result.longitude is not None:
            return result

        last_result = result

    return last_result or GeocodeResult(
        None, None, 0.0, message="No geocoding candidates"
    )


async def _fetch(query: str) -> GeocodeResult:
    settings = get_settings()
    try:
        location = await _geocode(query)
    except GeocodeConfigurationError as exc:
        _logger.error("Geocoding misconfiguration", error=str(exc))
        return GeocodeResult(None, None, 0.0, message=str(exc))
    except (GeocoderQuotaExceeded, GeocoderTimedOut) as exc:
        retry_message = (
            "Geocoding quota exceeded"
            if isinstance(exc, GeocoderQuotaExceeded)
            else "Geocoding timed out"
        )
        return GeocodeResult(None, None, 0.0, message=retry_message)
    except (GeocoderServiceError, GeocoderUnavailable, GeopyError) as exc:
        return GeocodeResult(None, None, 0.0, message=str(exc))

    if location is None:
        return GeocodeResult(None, None, 0.0, message="No geocoding candidates")

    latitude = getattr(location, "latitude", None)
    longitude = getattr(location, "longitude", None)
    if latitude is None or longitude is None:
        return GeocodeResult(None, None, 0.0, message="Invalid geocoder response")

    resolved_label = getattr(location, "address", None)
    raw_obj = getattr(location, "raw", {}) or {}
    if isinstance(raw_obj, Mapping):
        raw: Mapping[str, object] = cast(Mapping[str, object], raw_obj)
    else:
        raw = {}

    if not resolved_label:
        display_name = raw.get("display_name")
        if isinstance(display_name, str):
            resolved_label = display_name

    confidence = _extract_confidence(settings.geocoder_provider, raw)

    return GeocodeResult(
        float(latitude),
        float(longitude),
        confidence,
        message=None,
        resolved_label=resolved_label,
    )


async def _geocode(query: str) -> "Location | None":
    geocoder = await _get_geocoder()
    settings = get_settings()
    kwargs: dict[str, object] = {"exactly_one": True}
    if settings.geocoder_provider == "nominatim":
        kwargs["addressdetails"] = True

    async with _geocode_call_lock:
        return await asyncio.to_thread(geocoder.geocode, query, **kwargs)


async def _get_geocoder() -> Geocoder:
    global _geocoder
    async with _geocoder_lock:
        if _geocoder is None:
            settings = get_settings()
            _geocoder = _create_geocoder(settings)
        return _geocoder


def _create_geocoder(settings: "Settings") -> Geocoder:
    provider = settings.geocoder_provider
    timeout = settings.geocoder_timeout
    user_agent = settings.geocoder_user_agent or "addris-geocoder"

    if provider == "google":
        api_key = _require_api_key(provider, settings.geocoder_api_key)
        geocoder_cls = get_geocoder_for_service("googlev3")
        kwargs = {"api_key": api_key, "timeout": timeout, "user_agent": user_agent}
        if settings.geocoder_domain:
            kwargs["domain"] = settings.geocoder_domain
        return geocoder_cls(**kwargs)

    if provider == "nominatim":
        geocoder_cls = get_geocoder_for_service("nominatim")
        kwargs = {"user_agent": user_agent, "timeout": timeout}
        if settings.geocoder_domain:
            kwargs["domain"] = settings.geocoder_domain
        if settings.geocoder_api_key:
            kwargs["api_key"] = settings.geocoder_api_key
        return geocoder_cls(**kwargs)

    if provider == "bing":
        api_key = _require_api_key(provider, settings.geocoder_api_key)
        geocoder_cls = get_geocoder_for_service("bing")
        return geocoder_cls(api_key=api_key, timeout=timeout, user_agent=user_agent)

    if provider == "azure":
        api_key = _require_api_key(provider, settings.geocoder_api_key)
        geocoder_cls = get_geocoder_for_service("azuremaps")
        return geocoder_cls(
            subscription_key=api_key, timeout=timeout, user_agent=user_agent
        )

    if provider == "mapbox":
        api_key = _require_api_key(provider, settings.geocoder_api_key)
        geocoder_cls = get_geocoder_for_service("mapbox")
        return geocoder_cls(
            access_token=api_key, timeout=timeout, user_agent=user_agent
        )

    raise GeocodeConfigurationError(f"Unsupported geocoder provider '{provider}'")


def _require_api_key(provider: str, value: str | None) -> str:
    if value and value.strip():
        return value.strip()
    raise GeocodeConfigurationError(
        f"Geocoder provider '{provider}' requires ADDRIS_GEOCODER_API_KEY to be set"
    )


def _extract_confidence(provider: str, raw: Mapping[str, object]) -> float:
    try:
        if provider == "nominatim":
            importance = raw.get("importance")
            if importance is not None:
                return _clamp_confidence(float(importance))

        if provider == "google":
            geometry = raw.get("geometry")
            if isinstance(geometry, Mapping):
                location_type = geometry.get("location_type")
                if isinstance(location_type, str):
                    mapping = {
                        "ROOFTOP": 1.0,
                        "RANGE_INTERPOLATED": 0.7,
                        "GEOMETRIC_CENTER": 0.6,
                        "APPROXIMATE": 0.4,
                    }
                    if location_type in mapping:
                        return mapping[location_type]

        if provider == "bing":
            confidence = raw.get("confidence")
            if isinstance(confidence, str):
                mapping = {"high": 0.9, "medium": 0.6, "low": 0.3}
                lowered = confidence.lower()
                if lowered in mapping:
                    return mapping[lowered]

        if provider == "azure":
            score = raw.get("score")
            if isinstance(score, (int, float)):
                return _clamp_confidence(float(score))

        if provider == "mapbox":
            relevance = raw.get("relevance")
            if isinstance(relevance, (int, float)):
                return _clamp_confidence(float(relevance))
    except (TypeError, ValueError):  # pragma: no cover - defensive
        return 0.5

    return 0.5


def _clamp_confidence(value: float) -> float:
    return max(0.0, min(1.0, value))


def _compose_queries(parsed: Mapping[str, str], raw_text: str) -> list[str]:
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

    normalized = {
        key: value.strip()
        for key, value in parsed.items()
        if isinstance(value, str) and value.strip()
    }

    queries: list[str] = []

    def build_query(components: Mapping[str, str]) -> str:
        parts = [
            components[key]
            for key in priorities
            if key in components and components[key].strip()
        ]
        if not parts:
            parts = [value for value in components.values() if value.strip()]
        deduped = dict.fromkeys(part.strip() for part in parts if part.strip())
        return ", ".join(deduped)

    primary = build_query(normalized)
    if primary:
        queries.append(primary)

    postcode = normalized.get("postcode")
    if postcode:
        base_zip = _base_zip(postcode)
        if base_zip and base_zip != postcode:
            zip_components = dict(normalized)
            zip_components["postcode"] = base_zip
            alt = build_query(zip_components)
            if alt:
                queries.append(alt)

        zipless_components = dict(normalized)
        zipless_components.pop("postcode", None)
        alt = build_query(zipless_components)
        if alt:
            queries.append(alt)

    if raw_text.strip():
        queries.append(raw_text.strip())

    # Preserve order while removing duplicates
    deduped_queries = list(dict.fromkeys(query for query in queries if query))
    return deduped_queries or [raw_text.strip()]


def _base_zip(postcode: str) -> str | None:
    match = re.fullmatch(r"(\d{5})(?:[-\s]?(\d{4}))?", postcode.strip())
    if not match:
        return None
    return match.group(1)
