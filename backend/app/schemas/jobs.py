from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


JobStatus = Literal["pending", "processing", "completed", "failed"]
AddressStatus = Literal["pending", "validated", "failed"]


class RouteLeg(BaseModel):
    order: int
    label: str
    latitude: float
    longitude: float
    eta_seconds: int | None = None
    static_eta_seconds: int | None = None
    traffic_delay_seconds: int | None = None
    distance_meters: float | None = None
    cumulative_eta_seconds: int | None = None
    cumulative_distance_meters: float | None = None
    has_toll: bool | None = None
    toll_currency: str | None = None
    toll_cost: float | None = None


class RouteOrigin(BaseModel):
    latitude: float
    longitude: float
    label: str | None = None
    address: str | None = None


class AddressCandidate(BaseModel):
    raw_text: str
    confidence: float = Field(ge=0.0, le=1.0)
    parsed: dict[str, str] | None = None
    status: AddressStatus = "pending"
    message: str | None = None
    latitude: float | None = None
    longitude: float | None = None
