from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import jobs

router = APIRouter()
router.include_router(jobs.router, prefix="/v1/jobs", tags=["jobs"])
