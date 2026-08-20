# サイトの公開手順

ドメイン取得から公開、Search Console 登録までの手順です。
上から順に進めれば公開できます。

## 全体の流れ

```
1. ドメインを取得する          （年間 1,000〜2,000円程度）
2. Cloudflare Pages に接続する （無料）
3. 独自ドメインを割り当てる
4. Search Console に登録する
5. 会社情報を記入して再公開する
```

サーバー代はかかりません。かかるのはドメイン代だけです。

---

## 1. ドメインを取得する

塗装業の場合、覚えやすさより**社名との一致**を優先してください。
GBP の登録名と揃っているほうが、同一の事業者だと認識されやすくなります。

**候補の例**

- `tatsuya-tosou.jp`
- `tatsuyatosou.com`

**取得先**

| サービス | 特徴 |
|---|---|
| お名前.com / ムームードメイン | 国内大手。日本語のサポートあり |
| Cloudflare Registrar | 原価で提供。ただし手続きは英語 |

`.jp` は日本の事業者であることが伝わる一方、`.com` より高価です。
どちらでも検索順位に差はありません。

> **注意**：初年度が極端に安いドメインは、2年目以降に大きく値上がりすることが
> あります。**更新料**を確認してから契約してください。

---

## 2. Cloudflare Pages に接続する

[Cloudflare](https://dash.cloudflare.com/) の無料アカウントを作成します。

1. ダッシュボードで **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. このリポジトリを選択
3. ビルド設定を次のようにする

| 項目 | 値 |
|---|---|
| Framework preset | None |
| Build command | `pip install -e . && seo-meo site-build --out dist` |
| Build output directory | `dist` |
| Environment variables | `PYTHON_VERSION` = `3.11` |

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

### 公開後に必ずやること

`site/site.toml` の `base_url` を、実際のURLに書き換えてください。

```toml
[site]
base_url = "https://tatsuya-tosou.jp"
```

ここが仮のままだと、`canonical` タグと `sitemap.xml` が誤ったURLを指し、
**検索エンジンに正しくインデックスされません。**

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

| ファイル | 内容 |
|---|---|
| `site/site.toml` | 公開URL |
| `site/company.toml` | 住所・電話番号・営業時間・対応エリア・建設業許可番号 |
| `site/services.toml` | 各工事の料金 |
| `site/pages/about.md` | 会社紹介の本文 |
| `site/works/*.md` | 施工事例（見本のファイルは削除してください） |

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

### GBP と連動させる

サイトができたら、Google ビジネスプロフィールの「ウェブサイト」欄に
このURLを登録してください。GBP の `WEBSITE_CLICKS`（サイトクリック）が
計測できるようになり、週次レポートに反映されます。

### 効果を確認する

```bash
seo-meo report --out -
```

サイト公開の前後で、GBP の表示回数とサイトクリックがどう動いたかを
比較できます。
