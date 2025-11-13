from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Awaitable, Callable, Dict, Iterable, Sequence
from uuid import UUID, uuid4

from fastapi import UploadFile

from app.core.logging import get_logger
from app.ocr.pipeline import run_ocr
from app.parsing.address_parser import parse_address
from app.routing.optimizer import compute_route
from app.schemas.jobs import JobStatusResponse, RouteLeg
from app.services.geocoding import GeocodeResult, geocode_address
from app.services.models import JobRecord
from app.services.pipeline import extract_address_candidates
from app.services.repository import JobRepository
from app.services.storage import StorageService


OCRCallable = Callable[[Path], Sequence[tuple[str, float]]]
AddressParserCallable = Callable[[str], dict[str, str] | None]
GeocoderCallable = Callable[[dict[str, str], str], Awaitable[GeocodeResult]]
RouteCallable = Callable[
    [Iterable[tuple[str, float | None, float | None]]], Sequence[RouteLeg]
]


_logger = get_logger(__name__)


class JobService:
    """Coordinates OCR, parsing, and routing for uploaded jobs."""

    def __init__(
        self,
        storage: StorageService,
        repository: JobRepository,
        *,
        run_in_background: bool = True,
        ocr_runner: OCRCallable = run_ocr,
        address_parser: AddressParserCallable = parse_address,
        geocoder: GeocoderCallable = geocode_address,
        router: RouteCallable = compute_route,
    ) -> None:
        self._storage = storage
        self._repository = repository
        self._jobs: Dict[UUID, JobRecord] = {
            record.job_id: record for record in repository.list()
        }
        self._lock = asyncio.Lock()
        self._run_in_background = run_in_background
        self._ocr_runner = ocr_runner
        self._address_parser = address_parser
        self._geocoder = geocoder
        self._router = router

    async def create_job(
        self,
        upload: UploadFile,
        origin: tuple[float | None, float | None] | None = None,
    ) -> JobStatusResponse:
        contents = await upload.read()
        suffix = Path(upload.filename or "").suffix
        image_path = self._storage.save_bytes(contents, suffix)

        job_id = uuid4()
        now = datetime.now(timezone.utc)
        record = JobRecord(
            job_id=job_id,
            status="pending",
            created_at=now,
            updated_at=now,
            image_path=image_path,
            origin=origin,
        )

        async with self._lock:
            self._jobs[job_id] = record

        await self._persist(record)

        _logger.info(
            "Job created",
            job_id=str(job_id),
            image_path=str(image_path),
            origin=origin,
            background=self._run_in_background,
        )

        if self._run_in_background:
            asyncio.create_task(self._process_job(job_id))
        else:
            await self._process_job(job_id)
        return record.to_response()

    async def get_job(self, job_id: UUID) -> JobStatusResponse | None:
        async with self._lock:
            record = self._jobs.get(job_id)
        if record:
            return record.to_response()

        stored = await asyncio.to_thread(self._repository.get, job_id)
        if stored:
            async with self._lock:
                self._jobs[job_id] = stored
            return stored.to_response()
        return None

    async def list_jobs(self) -> list[JobStatusResponse]:
        async with self._lock:
            records = sorted(
                self._jobs.values(), key=lambda item: item.created_at, reverse=True
            )
        return [record.to_response() for record in records]

    async def _process_job(self, job_id: UUID) -> None:
        async with self._lock:
            record = self._jobs.get(job_id)
            if not record:
                return
            record.status = "processing"
            record.updated_at = datetime.now(timezone.utc)
        await self._persist(record)

        _logger.info("Job processing started", job_id=str(job_id))

        try:
            addresses = await extract_address_candidates(
                record.image_path,
                self._ocr_runner,
                self._address_parser,
                self._geocoder,
                log_context={"job_id": str(job_id)},
            )

            route_inputs: list[tuple[str, float | None, float | None]] = []
            if record.origin:
                route_inputs.append(("Origin", record.origin[0], record.origin[1]))
            route_inputs.extend(
                (
                    candidate.raw_text,
                    candidate.latitude,
                    candidate.longitude,
                )
                for candidate in addresses
                if candidate.latitude is not None and candidate.longitude is not None
            )

            route = await asyncio.to_thread(self._router, route_inputs)

            _logger.info(
                "Route computed",
                job_id=str(job_id),
                legs=len(route),
                with_origin=bool(record.origin),
            )

            async with self._lock:
                record = self._jobs[job_id]
                record.addresses = addresses
                record.route = list(route)
                record.status = "completed"
                record.updated_at = datetime.now(timezone.utc)
            await self._persist(record)

            _logger.info("Job completed", job_id=str(job_id))

        except Exception as exc:  # pylint: disable=broad-except
            async with self._lock:
                record = self._jobs[job_id]
                record.errors.append(str(exc))
                record.status = "failed"
                record.updated_at = datetime.now(timezone.utc)
            _logger.error(
                "Job processing failed",
                job_id=str(job_id),
                error=str(exc),
                exc_info=True,
            )
            await self._persist(record)

    async def _persist(self, record: JobRecord) -> None:
        await asyncio.to_thread(self._repository.upsert, record)


_job_service: JobService | None = None


def get_job_service(storage_root: Path) -> JobService:
    global _job_service
    if _job_service is None:
        storage = StorageService(storage_root)
        repository = JobRepository(storage_root / "jobs.db")
        _job_service = JobService(storage, repository)
    return _job_service
