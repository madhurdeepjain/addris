from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from app.schemas.jobs import AddressCandidate, RouteLeg


class AddressExtractionResponse(BaseModel):
    addresses: list[AddressCandidate] = Field(default_factory=list)


class RouteStop(BaseModel):
    label: str | None = Field(default=None)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)

    @field_validator("label", mode="before")
    def _normalize_label(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None


class RouteRequest(BaseModel):
    origin: RouteStop | None = None
    stops: list[RouteStop] = Field(..., min_length=1)


class RouteResponse(BaseModel):
    route: list[RouteLeg] = Field(default_factory=list)
    total_distance_meters: float = 0.0
    total_eta_seconds: int | None = None
    origin_address: str | None = None
