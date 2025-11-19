from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

from app.core.config import get_settings
from app.core.logging import get_logger
from app.domain.optimization import solve_tsp
from app.schemas.jobs import RouteLeg
from app.services.distance import DistanceMatrixResult, get_distance_matrix


_logger = get_logger(__name__)


@dataclass(slots=True)
class RouteComputationResult(Sequence[RouteLeg]):
    legs: list[RouteLeg]
    distance_provider: str
    uses_live_traffic: bool

    @property
    def total_distance_meters(self) -> float:
        return sum(leg.distance_meters or 0.0 for leg in self.legs)

    @property
    def total_eta_seconds(self) -> int:
        return sum(leg.eta_seconds or 0 for leg in self.legs)

    @property
    def total_static_eta_seconds(self) -> int:
        return sum(
            leg.static_eta_seconds
            if leg.static_eta_seconds is not None
            else (leg.eta_seconds or 0)
            for leg in self.legs
        )

    @property
    def total_traffic_delay_seconds(self) -> int:
        return sum(leg.traffic_delay_seconds or 0 for leg in self.legs)

    @property
    def total_toll_cost(self) -> float | None:
        cost = sum(leg.toll_cost or 0.0 for leg in self.legs)
        return cost if cost > 0 else None

    @property
    def total_toll_currency(self) -> str | None:
        currencies = {leg.toll_currency for leg in self.legs if leg.toll_currency}
        return currencies.pop() if len(currencies) == 1 else None

    @property
    def contains_tolls(self) -> bool:
        return any(leg.has_toll for leg in self.legs)

    def __iter__(self):  # pragma: no cover - delegating to list iterator
        return iter(self.legs)

    def __len__(self) -> int:  # pragma: no cover - delegating to list length
        return len(self.legs)

    def __getitem__(self, index: int) -> RouteLeg:  # pragma: no cover
        return self.legs[index]


def compute_route(
    addresses: Iterable[tuple[str, float | None, float | None]],
) -> RouteComputationResult:
    """Solve a single-vehicle TSP to minimize travel distance between stops."""

    nodes = [
        (label, lat, lon)
        for label, lat, lon in addresses
        if lat is not None and lon is not None
    ]

    _logger.info("Route computation started", nodes=len(nodes))

    if not nodes:
        _logger.info("Route computation skipped", reason="no valid coordinates")
        settings = get_settings()
        return RouteComputationResult([], settings.routing_distance_provider, False)

    if len(nodes) == 1:
        label, lat, lon = nodes[0]
        _logger.info(
            "Route computation single node",
            label=label,
            latitude=lat,
            longitude=lon,
        )
        leg = RouteLeg(
            order=0,
            label=label,
            latitude=lat,
            longitude=lon,
            eta_seconds=0,
            distance_meters=0.0,
            cumulative_eta_seconds=0,
            cumulative_distance_meters=0.0,
        )
        settings = get_settings()
        return RouteComputationResult([leg], settings.routing_distance_provider, False)

    matrix = get_distance_matrix(nodes)

    # Use domain logic to solve TSP
    route_indices = solve_tsp(matrix.distances)

    if route_indices is None:
        _logger.warning("Route solver fallback", nodes=len(nodes))
        legs = _fallback_route(nodes, matrix)
        return RouteComputationResult(legs, matrix.provider, matrix.uses_live_traffic)

    # Reconstruct route from indices
    route: list[RouteLeg] = []
    prev_node_idx = None
    cumulative_distance = 0.0
    cumulative_eta = 0

    distance_matrix = matrix.distances
    duration_matrix = matrix.durations
    static_duration_matrix = matrix.static_durations
    toll_matrix = matrix.tolls

    for order, node_index in enumerate(route_indices):
        label, lat, lon = nodes[node_index]

        distance_meters = 0.0
        eta_seconds = 0
        static_eta = 0
        delay_seconds = 0
        toll_currency = None
        toll_cost = None
        has_toll = False

        if prev_node_idx is not None:
            distance_meters = float(distance_matrix[prev_node_idx][node_index])
            eta_seconds = int(duration_matrix[prev_node_idx][node_index])
            static_eta = int(static_duration_matrix[prev_node_idx][node_index])
            delay_seconds = eta_seconds - static_eta
            toll_info = toll_matrix[prev_node_idx][node_index]
            if toll_info is not None:
                has_toll = True
                toll_currency = toll_info.currency_code
                toll_cost = toll_info.cost

        cumulative_distance += distance_meters
        cumulative_eta += eta_seconds

        route.append(
            RouteLeg(
                order=order,
                label=label,
                latitude=lat,
                longitude=lon,
                eta_seconds=eta_seconds,
                static_eta_seconds=static_eta,
                traffic_delay_seconds=delay_seconds,
                distance_meters=distance_meters,
                cumulative_eta_seconds=cumulative_eta,
                cumulative_distance_meters=cumulative_distance,
                has_toll=has_toll,
                toll_currency=toll_currency,
                toll_cost=toll_cost,
            )
        )

        prev_node_idx = node_index

    _logger.info(
        "Route computation finished",
        legs=len(route),
        provider=matrix.provider,
        live_traffic=matrix.uses_live_traffic,
    )
    return RouteComputationResult(route, matrix.provider, matrix.uses_live_traffic)


def _fallback_route(
    nodes: Sequence[tuple[str, float, float]],
    matrix: DistanceMatrixResult,
) -> list[RouteLeg]:
    legs: list[RouteLeg] = []
    cumulative_distance = 0.0
    cumulative_eta = 0
    for index, (label, lat, lon) in enumerate(nodes):
        distance_meters = 0.0
        eta_seconds = 0
        static_eta = 0
        delay_seconds = 0
        has_toll = False
        toll_currency = None
        toll_cost = None
        if index > 0:
            distance_meters = float(matrix.distances[index - 1][index])
            eta_seconds = int(matrix.durations[index - 1][index])
            static_eta = int(matrix.static_durations[index - 1][index])
            delay_seconds = eta_seconds - static_eta
            toll_info = matrix.tolls[index - 1][index]
            if toll_info is not None:
                has_toll = True
                toll_currency = toll_info.currency_code
                toll_cost = toll_info.cost
        cumulative_distance += distance_meters
        cumulative_eta += eta_seconds
        legs.append(
            RouteLeg(
                order=index,
                label=label,
                latitude=lat,
                longitude=lon,
                eta_seconds=eta_seconds,
                static_eta_seconds=static_eta,
                traffic_delay_seconds=delay_seconds,
                distance_meters=distance_meters,
                cumulative_eta_seconds=cumulative_eta,
                cumulative_distance_meters=cumulative_distance,
                has_toll=has_toll,
                toll_currency=toll_currency,
                toll_cost=toll_cost,
            )
        )
    return legs
