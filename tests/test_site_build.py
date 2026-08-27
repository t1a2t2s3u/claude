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


def site_pages(out: Path):
    """サイトとして生成したページ。同梱ツール (/kabekarute/) は
    サイトのコンテンツではないので、SEO 系の検査からは外す。"""
    return (p for p in out.rglob("index.html") if "kabekarute" not in p.parts)


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
        "faq/index.html",
        "404.html",
        "sitemap.xml",
        "robots.txt",
        "assets/style.css",
    ]:
        assert (out / path).exists(), path


def test_faq_page_has_faqpage_jsonld_matching_the_toml(built):
    _, out = built
    from seo_meo.site.content import load_faq

    faq = load_faq(SITE_ROOT)
    assert faq, "faq.toml が空"
    data = jsonld(read(out, "faq/index.html"))
    node = next(n for n in data["@graph"] if n.get("@type") == "FAQPage")
    assert len(node["mainEntity"]) == len(faq)
    assert node["mainEntity"][0]["name"] == faq[0].question


def test_faq_is_linked_from_navigation_and_sitemap(built):
    _, out = built
    assert 'href="/faq/"' in read(out, "index.html")
    assert f"{BASE_URL}/faq/" in read(out, "sitemap.xml")


def test_urls_end_in_a_slash_not_an_extension(built):
    """URL は後から変えると評価を失うので、最初から拡張子を出さない形にする。"""
    _, out = built
    from seo_meo.site.content import load_posts

    posts = load_posts(SITE_ROOT)
    assert posts, "記事が1本も無い"
    for post in posts:
        assert (out / "blog" / post.slug / "index.html").exists(), post.slug
        assert not (out / "blog" / f"{post.slug}.html").exists(), post.slug


def test_assets_are_copied(built):
    _, out = built
    assert (out / "assets" / "favicon.svg").exists()
    assert (out / "assets" / "style.css").exists()


def test_every_referenced_photo_exists(built):
    """施工事例が指している画像が実在すること。

    ファイル名の打ち間違いは、公開してから画像が出ないことで気づく類の
    ミスなので、ビルド時に落とす。
    """
    _, out = built
    from seo_meo.site.content import load_works

    for work in load_works(SITE_ROOT):
        for path in work.all_images:
            assert (out / "assets" / path).exists(), f"{work.slug}: {path}"


def test_base_url_override_reaches_canonical_and_sitemap(built):
    _, out = built
    assert f'<link rel="canonical" href="{BASE_URL}/">' in read(out, "index.html")
    assert f"<loc>{BASE_URL}/</loc>" in read(out, "sitemap.xml")


def test_every_page_has_a_canonical_and_a_description(built):
    _, out = built
    for path in site_pages(out):
        html = path.read_text(encoding="utf-8")
        assert '<link rel="canonical"' in html, path
        assert re.search(r'<meta name="description" content=".+?">', html), path


def test_home_page_json_ld_is_valid(built):
    """トップには、事業者・サイト・全サービスが出ていること。"""
    _, out = built
    from seo_meo.site.content import load_services

    payload = jsonld(read(out, "index.html"))
    types = [node["@type"] for node in payload["@graph"]]
    assert types[0] == "HousePainter"
    assert "WebSite" in types
    assert types.count("Service") == len(load_services(SITE_ROOT))


def test_article_pages_carry_breadcrumbs_and_article_markup(built):
    _, out = built
    from seo_meo.site.content import load_posts

    posts = load_posts(SITE_ROOT)
    assert posts, "記事が1本も無い"
    for post in posts:
        payload = jsonld(read(out, f"blog/{post.slug}/index.html"))
        types = [node["@type"] for node in payload["@graph"]]
        assert "BreadcrumbList" in types, post.slug
        assert "BlogPosting" in types, post.slug


def test_work_pages_carry_article_markup(built):
    _, out = built
    from seo_meo.site.content import load_works

    works = load_works(SITE_ROOT)
    assert works, "施工事例が1件も無い"
    for work in works:
        payload = jsonld(read(out, f"{work.url.strip('/')}/index.html"))
        assert "Article" in [node["@type"] for node in payload["@graph"]], work.slug


def test_markdown_body_is_not_escaped(built):
    """Markdown の書式が、そのまま文字として出てしまわないこと。"""
    _, out = built
    from seo_meo.site.content import load_posts

    slug = load_posts(SITE_ROOT)[0].slug
    html = read(out, f"blog/{slug}/index.html")
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
        for path in site_pages(out)
    }
    generated = {"/" if url == "//" else url for url in generated}
    for url in generated:
        assert f"<loc>{BASE_URL}{url}</loc>" in sitemap, url


def test_sitemap_carries_lastmod_for_dated_content(built):
    """日付のあるページには更新日を出す。検索エンジンが新しさを判断できる。"""
    _, out = built
    from seo_meo.site.content import load_posts, load_works

    sitemap = read(out, "sitemap.xml")
    for item in load_posts(SITE_ROOT) + load_works(SITE_ROOT):
        assert f"<lastmod>{item.date.isoformat()}</lastmod>" in sitemap, item.slug


def test_robots_points_at_the_sitemap(built):
    _, out = built
    assert f"Sitemap: {BASE_URL}/sitemap.xml" in read(out, "robots.txt")


def test_kabekarute_apps_are_bundled_but_not_indexed(built):
    """カベカルテはURLで配る（ファイル直開きはスマホでJSが動かない）。
    ただしサイトのコンテンツではないので、検索対象からは外す。"""
    _, out = built
    for page in ["kabekarute/index.html", "kabekarute/shindan/index.html",
                 "kabekarute/color/index.html", "kabekarute/kanko/index.html"]:
        assert (out / page).exists(), page
        assert 'name="robots" content="noindex"' in read(out, page), page
    assert "Disallow: /kabekarute/" in read(out, "robots.txt")
    assert "kabekarute" not in read(out, "sitemap.xml")


def test_no_external_resources_are_loaded(built):
    """外部CDN/フォント/画像を読むと表示が遅くなる。自己完結を保つ。

    対象は読み込みを伴うものだけ。<a> の外部リンク (Instagram など) は
    リクエストを発生させないので数えない。
    """
    _, out = built
    for path in out.rglob("index.html"):
        html = path.read_text(encoding="utf-8")
        loaded = re.findall(r'<(?:script|img|iframe)[^>]+src="(https?://[^"]+)"', html)
        loaded += re.findall(r'<link[^>]+href="(https?://[^"]+)"', html)
        external = [url for url in loaded if not url.startswith(BASE_URL)]
        assert external == [], (path.name, external)


def test_build_warns_about_unfilled_placeholders(tmp_path):
    """実在しない住所・電話番号がそのまま公開されるのを防ぐ。

    実際の site/ は記入が進むと未記入項目が減るため、コピーに印を入れて試す。
    """
    import shutil

    from seo_meo.site.content import PLACEHOLDER

    site = tmp_path / "site"
    shutil.copytree(SITE_ROOT, site)
    company = site / "company.toml"
    company.write_text(
        company.read_text(encoding="utf-8").replace(
            'phone = "', f'phone = "{PLACEHOLDER}', 1
        ),
        encoding="utf-8",
    )

    result = site_build.build(site, tmp_path / "d", base_url=BASE_URL)
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
    """公開URLが空だと canonical と sitemap が正しく出ない。"""
    import shutil

    site = tmp_path / "site"
    shutil.copytree(SITE_ROOT, site)
    config = site / "site.toml"
    config.write_text(
        re.sub(r'base_url = ".*"', 'base_url = ""', config.read_text(encoding="utf-8")),
        encoding="utf-8",
    )

    result = site_build.build(site, tmp_path / "d")
    assert any("base_url" in warning for warning in result.warnings)


def test_license_is_never_shown_when_not_held(built):
    """建設業許可を持っていないのに、あるように見せてはならない。

    持っていない許可を掲げるのは法令違反にあたる。license_number が空の
    ときは、どのページにも「建設業許可」の文字が出ないことを固定する。
    """
    _, out = built
    from seo_meo.site.content import load_company

    if load_company(SITE_ROOT).license_number:
        pytest.skip("許可番号が記入されているため、この不変条件は対象外")

    # ブログ記事は業界の一般論として許可制度に触れるため対象外。
    # ここで防ぎたいのは、自社の紹介として許可を掲げてしまうこと。
    for path in out.rglob("*.html"):
        if "blog" in path.parts:
            continue
        assert "建設業許可" not in path.read_text(encoding="utf-8"), path


def test_testimonials_are_shown_on_the_home_page(built):
    _, out = built
    html = read(out, "index.html")
    assert "お客様の声" in html
    assert "新築みたいに綺麗になって感動しました" in html


def test_testimonials_are_never_marked_up_as_reviews(built):
    """自社サイトに載せた自社への評価に Review 構造化データは付けられない。

    Google のガイドラインで認められていないため、表示のみで扱う。
    """
    _, out = built
    for path in site_pages(out):
        payload = jsonld(path.read_text(encoding="utf-8"))
        types = {node.get("@type") for node in payload["@graph"]}
        assert "Review" not in types, path
        assert "AggregateRating" not in types, path
        assert "aggregateRating" not in json.dumps(payload), path


def test_discontinued_bonus_is_not_advertised(built):
    """終了した特典を出したままにすると、景品表示法上の問題になり得る。"""
    _, out = built
    from seo_meo.site.content import load_plan

    plan = load_plan(SITE_ROOT)
    if plan and plan.bonus_options:
        pytest.skip("特典が設定されているため対象外")

    for path in out.rglob("*.html"):
        text = path.read_text(encoding="utf-8")
        assert "レンジフード清掃" not in text, path
        assert "契約者特典" not in text, path


def test_prices_are_labelled_tax_inclusive(built):
    """消費者向けの価格表示は税込である必要がある (消費税法第63条)。"""
    _, out = built
    assert "税込" in read(out, "services/index.html")


def test_every_package_shows_its_warranty(built):
    """保証年数は塗料ごとに違う。表から落ちると「最大5年」しか伝わらない。"""
    from seo_meo.site import content as content_mod

    _, out = built
    html = read(out, "services/index.html")
    packages = content_mod.load_packages(SITE_ROOT)
    assert packages
    for package in packages:
        assert package.warranty, f"{package.name} に warranty が無い"
        assert f'<td class="pt-warranty">{package.warranty}</td>' in html


def test_generated_html_tags_are_balanced(built):
    """開いたタグが必ず閉じていること。

    テンプレートを編集したときに閉じタグを入れ忘れると、表示が崩れる。
    ブラウザは黙って補正するので気づきにくい。
    """
    from html.parser import HTMLParser

    VOID = {
        "area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "source", "track", "wbr",
    }

    class Checker(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.stack: list[str] = []
            self.errors: list[str] = []

        def handle_starttag(self, tag, attrs):
            if tag not in VOID:
                self.stack.append(tag)

        def handle_endtag(self, tag):
            if tag in VOID:
                return
            if not self.stack:
                self.errors.append(f"余分な </{tag}>")
            elif self.stack[-1] != tag:
                self.errors.append(f"</{tag}> が来たが、開いているのは <{self.stack[-1]}>")
            else:
                self.stack.pop()

    _, out = built
    for path in sorted(out.rglob("*.html")):
        checker = Checker()
        checker.feed(path.read_text(encoding="utf-8"))
        assert not checker.errors, f"{path.name}: {checker.errors}"
        assert not checker.stack, f"{path.name}: 閉じられていないタグ {checker.stack}"


def test_internal_links_all_resolve(built):
    """サイト内のリンクが、実在するページを指していること。

    記事が増えるほどリンク切れは起きやすい。訪問者を行き止まりに
    追い込むうえ、検索評価の面でも損をするので、ビルド時に落とす。
    """
    _, out = built
    broken: list[str] = []

    for path in sorted(out.rglob("*.html")):
        html = path.read_text(encoding="utf-8")
        for href in set(re.findall(r'href="(/[^"]*)"', html)):
            href = href.split("#")[0]
            if not href:
                continue
            if href.endswith("/"):
                target = out / href.strip("/") / "index.html"
            else:
                target = out / href.lstrip("/")
            if not target.exists():
                broken.append(f"{path.name} → {href}")

    assert not broken, f"リンク切れ: {broken}"
