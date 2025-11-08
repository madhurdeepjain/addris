from app.parsing.address_parser import parse_address


def test_parse_address_basic():
    text = "123 Main Street, Springfield, IL 62704"
    parsed = parse_address(text)
    assert parsed is not None
    assert parsed.get("house_number") == "123"
    assert "main" in parsed.get("road", "").lower()
    assert parsed.get("postcode") == "62704"
