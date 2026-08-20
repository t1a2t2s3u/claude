"""静的サイトのビルド。

`site/` を読んで `dist/` に HTML を書き出す。ディレクトリごとに index.html を
置く形 (`/works/example/index.html`) にしているのは、URL を末尾スラッシュに
そろえるため。URL は後から変えると被リンクと評価を失うので、最初から
拡張子を出さない形にしておく。
"""

from __future__ import annotations

import shutil
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from . import content as content_mod
from . import structured

# 本文が無いページの説明文に使う長さの上限。検索結果で切られない範囲。
DESCRIPTION_LIMIT = 120

# 関連コンテンツとして各ページの下に出す件数。
RELATED_COUNT = 3


@dataclass
class BuildResult:
    out_dir: Path
    written: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def page_count(self) -> int:
        return len([path for path in self.written if path.endswith(".html")])


def _environment(site_root: Path) -> Any:
    from jinja2 import Environment, FileSystemLoader, select_autoescape

    return Environment(
        loader=FileSystemLoader(site_root / "templates"),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )


def _truncate(text: str, limit: int = DESCRIPTION_LIMIT) -> str:
    flat = " ".join(text.split())
    return flat[:limit] + ("…" if len(flat) > limit else "")


class _Builder:
    def __init__(self, content: content_mod.Content, site_root: Path, out_dir: Path):
        self.content = content
        self.settings = content.settings
        self.env = _environment(site_root)
        self.out_dir = out_dir
        self.result = BuildResult(out_dir=out_dir)
        self.urls: list[tuple[str, date | None]] = []

    # --- 出力 ---

    def write(self, path: str, html: str, *, in_sitemap: bool = True) -> None:
        """``path`` は ``/works/example/`` のような URL パス。"""
        target = self.out_dir / path.strip("/") / "index.html" if path != "/" else self.out_dir / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(html, encoding="utf-8")
        self.result.written.append(str(target.relative_to(self.out_dir)))
        if in_sitemap:
            self.urls.append((path, None))

    def write_file(self, name: str, text: str) -> None:
        target = self.out_dir / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
        self.result.written.append(name)

    def render(self, template: str, path: str, *, title: str, description: str, **context: Any) -> str:
        page_title = title if path == "/" else f"{title} | {self.settings.site_name}"
        return self.env.get_template(template).render(
            settings=self.settings,
            company=self.content.company,
            services=self.content.services,
            works=self.content.works,
            posts=self.content.posts,
            page_title=page_title,
            page_description=_truncate(description),
            canonical=f"{self.settings.canonical_base}{path}",
            current_year=date.today().year,
            **context,
        )

    # --- 各ページ ---

    def build_home(self) -> None:
        company = self.content.company
        jsonld = structured.graph(
            self.content,
            *[
                structured.service_offer(self.settings, company, service)
                for service in self.content.services
            ],
        )
        html = self.render(
            "index.html",
            "/",
            title=f"{company.name}｜{company.tagline}",
            description=company.description,
            section="home",
            jsonld=jsonld,
        )
        self.write("/", html)

    def build_services(self) -> None:
        company = self.content.company
        trail = [("ホーム", "/"), ("サービス・料金", "/services/")]
        jsonld = structured.graph(
            self.content,
            structured.breadcrumbs(self.settings, trail),
            *[
                structured.service_offer(self.settings, company, service)
                for service in self.content.services
            ],
        )
        names = "、".join(service.name for service in self.content.services)
        html = self.render(
            "services.html",
            "/services/",
            title="サービス・料金目安",
            description=f"{company.name}が対応する工事（{names}）の内容と費用の目安。お見積りは無料です。",
            section="services",
            trail=trail,
            jsonld=jsonld,
        )
        self.write("/services/", html)

    def build_works(self) -> None:
        trail = [("ホーム", "/"), ("施工事例", "/works/")]
        jsonld = structured.graph(
            self.content, structured.breadcrumbs(self.settings, trail)
        )
        html = self.render(
            "works_index.html",
            "/works/",
            title="施工事例",
            description=f"{self.content.company.name}がお引き受けした外壁塗装・屋根塗装の施工事例。仕上がりと費用の目安をご覧いただけます。",
            section="works",
            trail=trail,
            jsonld=jsonld,
        )
        self.write("/works/", html)

        for work in self.content.works:
            work_trail = trail + [(work.title, work.url)]
            work_jsonld = structured.graph(
                self.content,
                structured.breadcrumbs(self.settings, work_trail),
                structured.work_article(self.settings, work),
            )
            related = [other for other in self.content.works if other.slug != work.slug]
            page = self.render(
                "work.html",
                work.url,
                title=work.title,
                description=work.summary,
                section="works",
                work=work,
                trail=work_trail,
                related=related[:RELATED_COUNT],
                og_type="article",
                jsonld=work_jsonld,
            )
            self.write(work.url, page)

    def build_blog(self) -> None:
        trail = [("ホーム", "/"), ("ブログ", "/blog/")]
        jsonld = structured.graph(
            self.content, structured.breadcrumbs(self.settings, trail)
        )
        html = self.render(
            "blog_index.html",
            "/blog/",
            title="ブログ",
            description="外壁・屋根塗装の時期の見分け方、費用の考え方、業者選びのポイントなど、判断の材料になる情報をまとめています。",
            section="blog",
            trail=trail,
            jsonld=jsonld,
        )
        self.write("/blog/", html)

        for post in self.content.posts:
            post_trail = trail + [(post.title, post.url)]
            post_jsonld = structured.graph(
                self.content,
                structured.breadcrumbs(self.settings, post_trail),
                structured.blog_posting(self.settings, post),
            )
            related = [other for other in self.content.posts if other.slug != post.slug]
            page = self.render(
                "post.html",
                post.url,
                title=post.title,
                description=post.description,
                section="blog",
                post=post,
                trail=post_trail,
                related=related[:RELATED_COUNT],
                og_type="article",
                jsonld=post_jsonld,
            )
            self.write(post.url, page)

    def build_pages(self) -> None:
        for page in self.content.pages:
            trail = [("ホーム", "/"), (page.title, page.url)]
            jsonld = structured.graph(
                self.content, structured.breadcrumbs(self.settings, trail)
            )
            html = self.render(
                "page.html",
                page.url,
                title=page.title,
                description=page.description,
                section=page.slug,
                page=page,
                trail=trail,
                jsonld=jsonld,
            )
            self.write(page.url, html)

    def build_404(self) -> None:
        html = self.render(
            "404.html",
            "/404.html",
            title="ページが見つかりません",
            description="お探しのページは移動または削除された可能性があります。",
            section="",
            jsonld=structured.graph(self.content),
        )
        self.write_file("404.html", html)

    # --- 付随ファイル ---

    def build_sitemap(self) -> None:
        lines = ['<?xml version="1.0" encoding="UTF-8"?>',
                 '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
        lastmod = {work.url: work.date for work in self.content.works}
        lastmod.update({post.url: post.date for post in self.content.posts})
        for path, _ in self.urls:
            lines.append("  <url>")
            lines.append(f"    <loc>{self.settings.canonical_base}{path}</loc>")
            if path in lastmod:
                lines.append(f"    <lastmod>{lastmod[path].isoformat()}</lastmod>")
            lines.append("  </url>")
        lines.append("</urlset>")
        self.write_file("sitemap.xml", "\n".join(lines) + "\n")

    def build_robots(self) -> None:
        self.write_file(
            "robots.txt",
            "User-agent: *\nAllow: /\n\n"
            f"Sitemap: {self.settings.canonical_base}/sitemap.xml\n",
        )

    def copy_assets(self, site_root: Path) -> None:
        source = site_root / "assets"
        if not source.exists():
            return
        shutil.copytree(source, self.out_dir / "assets", dirs_exist_ok=True)
        self.result.written.append("assets/")


def build(
    site_root: Path,
    out_dir: Path,
    *,
    base_url: str | None = None,
    clean: bool = True,
) -> BuildResult:
    """サイトを生成する。``base_url`` を渡すと site.toml の設定を上書きする。"""
    content = content_mod.load(site_root)
    if base_url:
        content.settings.base_url = base_url

    if clean and out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    builder = _Builder(content, site_root, out_dir)
    builder.build_home()
    builder.build_services()
    builder.build_works()
    builder.build_blog()
    builder.build_pages()
    builder.build_404()
    builder.build_sitemap()
    builder.build_robots()
    builder.copy_assets(site_root)

    builder.result.warnings = _warnings(content)
    return builder.result


def _warnings(content: content_mod.Content) -> list[str]:
    """公開前に直すべき点。ビルド自体は止めない (下書き確認を妨げないため)。"""
    warnings = [
        f"未記入のまま残っています: {item}"
        for item in content_mod.find_placeholders(content)
    ]
    if not content.settings.base_url:
        warnings.append(
            "site.toml の base_url が空です。canonical と sitemap が正しく出ません。"
        )
    if not content.works:
        warnings.append("施工事例が1件もありません。塗装業では最も効くコンテンツです。")
    return warnings
