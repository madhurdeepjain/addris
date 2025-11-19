from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import cv2

from app.core.config import get_settings
from app.core.logging import get_logger
from app.domain.image import correct_orientation, preprocess_image


_TESSERACT_CONFIG = "--oem 3 --psm 6"
_MAX_RESULTS = 50
_EASYOCR_LANGUAGES = ("en",)
_DEFAULT_EASYOCR_CONFIDENCE = 0.5
_logger = get_logger(__name__)
_easyocr_reader: Any = None


@dataclass(slots=True)
class OCRLine:
    text: str
    confidence: float


def run_ocr(image_path: Path) -> Sequence[tuple[str, float]]:
    """Run OCR on an image with the configured backend."""

    settings = get_settings()
    backend = settings.ocr_backend
    _logger.info("OCR starting", backend=backend, image_path=str(image_path))

    if backend == "easyocr":
        results = _run_with_easyocr(image_path)
    elif backend == "tesseract":
        results = _run_with_tesseract(image_path)
    else:
        raise ValueError(f"Unsupported OCR backend: {backend}")

    _logger.info(
        "OCR completed",
        backend=backend,
        image_path=str(image_path),
        candidates=len(results),
    )
    return results


def _run_with_tesseract(image_path: Path) -> Sequence[tuple[str, float]]:
    try:
        import pytesseract
        from pytesseract import Output
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "Tesseract backend selected but the 'pytesseract' package is not installed."
        ) from exc

    image = cv2.imread(str(image_path))
    if image is None:
        _logger.error("Image read failed", image_path=str(image_path))
        raise FileNotFoundError(f"Unable to read image: {image_path}")

    oriented = correct_orientation(image)
    processed = preprocess_image(oriented)

    try:
        ocr_data = pytesseract.image_to_data(
            processed, output_type=Output.DICT, config=_TESSERACT_CONFIG
        )
    except pytesseract.TesseractError as exc:
        _logger.error("Tesseract execution failed", error=str(exc))
        raise RuntimeError(f"Tesseract OCR failed: {exc}") from exc

    lines = _aggregate_lines(ocr_data)
    # Return lines in reading order to support multi-line address extraction
    # lines.sort(key=lambda item: item.confidence, reverse=True)
    results = [(line.text, line.confidence) for line in lines[:_MAX_RESULTS]]
    _logger.debug("Tesseract candidates", count=len(results))
    return results


def _get_easyocr_reader():
    global _easyocr_reader
    if _easyocr_reader is not None:
        return _easyocr_reader  # type: ignore[return-value]

    try:
        import easyocr
    except ImportError as exc:  # pragma: no cover - import path varies per env
        raise RuntimeError(
            "EasyOCR backend selected but the 'easyocr' package is not installed."
        ) from exc

    try:
        reader = easyocr.Reader(list(_EASYOCR_LANGUAGES), gpu=False)
    except Exception as exc:  # pragma: no cover - depends on system setup
        _logger.error("EasyOCR initialization failed", error=str(exc))
        raise RuntimeError(f"Unable to initialize EasyOCR: {exc}") from exc

    _easyocr_reader = reader
    return reader


def _run_with_easyocr(image_path: Path) -> Sequence[tuple[str, float]]:
    reader = _get_easyocr_reader()

    try:
        results = reader.readtext(str(image_path), detail=1, paragraph=True)
    except FileNotFoundError:
        _logger.error("Image read failed", image_path=str(image_path))
        raise
    except Exception as exc:  # pragma: no cover - backend may raise varied errors
        _logger.error("EasyOCR execution failed", error=str(exc))
        raise RuntimeError(f"EasyOCR OCR failed: {exc}") from exc

    lines: list[OCRLine] = []
    for candidate in results:
        text: str | None = None
        confidence_value: Any = None

        if isinstance(candidate, str):
            text = candidate
        elif isinstance(candidate, (list, tuple)):
            if len(candidate) >= 2:
                text = candidate[1]
            elif candidate:
                text = candidate[0]
            if len(candidate) >= 3:
                confidence_value = candidate[2]
        else:
            continue

        normalized_text = str(text).strip() if text is not None else ""
        if not normalized_text:
            continue

        try:
            if confidence_value is None:
                conf_value = _DEFAULT_EASYOCR_CONFIDENCE
            else:
                conf_value = float(confidence_value)
        except (TypeError, ValueError):
            conf_value = _DEFAULT_EASYOCR_CONFIDENCE

        clamped_conf = max(0.0, min(1.0, conf_value))
        lines.append(OCRLine(normalized_text, clamped_conf))

    # Return lines in reading order to support multi-line address extraction
    # lines.sort(key=lambda item: item.confidence, reverse=True)
    trimmed = [(line.text, line.confidence) for line in lines[:_MAX_RESULTS]]
    _logger.debug("EasyOCR candidates", count=len(trimmed))
    return trimmed


def _aggregate_lines(data: dict[str, list]) -> list[OCRLine]:
    groups: dict[tuple[int, int, int, int], list[tuple[str, float]]] = {}
    size = len(data.get("text", []))
    for index in range(size):
        text = data["text"][index].strip()
        if not text:
            continue
        try:
            confidence = float(data["conf"][index])
        except (ValueError, TypeError):
            continue
        if confidence < 0:
            continue
        key = (
            int(data["page_num"][index]),
            int(data["block_num"][index]),
            int(data["par_num"][index]),
            int(data["line_num"][index]),
        )
        groups.setdefault(key, []).append((text, confidence))

    lines: list[OCRLine] = []
    for items in groups.values():
        words = [word for word, _ in items]
        confs = [conf for _, conf in items]
        if not words:
            continue
        average_conf = sum(confs) / len(confs) / 100.0
        clamped_conf = max(0.0, min(1.0, average_conf))
        lines.append(OCRLine(" ".join(words), clamped_conf))

    return lines
