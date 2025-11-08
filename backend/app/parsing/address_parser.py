from __future__ import annotations

from typing import Mapping

from postal.parser import parse_address as libpostal_parse


def parse_address(text: str) -> Mapping[str, str] | None:
    """Parse free-form text into structured address components using libpostal."""

    cleaned = text.strip()
    if not cleaned:
        return None

    components = libpostal_parse(cleaned)
    if not components:
        return None

    parsed: dict[str, str] = {}
    for value, component in components:
        normalized_component = component.strip()
        normalized_value = value.strip()
        if not normalized_component or not normalized_value:
            continue
        parsed[normalized_component] = normalized_value

    return parsed or None
