"""構造化データ (JSON-LD) の生成。

塗装業に対応する schema.org の型は ``HousePainter``
(LocalBusiness → HomeAndConstructionBusiness → HousePainter)。
LocalBusiness のまま出すより具体的なほうが、Google に業種を正しく伝えられる。

ここで出す住所・電話番号は Google ビジネスプロフィールの登録内容と一致して
いる必要がある。ズレるとどちらの情報が正しいか判断できず、評価を損なう。
"""

from __future__ import annotations

import json
from typing import Any

from .content import Company, Content, Post, Service, SiteSettings, Work

# 検索結果でこの事業者を一意に指すための識別子。
# 複数ページの JSON-LD が同じ事業者を指していることを示すために使う。
ORGANIZATION_ID = "#organization"


def _absolute(settings: SiteSettings, path: str) -> str:
    return f"{settings.canonical_base}{path}"


def _clean(data: dict) -> dict:
    """空の値を落とす。未記入の項目を空文字のまま出さないため。"""
    result = {}
    for key, value in data.items():
        if value in ("", None, [], {}):
            continue
        result[key] = _clean(value) if isinstance(value, dict) else value
    return result


def organization(settings: SiteSettings, company: Company) -> dict:
    """事業者そのものを表すノード。全ページに埋める。"""
    return _clean(
        {
            "@type": "HousePainter",
            "@id": _absolute(settings, f"/{ORGANIZATION_ID}"),
            "name": company.name,
            "legalName": company.legal_name,
            "description": company.description,
            "url": settings.canonical_base + "/",
            "telephone": company.phone,
            "email": company.email,
            "priceRange": company.price_range,
            "address": _clean(
                {
                    "@type": "PostalAddress",
                    "postalCode": company.postal_code,
                    "addressRegion": company.prefecture,
                    "addressLocality": company.city,
                    "streetAddress": company.street_address,
                    "addressCountry": "JP",
                }
            ),
            "areaServed": [
                {"@type": "City", "name": area} for area in company.areas
            ],
            "openingHours": company.opening_hours_spec,
            "founder": (
                {"@type": "Person", "name": company.representative}
                if company.representative
                else None
            ),
            "foundingDate": company.established,
            "sameAs": [url for url in (company.gbp_url,) if url],
        }
    )


def website(settings: SiteSettings) -> dict:
    return _clean(
        {
            "@type": "WebSite",
            "@id": _absolute(settings, "/#website"),
            "name": settings.site_name,
            "description": settings.description,
            "url": settings.canonical_base + "/",
            "inLanguage": "ja",
            "publisher": {"@id": _absolute(settings, f"/{ORGANIZATION_ID}")},
        }
    )


def service_offer(settings: SiteSettings, company: Company, service: Service) -> dict:
    return _clean(
        {
            "@type": "Service",
            "name": service.name,
            "description": service.summary,
            "serviceType": service.name,
            "provider": {"@id": _absolute(settings, f"/{ORGANIZATION_ID}")},
            "areaServed": [{"@type": "City", "name": area} for area in company.areas],
        }
    )


def work_article(settings: SiteSettings, work: Work) -> dict:
    """施工事例。工事の記録なので Article として出す。"""
    images = [
        _absolute(settings, f"/assets/{path}")
        for path in (work.before_image, work.after_image, *work.images)
        if path
    ]
    return _clean(
        {
            "@type": "Article",
            "headline": work.title,
            "description": work.summary,
            "datePublished": work.date.isoformat(),
            "image": images,
            "author": {"@id": _absolute(settings, f"/{ORGANIZATION_ID}")},
            "publisher": {"@id": _absolute(settings, f"/{ORGANIZATION_ID}")},
            "mainEntityOfPage": _absolute(settings, work.url),
        }
    )


def blog_posting(settings: SiteSettings, post: Post) -> dict:
    return _clean(
        {
            "@type": "BlogPosting",
            "headline": post.title,
            "description": post.description,
            "datePublished": post.date.isoformat(),
            "keywords": post.tags,
            "author": {"@id": _absolute(settings, f"/{ORGANIZATION_ID}")},
            "publisher": {"@id": _absolute(settings, f"/{ORGANIZATION_ID}")},
            "mainEntityOfPage": _absolute(settings, post.url),
        }
    )


def breadcrumbs(settings: SiteSettings, trail: list[tuple[str, str]]) -> dict:
    """``[(表示名, パス), ...]`` からパンくずを作る。"""
    return {
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": index,
                "name": name,
                "item": _absolute(settings, path),
            }
            for index, (name, path) in enumerate(trail, start=1)
        ],
    }


def graph(content: Content, *nodes: dict | None) -> str:
    """1ページ分の JSON-LD を ``@graph`` 1つにまとめて文字列にする。

    複数の script タグに分けるより、@graph で1つにまとめて @id で相互参照する
    ほうが、事業者ノードの重複を避けられる。
    """
    settings = content.settings
    items: list[dict] = [
        organization(settings, content.company),
        website(settings),
    ]
    items += [node for node in nodes if node]

    payload: dict[str, Any] = {"@context": "https://schema.org", "@graph": items}
    return json.dumps(payload, ensure_ascii=False, indent=2)
