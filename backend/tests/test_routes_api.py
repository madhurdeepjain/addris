from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.jobs import RouteLeg


client = TestClient(app)


def _stub_route(addresses):
    legs: list[RouteLeg] = []
    for order, (label, lat, lon) in enumerate(addresses):
        legs.append(
            RouteLeg(
                order=order,
                label=label,
                latitude=lat,
                longitude=lon,
                eta_seconds=0,
                distance_meters=0.0,
                cumulative_eta_seconds=0,
                cumulative_distance_meters=0.0,
            )
        )
    return legs


def test_route_endpoint_returns_route(monkeypatch):
    monkeypatch.setattr("app.api.v1.routes.compute_route", _stub_route)

    async def _stub_reverse_geocode(_lat, _lon):
        return "1600 Amphitheatre Pkwy, Mountain View, CA 94043"

    monkeypatch.setattr("app.api.v1.routes.reverse_geocode", _stub_reverse_geocode)

    payload = {
        "origin": {
            "label": "Current Location",
            "latitude": 37.42,
            "longitude": -122.08,
        },
        "stops": [
            {"label": "Stop A", "latitude": 37.43, "longitude": -122.09},
            {"label": "Stop B", "latitude": 37.44, "longitude": -122.1},
        ],
    }

    response = client.post("/v1/routes", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert len(data["route"]) == 3
    assert data["route"][0]["label"] == "Current Location"
    assert data["route"][1]["label"] == "Stop A"
    assert data["origin_address"] == "1600 Amphitheatre Pkwy, Mountain View, CA 94043"
    assert data["total_distance_meters"] == 0.0
    assert data["total_eta_seconds"] == 0
