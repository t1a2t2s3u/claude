from seo_meo.sources.gbp_locations import (
    format_address,
    parse_accounts,
    parse_locations,
)


def test_parse_accounts():
    accounts = parse_accounts(
        {
            "accounts": [
                {"name": "accounts/111", "accountName": "辰弥塗装工業"},
                {"accountName": "名前なし"},  # name が無いものは無視
            ]
        }
    )
    assert len(accounts) == 1
    assert accounts[0].name == "accounts/111"
    assert accounts[0].display_name == "辰弥塗装工業"


def test_parse_locations_extracts_bare_id():
    locations = parse_locations(
        {
            "locations": [
                {
                    "name": "locations/9876543210",
                    "title": "辰弥塗装工業",
                    "storefrontAddress": {
                        "postalCode": "000-0000",
                        "administrativeArea": "〇〇県",
                        "locality": "〇〇市",
                        "addressLines": ["〇〇町1-2-3"],
                    },
                }
            ]
        }
    )
    assert locations[0].location_id == "9876543210"
    assert locations[0].address == "000-0000 〇〇県 〇〇市 〇〇町1-2-3"


def test_location_without_storefront_address():
    """訪問対応のみの事業者は住所が非公開で、storefrontAddress が返らない。"""
    locations = parse_locations(
        {"locations": [{"name": "locations/1", "title": "辰弥塗装工業"}]}
    )
    assert locations[0].address == ""


def test_format_address_skips_missing_parts():
    assert format_address({"locality": "〇〇市"}) == "〇〇市"
    assert format_address(None) == ""


def test_parse_empty_payloads():
    assert parse_accounts({}) == []
    assert parse_locations({}) == []
