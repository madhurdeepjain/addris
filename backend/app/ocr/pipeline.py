from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import cv2
import numpy as np
import pytesseract
from pytesseract import Output

from app.core.config import get_settings
from app.core.logging import get_logger


_TESSERACT_CONFIG = "--oem 3 --psm 6"
_MAX_RESULTS = 10
_logger = get_logger(__name__)


@dataclass(slots=True)
class OCRLine:
    text: str
    confidence: float


def run_ocr(image_path: Path) -> Sequence[tuple[str, float]]:
    """Run OCR on an image with the configured backend."""

    settings = get_settings()
    backend = settings.ocr_backend
    _logger.info("OCR starting", backend=backend, image_path=str(image_path))

    if backend == "tesseract":
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
    image = cv2.imread(str(image_path))
    if image is None:
        _logger.error("Image read failed", image_path=str(image_path))
        raise FileNotFoundError(f"Unable to read image: {image_path}")

    oriented = _correct_orientation(image)
    processed = _preprocess(oriented)

    try:
        ocr_data = pytesseract.image_to_data(
            processed, output_type=Output.DICT, config=_TESSERACT_CONFIG
        )
    except pytesseract.TesseractError as exc:
        _logger.error("Tesseract execution failed", error=str(exc))
        raise RuntimeError(f"Tesseract OCR failed: {exc}") from exc

    lines = _aggregate_lines(ocr_data)
    lines.sort(key=lambda item: item.confidence, reverse=True)
    results = [(line.text, line.confidence) for line in lines[:_MAX_RESULTS]]
    _logger.debug("Tesseract candidates", count=len(results))
    return results


def _preprocess(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    denoised = cv2.bilateralFilter(gray, 9, 75, 75)
    thresh = cv2.adaptiveThreshold(
        denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10
    )
    inverted = cv2.bitwise_not(thresh)
    cleaned = cv2.medianBlur(inverted, 3)
    return cleaned


def _correct_orientation(image: np.ndarray) -> np.ndarray:
    try:
        osd = pytesseract.image_to_osd(image)
    except pytesseract.TesseractError:
        _logger.debug("Orientation detection skipped")
        return image

    angle = 0
    for line in osd.splitlines():
        if "Rotate:" in line:
            try:
                angle = int(line.split(":")[1].strip())
            except ValueError:
                angle = 0
            break

    if angle and angle % 360 != 0:
        _logger.debug("Rotating image", angle=angle)
        return _rotate(image, -angle)
    return image


def _rotate(image: np.ndarray, angle: float) -> np.ndarray:
    height, width = image.shape[:2]
    center = (width / 2, height / 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(image, matrix, (width, height), flags=cv2.INTER_LINEAR)


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
