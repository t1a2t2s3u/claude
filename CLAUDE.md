# CLAUDE.md

Guidance for Claude Code and other AI assistants working in this repository.

## Project overview

ブラウザだけで動く株式投資シミュレータ。架空の 10 銘柄からなる市場を日次で生成し、
成行・指値の売買、配当、手数料、成績集計までを扱う。利用者向けの説明は `README.md`
にある（相場モデルの式もそこ）。

newcomer が取り違えやすい設計判断は次の 3 つ。

- **依存パッケージを持たない。** ビルドもトランスパイルもしない素の ES モジュールで、
  `npm start` は `tools/serve.js` の静的サーバを起動するだけ。ライブラリを足す前に、
  まず「なくても書けるか」を検討する（チャートも Canvas に直接描いている）。
- **状態は `engine.js` の `state` ひとつにまとまった素の JSON。** クラスも Map も
  Date インスタンスも入れない。`JSON.stringify` → `JSON.parse` で往復でき、それが
  そのままセーブデータになるため。日付は `YYYY-MM-DD` の文字列で持つ。
- **乱数は必ず `state.rngState` 経由。** `Math.random()` をシミュレーション中に呼ぶと
  リプレイ再現性が壊れる。`engine.js` の `rngFor(state)` で取り出し、進めたあとに
  `state.rngState` を書き戻すこと。

## Repository structure

```
index.html / styles.css   画面の骨格とスタイル（UI 文言は日本語）
src/main.js               エントリポイント
src/ui.js                 DOM 組み立てとイベント配線（DOM を触るのはここだけ）
src/engine.js             日付進行・注文・配当・資産推移。state の生成もここ
src/market.js             価格生成とニュース抽選
src/instruments.js        架空銘柄マスタ
src/portfolio.js          現金・ポジション・取得単価・実現損益
src/stats.js              成績指標
src/chart.js              Canvas 描画
src/calendar.js           営業日カレンダー
src/rng.js src/format.js src/storage.js
test/                     node:test のユニットテスト
tools/serve.js            開発用の静的サーバ
```

`src/ui.js` 以外は DOM に触らない。ロジックを追加するときは、UI ではなく
該当モジュールに置いてテストを書く（`ui.js` はテストしていない）。

## Development workflow

```bash
npm start   # http://localhost:5173 で起動。file:// で開くと ES モジュールが読めない
npm test    # node --test。数秒で終わるので変更ごとに回してよい
```

lint / formatter は入れていない。周囲のコードのスタイルに合わせる。

## Conventions

- インデント 2、シングルクォート、セミコロンあり、行幅はおおむね 100。
- コメントと UI 文言は日本語。コメントは「なぜそうしているか」だけを書く。
- 関数は状態を引数で受け取る。モジュールスコープに可変状態を置かない
  （例外は `ui.js` の `ui` オブジェクトと `engine.js` の `orderSeq` だけ）。
- エラーは例外ではなく `{ ok: false, reason: '日本語の理由' }` を返して UI に出す。
  注文系（`placeMarketOrder` など）はこの形で統一されている。
- 金額は円単位の数値、株価は小数第 1 位まで（`round1`）。表示整形は `format.js` に集約。
- テストは `test/<module>.test.js`。テスト名も日本語で、性質（不変条件）を書く。

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
