from __future__ import annotations

import json
import re
from dataclasses import dataclass
from math import atan2, cos, radians, sin, sqrt
from typing import Any, Sequence

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger


_logger = get_logger(__name__)
_ROUTE_MATRIX_ENDPOINT = (
    "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
)
_ROUTE_MATRIX_FIELD_MASK = (
    "originIndex,destinationIndex,distanceMeters,duration,staticDuration,condition"
)
_AVERAGE_SPEED_MPS = 11.11
_MAX_GOOGLE_MATRIX_NODES = 25
_DURATION_RE = re.compile(r"^(-?\d+)(?:\.(\d+))?s$")


@dataclass(slots=True)
class DistanceMatrixResult:
    distances: list[list[int]]
    durations: list[list[int]]
    provider: str
    uses_live_traffic: bool


def get_distance_matrix(
    nodes: Sequence[tuple[str, float, float]],
) -> DistanceMatrixResult:
    settings = get_settings()
    if settings.routing_distance_provider == "google":
        result = _fetch_google_matrix(
            nodes,
            api_key=settings.google_maps_api_key,
            timeout=settings.routing_distance_timeout,
            use_traffic=settings.routing_use_traffic,
        )
        if result is not None:
            return result
        _logger.warning(
            "Distance provider fallback", provider="google", nodes=len(nodes)
        )
    return _build_haversine_matrix(nodes)


def _fetch_google_matrix(
    nodes: Sequence[tuple[str, float, float]],
    *,
    api_key: str | None,
    timeout: float,
    use_traffic: bool,
) -> DistanceMatrixResult | None:
    if not nodes:
        return DistanceMatrixResult([], [], "google", False)
    if not api_key:
        _logger.info("Google distance matrix skipped", reason="missing_api_key")
        return None
    if len(nodes) > _MAX_GOOGLE_MATRIX_NODES:
        _logger.info(
            "Google distance matrix skipped", reason="too_many_nodes", nodes=len(nodes)
        )
        return None
    payload = {
        "origins": [
            {"waypoint": {"location": {"latLng": {"latitude": lat, "longitude": lon}}}}
            for _, lat, lon in nodes
        ],
        "destinations": [
            {"waypoint": {"location": {"latLng": {"latitude": lat, "longitude": lon}}}}
            for _, lat, lon in nodes
        ],
        "travelMode": "DRIVE",
    }

    if use_traffic:
        payload["routingPreference"] = "TRAFFIC_AWARE_OPTIMAL"
        # payload["departureTime"] = (
        #     datetime.now(timezone.utc)
        #     .replace(microsecond=0)
        #     .isoformat()
        #     .replace("+00:00", "Z")
        # )
    else:
        payload["routingPreference"] = "TRAFFIC_UNAWARE"

    headers = {
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": _ROUTE_MATRIX_FIELD_MASK,
        "Content-Type": "application/json",
    }

    try:
        response = httpx.post(
            _ROUTE_MATRIX_ENDPOINT,
            headers=headers,
            json=payload,
            timeout=timeout,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        _logger.warning("Google route matrix request failed", error=str(exc))
        return None

    entries = _parse_route_matrix_response(response)
    size = len(nodes)

    if len(entries) != size * size:
        _logger.warning(
            "Google route matrix incomplete",
            expected=size * size,
            received=len(entries),
        )
        return None

    distances = [[0] * size for _ in range(size)]
    durations = [[0] * size for _ in range(size)]
    for entry in entries:
        origin_index = entry.get("originIndex")
        destination_index = entry.get("destinationIndex")
        if not isinstance(origin_index, int) or not isinstance(destination_index, int):
            _logger.warning("Google route matrix missing indexes", entry=entry)
            return None
        if not (0 <= origin_index < size and 0 <= destination_index < size):
            _logger.warning("Google route matrix index out of range", entry=entry)
            return None

        condition = entry.get("condition")
        if condition and condition != "ROUTE_EXISTS":
            _logger.warning(
                "Google route matrix condition", condition=condition, entry=entry
            )
            return None

        distance_value = entry.get("distanceMeters")
        if distance_value is None:
            if origin_index == destination_index:
                distance_value = 0
            else:
                _logger.warning("Google route matrix missing distance", entry=entry)
                return None

        duration_value = _parse_duration_seconds(entry.get("duration"))
        if duration_value is None:
            _logger.warning("Google route matrix missing duration", entry=entry)
            return None

        # `staticDuration` is still parsed to ensure the field mask works, even if
        # we do not display it directly.
        _parse_duration_seconds(entry.get("staticDuration"))

        try:
            distances[origin_index][destination_index] = int(
                round(float(distance_value))
            )
        except (TypeError, ValueError):
            _logger.warning("Google route matrix invalid distance", entry=entry)
            return None

        durations[origin_index][destination_index] = int(duration_value)

    return DistanceMatrixResult(
        distances=distances,
        durations=durations,
        provider="google",
        uses_live_traffic=use_traffic,
    )


def _build_haversine_matrix(
    nodes: Sequence[tuple[str, float, float]],
) -> DistanceMatrixResult:
    size = len(nodes)
    distances = [[0] * size for _ in range(size)]
    durations = [[0] * size for _ in range(size)]
    for i in range(size):
        _, lat_a, lon_a = nodes[i]
        for j in range(size):
            if i == j:
                continue
            _, lat_b, lon_b = nodes[j]
            distance = _haversine(lat_a, lon_a, lat_b, lon_b)
            distances[i][j] = int(round(distance))
            durations[i][j] = int(round(distance / _AVERAGE_SPEED_MPS))
    return DistanceMatrixResult(
        distances=distances,
        durations=durations,
        provider="haversine",
        uses_live_traffic=False,
    )


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6_371_000.0
    lat1_rad, lon1_rad = radians(lat1), radians(lon1)
    lat2_rad, lon2_rad = radians(lat2), radians(lon2)

    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad

    a = sin(dlat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return radius * c


def _parse_route_matrix_response(response: httpx.Response) -> list[dict[str, Any]]:
    content = response.text.strip()
    if not content:
        return []

    if content.startswith(")]}'"):
        content = content[4:].lstrip()

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        parsed = None

    if isinstance(parsed, list):
        return [entry for entry in parsed if isinstance(entry, dict)]

    if isinstance(parsed, dict):
        matrix_entries = parsed.get("matrixEntries")
        if isinstance(matrix_entries, list):
            return [entry for entry in matrix_entries if isinstance(entry, dict)]
        return [parsed]

    lines = [line.strip() for line in content.splitlines() if line.strip()]
    if not lines:
        return []

    entries: list[dict[str, Any]] = []

    for line in lines:
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError as exc:
            _logger.warning("Google route matrix parse error", error=str(exc))
            return []
        if isinstance(parsed, dict):
            entries.append(parsed)

    return entries


def _parse_duration_seconds(value: Any) -> int | None:
    if value is None:
        return None

    if isinstance(value, (int, float)):
        return int(round(float(value)))

    if isinstance(value, str):
        stripped = value.strip()
        match = _DURATION_RE.match(stripped)
        if match:
            try:
                total = float(stripped[:-1])
            except ValueError:
                return None
            return int(round(total))
        try:
            return int(round(float(stripped)))
        except ValueError:
            return None

    if isinstance(value, dict):
        seconds = value.get("seconds", 0)
        nanos = value.get("nanos", 0)
        try:
            total = float(seconds) + float(nanos) / 1_000_000_000
        except (TypeError, ValueError):
            return None
        return int(round(total))

    return None
