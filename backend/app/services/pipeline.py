from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Callable, Sequence

from app.core.logging import get_logger
from app.parsing.validation import AddressValidationResult
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
    address_validator: Callable[[dict[str, str], str], AddressValidationResult]
    | None = None,
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

    # Generate expanded candidates using sliding windows
    text_candidates = _generate_text_candidates(ocr_results)
    _logger.info(
        "Generated text candidates",
        count=len(text_candidates),
        **context,
    )

    addresses: list[AddressCandidate] = []
    seen_parsed: dict[str, AddressCandidate] = {}

    for text, confidence in text_candidates:
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

        validation_error_message = None
        if parsed and address_validator:
            try:
                validation_result = await asyncio.to_thread(
                    address_validator, parsed, text
                )
            except Exception as validation_error:  # pragma: no cover - defensive
                _logger.warning(
                    "Address validation failed",
                    text=text,
                    error=str(validation_error),
                    **context,
                )
                parsed = None
                validation_error_message = str(validation_error)
            else:
                if not validation_result.is_valid:
                    validation_error_message = (
                        validation_result.reason or "Address rejected by validator"
                    )
                    parsed = None
                else:
                    parsed = validation_result.components or dict(parsed)

        log_payload: dict[str, Any] = {
            "text": text,
            "confidence": confidence,
            "parsed": parsed,
            **context,
        }
        if parse_error_message:
            log_payload["parse_error"] = parse_error_message
        if validation_error_message:
            log_payload["validation_error"] = validation_error_message
        _logger.info("Address parsed", **log_payload)

        # Skip if we didn't get a valid parse
        if not parsed:
            continue

        geocode_result = await _geocode_candidate(
            parsed,
            text,
            geocoder,
            skip_reason=parse_error_message or validation_error_message,
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

        # Deduplication logic
        # Create a canonical representation of the address for deduplication
        # We use the resolved label if available, otherwise a sorted tuple of components
        if candidate.parsed:
            if "resolved_label" in candidate.parsed:
                dedupe_key = candidate.parsed["resolved_label"]
            else:
                # Fallback to sorted key-value pairs
                dedupe_key = str(sorted(candidate.parsed.items()))

            # If we haven't seen this address, or this candidate has higher confidence, store it
            if (
                dedupe_key not in seen_parsed
                or candidate.confidence > seen_parsed[dedupe_key].confidence
            ):
                seen_parsed[dedupe_key] = candidate

    addresses = list(seen_parsed.values())

    _logger.info(
        "Address extraction completed",
        total=len(addresses),
        **context,
    )

    return addresses


def _generate_text_candidates(ocr_results: OCRResult) -> list[tuple[str, float]]:
    """Generate text candidates using sliding windows to capture multi-line addresses."""
    candidates = []

    # 1. Individual lines
    candidates.extend(ocr_results)

    # 2. Window size 2 (combine adjacent lines)
    for i in range(len(ocr_results) - 1):
        text1, conf1 = ocr_results[i]
        text2, conf2 = ocr_results[i + 1]
        combined_text = f"{text1} {text2}"
        # Average confidence
        combined_conf = (conf1 + conf2) / 2
        candidates.append((combined_text, combined_conf))

    # 3. Window size 3 (combine 3 adjacent lines)
    for i in range(len(ocr_results) - 2):
        text1, conf1 = ocr_results[i]
        text2, conf2 = ocr_results[i + 1]
        text3, conf3 = ocr_results[i + 2]
        combined_text = f"{text1} {text2} {text3}"
        combined_conf = (conf1 + conf2 + conf3) / 3
        candidates.append((combined_text, combined_conf))

    return candidates


async def _geocode_candidate(
    parsed: dict[str, str] | None,
    raw_text: str,
    geocoder,
    *,
    skip_reason: str | None = None,
) -> GeocodeResult:
    if parsed:
        return await geocoder(parsed, raw_text)

    return GeocodeResult(
        None,
        None,
        0.0,
        message=skip_reason or "Unrecognized address",
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
