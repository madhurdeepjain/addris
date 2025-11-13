from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.jobs import AddressCandidate, RouteLeg


class AddressExtractionResponse(BaseModel):
    addresses: list[AddressCandidate] = Field(default_factory=list)


class RouteStop(BaseModel):
    label: str = Field(..., min_length=1)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)


class RouteRequest(BaseModel):
    origin: RouteStop | None = None
    stops: list[RouteStop] = Field(..., min_length=1)


class RouteResponse(BaseModel):
    route: list[RouteLeg] = Field(default_factory=list)
