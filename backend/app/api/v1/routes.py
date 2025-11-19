from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, status

from app.schemas.extraction import RouteRequest, RouteResponse
from app.services.geocoding import reverse_geocode
from app.services.routing import compute_route


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

    return RouteResponse(
        route=result.legs,
        total_distance_meters=result.total_distance_meters,
        total_eta_seconds=result.total_eta_seconds,
        total_static_eta_seconds=result.total_static_eta_seconds,
        total_traffic_delay_seconds=result.total_traffic_delay_seconds,
        total_toll_cost=result.total_toll_cost,
        total_toll_currency=result.total_toll_currency,
        contains_tolls=result.contains_tolls,
        origin_address=origin_address,
        distance_provider=result.distance_provider,
        uses_live_traffic=result.uses_live_traffic,
    )
