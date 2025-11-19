from __future__ import annotations

import cv2
import numpy as np
from app.core.logging import get_logger

_logger = get_logger(__name__)


def preprocess_image(image: np.ndarray) -> np.ndarray:
    """
    Apply standard preprocessing steps to improve OCR accuracy.
    Includes grayscale conversion, denoising, thresholding, and cleaning.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    denoised = cv2.bilateralFilter(gray, 9, 75, 75)
    thresh = cv2.adaptiveThreshold(
        denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10
    )
    inverted = cv2.bitwise_not(thresh)
    cleaned = cv2.medianBlur(inverted, 3)
    return cleaned


def correct_orientation(image: np.ndarray) -> np.ndarray:
    """
    Detect and correct text orientation using Tesseract OSD.
    """
    try:
        import pytesseract

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
        return rotate_image(image, -angle)
    return image


def rotate_image(image: np.ndarray, angle: float) -> np.ndarray:
    """
    Rotate an image by a specific angle around its center.
    """
    height, width = image.shape[:2]
    center = (width / 2, height / 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(image, matrix, (width, height), flags=cv2.INTER_LINEAR)
