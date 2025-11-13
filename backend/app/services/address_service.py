from __future__ import annotations

from pathlib import Path
from typing import Awaitable, Callable, Sequence

from fastapi import UploadFile

from app.core.logging import get_logger
from app.ocr.pipeline import run_ocr
from app.parsing.address_parser import parse_address
from app.schemas.jobs import AddressCandidate
from app.services.geocoding import GeocodeResult, geocode_address
from app.services.pipeline import extract_address_candidates
from app.services.storage import StorageService


OCRCallable = Callable[[Path], Sequence[tuple[str, float]]]
AddressParserCallable = Callable[[str], dict[str, str] | None]
GeocoderCallable = Callable[[dict[str, str], str], Awaitable[GeocodeResult]]


_logger = get_logger(__name__)


class AddressExtractionService:
    """Handle single-image address extraction without job orchestration."""

    def __init__(
        self,
        storage: StorageService,
        *,
        ocr_runner: OCRCallable = run_ocr,
        address_parser: AddressParserCallable = parse_address,
        geocoder: GeocoderCallable = geocode_address,
    ) -> None:
        self._storage = storage
        self._ocr_runner = ocr_runner
        self._address_parser = address_parser
        self._geocoder = geocoder

    async def extract(self, upload: UploadFile) -> list[AddressCandidate]:
        contents = await upload.read()
        suffix = Path(upload.filename or "").suffix
        image_path = self._storage.save_bytes(contents, suffix)

        try:
            addresses = await extract_address_candidates(
                image_path,
                self._ocr_runner,
                self._address_parser,
                self._geocoder,
            )
            return addresses
        finally:
            try:
                image_path.unlink(missing_ok=True)
            except OSError as exc:  # pragma: no cover - disk issues rare in tests
                _logger.warning(
                    "Failed to remove temporary image",
                    path=str(image_path),
                    error=str(exc),
                )


_extraction_service: AddressExtractionService | None = None


def get_address_extraction_service(storage_root: Path) -> AddressExtractionService:
    global _extraction_service
    if _extraction_service is None:
        storage = StorageService(storage_root)
        _extraction_service = AddressExtractionService(storage)
    return _extraction_service
