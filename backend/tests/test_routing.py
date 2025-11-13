from app.routing.optimizer import compute_route


def test_compute_route_orders_origin_first():
    addresses = [
        ("Origin", 37.7749, -122.4194),
        ("Stop A", 37.7790, -122.4180),
        ("Stop B", 37.7680, -122.4300),
    ]

    route = compute_route(addresses)

    assert route, "Route should not be empty"
    assert route[0].label == "Origin"
    labels = {leg.label for leg in route}
    assert labels == {"Origin", "Stop A", "Stop B"}
    assert route[0].cumulative_distance_meters == 0.0
