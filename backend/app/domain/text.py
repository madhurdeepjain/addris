from __future__ import annotations

from typing import Sequence


def generate_sliding_window_candidates(
    ocr_results: Sequence[tuple[str, float]],
    min_window: int = 2,
    max_window: int = 5,
) -> list[tuple[str, float]]:
    """
    Generate text candidates from OCR results using a sliding window approach.

    Args:
        ocr_results: Sequence of (text, confidence) tuples from OCR.
        min_window: Minimum window size.
        max_window: Maximum window size.

    Returns:
        List of (combined_text, average_confidence) tuples.
    """
    candidates = list(ocr_results)

    # Sliding windows
    for size in range(min_window, max_window + 1):
        for i in range(len(ocr_results) - size + 1):
            window = ocr_results[i : i + size]
            text = " ".join(item[0] for item in window)
            confidence = sum(item[1] for item in window) / size
            candidates.append((text, confidence))

    # Full text candidate (if reasonable size)
    if len(ocr_results) > 1 and len(ocr_results) <= 20:
        full_text = " ".join(item[0] for item in ocr_results)
        avg_conf = sum(item[1] for item in ocr_results) / len(ocr_results)
        candidates.append((full_text, avg_conf))

    return candidates
