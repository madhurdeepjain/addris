from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import UUID

from app.schemas.jobs import AddressCandidate, JobStatus, JobStatusResponse, RouteLeg


@dataclass
class JobRecord:
    """Persisted representation of a job lifecycle."""

    job_id: UUID
    status: JobStatus
    created_at: datetime
    updated_at: datetime
    image_path: Path
    origin: Optional[tuple[float | None, float | None]] = None
    addresses: list[AddressCandidate] = field(default_factory=list)
    route: list[RouteLeg] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def to_response(self) -> JobStatusResponse:
        return JobStatusResponse(
            job_id=self.job_id,
            status=self.status,
            created_at=self.created_at,
            updated_at=self.updated_at,
            addresses=self.addresses,
            route=self.route,
            errors=self.errors,
        )
