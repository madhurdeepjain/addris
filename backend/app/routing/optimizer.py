from __future__ import annotations

from math import atan2, cos, radians, sin, sqrt
from typing import Iterable, Sequence

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from app.schemas.jobs import RouteLeg


def compute_route(
    addresses: Iterable[tuple[str, float | None, float | None]],
) -> Sequence[RouteLeg]:
    """Solve a single-vehicle TSP to minimize travel distance between stops."""

    nodes = [
        (label, lat, lon)
        for label, lat, lon in addresses
        if lat is not None and lon is not None
    ]

    if not nodes:
        return []

    if len(nodes) == 1:
        label, lat, lon = nodes[0]
        return [
            RouteLeg(
                order=0,
                label=label,
                latitude=lat,
                longitude=lon,
                eta_seconds=0,
                distance_meters=0.0,
            )
        ]

    distance_matrix = _build_distance_matrix(nodes)
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
        return _fallback_route(nodes)

    order = 0
    index = routing.Start(0)
    route: list[RouteLeg] = []
    prev_node = None
    average_speed_mps = 11.11  # ~40 km/h

    while not routing.IsEnd(index):
        node_index = manager.IndexToNode(index)
        label, lat, lon = nodes[node_index]

        distance_meters = 0.0
        if prev_node is not None:
            distance_meters = distance_matrix[prev_node][node_index]
        eta_seconds = int(distance_meters / average_speed_mps) if distance_meters else 0

        route.append(
            RouteLeg(
                order=order,
                label=label,
                latitude=lat,
                longitude=lon,
                eta_seconds=eta_seconds,
                distance_meters=float(distance_meters),
            )
        )

        prev_node = node_index
        order += 1
        index = solution.Value(routing.NextVar(index))

    return route


def _build_distance_matrix(nodes: list[tuple[str, float, float]]) -> list[list[int]]:
    count = len(nodes)
    matrix = [[0] * count for _ in range(count)]
    for i in range(count):
        for j in range(count):
            if i == j:
                continue
            _, lat_a, lon_a = nodes[i]
            _, lat_b, lon_b = nodes[j]
            matrix[i][j] = int(round(_haversine(lat_a, lon_a, lat_b, lon_b)))
    return matrix


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371000.0
    lat1_rad, lon1_rad = radians(lat1), radians(lon1)
    lat2_rad, lon2_rad = radians(lat2), radians(lon2)

    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad

    a = sin(dlat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return radius * c


def _fallback_route(nodes: list[tuple[str, float, float]]) -> list[RouteLeg]:
    legs: list[RouteLeg] = []
    prev: tuple[str, float, float] | None = None
    average_speed_mps = 11.11
    for order, (label, lat, lon) in enumerate(nodes):
        distance_meters = 0.0
        if prev is not None:
            distance_meters = _haversine(prev[1], prev[2], lat, lon)
        eta_seconds = int(distance_meters / average_speed_mps) if distance_meters else 0
        legs.append(
            RouteLeg(
                order=order,
                label=label,
                latitude=lat,
                longitude=lon,
                eta_seconds=eta_seconds,
                distance_meters=distance_meters,
            )
        )
        prev = (label, lat, lon)
    return legs
