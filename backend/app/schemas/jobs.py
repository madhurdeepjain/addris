from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


JobStatus = Literal["pending", "processing", "completed", "failed"]
AddressStatus = Literal["pending", "validated", "failed"]


class RouteLeg(BaseModel):
    order: int
    label: str
    latitude: float
    longitude: float
    eta_seconds: int | None = None
    distance_meters: float | None = None


class AddressCandidate(BaseModel):
    raw_text: str
    confidence: float = Field(ge=0.0, le=1.0)
    parsed: dict[str, str] | None = None
    status: AddressStatus = "pending"
    message: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class JobCreateResponse(BaseModel):
    job_id: UUID
    status: JobStatus
    created_at: datetime


class JobStatusResponse(BaseModel):
    job_id: UUID
    status: JobStatus
    created_at: datetime
    updated_at: datetime
    addresses: list[AddressCandidate] = Field(default_factory=list)
    route: list[RouteLeg] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class JobListResponse(BaseModel):
    jobs: list[JobStatusResponse]
