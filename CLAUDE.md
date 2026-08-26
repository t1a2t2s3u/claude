# CLAUDE.md

Guidance for Claude Code and other AI assistants working in this repository.

## Project overview

ブラウザだけで動く株式投資シミュレータ。成行・指値の売買、配当、手数料、成績集計を扱う。
相場には 2 モードあり、`state.mode` で分岐する。

- `'sim'` … `market.js` が乱数で生成する架空の 10 銘柄
- `'real'` … `data/` に取り込んだ実在銘柄の日足を 1 日ずつ再生する。取り込みは
  `npm run import`（GitHub 上の S&P 500 データセット）か `npm run fetch`（Yahoo/Stooq）

どちらのモードでも `state` の形は同じで、注文・配当・集計・描画のコードは共通。
新しい相場の種類を足すときも、`step()` に分岐を 1 つ増やして `state.instruments` と
`state.market.instruments[].bars` を埋める形に揃えること。利用者向けの説明は `README.md`。

newcomer が取り違えやすい設計判断は次の 4 つ。

- **依存パッケージを持たない。** ビルドもトランスパイルもしない素の ES モジュールで、
  `npm start` は `tools/serve.js` の静的サーバを起動するだけ。ライブラリを足す前に、
  まず「なくても書けるか」を検討する（チャートも Canvas に直接描いている）。
- **状態は `engine.js` の `state` ひとつにまとまった素の JSON。** クラスも Map も
  Date インスタンスも入れない。`JSON.stringify` → `JSON.parse` で往復でき、それが
  そのままセーブデータになるため。日付は `YYYY-MM-DD` の文字列で持つ。
- **乱数は必ず `state.rngState` 経由。** `Math.random()` をシミュレーション中に呼ぶと
  リプレイ再現性が壊れる。`engine.js` の `rngFor(state)` で取り出し、進めたあとに
  `state.rngState` を書き戻すこと（架空市場モードのみ）。
- **実データ本体は `state` に入れない。** 数 MB になるため、`dataset` は実行時だけ持ち、
  state には `cursor`（カレンダー上の位置）と取得メタ情報だけを置く。実データモードの
  `state.market`（チャートの足の窓）も (dataset, cursor) からの導出値なので保存せず、
  `storage.js` が落とし、復元時に `rebindDataset` → `rebuildMarket` で組み立て直す。
  500 銘柄では market を保存すると localStorage の容量を超える。
- **金額・株価は `state.currency` の通貨で持つ。** 表示（`format.js`）・手数料
  （`portfolio.js` の `FEES`）・価格刻み・初期資金は通貨で切り替わる。フォーマッタは
  通貨を引数で受け取り、モジュールに状態を置かない。

## Repository structure

```
index.html / styles.css   画面の骨格とスタイル（UI 文言は日本語）
src/main.js               エントリポイント
src/ui.js                 DOM 組み立てとイベント配線（DOM を触るのはここだけ）
src/engine.js             日付進行・注文・配当・資産推移。state の生成もここ
src/market.js             架空市場の価格生成とニュース抽選
src/instruments.js        架空銘柄マスタ
src/dataset.js            data/ に取り込んだ実データの読み込み
src/portfolio.js          現金・ポジション・取得単価・実現損益
src/stats.js              成績指標
src/chart.js              Canvas 描画
src/calendar.js           営業日カレンダー（架空市場モード用）
src/rng.js src/format.js src/storage.js
test/                     node:test のユニットテスト
tools/serve.js            開発用の静的サーバ
tools/fetch-prices.js     実データ取得 CLI（npm run fetch）
tools/import-sp500.js     S&P 500 データセット取り込み CLI（npm run import）
tools/tickers.js          取得対象の銘柄プリセット
data/                     取り込んだ株価。生成物なので Git 管理外
```

`src/ui.js` 以外は DOM に触らない。ロジックを追加するときは、UI ではなく
該当モジュールに置いてテストを書く（`ui.js` はテストしていない）。

## Development workflow

```bash
npm start   # http://localhost:5173 で起動。file:// で開くと ES モジュールが読めない
npm test    # node --test。数秒で終わるので変更ごとに回してよい
npm run fetch -- --limit 2 --years 1   # 実データ取得の動作確認（軽い）
npm run import -- --limit 5            # S&P 500 取り込みの動作確認（約 30MB DL）
```

lint / formatter は入れていない。周囲のコードのスタイルに合わせる。

取得元にアクセスできない環境でも取得系のテストは通る。`fetchSeries` は `fetcher` を
引数で差し替えられ、`tools/fetch-prices.js` のベース URL は環境変数
`STOCKSIM_YAHOO_BASE` / `STOCKSIM_STOOQ_BASE` で差し替えられる。ネットワークに
出られない状態でパイプラインを確認したいときは、この 2 つでモックに向ける。

## Conventions

- インデント 2、シングルクォート、セミコロンあり、行幅はおおむね 100。
- コメントと UI 文言は日本語。コメントは「なぜそうしているか」だけを書く。
- 関数は状態を引数で受け取る。モジュールスコープに可変状態を置かない
  （例外は `ui.js` の `ui` オブジェクトと `engine.js` の `orderSeq` だけ）。
- エラーは例外ではなく `{ ok: false, reason: '日本語の理由' }` を返して UI に出す。
  注文系（`placeMarketOrder` など）はこの形で統一されている。
- 金額は円単位の数値、株価は小数第 1 位まで（`round1`）。表示整形は `format.js` に集約。
- テストは `test/<module>.test.js`。テスト名も日本語で、性質（不変条件）を書く。
  ネットワークに出るテストは書かない（取得系は解析関数と `fetcher` 差し替えで検証する）。
- `state` の形を変えたら `engine.js` の `SAVE_VERSION` を上げる。古い保存データは
  `storage.js` が捨てて新規開始に落とす（マイグレーションは書かない）。

## Git workflow

- Development happens on feature branches; do not commit directly to the default branch.
- Push with `git push -u origin <branch-name>`.
- Never force-push or rewrite history on a branch owned by someone else.
- Open a pull request only when explicitly asked.

## Notes for assistants

- Prefer reading the code over trusting this file where the two disagree, and
  fix this file when you find a discrepancy.
- Keep this document short and specific. Sections that restate general good
  practice should be deleted rather than expanded.
