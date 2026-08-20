"""ビルドの結合テスト。リポジトリ内の実際の site/ を材料に生成する。"""

import json
import re
from pathlib import Path

import pytest

from seo_meo.site import build as site_build

SITE_ROOT = Path(__file__).resolve().parents[1] / "site"
BASE_URL = "https://example.jp"


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    out = tmp_path_factory.mktemp("dist")
    result = site_build.build(SITE_ROOT, out, base_url=BASE_URL)
    return result, out


def read(out: Path, path: str) -> str:
    return (out / path).read_text(encoding="utf-8")


def jsonld(html: str) -> dict:
    match = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
    assert match, "JSON-LD が出力されていません"
    return json.loads(match.group(1))


def test_expected_pages_are_generated(built):
    _, out = built
    for path in [
        "index.html",
        "services/index.html",
        "works/index.html",
        "blog/index.html",
        "about/index.html",
        "contact/index.html",
        "404.html",
        "sitemap.xml",
        "robots.txt",
        "assets/style.css",
    ]:
        assert (out / path).exists(), path


def test_urls_end_in_a_slash_not_an_extension(built):
    """URL は後から変えると評価を失うので、最初から拡張子を出さない形にする。"""
    _, out = built
    assert (out / "blog" / "2026-06-mitsumori-no-mikata" / "index.html").exists()
    assert not (out / "blog" / "2026-06-mitsumori-no-mikata.html").exists()


def test_assets_are_copied(built):
    _, out = built
    assert (out / "assets" / "works" / "example-before.svg").exists()
    assert (out / "assets" / "favicon.svg").exists()


def test_base_url_override_reaches_canonical_and_sitemap(built):
    _, out = built
    assert f'<link rel="canonical" href="{BASE_URL}/">' in read(out, "index.html")
    assert f"<loc>{BASE_URL}/</loc>" in read(out, "sitemap.xml")


def test_every_page_has_a_canonical_and_a_description(built):
    _, out = built
    for path in out.rglob("index.html"):
        html = path.read_text(encoding="utf-8")
        assert '<link rel="canonical"' in html, path
        assert re.search(r'<meta name="description" content=".+?">', html), path


def test_home_page_json_ld_is_valid(built):
    _, out = built
    payload = jsonld(read(out, "index.html"))
    types = [node["@type"] for node in payload["@graph"]]
    assert types[0] == "HousePainter"
    assert "WebSite" in types
    assert types.count("Service") == 4


def test_article_pages_carry_breadcrumbs_and_article_markup(built):
    _, out = built
    payload = jsonld(read(out, "blog/2026-06-mitsumori-no-mikata/index.html"))
    types = [node["@type"] for node in payload["@graph"]]
    assert "BreadcrumbList" in types
    assert "BlogPosting" in types


def test_work_pages_carry_article_markup(built):
    _, out = built
    payload = jsonld(read(out, "works/2026-04-example/index.html"))
    assert "Article" in [node["@type"] for node in payload["@graph"]]


def test_markdown_body_is_not_escaped(built):
    _, out = built
    html = read(out, "blog/2026-06-mitsumori-no-mikata/index.html")
    assert "<strong>" in html
    assert "&lt;strong&gt;" not in html


def test_phone_number_is_a_tap_to_call_link(built):
    """来店より電話が主な問い合わせ手段。スマホでタップ発信できる必要がある。"""
    _, out = built
    assert re.search(r'href="tel:\+?\d', read(out, "index.html"))


def test_sitemap_lists_every_generated_page(built):
    _, out = built
    sitemap = read(out, "sitemap.xml")
    generated = {
        "/" + str(path.parent.relative_to(out)).replace(".", "") + "/"
        for path in out.rglob("index.html")
    }
    generated = {"/" if url == "//" else url for url in generated}
    for url in generated:
        assert f"<loc>{BASE_URL}{url}</loc>" in sitemap, url


def test_sitemap_carries_lastmod_for_dated_content(built):
    _, out = built
    assert "<lastmod>2026-06-09</lastmod>" in read(out, "sitemap.xml")


def test_robots_points_at_the_sitemap(built):
    _, out = built
    assert f"Sitemap: {BASE_URL}/sitemap.xml" in read(out, "robots.txt")


def test_no_external_requests_in_the_markup(built):
    """外部CDN/フォントを読むと表示が遅くなる。自己完結を保つ。"""
    _, out = built
    html = read(out, "index.html")
    urls = re.findall(r'(?:src|href)="(https?://[^"]+)"', html)
    # canonical と og:url は自サイトを指す絶対URLなので対象外
    third_party = [url for url in urls if not url.startswith(BASE_URL)]
    assert third_party == [], third_party


def test_build_warns_about_unfilled_placeholders(built):
    """実在しない住所・電話番号がそのまま公開されるのを防ぐ。"""
    result, _ = built
    assert any("company.toml の phone" in w for w in result.warnings)


def test_build_is_repeatable(tmp_path):
    first = site_build.build(SITE_ROOT, tmp_path / "d", base_url=BASE_URL)
    second = site_build.build(SITE_ROOT, tmp_path / "d", base_url=BASE_URL)
    assert sorted(first.written) == sorted(second.written)


def test_clean_removes_files_from_a_previous_build(tmp_path):
    out = tmp_path / "d"
    site_build.build(SITE_ROOT, out, base_url=BASE_URL)
    stale = out / "old" / "index.html"
    stale.parent.mkdir(parents=True)
    stale.write_text("古い", encoding="utf-8")

    site_build.build(SITE_ROOT, out, base_url=BASE_URL)
    assert not stale.exists()


def test_missing_base_url_is_reported(tmp_path):
    result = site_build.build(SITE_ROOT, tmp_path / "d", base_url="")
    assert any("base_url" in warning for warning in result.warnings)
