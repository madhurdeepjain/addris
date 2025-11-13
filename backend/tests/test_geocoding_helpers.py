from app.services.geocoding import _compose_queries


def test_compose_queries_generates_zip_fallbacks():
    parsed = {
        "house_number": "609",
        "road": "Castle Ridge Rd",
        "city": "Austin",
        "state": "TX",
        "postcode": "78746-5147",
    }

    queries = _compose_queries(parsed, "609 Castle Ridge Rd Austin TX 78746-5147")

    assert queries, "Expected at least one query"
    joined = " | ".join(queries)
    assert "78746-5147" in joined
    assert "78746" in joined, "Should include base ZIP fallback"


def test_compose_queries_handles_missing_components():
    parsed = {"city": "Austin", "state": "TX"}

    queries = _compose_queries(parsed, "Austin TX")

    assert queries[0] == "Austin, TX"
    assert queries[-1] == "Austin TX"
