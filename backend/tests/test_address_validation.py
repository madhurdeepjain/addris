from app.services.parsing import validate_parsed_address


def test_validator_accepts_common_address():
    parsed = {
        "house_number": "1",
        "road": "Science Pk",
        "city": "Boston",
        "state": "MA",
        "postcode": "02114",
    }
    result = validate_parsed_address(parsed, "1 Science Pk, Boston, MA 02114")

    assert result.is_valid
    assert result.components is not None
    assert result.components.get("road") == "Science Pk"


def test_validator_allows_shipping_label_with_real_address():
    parsed = {
        "house_number": "609",
        "road": "Castle Ridge Rd",
        "city": "Austin",
        "state": "TX",
        "postcode": "78746-5147",
    }
    raw_text = (
        "PRIORITY MAIL TM MARKY'S STORE 0005 509 CASTLE RIDGE RD AUSTIN TX 78746-5147"
    )

    result = validate_parsed_address(parsed, raw_text)

    assert result.is_valid
    assert result.components is not None
    assert result.components["postcode"] == "78746-5147"


def test_validator_rejects_tracking_labels():
    parsed = {"house_number": "Tracking"}
    result = validate_parsed_address(parsed, "USPS Tracking #9400 1000 0000 0000 0000")

    assert not result.is_valid
    assert result.reason is not None


def test_validator_requires_address_structure():
    parsed = {"city": "Hopkinton", "state": "MA"}
    result = validate_parsed_address(parsed, "Hopkinton MA")

    assert not result.is_valid
    assert result.reason == "Missing essential address parts"
