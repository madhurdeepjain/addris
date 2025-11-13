from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, status

from app.routing.optimizer import compute_route
from app.schemas.extraction import RouteRequest, RouteResponse


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
    if payload.origin is not None:
        origin_label = payload.origin.label or "Origin"
        nodes.append((origin_label, payload.origin.latitude, payload.origin.longitude))

    for stop in payload.stops:
        nodes.append((stop.label, stop.latitude, stop.longitude))

    if not nodes:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "No valid coordinates provided"
        )

    route = await asyncio.to_thread(compute_route, nodes)
    return RouteResponse(route=list(route))
