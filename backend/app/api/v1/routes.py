from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, status

from app.routing.optimizer import compute_route
from app.schemas.extraction import RouteRequest, RouteResponse
from app.services.geocoding import reverse_geocode


router = APIRouter()


@router.post(
    "/",
    response_model=RouteResponse,
    status_code=status.HTTP_200_OK,
)
async def create_route(payload: RouteRequest) -> RouteResponse:
    if not payload.stops:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "At least one stop is required"
        )

    nodes: list[tuple[str, float, float]] = []
    origin_address: str | None = None
    if payload.origin is not None:
        origin_address = await reverse_geocode(
            payload.origin.latitude, payload.origin.longitude
        )
        origin_label = payload.origin.label or origin_address or "Origin"
        nodes.append((origin_label, payload.origin.latitude, payload.origin.longitude))

    for index, stop in enumerate(payload.stops, start=1):
        label = stop.label or f"Stop {index}"
        nodes.append((label, stop.latitude, stop.longitude))

    if not nodes:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "No valid coordinates provided"
        )

    result = await asyncio.to_thread(compute_route, nodes)
    route = list(result.legs)

    total_distance = sum(
        leg.distance_meters or 0.0 for leg in route if leg.distance_meters is not None
    )
    total_eta = sum(
        leg.eta_seconds or 0 for leg in route if leg.eta_seconds is not None
    )
    total_static_eta = 0
    total_delay = 0
    contains_tolls = any(bool(leg.has_toll) for leg in route)
    total_toll_cost = 0.0
    toll_cost_available = False
    toll_currency: str | None = None

    for leg in route:
        if leg.static_eta_seconds is not None:
            total_static_eta += leg.static_eta_seconds
        elif leg.eta_seconds is not None:
            total_static_eta += leg.eta_seconds

        if leg.traffic_delay_seconds is not None:
            total_delay += leg.traffic_delay_seconds

        if leg.toll_cost is not None:
            total_toll_cost += leg.toll_cost
            if not toll_cost_available:
                toll_currency = leg.toll_currency
                toll_cost_available = True
            elif toll_currency != leg.toll_currency:
                toll_currency = None

    return RouteResponse(
        route=route,
        total_distance_meters=total_distance,
        total_eta_seconds=total_eta,
        total_static_eta_seconds=total_static_eta,
        total_traffic_delay_seconds=total_delay,
        total_toll_cost=total_toll_cost if toll_cost_available else None,
        total_toll_currency=toll_currency if toll_cost_available else None,
        contains_tolls=contains_tolls,
        origin_address=origin_address,
        distance_provider=result.distance_provider,
        uses_live_traffic=result.uses_live_traffic,
    )
