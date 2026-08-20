"""取得元に共通のエラーと補助関数。"""

from __future__ import annotations

import time
from typing import Any, Callable

# 一時的な失敗とみなして再試行するステータス。
RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


class ApiError(Exception):
    """API 呼び出しが失敗したとき。"""

    def __init__(self, status: int, message: str, url: str = "") -> None:
        self.status = status
        self.url = url
        super().__init__(message)


class AccessNotGrantedError(ApiError):
    """API は叩けたが権限が無いとき (403)。

    Business Profile API はプロジェクト単位で Google の利用申請・承認が必要。
    未承認だとここに落ちるので、原因をメッセージで明示する。
    """


def request_json(
    session: Any,
    url: str,
    params: list[tuple[str, Any]] | None = None,
    *,
    max_attempts: int = 4,
    sleep: Callable[[float], None] = time.sleep,
) -> dict:
    """GET して JSON を返す。一時エラーは指数バックオフで再試行する。"""
    delay = 2.0
    last: ApiError | None = None

    for attempt in range(1, max_attempts + 1):
        response = session.get(url, params=params)
        status = response.status_code

        if status == 200:
            return response.json()

        body = _short_body(response)
        if status == 403:
            raise AccessNotGrantedError(
                status,
                "403 Forbidden: Business Profile API の利用が承認されていないか、"
                "このアカウントに拠点の管理権限がありません。"
                f"\nURL: {url}\n応答: {body}",
                url,
            )
        if status == 404:
            raise ApiError(
                status,
                f"404 Not Found: location_id が正しいか確認してください。\nURL: {url}",
                url,
            )

        last = ApiError(status, f"HTTP {status}: {body}\nURL: {url}", url)
        if status not in RETRYABLE_STATUS or attempt == max_attempts:
            raise last

        sleep(delay)
        delay *= 2

    raise last if last else ApiError(0, "リクエストに失敗しました", url)


def _short_body(response: Any, limit: int = 500) -> str:
    text = getattr(response, "text", "") or ""
    return text[:limit]
