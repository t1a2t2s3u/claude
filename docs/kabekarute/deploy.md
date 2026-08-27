# kabekarute.com の公開手順

カベカルテを kabekarute.com で公開するための手順です。
リポジトリ側の準備（`app/kabekarute/wrangler.toml`）は済んでいるので、
残りは Cloudflare の画面操作だけです。tatsumi-tosou.com のときと
ほぼ同じ流れなので、2回目はだいぶ楽なはずです。

## 全体の流れ

```
1. kabekarute.com を Cloudflare に追加する ✅ 完了（2026-08-27）
2. ネームサーバーを Cloudflare に向ける    ✅ 完了
3. Worker を Git リポジトリから作る        ✅ 完了（Worker名: kabekarute）
4. Worker に kabekarute.com を割り当てる   ✅ 完了・開通確認済み
```

**公開済み: https://kabekarute.com**

> 初回構築時のメモ: Worker 作成画面ではブランチを選べず、標準ブランチで
> ビルドが失敗した。作成後に Settings → Build → Branch control で
> Production branch を `claude/seo-meo-automation-mvntxp` に変更して解決。
> 残タスク: www.kabekarute.com → kabekarute.com の301リダイレクト
> （Rules → Redirect Rules。未設定でも表示には支障なし）

---

## 1. kabekarute.com を Cloudflare に追加する

1. [Cloudflare](https://dash.cloudflare.com/) にログイン
2. 「＋ サイトを追加」→ `kabekarute.com` を入力 → 無料プランを選択
3. 表示される **2つのネームサーバー名**（`○○.ns.cloudflare.com`）をメモ

> 取得したばかりのドメインなので、tatsumi-tosou.com のときのような
> 「古いAレコードが残っていて旧サーバーが応答する」問題は起きません。
> DNSレコードの取り込み画面に何か出てきても、空のまま進めてOKです。

## 2. ネームサーバーを Cloudflare に向ける

ドメインを取得した業者（お名前.com など）の管理画面で、
ネームサーバーを手順1でメモした2つに変更します。

- 反映まで数分〜数時間かかることがあります
- Cloudflare のサイト一覧で kabekarute.com が「アクティブ」になれば完了

## 3. Worker を Git リポジトリから作る

1. Cloudflare の **Workers & Pages** → 「作成」→ **「リポジトリをインポート」**
2. リポジトリ `t1a2t2s3u/claude` を選ぶ
3. 設定は次のとおり:

| 項目 | 値 |
|---|---|
| プロジェクト名（Worker名） | `kabekarute` ※必ずこの名前に |
| 本番ブランチ | `claude/seo-meo-automation-mvntxp` |
| **ルートディレクトリ（Path）** | `app/kabekarute` ※ここが重要 |
| ビルドコマンド | 空のまま |
| デプロイコマンド | `npx wrangler deploy` |

> **Worker 名は `kabekarute` にしてください。** リポジトリ内の
> `app/kabekarute/wrangler.toml` の name と一致していないと、
> 別の Worker が黙って新規作成されます（サイト本体で経験したのと
> 同じ落とし穴です）。

4. デプロイが走って、`kabekarute.workers.dev` のようなURLで
   一度表示確認できます

## 4. Worker に kabekarute.com を割り当てる

1. 作った Worker → **設定（Settings）** → **ドメインとルート（Domains & Routes）**
2. 「カスタムドメインを追加」→ `kabekarute.com` を入力
3. あわせて `www.kabekarute.com` → `https://kabekarute.com` への
   301リダイレクトを **Rules → Redirect Rules** で1つ作る
   （tatsumi-tosou.com のときと同じ理由。両方で見えると評価が分散する）

---

## 公開後の確認

- https://kabekarute.com/ でホームが開く
- 「診断・見積り」を開いて、書類の生成まで動く
- スマホでも確認（ホーム画面に追加までやっておくと営業時に見せられる）

## 以後の更新

リポジトリの `app/kabekarute/` を変更して本番ブランチに push すれば、
サイト本体と同じように自動で反映されます（Claude に依頼すればそこまで
やります）。tatsumi-tosou.com/kabekarute/ にも同じものが同梱されて
いますが、今後の案内は kabekarute.com に一本化してください。

## メモ

- 現在、全ページに noindex（検索に載せない設定）が入っています。
  **販売ページと利用規約を整えて売り出すタイミングで外す**予定です。
  外すときは Claude に「kabekarute.com の noindex を外して」と言えばOK
- 商標の確認（J-PlatPat）は `docs/kabekarute/shohyo.md` の手順で
