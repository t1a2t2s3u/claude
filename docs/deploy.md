# サイトの公開手順

ドメイン取得から公開、Search Console 登録までの手順です。
上から順に進めれば公開できます。

## 全体の流れ

```
1. ドメインを取得する            ✅ 完了（tatsumi-tosou.com）
2. Cloudflare Workers で公開する ✅ 完了（orange-boat-b4db）
3. 独自ドメインを割り当てる      ✅ 完了
4. GitHub と連携して更新を自動化 ← いまここ
5. Search Console に登録する
6. 会社情報を記入する            ✅ 完了
```

サーバー代はかかりません。かかるのはドメイン代だけです。

会社情報の記入は完了しているので、残りは公開の作業だけです。

---

## 1. ドメインを取得する ✅ 完了

**取得済み：`tatsumi-tosou.com`**

`site/site.toml` の `base_url` に設定済みです。

> **www あり・なしについて**：正とするのは `https://tatsumi-tosou.com`
> （www なし）です。両方でサイトが見えると Google からは別々のサイトに見え、
> 評価が分散します。`www.tatsumi-tosou.com` は手順3で www なしへ転送します。

> **更新料の確認を忘れずに**：初年度が安いドメインは2年目以降に値上がりする
> ことがあります。取得先の管理画面で更新料と自動更新の設定を確認してください。
> **ドメインを失効させると、サイトが消えるだけでなく、他人に取得される
> 可能性があります。**

---

## 2. Cloudflare Workers で公開する ✅ 完了

[Cloudflare](https://dash.cloudflare.com/) の無料アカウントで、`dist/` を
そのままアップロードして作った Worker (`orange-boat-b4db`) で公開している。

> **Pages ではなく Workers を使っている。** 当初は Pages + Git 連携を
> 想定していたが、実際には Workers の直接アップロードで立ち上げた。
> ダッシュボードから zip を再アップロードする機能は Workers には無いため、
> 更新は手順4の GitHub 連携で行う。

---

## 3. 独自ドメインを割り当てる ✅ 完了

ネームサーバーを Cloudflare (`andy` / `emerie.ns.cloudflare.com`) に向け、
Worker の **Domains** に `tatsumi-tosou.com` を登録してある。

### つまずいた点（同じことが起きたとき用）

**お名前.com から引き継がれた A レコードが残っていると、そちらが優先される。**
Cloudflare 移管時に既存レコードが取り込まれるため、`@` と `www` の A レコード
(`157.120.209.207`) が残り、Worker ではなく旧サーバーの nginx が応答していた。
症状は「Forbidden」→ 削除後は Cloudflare の「Error 1016」。

DNS から次の2件を削除して解決した。

| 種別 | 名前 | 内容 |
|---|---|---|
| A | `@` | `157.120.209.207` |
| A | `www` | `157.120.209.207` |

**MX・TXT（SPF / DKIM）は消さないこと。** メールが届かなくなる。

さらに、競合したまま登録した Custom Domain は壊れた状態
（A/AAAA を一切返さない）になっていた。**一度削除して登録し直すと直る。**

> 切り分けの順番として、まず `dig` などで権威サーバーに直接 A レコードを
> 引くこと。ネームサーバーが切り替わっているかどうかは数秒で分かるので、
> 「まだ反映されていないだけ」と待ち続けずに済む。

### www ありを、www なしへ転送する

`www` の A レコードを削除したため、`www.tatsumi-tosou.com` は現在どこにも
つながらない。Cloudflare の **Rules** → **Redirect Rules** で
`https://tatsumi-tosou.com` へ 301 転送する設定を1つ作ること。

両方でサイトが見えると Google からは別々のサイトに見え、評価が分散する。

---

## 4. GitHub と連携して更新を自動化する

Workers のダッシュボードには「zip を上げ直す」機能が無い（あるのは
`Edit code` と `Visit` だけ）。そのため、GitHub のブランチを Cloudflare に
つないで、push したら自動で公開される形にする。

### リポジトリ側（設定済み）

| ファイル | 役割 |
|---|---|
| `wrangler.toml` | 更新先の Worker 名と、公開するディレクトリ |
| `dist/` | ビルド済みの成果物。`.gitignore` から外してある |

`wrangler.toml` の `name` は Cloudflare 上の Worker 名と一致していなければ
ならない。ずれると既存サイトが更新されず、別の Worker が黙って新規作成される。
`tests/test_deploy_config.py` で固定してある。

**Cloudflare 側ではビルドしない。** Python が使える保証がないため、
ビルド済みの `dist/` をリポジトリに含める方式にしている。

### Cloudflare 側の設定（初回だけ）

1. Worker → **Settings** → **Build** → **Git repository** → **GitHub**
2. リポジトリ `t1a2t2s3u/claude` を選ぶ
3. 本番ブランチに `claude/seo-meo-automation-mvntxp` を指定
4. Build command は**空のまま**、Deploy command は `npx wrangler deploy`

### 以後の更新手順

```bash
seo-meo site-build --strict   # dist/ を作り直す
git add dist && git commit && git push
```

push すると Cloudflare が自動で公開する。`--strict` を付けているので、
`【要記入】` が1つでも残っていればビルドが失敗し、公開されない。

**`dist/` の commit を忘れると、サイトは変わらない。** `site/` を編集した
ときは必ずビルドし直してから commit すること。

---

## 5. Search Console に登録する

サイトが表示されるようになったら登録します。ここで初めて
「どんな語で検索されているか」のデータが手に入ります。

1. [Search Console](https://search.google.com/search-console) を開く
2. 「プロパティを追加」→ **ドメイン** を選択し、ドメイン名を入力
3. 表示された TXT レコードを、Cloudflare の **DNS** 設定に追加
4. 「確認」を押す
5. 左メニューの **サイトマップ** に `sitemap.xml` を送信

データが溜まり始めるまで数日かかります。

---

## 6. 会社情報を記入する

公開前に、`【要記入】` が残っていないか確認してください。

```bash
seo-meo site-build --strict
```

未記入の項目があると、一覧が表示されて失敗します。すべて埋まると成功します。

記入する必要があるファイル:

2026年8月時点で、記入は**すべて完了しています**。上のコマンドが成功すれば
公開して問題ありません。

内容を変更したくなったときに触るファイルは次のとおりです。

| ファイル | 内容 |
|---|---|
| `site/site.toml` | 公開URL |
| `site/company.toml` | 住所・電話番号・営業時間・対応エリア・保有資格 |
| `site/services.toml` | パック料金と工事の内容 |
| `site/testimonials.toml` | お客様の声 |
| `site/pages/about.md` | 会社紹介の本文 |
| `site/works/*.md` | 施工事例 |

> **住所・電話番号は Google ビジネスプロフィールの登録内容と一字一句そろえて
> ください。**「1-2-3」と「一丁目2番3号」のような表記ゆれでも、Google からは
> 別の情報に見えます。これは MEO の減点要因です。

---

## 公開後にやること

### 施工事例を足していく

塗装業で最も問い合わせにつながるコンテンツです。工事が終わるたびに
1件ずつ足していってください。手順は README の「施工事例を追加する」を参照。

**写真は必ずご自身で撮ったものを使ってください。** フリー素材や他社の写真を
使うと、実績の誤認にあたります。

### GBP と連動させる — 公開したらすぐに

Google ビジネスプロフィールの「ウェブサイト」欄に
`https://tatsumi-tosou.com` を登録してください。

**この欄は現在、空になっています。** 以前登録されていたURLがすでに存在しない
サイトを指しており、プロフィールを見た人がタップするとエラー画面が出る状態
だったため、いったん削除しました。ここを埋め直すのが公開後の最初の仕事です。

登録すると GBP の `WEBSITE_CLICKS`（サイトクリック）が計測できるようになり、
週次レポートに反映されます。

### 効果を確認する

```bash
seo-meo report --out -
```

サイト公開の前後で、GBP の表示回数とサイトクリックがどう動いたかを
比較できます。
