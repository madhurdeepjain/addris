from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Mapping

from postal.parser import parse_address as libpostal_parse

from app.core.logging import get_logger


_logger = get_logger(__name__)


@dataclass(slots=True)
class AddressValidationResult:
    is_valid: bool
    reason: str | None = None
    components: dict[str, str] | None = None


_ALLOWED_COMPONENTS = {
    "house_number",
    "road",
    "unit",
    "level",
    "staircase",
    "entrance",
    "po_box",
    "suburb",
    "city_district",
    "city",
    "state_district",
    "state",
    "postcode",
    "country",
    "country_region",
    "world_region",
}

_NOISE_PATTERN = re.compile(
    r"\b("
    r"tracking|shipment|shipping|package|parcel|barcode|deliver(?:y|ies)|"
    r"pickup|drop\s?off|mail|label|order|confirmation|invoice|reference|"
    r"usps|fedex|ups|dhl"
    r")\b",
    flags=re.IGNORECASE,
)

_PHONE_PATTERN = re.compile(
    r"(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}",
    flags=re.IGNORECASE,
)

_MIN_COMPONENTS = 2
_REQUIRED_COMBINATIONS = [
    {"house_number", "road"},
    {"road", "city"},
    {"road", "state"},
    {"road", "postcode"},
    {"house_number", "city"},
    {"house_number", "postcode"},
    {"po_box", "city"},
]


def parse_address(text: str) -> Mapping[str, str] | None:
    """Parse free-form text into structured address components using libpostal."""

    cleaned = text.strip()
    if not cleaned:
        _logger.info("Address parsing skipped", reason="empty input")
        return None

    components = libpostal_parse(cleaned)
    if not components:
        _logger.info("Address parsing yielded no components", raw_text=text)
        return None

    parsed: dict[str, str] = {}
    for value, component in components:
        normalized_component = component.strip()
        normalized_value = value.strip()
        if not normalized_component or not normalized_value:
            continue
        parsed[normalized_component] = normalized_value

    if not parsed:
        _logger.info("Address parsing produced empty result", raw_text=text)
        return None

    _logger.info("Address parsed", raw_text=text, components=parsed)
    return parsed


def validate_parsed_address(
    parsed: Mapping[str, str],
    raw_text: str,
) -> AddressValidationResult:
    """Validate parsed address components before geocoding."""

    if not parsed:
        return AddressValidationResult(False, reason="No address components")

    cleaned: dict[str, str] = {}
    raw_noise = bool(_NOISE_PATTERN.search(raw_text))
    for component, value in parsed.items():
        key = component.strip().lower()
        if key not in _ALLOWED_COMPONENTS:
            continue

        normalized = value.strip()
        if not normalized:
            continue

        if _NOISE_PATTERN.search(normalized):
            continue

        if key == "house_number":
            if not any(ch.isdigit() for ch in normalized):
                continue
            if _is_part_of_phone_number(normalized, raw_text):
                continue

        if key == "road" and not any(ch.isalpha() for ch in normalized):
            continue

        if key == "postcode":
            normalized = _normalize_postcode(normalized)
            if not normalized:
                continue

        cleaned[key] = normalized

    if len(cleaned) < _MIN_COMPONENTS:
        reason = "Insufficient address detail"
        if raw_noise:
            reason = "Insufficient address detail (looks like a shipping label)"
        return AddressValidationResult(False, reason=reason)

    if not any(required.issubset(cleaned) for required in _REQUIRED_COMBINATIONS):
        reason = "Missing essential address parts"
        if raw_noise:
            reason = "Missing essential address parts (looks like a shipping label)"
        return AddressValidationResult(False, reason=reason)

    return AddressValidationResult(True, components=cleaned)


def _normalize_postcode(postcode: str) -> str | None:
    compact = postcode.replace(" ", "").strip()
    if not compact:
        return None

    zip9_match = re.fullmatch(r"(\d{5})(?:[-](\d{4}))?", compact)
    if zip9_match:
        base, plus4 = zip9_match.groups(default="")
        return f"{base}-{plus4}" if plus4 else base

    # Allow simple alphanumeric postcodes of length >= 3
    if len(compact) >= 3 and compact.isalnum():
        return compact

    return None


def _is_part_of_phone_number(house_number: str, raw_text: str) -> bool:
    phones = _PHONE_PATTERN.findall(raw_text)
    if not phones:
        return False

    text_without_phones = _PHONE_PATTERN.sub(" ", raw_text)
    pattern = r"\b" + re.escape(house_number) + r"\b"
    if re.search(pattern, text_without_phones):
        return False

    return True
