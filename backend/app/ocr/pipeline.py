from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import cv2
import numpy as np
import pytesseract
from pytesseract import Output


_TESSERACT_CONFIG = "--oem 3 --psm 6"
_MAX_RESULTS = 10


@dataclass(slots=True)
class OCRLine:
    text: str
    confidence: float


def run_ocr(image_path: Path) -> Sequence[tuple[str, float]]:
    """Run OCR on an image and return up to 10 high-confidence lines."""

    image = cv2.imread(str(image_path))
    if image is None:
        raise FileNotFoundError(f"Unable to read image: {image_path}")

    oriented = _correct_orientation(image)
    processed = _preprocess(oriented)

    try:
        ocr_data = pytesseract.image_to_data(
            processed, output_type=Output.DICT, config=_TESSERACT_CONFIG
        )
    except pytesseract.TesseractError as exc:
        raise RuntimeError(f"Tesseract OCR failed: {exc}") from exc

    lines = _aggregate_lines(ocr_data)
    lines.sort(key=lambda item: item.confidence, reverse=True)
    return [(line.text, line.confidence) for line in lines[:_MAX_RESULTS]]


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
