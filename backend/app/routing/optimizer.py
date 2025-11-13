from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from app.core.config import get_settings
from app.core.logging import get_logger
from app.schemas.jobs import RouteLeg
from app.services.distance import DistanceMatrixResult, get_distance_matrix


_logger = get_logger(__name__)


@dataclass(slots=True)
class RouteComputationResult(Sequence[RouteLeg]):
    legs: list[RouteLeg]
    distance_provider: str
    uses_live_traffic: bool

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
    distance_matrix = matrix.distances
    duration_matrix = matrix.durations

    depot_index = 0

    manager = pywrapcp.RoutingIndexManager(len(nodes), 1, depot_index)
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index: int, to_index: int) -> int:
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return distance_matrix[from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_parameters.time_limit.seconds = 5

    solution = routing.SolveWithParameters(search_parameters)
    if not solution:
        _logger.warning("Route solver fallback", nodes=len(nodes))
        legs = _fallback_route(nodes, matrix)
        return RouteComputationResult(legs, matrix.provider, matrix.uses_live_traffic)

    order = 0
    index = routing.Start(0)
    route: list[RouteLeg] = []
    prev_node = None
    cumulative_distance = 0.0
    cumulative_eta = 0

    while not routing.IsEnd(index):
        node_index = manager.IndexToNode(index)
        label, lat, lon = nodes[node_index]

        distance_meters = 0.0
        eta_seconds = 0
        if prev_node is not None:
            distance_meters = float(distance_matrix[prev_node][node_index])
            eta_seconds = int(duration_matrix[prev_node][node_index])
        cumulative_distance += distance_meters
        cumulative_eta += eta_seconds

        route.append(
            RouteLeg(
                order=order,
                label=label,
                latitude=lat,
                longitude=lon,
                eta_seconds=eta_seconds,
                distance_meters=distance_meters,
                cumulative_eta_seconds=cumulative_eta,
                cumulative_distance_meters=cumulative_distance,
            )
        )

        prev_node = node_index
        order += 1
        index = solution.Value(routing.NextVar(index))

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
        if index > 0:
            distance_meters = float(matrix.distances[index - 1][index])
            eta_seconds = int(matrix.durations[index - 1][index])
        cumulative_distance += distance_meters
        cumulative_eta += eta_seconds
        legs.append(
            RouteLeg(
                order=index,
                label=label,
                latitude=lat,
                longitude=lon,
                eta_seconds=eta_seconds,
                distance_meters=distance_meters,
                cumulative_eta_seconds=cumulative_eta,
                cumulative_distance_meters=cumulative_distance,
            )
        )
    return legs
