from __future__ import annotations

from pathlib import Path
from typing import BinaryIO
from uuid import uuid4

from app.core.logging import get_logger


_logger = get_logger(__name__)


class StorageService:
    """Handles persistence of uploaded files and derived artifacts."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.uploads_dir = self.root / "uploads"
        self.uploads_dir.mkdir(parents=True, exist_ok=True)

    def save_bytes(self, data: bytes, suffix: str = "") -> Path:
        """Persist raw bytes to a unique file under storage root."""

        filename = f"{uuid4().hex}{suffix}"
        destination = self.uploads_dir / filename
        destination.write_bytes(data)
        _logger.info("Stored upload", destination=str(destination), size=len(data))
        return destination

    def save_fileobj(self, file: BinaryIO, suffix: str = "") -> Path:
        """Persist a file-like object to a unique path."""

        filename = f"{uuid4().hex}{suffix}"
        destination = self.uploads_dir / filename
        with destination.open("wb") as buffer:
            buffer.write(file.read())
        _logger.info("Stored file object", destination=str(destination))
        return destination
