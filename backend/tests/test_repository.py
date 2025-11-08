from datetime import datetime, timezone
from uuid import uuid4

from app.schemas.jobs import AddressCandidate, RouteLeg
from app.services.models import JobRecord
from app.services.repository import JobRepository


def test_repository_persists_and_loads_records(tmp_path):
    repository = JobRepository(tmp_path / "jobs.db")
    job_id = uuid4()
    now = datetime.now(timezone.utc)

    record = JobRecord(
        job_id=job_id,
        status="completed",
        created_at=now,
        updated_at=now,
        image_path=tmp_path / "image.png",
        origin=(12.0, 34.0),
        addresses=[
            AddressCandidate(
                raw_text="123 Main St",
                confidence=0.9,
                parsed={"house_number": "123", "road": "Main St"},
                status="validated",
                latitude=12.0,
                longitude=34.0,
            )
        ],
        route=[
            RouteLeg(
                order=0,
                label="Origin",
                latitude=12.0,
                longitude=34.0,
                eta_seconds=0,
                distance_meters=0.0,
            )
        ],
        errors=["test"],
    )

    repository.upsert(record)

    loaded = repository.get(job_id)
    assert loaded is not None
    assert loaded.job_id == job_id
    assert loaded.addresses[0].raw_text == "123 Main St"

    all_jobs = list(repository.list())
    assert len(all_jobs) == 1
    assert all_jobs[0].job_id == job_id
