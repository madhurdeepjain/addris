from __future__ import annotations

from tempfile import SpooledTemporaryFile

import pytest
from fastapi import UploadFile

from app.parsing.validation import AddressValidationResult
from app.schemas.jobs import RouteLeg
from app.services.geocoding import GeocodeResult
from app.services.job_service import JobService
from app.services.repository import JobRepository
from app.services.storage import StorageService


def _stub_ocr(_path):
    return [("123 Main St Springfield IL 62704", 0.95)]


def _stub_parser(_text):
    return {
        "house_number": "123",
        "road": "Main St",
        "city": "Springfield",
        "state": "IL",
        "postcode": "62704",
    }


async def _stub_geocoder(parsed, _raw_text):
    assert parsed["house_number"] == "123"
    return GeocodeResult(
        latitude=39.7817,
        longitude=-89.6501,
        confidence=0.9,
        resolved_label="123 Main St, Springfield, IL 62704",
    )


def _stub_validator(parsed, _raw_text):
    return AddressValidationResult(True, components=dict(parsed))


def _stub_router(addresses):
    items = list(addresses)
    legs = []
    for order, (label, lat, lon) in enumerate(items):
        legs.append(
            RouteLeg(
                order=order,
                label=label,
                latitude=lat,
                longitude=lon,
                eta_seconds=0,
                distance_meters=0.0,
            )
        )
    return legs


@pytest.mark.asyncio
async def test_job_service_processes_job(tmp_path):
    storage = StorageService(tmp_path)
    repository = JobRepository(tmp_path / "jobs.db")
    service = JobService(
        storage,
        repository,
        run_in_background=False,
        ocr_runner=_stub_ocr,
        address_parser=_stub_parser,
        geocoder=_stub_geocoder,
        address_validator=_stub_validator,
        router=_stub_router,
    )

    file_obj = SpooledTemporaryFile()
    file_obj.write(b"dummy image data")
    file_obj.seek(0)
    upload = UploadFile(
        filename="test.png", file=file_obj, headers={"content-type": "image/png"}
    )

    response = await service.create_job(upload, origin=(39.78, -89.65))

    job = await service.get_job(response.job_id)

    await upload.close()

    assert job is not None
    assert job.status == "completed"
    assert job.addresses, "Expected at least one address candidate"
    assert job.addresses[0].status == "validated"
    assert job.route, "Route should be populated"

    stored = repository.get(response.job_id)
    assert stored is not None
    assert stored.status == "completed"
