from __future__ import annotations

import re
from typing import Mapping


def compose_geocoding_queries(parsed: Mapping[str, str], raw_text: str) -> list[str]:
    """
    Generate a list of query strings to try for geocoding, ordered by priority.
    """
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
