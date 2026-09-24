# office/

オフィスボード（https://claude.ai/code/artifact/c7d8805a-a816-41b8-b2f8-f8c401d90f6c）の
ページソース。同じ URL に republish すれば切り替えられる。

- `office-map.html` — 見下ろし型マップ版（現在公開中）。上から順に:
  各ボードへのリンク → **「📌 今日やること」**（db の `today/*` の最新。
  秘書が毎朝のブリーフィングと同時に重要な順で更新）→ **「あなたの番」**（db の `inbox/*` で status が
  open のもの。返事の札を押すとコピー、📋 で投稿文コピー、「済み」で
  ページが status:done に更新）→ マップ（キャラをタップで詳細）→
  「本業 更新スケジュール」欄（初期値は `seo/schedule.md` の要約。db の
  `schedule/*` と `office/schedule` のうち updated_at が新しいものを表示）。
  キャラは出勤時刻の約2時間前（人により±30分）にドアから出社し、待機中は
  歩き回り、稼働中は自席で作業、出勤から2時間（または最後の報告から1時間）
  たつと帰る。不在の社員はマップ下の一覧に出社予定とともに表示。
- `office-cards.html` — 部署別カード版（前バージョン）。スマホでの可読性重視。

どちらも同じ db（employees / activity / office/stats）を読む。マップ版は
担当者の状態に、`employees/<id>` より新しい `activity` の同名エントリがあれば
そちらを使う（ツールからは既存ドキュメントを更新できないため）。

その他のボードのソース:

- `blog-board.html` — 辰弥塗装工業 ブログ記事ボード
  （https://claude.ai/code/artifact/f489999f-7e8e-4453-984a-3a193aab70fd）。
  塗装ブログライターが記事ごとにカードを追加し、同じURLに republish する。
- `finishing-sheet.html` — 仕上げ質問シート
  （https://claude.ai/code/artifact/a2022666-784a-45e2-b650-c67103b3d4df）。
- `product-board.html` — 企画ボード
  （https://claude.ai/artifact/HKPwK3npkyC3XTYYjziMHU）。企画リサーチャーが
  毎週の稼働後に `product/pipeline.md` と `product/reports/` の最新から
  書き直し、同じURLに republish する。オフィスボードのリンク列と、
  マップで企画リサーチャーをタップした詳細から開ける。
