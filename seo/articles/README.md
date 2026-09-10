# seo/articles/ — 塗装ブログ記事の流れ

ブログライター（`.claude/skills/seo-writer/`）が書く、ホームページ
（https://tatsumi-tosou.com/blog/）向けの記事の置き場です。

```
seo/briefs/            ← ディレクターの執筆指示（狙う検索語・構成）
seo/articles/drafts/   ← 記事本体（サイト形式 .md）＋ メモ（.memo.md）
                          状態: 確認待ち → 公開OK → 公開済み
seo/articles/published/← 公開した記事のコピーとメモ（URL付き）
```

**公開はオーナーのOKが出てから。** 記事はブログ記事ボード
（CLAUDE.md の「Blog board」）に確認待ちで並びます。オーナーがチャットで
「ブログ <スラッグ> OK」または「修正: …」と返すと、ライターが公開作業
（別ブランチ `claude/seo-meo-automation-mvntxp` の `site/posts/` へ入稿・
ビルド・push）を行います。

公開済み記事（2026-09-10 時点。ソースは上記ブランチの `site/posts/`）:

| 公開日 | タイトル | URL |
|---|---|---|
| 2026-08-23 | 秋田市の外壁塗装はいつがいい？雪と塩害から考える塗り替え時期 | /blog/2026-08-akita-nurikae-jiki/ |
| 2026-08-26 | 秋田市の外壁塗装に補助金は使える？2026年度の制度をまとめました | /blog/2026-08-akita-gaiheki-hojokin/ |
| 2026-09-07 | 外壁塗装の色選びで失敗しないために。人気の色と、秋田で映える色 | /blog/2026-09-gaiheki-iro-erabi/ |
