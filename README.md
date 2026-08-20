# 辰弥塗装工業 SEO/MEO データ収集・レポート基盤

Google ビジネスプロフィール (GBP) の数字を毎日自動で集め、週次レポートを
自動生成するツールです。

> **なぜ最初にこれを作るのか**
> 施策を打つ前に、効果を測る仕組みが要ります。GBP の管理画面は過去データの
> 保持期間が限られ、期間比較も手作業になります。まず数字を自分の手元に貯めて
> おくと、「投稿を増やした週に何が起きたか」が後から検証できるようになります。

## できること

| コマンド | 内容 | 実行頻度 |
|---|---|---|
| `seo-meo locations` | 拠点ID (`location_id`) を一覧表示 | 初期設定時に1回 |
| `seo-meo fetch` | 日次指標を取り込む | 毎日 |
| `seo-meo keywords` | 月次の検索キーワードを取り込む | 月1回 |
| `seo-meo report` | 週次レポート (Markdown) を生成 | 毎週 |
| `seo-meo status` | DB の中身と取り込み履歴を確認 | 随時 |

収集する指標は塗装業で意味のあるものだけに絞っています。

- **表示回数**: 検索表示 (スマホ / PC)、マップ表示 (スマホ / PC)
- **アクション**: 電話タップ、ルート検索、メッセージ、サイトクリック
- **検索キーワード**: どんな語で見つけられたか (月次)

レポートは直近7日と、その前の7日を並べた比較になります。単月の絶対値より
「前週と比べてどうか」のほうが打つ手の判断に直結するためです。

## セットアップ

### 1. Google 側の準備 — ここが一番時間がかかります

Business Profile 系 API は、Google Cloud プロジェクトごとに**利用申請と承認**
が必要です。承認前は API を有効化することすらできません。申請から承認までは
数日〜数週間かかることがあるため、**最初に出してください**。

1. [Google Cloud コンソール](https://console.cloud.google.com/) でプロジェクトを作成
2. Google の [Business Profile APIs の前提条件ページ](https://developers.google.com/my-business/content/prereqs)
   から、アクセスリクエストフォームを提出する
   （フォームの場所や必要事項は変わることがあるので、必ず最新のページを確認してください）
3. 承認後、以下の API を有効化する
   - Business Profile Performance API
   - My Business Account Management API
   - My Business Business Information API
4. 「APIとサービス」→「認証情報」で **OAuth クライアント ID（アプリケーションの種類:
   デスクトップアプリ）** を作成し、JSON を `secrets/client_secret.json` に置く

> **承認待ちの間も進められます。** 下の「サンプルデータで動作確認」を先に
> やっておくと、承認が下りた日に `--source` を切り替えるだけで本番運用に入れます。

### 2. インストール

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
```

### 3. 設定ファイル

```bash
cp config.example.toml config.toml
```

`config.toml` を開いて `location_id` を記入します。認証情報を含むので
`config.toml` と `secrets/` は `.gitignore` 済みです。**絶対にコミットしないでください。**

### 4. 認証

```bash
seo-meo auth-login
```

ブラウザが開くので、**GBP の管理権限を持つ Google アカウント**で同意します。
以降は保存されたトークンで無人実行できます。

### 5. 拠点IDの調べ方

`location_id` は GBP 管理画面の URL からは読み取れません。認証後に次を実行すると
一覧が出るので、対象の行をそのまま `config.toml` に貼り付けます。

```bash
seo-meo locations
```

```
accounts/111222333  辰弥塗装工業
  location_id = "9876543210"
      辰弥塗装工業  000-0000 〇〇県〇〇市〇〇町1-2-3
```

## 使い方

```bash
seo-meo fetch                      # 直近30日を取り込む（既定）
seo-meo fetch --days 90            # さかのぼる日数を変える
seo-meo keywords --months 6        # 検索キーワードを6か月分
seo-meo report                     # reports/weekly-YYYY-MM-DD.md を出力
seo-meo report --out -             # 標準出力に表示
seo-meo status                     # 何がどこまで入っているか確認
```

### サンプルデータで動作確認

API 承認を待たずにレポートの中身を確認できます。

```bash
seo-meo fetch --source sample --end 2026-08-15
seo-meo keywords --source sample --end 2026-08-15
seo-meo report --end 2026-08-15 --out -
```

サンプル由来のデータが混ざったレポートには、取り込み履歴から自動判定して
警告が入ります。実データと取り違える心配はありません。

**本番運用に切り替えるときは、サンプルを消してから取り直してください。**

```bash
rm data/seo_meo.sqlite3
seo-meo fetch --days 90
```

## 自動実行

`cron` に登録します（`/path/to` は実際のパスに置き換えてください）。

```cron
# 毎朝 7:00 に前日までのデータを取り込む
0 7 * * * cd /path/to/repo && .venv/bin/seo-meo fetch >> logs/fetch.log 2>&1

# 毎週月曜 8:00 に週次レポートを生成する
0 8 * * 1 cd /path/to/repo && .venv/bin/seo-meo report >> logs/report.log 2>&1

# 毎月1日にキーワードを取り込む
0 6 1 * * cd /path/to/repo && .venv/bin/seo-meo keywords >> logs/keywords.log 2>&1
```

## 設計上の判断

**毎回さかのぼって取り直す。** Performance API のデータは即日では確定せず、
数日かけて値が埋まります。「前回の続きから」だと確定前の値が残ってしまうため、
既定で30日分の窓ごと取り直して上書きします。書き込みはすべて
`(拠点, 日付, 指標)` を主キーにした upsert なので、何度実行しても重複しません。

**値が 0 の日も行として残す。** API は 0 件の日を値ごと省略して返します。行を
落とすと「まだ取得していない」と「その日は 0 件だった」が区別できなくなるため、
明示的に 0 を書き込みます。

**しきい値は実数と区別する。** Google は表示回数が少ないキーワードの実数を
公開せず、「15未満」のようなしきい値だけを返します。これを 0 や 15 に丸めると
集計が歪むため、`value` と `threshold` を別カラムで保持し、レポートでは `<15`
と表示します。

**データ確定までの遅延を見込む。** 既定では「今日から5日前」を最終日として
扱います (`config.toml` の `data_lag_days`)。

## 開発

```bash
python3 -m pytest        # テスト実行
```

外部 API を叩くテストはありません。API クライアントは応答パース関数を分けて
あり、実際の応答形と同じ構造の payload をテストで直接渡しています。

```
seo_meo/
  cli.py               コマンド定義
  config.py            設定 (TOML) の読み込み
  auth.py              Google OAuth
  metrics.py           指標の定義と日本語ラベル
  storage.py           SQLite への蓄積・集計クエリ
  sources/
    base.py            共通のエラー処理と指数バックオフ再試行
    gbp_performance.py 日次指標・月次キーワードの取得
    gbp_locations.py   拠点IDの一覧取得
    fixture.py         承認待ち用のサンプルデータ生成
  report/
    weekly.py          週次の集計と Markdown 出力
```

## 次に足すもの

この基盤の上に載せる想定の施策です。まだ実装していません。

- **Search Console 連携** — 自社サイトを作ったら `sources/search_console.py` を
  足し、`fetch` から呼びます。storage と report はそのまま使えます。
- **口コミ返信ドラフト生成** — 新着口コミを取得し、返信案を作る。
  投稿は必ず人が確認してから行います。
- **GBP 投稿ネタの定期提案** — 施工事例から投稿文の下書きを作る。
- **NAP 一貫性チェック** — 社名・住所・電話番号が各ポータルでズレていないか巡回。
- **構造化データ生成** — サイト構築後、`HomeAndConstructionBusiness` の JSON-LD を生成。

## やらないこと

以下は Google のポリシー違反、またはスパム判定の対象です。自動化しません。

- 口コミの自動投稿・依頼の偽装
- 地域名だけ差し替えた量産ページ（ドアウェイページ）
- 実在しない営業所の登録
