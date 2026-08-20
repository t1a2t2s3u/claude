"""コマンドラインインターフェース。

想定する運用:

    seo-meo auth-login          # 初回のみ、ブラウザで同意
    seo-meo fetch               # 毎日 (cron)
    seo-meo keywords            # 月1回
    seo-meo report              # 毎週 (cron)
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

from . import auth, config as config_mod, metrics
from .report import weekly
from .site import build as site_build, content as site_content
from .sources import fixture, gbp_locations, gbp_performance
from .sources.base import ApiError
from .storage import connect, log_fetch, save_daily, save_keywords

SAMPLE = "sample"
GBP = "gbp"

# サイトのコンテンツと出力先。リポジトリ直下からの相対パス。
DEFAULT_SITE_DIR = "site"
DEFAULT_OUT_DIR = "dist"


def _parse_date(value: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"日付は YYYY-MM-DD 形式で指定してください: {value}"
        ) from exc


def _default_end(cfg: config_mod.Config, override: date | None) -> date:
    """データが確定していると見なせる最終日。"""
    if override:
        return override
    return date.today() - timedelta(days=cfg.data_lag_days)


def cmd_auth_login(args: argparse.Namespace) -> int:
    cfg = config_mod.load(args.config)
    path = auth.login(cfg.client_secret_file, cfg.token_file)
    print(f"認証しました。トークンを保存: {path}")
    return 0


def cmd_locations(args: argparse.Namespace) -> int:
    """config.toml に書く location_id を調べるための一覧表示。"""
    cfg = config_mod.load(args.config)
    session = auth.authorized_session(cfg.token_file)

    accounts = gbp_locations.list_accounts(session)
    if not accounts:
        print("アクセスできるアカウントがありません。"
              "認証したGoogleアカウントに拠点の管理権限があるか確認してください。")
        return 1

    for account in accounts:
        print(f"\n{account.name}  {account.display_name}")
        locations = gbp_locations.list_locations(session, account.name)
        if not locations:
            print("  (拠点なし)")
            continue
        for location in locations:
            print(f"  location_id = \"{location.location_id}\"")
            print(f"      {location.title}  {location.address}".rstrip())
    return 0


def cmd_fetch(args: argparse.Namespace) -> int:
    cfg = config_mod.load(args.config)
    end = _default_end(cfg, args.end)
    days = args.days or cfg.lookback_days
    start = end - timedelta(days=days - 1)

    if args.source == SAMPLE:
        values = fixture.daily_metrics(start, end)
    else:
        session = auth.authorized_session(cfg.token_file)
        values = gbp_performance.fetch_daily_metrics(
            session, cfg.location_path, metrics.ALL_METRICS, start, end
        )

    with connect(cfg.database) as conn:
        rows = save_daily(conn, cfg.location_path, values)
        log_fetch(
            conn, cfg.location_path, f"daily:{args.source}",
            start.isoformat(), end.isoformat(), rows,
        )

    print(f"日次指標を取り込みました: {start} 〜 {end} / {rows}行 (source={args.source})")
    return 0


def cmd_keywords(args: argparse.Namespace) -> int:
    cfg = config_mod.load(args.config)
    end = _default_end(cfg, args.end)
    months = gbp_performance.recent_months(end, args.months)

    if args.source == SAMPLE:
        counts = fixture.monthly_keywords(months)
    else:
        session = auth.authorized_session(cfg.token_file)
        counts = gbp_performance.fetch_monthly_keywords(session, cfg.location_path, months)

    with connect(cfg.database) as conn:
        rows = save_keywords(conn, cfg.location_path, counts)
        log_fetch(
            conn, cfg.location_path, f"keywords:{args.source}",
            months[0], months[-1], rows,
        )

    print(f"検索キーワードを取り込みました: {months[0]} 〜 {months[-1]} / {rows}行")
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    cfg = config_mod.load(args.config)
    end = _default_end(cfg, args.end)

    with connect(cfg.database) as conn:
        report = weekly.build(
            conn,
            cfg.location_path,
            cfg.business_name,
            end,
            is_sample=args.sample,
        )

    markdown = weekly.render_markdown(report)

    if args.out == "-":
        print(markdown)
        return 0

    out_path = Path(args.out) if args.out else cfg.report_dir / f"weekly-{end}.md"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(markdown, encoding="utf-8")
    print(f"レポートを出力しました: {out_path}")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    cfg = config_mod.load(args.config)
    with connect(cfg.database) as conn:
        row = conn.execute(
            """
            SELECT COUNT(*) AS rows, MIN(date) AS first, MAX(date) AS last
            FROM daily_metrics WHERE location_id = ?
            """,
            (cfg.location_path,),
        ).fetchone()
        keyword_rows = conn.execute(
            "SELECT COUNT(*) AS rows FROM monthly_keywords WHERE location_id = ?",
            (cfg.location_path,),
        ).fetchone()
        recent = conn.execute(
            """
            SELECT source, range_start, range_end, rows, fetched_at
            FROM fetch_log WHERE location_id = ?
            ORDER BY id DESC LIMIT 5
            """,
            (cfg.location_path,),
        ).fetchall()

    print(f"拠点: {cfg.business_name} ({cfg.location_path})")
    print(f"DB:   {cfg.database}")
    print(f"日次指標: {row['rows']}行  期間: {row['first'] or '-'} 〜 {row['last'] or '-'}")
    print(f"キーワード: {keyword_rows['rows']}行")
    if recent:
        print("\n直近の取り込み:")
        for entry in recent:
            print(
                f"  {entry['fetched_at']}  {entry['source']:<18}"
                f"  {entry['range_start']}〜{entry['range_end']}  {entry['rows']}行"
            )
    return 0


def cmd_site_build(args: argparse.Namespace) -> int:
    result = site_build.build(
        Path(args.site), Path(args.out), base_url=args.base_url
    )
    print(f"サイトを生成しました: {result.out_dir} / {result.page_count}ページ")

    if result.warnings:
        print(f"\n公開前に直すべき点が {len(result.warnings)} 件あります:")
        for warning in result.warnings:
            print(f"  - {warning}")
        if args.strict:
            print("\n--strict が指定されているため失敗として扱います。")
            return 1
    return 0


def cmd_site_serve(args: argparse.Namespace) -> int:
    """ビルドしてローカルで確認する。公開用ではない。"""
    import functools
    import http.server
    import socketserver

    out = Path(args.out)
    result = site_build.build(Path(args.site), out, base_url=args.base_url)
    print(f"サイトを生成しました: {out} / {result.page_count}ページ")
    for warning in result.warnings:
        print(f"  - {warning}")

    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=str(out)
    )
    with socketserver.TCPServer(("127.0.0.1", args.port), handler) as httpd:
        print(f"\nhttp://127.0.0.1:{args.port}/ で確認できます (Ctrl+C で終了)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n終了しました。")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="seo-meo", description="辰弥塗装工業 SEO/MEO データ収集・レポート基盤"
    )
    parser.add_argument("--config", help="設定ファイルのパス (既定: config.toml)")
    sub = parser.add_subparsers(dest="command", required=True)

    p_auth = sub.add_parser("auth-login", help="ブラウザで Google の認証を行う (初回のみ)")
    p_auth.set_defaults(func=cmd_auth_login)

    p_loc = sub.add_parser("locations", help="拠点ID (location_id) を一覧表示する")
    p_loc.set_defaults(func=cmd_locations)

    p_fetch = sub.add_parser("fetch", help="日次指標を取り込む")
    p_fetch.add_argument("--days", type=int, help="さかのぼる日数 (既定: 設定値)")
    p_fetch.add_argument("--end", type=_parse_date, help="最終日 YYYY-MM-DD")
    p_fetch.add_argument(
        "--source", choices=[GBP, SAMPLE], default=GBP,
        help="gbp=実データ, sample=API承認待ち用のサンプル",
    )
    p_fetch.set_defaults(func=cmd_fetch)

    p_kw = sub.add_parser("keywords", help="月次の検索キーワードを取り込む")
    p_kw.add_argument("--months", type=int, default=3, help="さかのぼる月数 (既定: 3)")
    p_kw.add_argument("--end", type=_parse_date, help="基準日 YYYY-MM-DD")
    p_kw.add_argument("--source", choices=[GBP, SAMPLE], default=GBP)
    p_kw.set_defaults(func=cmd_keywords)

    p_report = sub.add_parser("report", help="週次レポートを生成する")
    p_report.add_argument("--end", type=_parse_date, help="週の最終日 YYYY-MM-DD")
    p_report.add_argument("--out", help="出力先。'-' で標準出力")
    p_report.add_argument(
        "--sample", action="store_true",
        help="サンプルデータである旨を明記する (取り込み履歴から自動判定もされる)"
    )
    p_report.set_defaults(func=cmd_report)

    p_site = sub.add_parser("site-build", help="自社サイトを生成する")
    p_site.add_argument("--site", default=DEFAULT_SITE_DIR, help="コンテンツのディレクトリ")
    p_site.add_argument("--out", default=DEFAULT_OUT_DIR, help="出力先ディレクトリ")
    p_site.add_argument("--base-url", help="site.toml の base_url を上書きする")
    p_site.add_argument(
        "--strict", action="store_true",
        help="未記入項目などの警告があれば失敗にする (公開前の確認用)",
    )
    p_site.set_defaults(func=cmd_site_build)

    p_serve = sub.add_parser("site-serve", help="生成したサイトをローカルで確認する")
    p_serve.add_argument("--site", default=DEFAULT_SITE_DIR)
    p_serve.add_argument("--out", default=DEFAULT_OUT_DIR)
    p_serve.add_argument("--base-url", help="site.toml の base_url を上書きする")
    p_serve.add_argument("--port", type=int, default=8000)
    p_serve.set_defaults(func=cmd_site_serve)

    p_status = sub.add_parser("status", help="DB の中身と取り込み履歴を表示する")
    p_status.set_defaults(func=cmd_status)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return int(args.func(args))
    except (
        config_mod.ConfigError,
        auth.AuthError,
        ApiError,
        site_content.ContentError,
    ) as exc:
        print(f"エラー: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
