from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.config import get_settings
from app.schemas.extraction import AddressExtractionResponse
from app.services.address_service import (
    AddressExtractionService,
    get_address_extraction_service,
)


router = APIRouter()


def get_service() -> AddressExtractionService:
    settings = get_settings()
    return get_address_extraction_service(settings.storage_root)


@router.post(
    "/extract",
    response_model=AddressExtractionResponse,
    status_code=status.HTTP_200_OK,
)
async def extract_addresses(
    image: UploadFile = File(...),
    service: AddressExtractionService = Depends(get_service),
) -> AddressExtractionResponse:
    content_type = (image.content_type or "").lower()
    if content_type not in {"image/jpeg", "image/png"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported file type")

    try:
        addresses = await service.extract(image)
    finally:
        await image.close()

    return AddressExtractionResponse(addresses=addresses)
