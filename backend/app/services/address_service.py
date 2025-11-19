from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Awaitable, Callable, Sequence

from fastapi import UploadFile

from app.core.config import get_settings
from app.core.logging import get_logger
from app.domain.text import generate_sliding_window_candidates
from app.services.llm import get_llm_service
from app.services.ocr import run_ocr
from app.services.parsing import (
    AddressValidationResult,
    parse_address,
    validate_parsed_address,
)
from app.schemas.jobs import AddressCandidate
from app.services.geocoding import GeocodeResult, geocode_address
from app.services.storage import StorageService


OCRResult = Sequence[tuple[str, float]]
OCRCallable = Callable[[Path], OCRResult]
AddressParserCallable = Callable[[str], dict[str, str] | None]
GeocoderCallable = Callable[[dict[str, str], str], Awaitable[GeocodeResult]]
AddressValidatorCallable = Callable[[dict[str, str], str], AddressValidationResult]


_logger = get_logger(__name__)


class AddressExtractionService:
    """Handle single-image address extraction."""

    def __init__(
        self,
        storage: StorageService,
        *,
        ocr_runner: OCRCallable = run_ocr,
        address_parser: AddressParserCallable = parse_address,
        geocoder: GeocoderCallable = geocode_address,
        address_validator: AddressValidatorCallable = validate_parsed_address,
    ) -> None:
        self._storage = storage
        self._ocr_runner = ocr_runner
        self._address_parser = address_parser
        self._geocoder = geocoder
        self._address_validator = address_validator

    async def extract(self, upload: UploadFile) -> list[AddressCandidate]:
        contents = await upload.read()
        suffix = Path(upload.filename or "").suffix
        image_path = self._storage.save_bytes(contents, suffix)

        try:
            return await self._process_image(image_path)
        finally:
            try:
                image_path.unlink(missing_ok=True)
            except OSError as exc:
                _logger.warning(
                    "Failed to remove temporary image",
                    path=str(image_path),
                    error=str(exc),
                )

    async def _process_image(self, image_path: Path) -> list[AddressCandidate]:
        settings = get_settings()
        strategy = settings.extraction_strategy

        _logger.info(
            "Address extraction started", image_path=str(image_path), strategy=strategy
        )

        if strategy == "vlm":
            return await self._process_with_vlm(image_path)
        elif strategy == "ocr_llm":
            return await self._process_with_ocr_llm(image_path)
        else:
            return await self._process_with_sliding_window(image_path)

    async def _process_with_sliding_window(
        self, image_path: Path
    ) -> list[AddressCandidate]:
        # 1. Run OCR
        ocr_results = await asyncio.to_thread(self._ocr_runner, image_path)
        _logger.info(
            "OCR results received",
            candidates=len(ocr_results),
            preview=[text for text, _ in ocr_results[:3]],
        )

        # 2. Generate Candidates
        text_candidates = self._generate_text_candidates(ocr_results)

        # 3. Parse, Validate, and Geocode
        seen_parsed: dict[str, AddressCandidate] = {}

        for text, confidence in text_candidates:
            candidate = await self._process_candidate(text, confidence)
            if not candidate:
                continue

            # Deduplication
            dedupe_key = self._get_dedupe_key(candidate)
            if (
                dedupe_key not in seen_parsed
                or candidate.confidence > seen_parsed[dedupe_key].confidence
            ):
                seen_parsed[dedupe_key] = candidate

        # 4. Post-processing cleanup
        addresses = self._filter_duplicates(list(seen_parsed.values()))

        _logger.info("Address extraction completed", total=len(addresses))
        return addresses

    async def _process_with_vlm(self, image_path: Path) -> list[AddressCandidate]:
        llm_service = get_llm_service()
        extracted_data = await llm_service.extract_addresses_from_image(image_path)

        candidates = []
        for item in extracted_data:
            # Convert LLM output to string values as expected by domain logic
            parsed = {k: str(v) for k, v in item.items() if k != "raw_text" and v}
            raw_text = str(item.get("raw_text", ""))
            if not raw_text and parsed:
                # Reconstruct raw text if missing
                raw_text = ", ".join(parsed.values())

            candidate = await self._process_structured_candidate(
                parsed, raw_text, confidence=0.9
            )
            if candidate:
                candidates.append(candidate)

        return self._filter_duplicates(candidates)

    async def _process_with_ocr_llm(self, image_path: Path) -> list[AddressCandidate]:
        # 1. Run OCR
        ocr_results = await asyncio.to_thread(self._ocr_runner, image_path)

        # Combine all text for the LLM
        full_text = "\n".join([text for text, _ in ocr_results])

        # 2. LLM Extraction
        llm_service = get_llm_service()
        extracted_data = await llm_service.extract_addresses_from_text(full_text)

        candidates = []
        for item in extracted_data:
            parsed = {k: str(v) for k, v in item.items() if k != "raw_text" and v}
            raw_text = str(item.get("raw_text", ""))
            if not raw_text and parsed:
                raw_text = ", ".join(parsed.values())

            candidate = await self._process_structured_candidate(
                parsed, raw_text, confidence=0.9
            )
            if candidate:
                candidates.append(candidate)

        return self._filter_duplicates(candidates)

    def _filter_duplicates(
        self, candidates: list[AddressCandidate]
    ) -> list[AddressCandidate]:
        """
        Aggressively filter duplicates.
        If we have a validated version of an address, discard any failed versions
        that share the same core components (House #, Road, City, State).
        """
        groups: dict[str, list[AddressCandidate]] = {}
        for c in candidates:
            key = self._get_loose_dedupe_key(c)
            groups.setdefault(key, []).append(c)

        results = []
        for group in groups.values():
            validated = [c for c in group if c.status == "validated"]
            if validated:
                # Deduplicate validated candidates by their resolved_label
                # This ensures we don't return identical addresses, but still allow
                # different units/variations that share the same core components.
                seen_labels = set()
                unique_validated = []
                # Sort by confidence descending to keep the best version
                validated.sort(key=lambda x: x.confidence, reverse=True)

                for v in validated:
                    # Use resolved_label as the primary identity for a validated address
                    label = v.parsed.get("resolved_label")
                    if not label:
                        # Fallback identity if no resolved label
                        label = (
                            str(sorted(v.parsed.items())) if v.parsed else v.raw_text
                        )

                    if label not in seen_labels:
                        seen_labels.add(label)
                        unique_validated.append(v)

                results.extend(unique_validated)
            else:
                # Otherwise, return the single best candidate based on confidence
                best = max(group, key=lambda x: x.confidence)
                results.append(best)

        return results

    def _get_loose_dedupe_key(self, candidate: AddressCandidate) -> str:
        """Generate a loose key based on core address components."""
        if not candidate.parsed:
            return candidate.raw_text

        components = [
            candidate.parsed.get("house_number", ""),
            candidate.parsed.get("road", ""),
            candidate.parsed.get("city", ""),
            candidate.parsed.get("state", ""),
        ]
        # Normalize: lowercase and strip
        return "|".join(c.lower().strip() for c in components)

    async def _process_candidate(
        self, text: str, confidence: float
    ) -> AddressCandidate | None:
        # Parse
        try:
            parsed = await asyncio.to_thread(self._address_parser, text)
        except Exception as e:
            _logger.warning("Parse failed", text=text, error=str(e))
            return None

        if not parsed:
            return None

        # Validate
        try:
            validation = await asyncio.to_thread(self._address_validator, parsed, text)
            if not validation.is_valid:
                return None
            parsed = validation.components or parsed
        except Exception as e:
            _logger.warning("Validation failed", text=text, error=str(e))
            return None

        # Geocode
        geocode_result = await self._geocode_candidate(parsed, text)

        return self._build_candidate(text, confidence, geocode_result, parsed)

    async def _process_structured_candidate(
        self, parsed: dict[str, str], text: str, confidence: float
    ) -> AddressCandidate | None:
        # Validate
        try:
            validation = await asyncio.to_thread(self._address_validator, parsed, text)
            if not validation.is_valid:
                return None
            parsed = validation.components or parsed
        except Exception as e:
            _logger.warning("Validation failed", text=text, error=str(e))
            return None

        # Geocode
        geocode_result = await self._geocode_candidate(parsed, text)

        return self._build_candidate(text, confidence, geocode_result, parsed)

    def _generate_text_candidates(
        self, ocr_results: OCRResult
    ) -> list[tuple[str, float]]:
        return generate_sliding_window_candidates(ocr_results)

    async def _geocode_candidate(
        self, parsed: dict[str, str], raw_text: str
    ) -> GeocodeResult:
        return await self._geocoder(parsed, raw_text)

    def _build_candidate(
        self,
        text: str,
        confidence: float,
        geocode_result: GeocodeResult,
        parsed: dict[str, str],
    ) -> AddressCandidate:
        base_conf = max(0.0, min(1.0, confidence))
        combined_conf = base_conf

        if geocode_result.confidence > 0:
            combined_conf = min(1.0, (base_conf + geocode_result.confidence) / 2)
        elif geocode_result.message:
            combined_conf = max(0.0, base_conf * 0.5)

        status = "pending"
        if geocode_result.latitude is not None and geocode_result.longitude is not None:
            status = "validated"
        elif geocode_result.message:
            status = "failed"

        final_parsed = dict(parsed)
        if geocode_result.resolved_label:
            final_parsed.setdefault("resolved_label", geocode_result.resolved_label)

        return AddressCandidate(
            raw_text=text,
            confidence=combined_conf,
            parsed=final_parsed,
            status=status,
            message=geocode_result.message if status == "failed" else None,
            latitude=geocode_result.latitude,
            longitude=geocode_result.longitude,
        )

    def _get_dedupe_key(self, candidate: AddressCandidate) -> str:
        if candidate.parsed and "resolved_label" in candidate.parsed:
            return candidate.parsed["resolved_label"]
        return (
            str(sorted(candidate.parsed.items()))
            if candidate.parsed
            else candidate.raw_text
        )


_extraction_service: AddressExtractionService | None = None


def get_address_extraction_service(storage_root: Path) -> AddressExtractionService:
    global _extraction_service
    if _extraction_service is None:
        storage = StorageService(storage_root)
        _extraction_service = AddressExtractionService(storage)
    return _extraction_service
