from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.core.config import get_settings
from app.schemas.jobs import JobListResponse, JobStatusResponse
from app.services.job_service import JobService, get_job_service

router = APIRouter()


def get_service() -> JobService:
    settings = get_settings()
    return get_job_service(settings.storage_root)


@router.post(
    "/", response_model=JobStatusResponse, status_code=status.HTTP_202_ACCEPTED
)
async def create_job(
    image: UploadFile = File(...),
    latitude: float | None = Form(default=None),
    longitude: float | None = Form(default=None),
    service: JobService = Depends(get_service),
) -> JobStatusResponse:
    if image.content_type not in {"image/jpeg", "image/png"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported file type")
    origin = (
        (latitude, longitude)
        if latitude is not None and longitude is not None
        else None
    )
    return await service.create_job(image, origin=origin)


@router.get("/", response_model=JobListResponse)
async def list_jobs(service: JobService = Depends(get_service)) -> JobListResponse:
    jobs = await service.list_jobs()
    return JobListResponse(jobs=jobs)


@router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job(
    job_id: UUID, service: JobService = Depends(get_service)
) -> JobStatusResponse:
    job = await service.get_job(job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return job
