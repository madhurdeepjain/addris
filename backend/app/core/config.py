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

    geocoder_provider: Literal["google", "nominatim"] = Field(
        "nominatim", alias="ADDRIS_GEOCODER_PROVIDER"
    )
    geocoder_user_agent: str = Field(
        "addris-geocoder", alias="ADDRIS_GEOCODER_USER_AGENT"
    )
    geocoder_domain: str | None = Field(None, alias="ADDRIS_GEOCODER_DOMAIN")
    geocoder_timeout: float = Field(10.0, alias="ADDRIS_GEOCODER_TIMEOUT")

    ocr_backend: Literal["easyocr", "tesseract"] = Field(
        "easyocr", alias="ADDRIS_OCR_BACKEND"
    )

    routing_distance_provider: Literal["google", "haversine"] = Field(
        "google", alias="ADDRIS_ROUTING_DISTANCE_PROVIDER"
    )
    google_maps_api_key: str | None = Field(None, alias="ADDRIS_GOOGLE_MAPS_API_KEY")
    routing_distance_timeout: float = Field(
        10.0, alias="ADDRIS_ROUTING_DISTANCE_TIMEOUT"
    )
    routing_use_traffic: bool = Field(True, alias="ADDRIS_ROUTING_USE_TRAFFIC")

    # LLM Configuration
    llm_provider: Literal["openai", "anthropic", "google", "xai", "local"] = Field(
        "openai", alias="ADDRIS_LLM_PROVIDER"
    )
    openai_api_key: str | None = Field(None, alias="ADDRIS_OPENAI_API_KEY")
    anthropic_api_key: str | None = Field(None, alias="ADDRIS_ANTHROPIC_API_KEY")
    google_api_key: str | None = Field(None, alias="ADDRIS_GOOGLE_API_KEY")
    xai_api_key: str | None = Field(None, alias="ADDRIS_XAI_API_KEY")

    llm_base_url: str | None = Field(None, alias="ADDRIS_LLM_BASE_URL")
    llm_model: str = Field("gemma3:4b", alias="ADDRIS_LLM_MODEL")

    # Extraction Strategy
    extraction_strategy: Literal["ocr_sliding_window", "vlm", "ocr_llm"] = Field(
        "vlm", alias="ADDRIS_EXTRACTION_STRATEGY"
    )

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

    @field_validator("geocoder_provider", mode="before")
    def _normalize_provider(cls, value: str) -> str:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @field_validator("routing_distance_provider", mode="before")
    def _normalize_distance_provider(cls, value: str) -> str:
        if isinstance(value, str):
            return value.strip().lower()
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached application settings."""

    return Settings()  # type: ignore[call-arg]
