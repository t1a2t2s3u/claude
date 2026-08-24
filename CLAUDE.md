# CLAUDE.md

Guidance for Claude Code and other AI assistants working in this repository.

## Project overview

辰弥塗装工業（塗装工事業）の SEO/MEO 施策を自動化するためのツール群。
実装済みの機能は2つ。

1. **MEO のデータ収集・レポート** — Google ビジネスプロフィール (GBP) の日次
   指標と月次検索キーワードを Business Profile Performance API から取得し、
   SQLite に蓄積して週次レポートを Markdown で生成する。
2. **自社サイトの静的生成** — `site/` の TOML と Markdown から、構造化データ
   付きの HTML を `dist/` に生成する。

前提として押さえておくべきこと:

- **会社情報 (`site/company.toml`) は GBP の登録内容と一致していなければ
  ならない。** サイト表示と JSON-LD の両方に使われる。表記ゆれ (NAP のズレ) は
  MEO の減点要因。ここを変更する提案をするときは必ず両方への影響を考えること。
- **Business Profile API は Google の利用申請・承認が必要。** 承認前は API を
  有効化すらできない。そのため承認待ちでも動作確認できるよう、実データと
  同じ形のサンプルを生成する経路 (`--source sample`) を用意してある。
  サイト生成は認証不要で動く。
- **Search Console はまだ無い。** サイト公開・登録後に
  `sources/search_console.py` を足す想定。storage と report は流用できる。
- **実在の会社情報を創作しない。** 住所・電話番号・施工実績・お客様の声は
  `【要記入】` のまま残し、ビルド時に警告を出す設計になっている。この仕組みを
  弱める変更を入れないこと。
- **口コミの自動投稿や量産ページ生成は実装しない。** Google のポリシー違反、
  またはスパム判定の対象。README の「やらないこと」を参照。

## Repository structure

```
seo_meo/
  cli.py               argparse によるコマンド定義。運用の入口はすべてここ
  config.py            config.toml の読み込み。相対パスは設定ファイル基準で解決
  auth.py              Google OAuth。google-auth 系の import は関数内（遅延）
  metrics.py           扱う DailyMetric の定義と日本語ラベル
  storage.py           SQLite スキーマ・upsert・集計クエリ
  sources/
    base.py            共通のエラー型と、指数バックオフ付き GET
    gbp_performance.py 日次指標・月次キーワードの取得
    gbp_locations.py   拠点ID の一覧取得（初期設定用）
    fixture.py         承認待ち用のサンプルデータ生成（決定的）
  report/
    weekly.py          週次の集計と Markdown 出力
  site/
    content.py         コンテンツ読み込み。TOML フロントマター付き Markdown
    structured.py      JSON-LD 生成。塗装業は HousePainter 型
    build.py           HTML・sitemap.xml・robots.txt の出力
site/
  site.toml            公開URL などサイト全体の設定
  company.toml         会社情報。GBP の登録内容と一致させる
  services.toml        工事の内容と料金
  works/*.md           施工事例。ファイル名が URL になる
  posts/*.md           ブログ記事
  pages/*.md           会社概要・お問い合わせ
  templates/*.html     Jinja2 テンプレート
  assets/              CSS と画像。dist/assets/ にそのままコピーされる
dist/                  site/ から生成した公開物。commit する（下記）
wrangler.toml          Cloudflare の更新先 Worker と、公開ディレクトリ
docs/deploy.md         ドメイン取得から Search Console 登録までの手順
tests/                 pytest。外部 API は叩かない
```

新しい取得元を足すときは `sources/` にモジュールを作り、`storage.DailyValue`
を返す関数を用意して `cli.cmd_fetch` から呼ぶ。storage と report は指標名を
知っていれば動くので、変更は `metrics.py` への追記で済むことが多い。

サイトにページ種別を足すときは、`site/templates/` にテンプレートを置き、
`site/build.py` の `_Builder` にビルドメソッドを足して `build()` から呼ぶ。
URL を `write()` に渡した時点で sitemap にも載る。

## Deployment

サイトは `tatsumi-tosou.com` で公開中。Cloudflare Workers (`orange-boat-b4db`)
が、GitHub 上の **commit された `dist/` をそのまま配信している。**

- **`site/` を変更したら、必ず `seo-meo site-build --strict` を実行して
  `dist/` も一緒に commit する。** 忘れるとサイトは変わらない。
  `tests/test_deploy_config.py` が、古い `dist/` を commit しようとすると
  失敗するようにしてある。
- **Cloudflare 側ではビルドしない。** Python が使える保証がないため、
  ビルド済みを配る方式にしている。Build command は空。
- `wrangler.toml` の `name` は Cloudflare 上の Worker 名と一致させること。
  ずれると既存サイトが更新されず、別の Worker が黙って新規作成される。
- **Cloudflare が見ているのは `claude/seo-meo-automation-mvntxp` ブランチ。**
  ここ以外に push してもサイトは変わらない。別のブランチで作業する場合は、
  Cloudflare 側の Production branch も変えること（Worker → Settings →
  Build → Branch control）。

DNS でつまずいたときの切り分けは `docs/deploy.md` の手順3を読むこと。

## Development workflow

### Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp config.example.toml config.toml   # location_id を記入する
```

### Build, test, lint

```bash
python3 -m pytest        # 全テスト。1秒未満なので毎回の変更ごとに回してよい
```

リンタ・フォーマッタは未導入。

### Running the application

API 承認前でも通しで動かせる:

```bash
seo-meo fetch --source sample --end 2026-08-15
seo-meo report --end 2026-08-15 --out -
```

サイトは認証なしで動く:

```bash
seo-meo site-serve            # ビルドして http://127.0.0.1:8000/
seo-meo site-build --strict   # 未記入があれば失敗する（公開前の確認）
```

## Conventions

- **コメントと出力は日本語。** 運用するのは開発者ではないため、CLI の出力・
  エラーメッセージ・レポートはすべて日本語で書く。コード中のコメントは
  「なぜそうしたか」を書く（何をしているかはコードを読めば分かる）。
- **識別子は英語。** 変数名・関数名・テーブル名は英語のまま。
- **API クライアントはパース関数を分ける。** `fetch_*` が HTTP を担当し、
  `parse_*` が純粋関数として応答を変換する。テストは `parse_*` に対して、
  実際の応答と同じ構造の dict を直接渡す形で書く。ネットワークはモックしない。
- **書き込みはすべて upsert。** 同じ範囲を何度取り直しても行が重複しない
  ことを前提に設計している。テストで必ず担保すること。
- **欠損と 0 を混同しない。** API が値を省略した日は 0 として明示的に書き込む。
  「未取得」と「0件」が区別できなくなる変更を入れない。
- **サイトに外部リソースを足さない。** CDN・Webフォント・解析タグを読み込むと
  表示が遅くなる。生成物は自己完結を保つ（テストで担保している）。
- **URL を変えない。** 一度公開した URL を変えると被リンクと評価を失う。
  ページ種別を足すのは自由だが、既存の URL 構造は動かさない。

## Git workflow

- Development happens on feature branches; do not commit directly to the
  default branch.
- Push with `git push -u origin <branch-name>`.
- Never force-push or rewrite history on a branch owned by someone else.
- Open a pull request only when explicitly asked.
- **`config.toml` と `secrets/` は絶対にコミットしない。** `.gitignore` 済み。

## Notes for assistants

- Prefer reading the code over trusting this file where the two disagree, and
  fix this file when you find a discrepancy.
- Google の API 仕様（承認フロー、エンドポイント、enum 値）は変わる。実装と
  食い違ったら公式ドキュメントを確認すること。
