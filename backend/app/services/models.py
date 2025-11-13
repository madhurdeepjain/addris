from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import UUID

from app.schemas.jobs import (
    AddressCandidate,
    JobStatus,
    JobStatusResponse,
    RouteLeg,
    RouteOrigin,
)


@dataclass
class JobRecord:
    """Persisted representation of a job lifecycle."""

    job_id: UUID
    status: JobStatus
    created_at: datetime
    updated_at: datetime
    image_path: Path
    origin: Optional[tuple[float | None, float | None]] = None
    origin_address: Optional[str] = None
    addresses: list[AddressCandidate] = field(default_factory=list)
    route: list[RouteLeg] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    total_distance_meters: float | None = None
    total_eta_seconds: int | None = None

    def to_response(self) -> JobStatusResponse:
        origin_payload = None
        if self.origin and self.origin[0] is not None and self.origin[1] is not None:
            origin_payload = RouteOrigin(
                latitude=float(self.origin[0]),
                longitude=float(self.origin[1]),
                label=self.origin_address,
                address=self.origin_address,
            )
        return JobStatusResponse(
            job_id=self.job_id,
            status=self.status,
            created_at=self.created_at,
            updated_at=self.updated_at,
            addresses=self.addresses,
            route=self.route,
            origin=origin_payload,
            total_distance_meters=self.total_distance_meters,
            total_eta_seconds=self.total_eta_seconds,
            errors=self.errors,
        )
