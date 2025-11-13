from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import addresses, routes

router = APIRouter()
router.include_router(addresses.router, prefix="/v1/addresses", tags=["addresses"])
router.include_router(routes.router, prefix="/v1/routes", tags=["routes"])
