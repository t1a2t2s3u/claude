# CLAUDE.md

Guidance for Claude Code and other AI assistants working in this repository.

## Project overview

「星よみ手帳」— 生年月日と血液型を入力すると、今日の一枚(タロット)、
恋愛・仕事・金運のパーソナル運勢、星座×干支×血液型の複合鑑定、四柱推命
(簡易命式)、数秘術診断、ふたりの相性診断を表示する日本語の占いWebアプリ。
ビルド工程も実行時依存もない静的サイトとして動く。

設計上の要点:

- 日替わり要素(運勢・タロット)は乱数ではなく「日付 + 星座ID + 干支ID +
  血液型」をシードにした決定的生成(`js/fortune.js` / `js/tarot.js`)。
  同じ日・同じ人は必ず同じ結果になることが仕様であり、`Math.random()` に
  置き換えてはいけない。12星座ランキングは星座のみのシード(パーソナル
  シードなし)、相性診断は日付に依存しない決定的スコアで生成する。
- 占いロジック(zodiac / eto / bloodtype / composite / numerology /
  fourpillars / tarot / compatibility / fortune)はDOM非依存のESモジュール。
  ブラウザとNodeテストの両方から同一コードを読み込むため、これらの
  ファイルにDOM APIやブラウザ専用APIを入れないこと。
- 干支・年柱は元日切り替えの暦年で判定する(旧暦・立春は考慮しない)。
  日柱はユリウス通日から算出し、2024/1/1=甲子・2000/1/1=戊午をテストで
  固定している。月柱・時柱は扱わない(節入り・出生時刻が必要なため)。

## Repository structure

```
index.html          画面構造(タブ構成のエントリポイント)
assets/tarot/       ウェイト版タロットの絵柄(パブリックドメイン、22枚)
css/style.css       全スタイル(夜空テーマ、レスポンシブ)
js/zodiac.js        12星座データ・星座判定
js/eto.js           干支(十二支)データ・判定
js/bloodtype.js     血液型の性質データ
js/composite.js     星座×干支×血液型の複合プロフィール生成
js/numerology.js    運命数の計算・意味データ
js/fourpillars.js   四柱推命(年柱・日柱・日干・五行)の計算と意味データ
js/tarot.js         タロット(大アルカナ22枚)データ・今日の一枚の選択
js/compatibility.js ふたりの相性診断(星座/血液型/干支/五行の4軸)
js/fortune.js       日替わり運勢とランキングの生成
js/main.js          フォームと結果表示のDOM制御(ここだけDOMに触れる)
test/*.test.mjs     ロジックのユニットテスト(node --test)
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
