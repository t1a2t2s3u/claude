"""サイトのコンテンツ読み込み。

会社情報とサービスは TOML、施工事例と記事は Markdown（TOML フロントマター付き）。
CMS を挟まないのは、更新頻度が月に数回で、そのために保守が必要なサーバーを
持つと割に合わないため。

未記入の項目は ``PLACEHOLDER`` を含む文字列のままにしておき、ビルド時に警告
する。実在しない住所や電話番号が公開されるのを防ぐための仕組み。
"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

FRONT_MATTER_DELIM = "+++"

# 未記入であることを示す印。この文字列を含む値はビルド時に警告される。
PLACEHOLDER = "【要記入】"


class ContentError(Exception):
    """コンテンツの読み込みに失敗したとき。"""


def is_placeholder(value: Any) -> bool:
    return isinstance(value, str) and PLACEHOLDER in value


@dataclass
class Company:
    """会社情報。

    ここに書いた住所・電話番号は、サイト表示と構造化データ (JSON-LD) の
    両方に使われる。Google ビジネスプロフィールの登録内容と一字一句そろえる
    こと。表記ゆれ (NAP のズレ) は MEO の減点要因になる。
    """

    name: str
    legal_name: str
    tagline: str
    description: str
    postal_code: str
    prefecture: str
    city: str
    street_address: str
    phone: str
    email: str
    representative: str
    established: str
    license_number: str
    business_hours: str
    holidays: str
    # 表示用の創業年 (established) とは別に、構造化データ用の ISO 形式の日付
    founded_on: str = ""
    areas: list[str] = field(default_factory=list)
    # トップページに並べる信頼材料。建設業許可や創業年で足りない分をここで補う
    trust_points: list[str] = field(default_factory=list)
    # 保有資格。建設業許可がない分、ここが技術力の裏づけになる
    qualifications: list[str] = field(default_factory=list)
    # 表示用の営業時間は自由文だが、構造化データには機械可読な形が要る。
    # 例: ["Mo-Fr 08:00-18:00", "Sa 08:00-17:00"]
    opening_hours_spec: list[str] = field(default_factory=list)
    price_range: str = ""
    gbp_url: str = ""
    instagram_url: str = ""
    line_url: str = ""
    map_embed_url: str = ""

    @property
    def full_address(self) -> str:
        return f"〒{self.postal_code} {self.prefecture}{self.city}{self.street_address}"

    @property
    def tel_link(self) -> str:
        """tel: リンク用に記号を落とした番号。スマホのタップ発信で使う。"""
        return "".join(ch for ch in self.phone if ch.isdigit() or ch == "+")


@dataclass
class SiteSettings:
    """サイト全体の設定。"""

    site_name: str
    base_url: str
    description: str
    locale: str = "ja_JP"
    contact_note: str = ""

    @property
    def canonical_base(self) -> str:
        return self.base_url.rstrip("/")


@dataclass
class Service:
    """対応する工事の種類。

    料金は工事ごとではなく塗料グレード別のパック料金で決まるため、
    価格は Package 側に持たせ、ここでは任意にしている。
    """

    slug: str
    name: str
    summary: str
    duration: str
    price_from: str = ""
    price_note: str = ""
    body_html: str = ""
    features: list[str] = field(default_factory=list)
    in_package: bool = False
    """パック料金に含まれる工事か。含まれないものは別途見積もり。"""


@dataclass
class Package:
    """塗料グレード別のパック料金。"""

    name: str
    durability: str
    price: str
    note: str = ""


@dataclass
class PackagePlan:
    """パック料金の前提条件。金額だけを出すと誤解を招くため必ず添える。"""

    basis: str
    warranty: str
    tax_note: str
    includes: list[str] = field(default_factory=list)
    bonus: str = ""
    bonus_options: list[str] = field(default_factory=list)


@dataclass
class Work:
    """施工事例。塗装業では最も問い合わせに繋がるコンテンツ。"""

    slug: str
    title: str
    date: date
    area: str
    service: str
    summary: str
    body_html: str
    building: str = ""
    duration: str = ""
    paint: str = ""
    price_range: str = ""
    before_image: str = ""
    after_image: str = ""
    images: list[str] = field(default_factory=list)

    @property
    def url(self) -> str:
        return f"/works/{self.slug}/"


@dataclass
class Post:
    slug: str
    title: str
    date: date
    description: str
    body_html: str
    tags: list[str] = field(default_factory=list)

    @property
    def url(self) -> str:
        return f"/blog/{self.slug}/"


@dataclass
class StaticPage:
    slug: str
    title: str
    description: str
    body_html: str

    @property
    def url(self) -> str:
        return f"/{self.slug}/"


@dataclass
class Content:
    """サイト生成に必要なもの一式。"""

    settings: SiteSettings
    company: Company
    services: list[Service]
    packages: list[Package]
    plan: PackagePlan | None
    works: list[Work]
    posts: list[Post]
    pages: list[StaticPage]

    def page(self, slug: str) -> StaticPage | None:
        return next((p for p in self.pages if p.slug == slug), None)


def split_front_matter(text: str) -> tuple[dict, str]:
    """``+++`` で囲んだ TOML フロントマターと本文に分ける。

    YAML ではなく TOML なのは、tomllib が標準ライブラリにあり、日付を
    そのまま date 型として読めるため（依存が1つ減る）。
    """
    stripped = text.lstrip()
    if not stripped.startswith(FRONT_MATTER_DELIM):
        return {}, text

    rest = stripped[len(FRONT_MATTER_DELIM) :]
    end = rest.find(f"\n{FRONT_MATTER_DELIM}")
    if end == -1:
        raise ContentError("フロントマターが閉じられていません (+++ が足りません)")

    front = rest[:end]
    body = rest[end + len(FRONT_MATTER_DELIM) + 1 :]
    try:
        return tomllib.loads(front), body.lstrip("\n")
    except tomllib.TOMLDecodeError as exc:
        raise ContentError(f"フロントマターの TOML が不正です: {exc}") from exc


def _render_markdown(body: str) -> str:
    import markdown as markdown_lib

    return markdown_lib.markdown(body, extensions=["extra", "sane_lists"])


def _summarise(body_html: str, limit: int = 110) -> str:
    """本文から一覧用の抜粋を作る。タグを落として先頭を切るだけ。"""
    import re

    text = re.sub(r"<[^>]+>", "", body_html)
    text = " ".join(text.split())
    return text[:limit] + ("…" if len(text) > limit else "")


def _load_toml(path: Path) -> dict:
    if not path.exists():
        raise ContentError(f"コンテンツが見つかりません: {path}")
    with path.open("rb") as fh:
        return tomllib.load(fh)


def load_settings(root: Path) -> SiteSettings:
    raw = _load_toml(root / "site.toml")
    site = raw.get("site", {})
    return SiteSettings(
        site_name=site.get("name", ""),
        base_url=site.get("base_url", ""),
        description=site.get("description", ""),
        locale=site.get("locale", "ja_JP"),
        contact_note=site.get("contact_note", ""),
    )


def load_company(root: Path) -> Company:
    raw = _load_toml(root / "company.toml")
    company = raw.get("company", {})
    return Company(
        name=company.get("name", ""),
        legal_name=company.get("legal_name", company.get("name", "")),
        tagline=company.get("tagline", ""),
        description=company.get("description", ""),
        postal_code=company.get("postal_code", ""),
        prefecture=company.get("prefecture", ""),
        city=company.get("city", ""),
        street_address=company.get("street_address", ""),
        phone=company.get("phone", ""),
        email=company.get("email", ""),
        representative=company.get("representative", ""),
        established=company.get("established", ""),
        founded_on=company.get("founded_on", ""),
        license_number=company.get("license_number", ""),
        business_hours=company.get("business_hours", ""),
        holidays=company.get("holidays", ""),
        areas=list(company.get("areas", [])),
        trust_points=list(company.get("trust_points", [])),
        qualifications=list(company.get("qualifications", [])),
        opening_hours_spec=list(company.get("opening_hours_spec", [])),
        price_range=company.get("price_range", ""),
        gbp_url=company.get("gbp_url", ""),
        instagram_url=company.get("instagram_url", ""),
        line_url=company.get("line_url", ""),
        map_embed_url=company.get("map_embed_url", ""),
    )


def load_services(root: Path) -> list[Service]:
    raw = _load_toml(root / "services.toml")
    services = []
    for entry in raw.get("service", []):
        services.append(
            Service(
                slug=entry["slug"],
                name=entry.get("name", ""),
                summary=entry.get("summary", ""),
                duration=entry.get("duration", ""),
                price_from=entry.get("price_from", ""),
                price_note=entry.get("price_note", ""),
                features=list(entry.get("features", [])),
                body_html=_render_markdown(entry.get("body", "")),
                in_package=bool(entry.get("in_package", False)),
            )
        )
    return services


def load_packages(root: Path) -> list[Package]:
    raw = _load_toml(root / "services.toml")
    return [
        Package(
            name=entry.get("name", ""),
            durability=entry.get("durability", ""),
            price=entry.get("price", ""),
            note=entry.get("note", ""),
        )
        for entry in raw.get("package", [])
    ]


def load_plan(root: Path) -> PackagePlan | None:
    raw = _load_toml(root / "services.toml")
    plan = raw.get("package_plan")
    if not plan:
        return None
    return PackagePlan(
        basis=plan.get("basis", ""),
        warranty=plan.get("warranty", ""),
        tax_note=plan.get("tax_note", ""),
        includes=list(plan.get("includes", [])),
        bonus=plan.get("bonus", ""),
        bonus_options=list(plan.get("bonus_options", [])),
    )


def load_works(root: Path) -> list[Work]:
    """施工事例を新しい順に読み込む。"""
    works: list[Work] = []
    for path in sorted((root / "works").glob("*.md")):
        front, body = split_front_matter(path.read_text(encoding="utf-8"))
        body_html = _render_markdown(body)
        works.append(
            Work(
                slug=path.stem,
                title=front.get("title", path.stem),
                date=_as_date(front.get("date"), path),
                area=front.get("area", ""),
                service=front.get("service", ""),
                summary=front.get("summary") or _summarise(body_html),
                body_html=body_html,
                building=front.get("building", ""),
                duration=front.get("duration", ""),
                paint=front.get("paint", ""),
                price_range=front.get("price_range", ""),
                before_image=front.get("before_image", ""),
                after_image=front.get("after_image", ""),
                images=list(front.get("images", [])),
            )
        )
    works.sort(key=lambda w: w.date, reverse=True)
    return works


def load_posts(root: Path) -> list[Post]:
    """記事を新しい順に読み込む。"""
    posts: list[Post] = []
    for path in sorted((root / "posts").glob("*.md")):
        front, body = split_front_matter(path.read_text(encoding="utf-8"))
        body_html = _render_markdown(body)
        posts.append(
            Post(
                slug=path.stem,
                title=front.get("title", path.stem),
                date=_as_date(front.get("date"), path),
                description=front.get("description") or _summarise(body_html),
                body_html=body_html,
                tags=list(front.get("tags", [])),
            )
        )
    posts.sort(key=lambda p: p.date, reverse=True)
    return posts


def load_pages(root: Path) -> list[StaticPage]:
    pages: list[StaticPage] = []
    for path in sorted((root / "pages").glob("*.md")):
        front, body = split_front_matter(path.read_text(encoding="utf-8"))
        body_html = _render_markdown(body)
        pages.append(
            StaticPage(
                slug=path.stem,
                title=front.get("title", path.stem),
                description=front.get("description") or _summarise(body_html),
                body_html=body_html,
            )
        )
    return pages


def _as_date(value: Any, path: Path) -> date:
    if isinstance(value, date):
        return value
    raise ContentError(
        f"{path.name}: フロントマターに date が必要です (例: date = 2026-04-15)"
    )


def load(root: Path) -> Content:
    """``site/`` 以下を丸ごと読み込む。"""
    return Content(
        settings=load_settings(root),
        company=load_company(root),
        services=load_services(root),
        packages=load_packages(root),
        plan=load_plan(root),
        works=load_works(root),
        posts=load_posts(root),
        pages=load_pages(root),
    )


def find_placeholders(content: Content) -> list[str]:
    """未記入のまま残っている箇所を洗い出す。"""
    found: list[str] = []

    for field_name, value in vars(content.company).items():
        if is_placeholder(value):
            found.append(f"company.toml の {field_name}")
        elif isinstance(value, list):
            found += [
                f"company.toml の {field_name}[{i}]"
                for i, item in enumerate(value)
                if is_placeholder(item)
            ]

    for field_name, value in vars(content.settings).items():
        if is_placeholder(value):
            found.append(f"site.toml の {field_name}")

    for service in content.services:
        for field_name, value in vars(service).items():
            if is_placeholder(value):
                found.append(f"services.toml の {service.slug}.{field_name}")

    for package in content.packages:
        for field_name, value in vars(package).items():
            if is_placeholder(value):
                found.append(f"services.toml の {package.name}.{field_name}")

    if content.plan:
        for field_name, value in vars(content.plan).items():
            if is_placeholder(value):
                found.append(f"services.toml の package_plan.{field_name}")
            elif isinstance(value, list):
                found += [
                    f"services.toml の package_plan.{field_name}[{i}]"
                    for i, item in enumerate(value)
                    if is_placeholder(item)
                ]

    for work in content.works:
        if is_placeholder(work.title) or PLACEHOLDER in work.body_html:
            found.append(f"works/{work.slug}.md")

    for post in content.posts:
        if is_placeholder(post.title) or PLACEHOLDER in post.body_html:
            found.append(f"posts/{post.slug}.md")

    for page in content.pages:
        if is_placeholder(page.title) or PLACEHOLDER in page.body_html:
            found.append(f"pages/{page.slug}.md")

    return found
