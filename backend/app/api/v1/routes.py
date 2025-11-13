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
    return RouteResponse(
        route=route,
        total_distance_meters=total_distance,
        total_eta_seconds=total_eta,
        origin_address=origin_address,
        distance_provider=result.distance_provider,
        uses_live_traffic=result.uses_live_traffic,
    )
