from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    debug: bool = Field(False, alias="ADDRIS_DEBUG")
    storage_root: Path = Field(Path("./data"), alias="ADDRIS_STORAGE_ROOT")

    geocoder_base_url: str = Field(
        "https://nominatim.openstreetmap.org", alias="ADDRIS_GEOCODER_BASE_URL"
    )
    geocoder_email: str | None = Field(None, alias="ADDRIS_GEOCODER_EMAIL")

    route_service_url: str = Field(
        "https://api.openrouteservice.org", alias="ADDRIS_ROUTE_SERVICE_URL"
    )
    route_service_api_key: str | None = Field(
        None, alias="ADDRIS_ROUTE_SERVICE_API_KEY"
    )

    ocr_backend: Literal["easyocr", "tesseract"] = Field(
        "easyocr", alias="ADDRIS_OCR_BACKEND"
    )

    environment: Literal["dev", "prod", "test"] = Field("dev", alias="ADDRIS_ENV")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @field_validator("storage_root", mode="before")
    def _expand_storage_root(cls, value: Path | str) -> Path:
        """Expand user and resolve the storage directory."""
        path = Path(value).expanduser()
        path.mkdir(parents=True, exist_ok=True)
        return path


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached application settings."""

    return Settings()  # type: ignore[call-arg]
