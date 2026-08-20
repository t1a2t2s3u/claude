import json
from datetime import date

from seo_meo.site import structured
from seo_meo.site.content import (
    BeforeAfter,
    Company,
    Content,
    Package,
    Post,
    Service,
    SiteSettings,
    Work,
)

SETTINGS = SiteSettings(
    site_name="辰弥塗装工業",
    base_url="https://example.jp",
    description="外壁塗装・屋根塗装",
)

COMPANY = Company(
    name="辰弥塗装工業",
    legal_name="辰弥塗装工業",
    tagline="住まいを、次の20年へ。",
    description="外壁塗装の専門店",
    postal_code="000-0000",
    prefecture="〇〇県",
    city="〇〇市",
    street_address="〇〇町1-2-3",
    phone="06-1234-5678",
    email="",
    representative="山田太郎",
    established="2005年",
    license_number="〇〇県知事許可 第00000号",
    business_hours="8:00〜18:00",
    holidays="日曜",
    areas=["〇〇市", "△△市"],
    opening_hours_spec=["Mo-Sa 08:00-18:00"],
    price_range="¥¥",
)

CONTENT = Content(
    settings=SETTINGS,
    company=COMPANY,
    services=[
        Service(
            slug="gaiheki",
            name="外壁塗装",
            summary="足場から3回塗りまで",
            duration="12日",
            in_package=True,
        )
    ],
    packages=[Package(name="シリコン塗料", durability="約7年", price="84万円")],
    plan=None,
    testimonials=[],
    works=[],
    posts=[],
    pages=[],
)


def test_organization_uses_the_house_painter_type():
    """塗装業に対応する schema.org の型。LocalBusiness より具体的。"""
    org = structured.organization(SETTINGS, COMPANY)
    assert org["@type"] == "HousePainter"
    assert org["@id"] == "https://example.jp/#organization"


def test_organization_address_matches_company_fields():
    address = structured.organization(SETTINGS, COMPANY)["address"]
    assert address == {
        "@type": "PostalAddress",
        "postalCode": "000-0000",
        "addressRegion": "〇〇県",
        "addressLocality": "〇〇市",
        "streetAddress": "〇〇町1-2-3",
        "addressCountry": "JP",
    }


def test_area_served_lists_every_area():
    org = structured.organization(SETTINGS, COMPANY)
    assert [area["name"] for area in org["areaServed"]] == ["〇〇市", "△△市"]


def test_empty_fields_are_omitted_not_emitted_blank():
    """未入力の項目を空文字で出すと、構造化データとして不正になる。"""
    org = structured.organization(SETTINGS, COMPANY)
    assert "email" not in org
    assert "sameAs" not in org


def test_same_as_includes_the_business_profile_when_set():
    company = Company(**{**vars(COMPANY), "gbp_url": "https://maps.google.com/x"})
    assert structured.organization(SETTINGS, company)["sameAs"] == [
        "https://maps.google.com/x"
    ]


def test_service_references_the_organization_by_id():
    node = structured.service_offer(SETTINGS, COMPANY, CONTENT.services[0])
    assert node["@type"] == "Service"
    assert node["provider"] == {"@id": "https://example.jp/#organization"}


def test_work_article_collects_images_as_absolute_urls():
    work = Work(
        slug="a",
        title="K様邸",
        date=date(2026, 4, 15),
        area="〇〇市",
        service="外壁塗装",
        summary="概要",
        body_html="<p>本文</p>",
        pairs=[
            BeforeAfter(label="屋根", before="works/a-yane-before.jpg", after="works/a-yane-after.jpg"),
            BeforeAfter(label="外壁", before="works/a-kabe-before.jpg", after="works/a-kabe-after.jpg"),
        ],
        images=["works/a-1.jpg"],
    )
    node = structured.work_article(SETTINGS, work)
    assert node["image"] == [
        "https://example.jp/assets/works/a-yane-before.jpg",
        "https://example.jp/assets/works/a-yane-after.jpg",
        "https://example.jp/assets/works/a-kabe-before.jpg",
        "https://example.jp/assets/works/a-kabe-after.jpg",
        "https://example.jp/assets/works/a-1.jpg",
    ]
    assert node["mainEntityOfPage"] == "https://example.jp/works/a/"


def test_blog_posting():
    post = Post(
        slug="p",
        title="記事",
        date=date(2026, 5, 12),
        description="説明",
        body_html="<p>本文</p>",
        tags=["費用"],
    )
    node = structured.blog_posting(SETTINGS, post)
    assert node["@type"] == "BlogPosting"
    assert node["datePublished"] == "2026-05-12"
    assert node["keywords"] == ["費用"]


def test_breadcrumbs_are_numbered_from_one():
    trail = [("ホーム", "/"), ("ブログ", "/blog/"), ("記事", "/blog/p/")]
    items = structured.breadcrumbs(SETTINGS, trail)["itemListElement"]
    assert [item["position"] for item in items] == [1, 2, 3]
    assert items[-1]["item"] == "https://example.jp/blog/p/"


def test_graph_is_valid_json_with_organization_and_website():
    payload = json.loads(structured.graph(CONTENT))
    assert payload["@context"] == "https://schema.org"
    types = [node["@type"] for node in payload["@graph"]]
    assert types == ["HousePainter", "WebSite"]


def test_graph_appends_extra_nodes_and_skips_none():
    payload = json.loads(
        structured.graph(
            CONTENT,
            structured.service_offer(SETTINGS, COMPANY, CONTENT.services[0]),
            None,
        )
    )
    assert [node["@type"] for node in payload["@graph"]] == [
        "HousePainter",
        "WebSite",
        "Service",
    ]


def test_placeholder_values_never_reach_structured_data():
    """未記入のまま公開されても、誤った情報を検索エンジンに渡さない。"""
    from seo_meo.site.content import PLACEHOLDER

    company = Company(
        **{
            **vars(COMPANY),
            "representative": f"{PLACEHOLDER}代表者名",
            "areas": ["秋田市", f"{PLACEHOLDER}〇〇市"],
        }
    )
    org = structured.organization(SETTINGS, company)

    assert "founder" not in org
    assert [area["name"] for area in org["areaServed"]] == ["秋田市"]
    assert PLACEHOLDER not in json.dumps(org, ensure_ascii=False)


def test_founding_date_is_machine_readable():
    """schema.org は ISO 形式の日付を期待する。表示用の「2021年」とは分ける。"""
    company = Company(**{**vars(COMPANY), "founded_on": "2021-04-01"})
    assert structured.organization(SETTINGS, company)["foundingDate"] == "2021-04-01"


def test_instagram_is_included_in_same_as():
    company = Company(
        **{**vars(COMPANY), "instagram_url": "https://www.instagram.com/example/"}
    )
    assert structured.organization(SETTINGS, company)["sameAs"] == [
        "https://www.instagram.com/example/"
    ]
