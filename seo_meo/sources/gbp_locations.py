"""拠点ID (location_id) を調べるためのクライアント。

Performance API が要求する ``locations/{id}`` の id は、ビジネスプロフィール
管理画面の URL からは読み取れない。Account Management API と Business
Information API を順に叩いて一覧するのが確実な方法。

初期設定で1回使うだけなので、ページングは素直に全件回している。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .base import request_json

ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"
LOCATIONS_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"

# Business Information API は readMask 必須。必要な項目だけ要求する。
LOCATION_READ_MASK = "name,title,storefrontAddress"


@dataclass(frozen=True)
class Account:
    name: str  # "accounts/123"
    display_name: str


@dataclass(frozen=True)
class Location:
    name: str  # "locations/456"
    title: str
    address: str

    @property
    def location_id(self) -> str:
        return self.name.split("/")[-1]


def list_accounts(session: Any) -> list[Account]:
    """アクセスできるアカウントを列挙する。"""
    accounts: list[Account] = []
    page_token: str | None = None
    while True:
        params: list[tuple[str, Any]] = [("pageSize", 20)]
        if page_token:
            params.append(("pageToken", page_token))
        payload = request_json(session, ACCOUNTS_URL, params)
        accounts.extend(parse_accounts(payload))
        page_token = payload.get("nextPageToken")
        if not page_token:
            return accounts


def parse_accounts(payload: dict) -> list[Account]:
    return [
        Account(name=entry["name"], display_name=entry.get("accountName", ""))
        for entry in payload.get("accounts", [])
        if entry.get("name")
    ]


def list_locations(session: Any, account_name: str) -> list[Location]:
    """1アカウント配下の拠点を列挙する。"""
    url = f"{LOCATIONS_BASE}/{account_name}/locations"
    locations: list[Location] = []
    page_token: str | None = None
    while True:
        params: list[tuple[str, Any]] = [
            ("readMask", LOCATION_READ_MASK),
            ("pageSize", 100),
        ]
        if page_token:
            params.append(("pageToken", page_token))
        payload = request_json(session, url, params)
        locations.extend(parse_locations(payload))
        page_token = payload.get("nextPageToken")
        if not page_token:
            return locations


def parse_locations(payload: dict) -> list[Location]:
    return [
        Location(
            name=entry["name"],
            title=entry.get("title", ""),
            address=format_address(entry.get("storefrontAddress")),
        )
        for entry in payload.get("locations", [])
        if entry.get("name")
    ]


def format_address(address: dict | None) -> str:
    """住所を1行にまとめる。非店舗型 (訪問対応のみ) だと住所が無いこともある。"""
    if not address:
        return ""
    parts = [
        address.get("postalCode", ""),
        address.get("administrativeArea", ""),
        address.get("locality", ""),
        *address.get("addressLines", []),
    ]
    return " ".join(part for part in parts if part)
