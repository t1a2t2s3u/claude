"""Google OAuth 2.0 の認証。

Business Profile API は ``business.manage`` スコープのユーザー認証が必要で、
サービスアカウントでは (ドメイン全体の委任を除いて) 使えない。そのため初回
だけブラウザで同意し、取得したリフレッシュトークンをファイルに保存して以降
は無人で回す。

google-auth 系のパッケージは実際に認証するときだけ要るので、import は関数の
中に置いている (サンプルデータだけ触る間は未インストールでも動く)。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

SCOPES = ["https://www.googleapis.com/auth/business.manage"]


class AuthError(Exception):
    """認証情報が用意できないとき。"""


def _import_google() -> tuple[Any, Any, Any]:
    try:
        from google.auth.transport.requests import AuthorizedSession, Request
        from google.oauth2.credentials import Credentials
    except ImportError as exc:  # pragma: no cover - 依存の有無に依存
        raise AuthError(
            "google-auth が見つかりません。`pip install -e .` で依存を入れてください。"
        ) from exc
    return AuthorizedSession, Request, Credentials


def login(client_secret_file: Path, token_file: Path) -> Path:
    """ブラウザで同意を取り、トークンを保存する。初回のみ手動で実行する。"""
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError as exc:  # pragma: no cover - 依存の有無に依存
        raise AuthError(
            "google-auth-oauthlib が見つかりません。`pip install -e .` を実行してください。"
        ) from exc

    if not client_secret_file.exists():
        raise AuthError(
            f"クライアントシークレットがありません: {client_secret_file}\n"
            "Google Cloud コンソールで OAuth クライアント (デスクトップ) を作成し、"
            "JSON をこのパスに置いてください。"
        )

    flow = InstalledAppFlow.from_client_secrets_file(str(client_secret_file), SCOPES)
    credentials = flow.run_local_server(port=0)

    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(credentials.to_json(), encoding="utf-8")
    token_file.chmod(0o600)
    return token_file


def authorized_session(token_file: Path) -> Any:
    """保存済みトークンから認証済みセッションを作る。期限切れなら更新する。"""
    AuthorizedSession, Request, Credentials = _import_google()

    if not token_file.exists():
        raise AuthError(
            f"トークンがありません: {token_file}\n"
            "先に `seo-meo auth-login` を実行してください。"
        )

    credentials = Credentials.from_authorized_user_file(str(token_file), SCOPES)
    if not credentials.valid:
        if credentials.expired and credentials.refresh_token:
            credentials.refresh(Request())
            token_file.write_text(credentials.to_json(), encoding="utf-8")
        else:
            raise AuthError(
                "トークンが無効です。`seo-meo auth-login` で取り直してください。"
            )

    return AuthorizedSession(credentials)
