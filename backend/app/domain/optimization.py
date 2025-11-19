from __future__ import annotations

from typing import Sequence

from ortools.constraint_solver import pywrapcp, routing_enums_pb2


def solve_tsp(
    distance_matrix: Sequence[Sequence[int]],
    depot_index: int = 0,
    time_limit_seconds: int = 5,
) -> list[int] | None:
    """
    Solve the Traveling Salesperson Problem (TSP) using OR-Tools.

    Args:
        distance_matrix: Square matrix of distances between nodes.
        depot_index: Index of the starting node.
        time_limit_seconds: Maximum time to spend searching for a solution.

    Returns:
        List of node indices in the optimal order, or None if no solution found.
    """
    size = len(distance_matrix)
    if size <= 1:
        return list(range(size))

    manager = pywrapcp.RoutingIndexManager(size, 1, depot_index)
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
    search_parameters.time_limit.seconds = time_limit_seconds

    solution = routing.SolveWithParameters(search_parameters)
    if not solution:
        return None

    index = routing.Start(0)
    route_indices: list[int] = []

    while not routing.IsEnd(index):
        node_index = manager.IndexToNode(index)
        route_indices.append(node_index)
        index = solution.Value(routing.NextVar(index))

    return route_indices
