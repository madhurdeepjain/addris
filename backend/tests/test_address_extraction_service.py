from __future__ import annotations

from tempfile import SpooledTemporaryFile

import pytest
from fastapi import UploadFile

from app.parsing.validation import AddressValidationResult
from app.services.address_service import AddressExtractionService
from app.services.geocoding import GeocodeResult
from app.services.storage import StorageService


def _stub_ocr(_path):
    return [("1600 Amphitheatre Pkwy Mountain View CA", 0.92)]


def _stub_parser(_text):
    return {
        "house_number": "1600",
        "road": "Amphitheatre Pkwy",
        "city": "Mountain View",
        "state": "CA",
    }


def _stub_validator(parsed, _raw_text):
    return AddressValidationResult(True, components=dict(parsed))


async def _stub_geocoder(parsed, _raw_text):
    assert parsed["house_number"] == "1600"
    return GeocodeResult(
        latitude=37.422,
        longitude=-122.084,
        confidence=0.85,
        resolved_label="1600 Amphitheatre Parkway, Mountain View, CA",
    )


@pytest.mark.asyncio
async def test_address_extraction_service_returns_candidates(tmp_path):
    storage = StorageService(tmp_path)
    service = AddressExtractionService(
        storage,
        ocr_runner=_stub_ocr,
        address_parser=_stub_parser,
        geocoder=_stub_geocoder,
        address_validator=_stub_validator,
    )

    file_obj = SpooledTemporaryFile()
    file_obj.write(b"test image bytes")
    file_obj.seek(0)

    upload = UploadFile(
        filename="test.jpg",
        file=file_obj,
        headers={"content-type": "image/jpeg"},
    )

    addresses = await service.extract(upload)
    await upload.close()

    assert len(addresses) == 1
    candidate = addresses[0]
    assert candidate.status == "validated"
    assert candidate.latitude == pytest.approx(37.422)
    assert candidate.longitude == pytest.approx(-122.084)
    assert candidate.parsed is not None
    assert candidate.parsed["road"] == "Amphitheatre Pkwy"

    uploads = list(storage.uploads_dir.iterdir())
    assert uploads == []
