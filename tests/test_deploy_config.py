"""公開設定 (wrangler.toml) の取り違えを防ぐためのテスト。

Cloudflare は wrangler.toml の name で更新先の Worker を決める。ここがずれると
既存のサイトが更新されず、別の Worker が黙って新規作成されるだけで、しかも
エラーにならない。気づくのは「更新したのにサイトが変わらない」と言われてから
なので、テストで固定しておく。
"""

import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
WRANGLER = REPO_ROOT / "wrangler.toml"

# Cloudflare 上で稼働している Worker 名。変更するときは Cloudflare 側の
# Worker 名も同時に変えること。
WORKER_NAME = "orange-boat-b4db"


def _config():
    with WRANGLER.open("rb") as fp:
        return tomllib.load(fp)


def test_worker_name_matches_the_deployed_worker():
    assert _config()["name"] == WORKER_NAME


def test_assets_directory_is_the_build_output():
    assert _config()["assets"]["directory"] == "./dist"


def test_build_output_is_committed():
    # dist/ を .gitignore し直すと、Cloudflare が公開するものが無くなる。
    assert (REPO_ROOT / "dist" / "index.html").exists()


def test_dist_is_not_ignored():
    ignored = (REPO_ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
    assert "dist/" not in [line.strip() for line in ignored]


def test_committed_build_is_up_to_date(tmp_path):
    """`site/` を直したのに `dist/` を作り直さず commit する事故を防ぐ。

    Cloudflare は `dist/` をそのまま配信するので、ここが古いと「更新したのに
    サイトが変わらない」という、原因の分かりにくい形で表面化する。
    """
    from seo_meo.site import build as site_build

    fresh = tmp_path / "dist"
    site_build.build(REPO_ROOT / "site", fresh)

    committed = REPO_ROOT / "dist"
    relative = lambda root: {  # noqa: E731
        path.relative_to(root) for path in root.rglob("*") if path.is_file()
    }
    assert relative(fresh) == relative(committed), "dist/ のファイル構成が古い"

    stale = [
        str(name)
        for name in sorted(relative(fresh))
        if (fresh / name).read_bytes() != (committed / name).read_bytes()
    ]
    assert not stale, f"dist/ の内容が古い（seo-meo site-build をやり直す）: {stale}"


def test_worker_entry_point_exists():
    """フォームの受け口。main が無いと /api/contact が 404 になる。"""
    config = _config()
    assert config["main"] == "worker/index.js"
    assert (REPO_ROOT / "worker" / "index.js").exists()


def test_worker_can_reach_the_static_assets():
    """binding が無いと、Worker からサイト本体を返せずに全ページが落ちる。"""
    assert _config()["assets"]["binding"] == "ASSETS"


def test_mail_binding_and_addresses_are_configured():
    """フォームの送信先。バインディング名は worker/index.js と揃える。"""
    config = _config()
    assert [b["name"] for b in config["send_email"]] == ["CONTACT_MAIL"]

    worker = (REPO_ROOT / "worker" / "index.js").read_text(encoding="utf-8")
    assert "env.CONTACT_MAIL" in worker
    for key in ("CONTACT_FROM", "CONTACT_TO"):
        assert config["vars"][key], key
        assert f"env.{key}" in worker, key


def test_worker_does_not_load_anything_from_npm():
    """npm の依存を入れると、Cloudflare 側でのビルドが必要になる。
    cloudflare: で始まる組み込みモジュールだけで書くこと。"""
    import re

    worker = (REPO_ROOT / "worker" / "index.js").read_text(encoding="utf-8")
    imports = re.findall(r'^import .*? from "([^"]+)";', worker, re.M)
    assert imports == ["cloudflare:email"], imports
