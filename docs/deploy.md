# サイトの公開手順

ドメイン取得から公開、Search Console 登録までの手順です。
上から順に進めれば公開できます。

## 全体の流れ

```
1. ドメインを取得する          ✅ 完了（tatsumi-tosou.com）
2. Cloudflare Pages に接続する （無料）      ← いまここ
3. 独自ドメインを割り当てる
4. Search Console に登録する
5. 会社情報を記入する          ✅ 完了
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

## 2. Cloudflare Pages に接続する

[Cloudflare](https://dash.cloudflare.com/) の無料アカウントを作成します。

1. ダッシュボードで **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. このリポジトリを選択
3. ビルド設定を次のようにする

| 項目 | 値 |
|---|---|
| Framework preset | None |
| Build command | `pip install -e . && seo-meo site-build --out dist --strict` |
| Build output directory | `dist` |
| Environment variables | `PYTHON_VERSION` = `3.11` |

`--strict` を付けているのは、**未記入の項目が残ったまま公開されるのを防ぐ**
ためです。`【要記入】` が1つでも残っているとビルドが失敗し、公開されません。

`PYTHON_VERSION` は必ず `3.11` 以上にしてください。設定ファイルの読み込みに
使っている `tomllib` が、それより古い Python には入っていません。

4. **Save and Deploy**

数分で `〇〇.pages.dev` のURLで公開されます。この時点では仮のURLです。

> ビルドがPythonで動かない場合は、代わりに GitHub Actions
> (`.github/workflows/deploy-site.yml`) でビルドしたものを配信する方法に
> 切り替えられます。同ファイルのコメントを参照してください。

---

## 3. 独自ドメインを割り当てる

1. Cloudflare Pages のプロジェクト → **Custom domains** → **Set up a domain**
2. 取得したドメインを入力
3. 表示された **ネームサーバー**を、ドメインを取得したサービスの管理画面で設定する

反映には数時間〜1日かかることがあります。HTTPS の証明書は Cloudflare が
自動で用意するので、設定は不要です。

### www ありを、www なしへ転送する

Cloudflare の **Rules** → **Redirect Rules** で、`www.tatsumi-tosou.com` への
アクセスを `https://tatsumi-tosou.com` へ転送する設定を1つ作ります
（種別は「301 Permanent Redirect」）。

両方でサイトが見えると Google からは別々のサイトに見え、評価が分散します。

---

## 4. Search Console に登録する

サイトが表示されるようになったら登録します。ここで初めて
「どんな語で検索されているか」のデータが手に入ります。

1. [Search Console](https://search.google.com/search-console) を開く
2. 「プロパティを追加」→ **ドメイン** を選択し、ドメイン名を入力
3. 表示された TXT レコードを、Cloudflare の **DNS** 設定に追加
4. 「確認」を押す
5. 左メニューの **サイトマップ** に `sitemap.xml` を送信

データが溜まり始めるまで数日かかります。

---

## 5. 会社情報を記入する

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
