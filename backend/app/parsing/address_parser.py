from __future__ import annotations

from typing import Mapping

from postal.parser import parse_address as libpostal_parse

from app.core.logging import get_logger


_logger = get_logger(__name__)


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
