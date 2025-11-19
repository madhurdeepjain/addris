from __future__ import annotations

import base64
from pathlib import Path
from typing import Any, List, Optional

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama

from app.core.config import get_settings
from app.core.logging import get_logger

_logger = get_logger(__name__)


class AddressItem(BaseModel):
    house_number: Optional[str] = Field(
        None, description="The house or building number"
    )
    road: Optional[str] = Field(None, description="The street or road name")
    unit: Optional[str] = Field(None, description="Apartment, suite, or unit number")
    city: Optional[str] = Field(None, description="City or town name")
    state: Optional[str] = Field(None, description="State, province, or region")
    postcode: Optional[str] = Field(None, description="Postal or ZIP code")
    country: Optional[str] = Field(None, description="Country name")
    raw_text: Optional[str] = Field(
        None, description="The exact text substring found in the source"
    )


class AddressExtractionResult(BaseModel):
    addresses: List[AddressItem] = Field(
        default_factory=list, description="List of extracted addresses"
    )


class LLMService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.initialization_error: str | None = None
        self.llm = self._initialize_llm()

    def _initialize_llm(self) -> BaseChatModel | None:
        provider = self.settings.llm_provider
        model = self.settings.llm_model
        temperature = 0

        try:
            if provider == "openai":
                api_key = self.settings.openai_api_key

                if not api_key:
                    self.initialization_error = (
                        "OpenAI API key not found. Please set ADDRIS_OPENAI_API_KEY."
                    )
                    _logger.warning(self.initialization_error)
                    return None
                return ChatOpenAI(
                    model=model,
                    api_key=api_key,
                    temperature=temperature,
                )

            elif provider == "anthropic":
                api_key = self.settings.anthropic_api_key
                if not api_key:
                    self.initialization_error = "Anthropic API key not found. Please set ADDRIS_ANTHROPIC_API_KEY."
                    _logger.warning(self.initialization_error)
                    return None
                return ChatAnthropic(
                    model=model,
                    api_key=api_key,
                    temperature=temperature,
                )

            elif provider == "google":
                api_key = self.settings.google_api_key
                if not api_key:
                    self.initialization_error = (
                        "Google API key not found. Please set ADDRIS_GOOGLE_API_KEY."
                    )
                    _logger.warning(self.initialization_error)
                    return None
                return ChatGoogleGenerativeAI(
                    model=model,
                    google_api_key=api_key,
                    temperature=temperature,
                )

            elif provider == "grok":
                api_key = self.settings.xai_api_key
                if not api_key:
                    self.initialization_error = (
                        "xAI API key not found. Please set ADDRIS_XAI_API_KEY."
                    )
                    _logger.warning(self.initialization_error)
                    return None
                return ChatOpenAI(
                    model=model,
                    api_key=api_key,
                    base_url="https://api.x.ai/v1",
                    temperature=temperature,
                )

            elif provider == "local":
                # Use ChatOllama for local provider
                base_url = self.settings.llm_base_url
                return ChatOllama(
                    model=model,
                    base_url=base_url,
                    temperature=temperature,
                )

            else:
                self.initialization_error = f"Unsupported LLM provider: {provider}"
                _logger.error(self.initialization_error)
                return None

        except Exception as e:
            self.initialization_error = f"Failed to initialize LLM: {str(e)}"
            _logger.error(self.initialization_error)
            return None

    async def extract_addresses_from_text(self, text: str) -> list[dict[str, Any]]:
        """
        Extract addresses from raw text using an LLM.
        """
        if not self.llm:
            raise RuntimeError(
                self.initialization_error or "LLM client not initialized"
            )

        system_prompt = "You are an expert address extraction system. Identify and extract all physical addresses from the text."

        try:
            structured_llm = self.llm.with_structured_output(AddressExtractionResult)
            result = await structured_llm.ainvoke(
                [SystemMessage(content=system_prompt), HumanMessage(content=text)]
            )

            # result should be an AddressExtractionResult instance
            if not result or not result.addresses:
                return []

            return [addr.model_dump(exclude_none=True) for addr in result.addresses]

        except Exception as e:
            _logger.error("LLM text extraction failed", error=str(e))
            return []

    async def extract_addresses_from_image(
        self, image_path: Path
    ) -> list[dict[str, Any]]:
        """
        Extract addresses directly from an image using a VLM.
        """
        if not self.llm:
            raise RuntimeError(
                self.initialization_error or "LLM client not initialized"
            )

        # Encode image
        try:
            with open(image_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode("utf-8")
        except Exception as e:
            _logger.error(
                "Failed to read image file", path=str(image_path), error=str(e)
            )
            return []

        prompt_text = (
            "Identify and extract all physical addresses visible in this image."
        )

        # Construct multimodal message
        message = HumanMessage(
            content=[
                {"type": "text", "text": prompt_text},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{encoded_string}"},
                },
            ]
        )

        try:
            structured_llm = self.llm.with_structured_output(AddressExtractionResult)
            result = await structured_llm.ainvoke([message])

            if not result or not result.addresses:
                return []

            return [addr.model_dump(exclude_none=True) for addr in result.addresses]

        except Exception as e:
            _logger.error("LLM image extraction failed", error=str(e))
            return []


_llm_service: LLMService | None = None


def get_llm_service() -> LLMService:
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service
