# CLAUDE.md

Guidance for Claude Code and other AI assistants working in this repository.

## Project overview

「星よみ手帳」— 生年月日を入力すると、12星座の今日の運勢と数秘術(運命数)
診断を表示する日本語の占いWebアプリ。ビルド工程も実行時依存もない静的サイト
として動く。

設計上の要点:

- 運勢は乱数ではなく「日付 + 星座ID」をシードにした決定的生成
  (`js/fortune.js`)。同じ日は必ず同じ結果になることが仕様であり、
  `Math.random()` に置き換えてはいけない。
- 占いロジック(zodiac / numerology / fortune)はDOM非依存のESモジュール。
  ブラウザとNodeテストの両方から同一コードを読み込むため、これらのファイル
  にDOM APIやブラウザ専用APIを入れないこと。

## Repository structure

```
index.html        画面構造(エントリポイント)
css/style.css     全スタイル(夜空テーマ、レスポンシブ)
js/zodiac.js      12星座データ・星座判定
js/numerology.js  運命数の計算・意味データ
js/fortune.js     日替わり運勢とランキングの生成
js/main.js        フォームと結果表示のDOM制御(ここだけDOMに触れる)
test/*.test.mjs   ロジックのユニットテスト(node --test)
```

新しい占いロジックは `js/` にDOM非依存モジュールとして追加し、表示は
`main.js` に、テストは `test/` に置く。

## Development workflow

### Setup

クローンするだけ。npm install は不要(依存パッケージなし)。Node 22系で
動作確認済み。

### Build, test, lint

- ビルド: なし(静的ファイルのみ)
- テスト: `npm test`(= `node --test 'test/**/*.test.mjs'`)。数秒で終わる
  ので、ロジック変更のたびに実行する。
- リント: 未導入。

### Running the application

`python3 -m http.server 3000` などでルートを配信し、ブラウザで開く。
`file://` 直開きはESモジュールがブロックされることがあるので使わない。

## Conventions

- UI文言・コメントは日本語。コードの識別子は英語。
- インデントは2スペース、文字列はシングルクォート。
- 占い結果のテキストは断定的な不安を煽る表現を避け、前向きなトーンで書く。

## Git workflow

- Development happens on feature branches; do not commit directly to the
  default branch.
- Push with `git push -u origin <branch-name>`.
- Never force-push or rewrite history on a branch owned by someone else.
- Open a pull request only when explicitly asked.

## Notes for assistants

- Prefer reading the code over trusting this file where the two disagree, and
  fix this file when you find a discrepancy.
- Keep this document short and specific. Sections that restate general good
  practice should be deleted rather than expanded.
