from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Sequence

from app.core.logging import get_logger
from app.schemas.jobs import AddressCandidate
from app.services.geocoding import GeocodeResult


OCRResult = Sequence[tuple[str, float]]


_logger = get_logger(__name__)


async def extract_address_candidates(
    image_path: Path,
    ocr_runner,
    address_parser,
    geocoder,
    *,
    log_context: dict[str, Any] | None = None,
) -> list[AddressCandidate]:
    """Run OCR, parse, and geocode to build address candidates."""

    context = log_context or {}

    _logger.info(
        "Address extraction started",
        image_path=str(image_path),
        **context,
    )

    ocr_results: OCRResult = await asyncio.to_thread(ocr_runner, image_path)
    _logger.info(
        "OCR results received",
        candidates=len(ocr_results),
        preview=[text for text, _ in ocr_results[:3]],
        **context,
    )

    addresses: list[AddressCandidate] = []
    for text, confidence in ocr_results:
        try:
            parsed = await asyncio.to_thread(address_parser, text)
        except Exception as parse_error:  # pragma: no cover - defensive
            _logger.warning(
                "Address parsing failed",
                text=text,
                error=str(parse_error),
                **context,
            )
            parsed = None
            parse_error_message = str(parse_error)
        else:
            parse_error_message = None

        log_payload: dict[str, Any] = {
            "text": text,
            "confidence": confidence,
            "parsed": parsed,
            **context,
        }
        if parse_error_message:
            log_payload["parse_error"] = parse_error_message
        _logger.info("Address parsed", **log_payload)

        geocode_result = await _geocode_candidate(
            parsed,
            text,
            geocoder,
            parse_error_message=parse_error_message,
        )

        _logger.info(
            "Geocoding completed",
            text=text,
            latitude=geocode_result.latitude,
            longitude=geocode_result.longitude,
            confidence=geocode_result.confidence,
            message=geocode_result.message,
            resolved_label=geocode_result.resolved_label,
            **context,
        )

        candidate = _build_candidate(
            text,
            confidence,
            geocode_result,
            parsed,
        )
        addresses.append(candidate)

    _logger.info(
        "Address extraction completed",
        total=len(addresses),
        **context,
    )

    return addresses


async def _geocode_candidate(
    parsed: dict[str, str] | None,
    raw_text: str,
    geocoder,
    *,
    parse_error_message: str | None = None,
) -> GeocodeResult:
    if parsed:
        return await geocoder(parsed, raw_text)

    return GeocodeResult(
        None,
        None,
        0.0,
        message=parse_error_message or "Unrecognized address",
    )


def _build_candidate(
    text: str,
    confidence: float,
    geocode_result: GeocodeResult,
    parsed: dict[str, str] | None,
) -> AddressCandidate:
    base_confidence = max(0.0, min(1.0, confidence))
    combined_confidence = base_confidence

    if geocode_result.confidence > 0:
        combined_confidence = min(
            1.0, (base_confidence + geocode_result.confidence) / 2
        )
    elif geocode_result.message:
        combined_confidence = max(0.0, base_confidence * 0.5)

    status = "pending"
    if geocode_result.latitude is not None and geocode_result.longitude is not None:
        status = "validated"
    elif geocode_result.message:
        status = "failed"

    parsed_payload = dict(parsed) if parsed else None
    if parsed_payload and geocode_result.resolved_label:
        parsed_payload.setdefault("resolved_label", geocode_result.resolved_label)

    return AddressCandidate(
        raw_text=text,
        confidence=combined_confidence,
        parsed=parsed_payload,
        status=status,
        message=geocode_result.message if status == "failed" else None,
        latitude=geocode_result.latitude,
        longitude=geocode_result.longitude,
    )
