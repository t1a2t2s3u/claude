# Sonae をアプリとして配布する

`index.html` は1枚で完結しているので、静的ホスティングに置くだけで動きます。
このフォルダのファイルを `index.html` と**同じ階層**に並べると、
ホーム画面に追加したときに本物のアプリのように振る舞います。

```
your-site/
  index.html            ← リポジトリ直下のものをコピー
  manifest.webmanifest
  sw.js
  icon-180.png
  icon-192.png
  icon-512.png
```

`index.html` は、`window.claude` が無く `file:` でもないときだけ
manifest を読み込み、`sw.js` を登録します。
つまり Claude の Artifact 上では今までどおり動き、
自前のサーバーに置いたときだけ PWA になります。

## これで手に入るもの

- **ホーム画面から全画面で起動**（Safari のアドレスバーが出ない）
- **オフラインで起動できる**。`sw.js` が本体とアイコンをキャッシュします。
  Google Fonts も一度読めばキャッシュし、取れないときはシステムフォントに落ちます
- **アイコンが「そ」になる**（追加時のスクリーンショットではなく）

## 置き場所の条件

- **HTTPS が必須**です（`localhost` は例外）。Service Worker が動きません
- サブディレクトリでも動きます（パスはすべて相対で書いてあります）
- 無料で使えるところ：GitHub Pages / Cloudflare Pages / Netlify / Vercel

GitHub Pages なら、リポジトリの Settings → Pages でブランチを選ぶだけです。
`index.html` と `release/` の中身を同じ階層に置いてください。

## 更新するとき

`index.html` を差し替えたら、`sw.js` の `CACHE = 'sonae-v1'` の
**数字を上げてください**。古いキャッシュが残って更新が反映されない事故を防げます。

本体は network-first で取りに行くので、通信があれば基本は最新が出ます。
バージョンを上げるのは、アイコンや manifest を変えたときに確実にするためです。

## App Store / Google Play に出す場合

PWA のままでは出せません。Capacitor などで包む必要があります。

- **iOS**：Apple Developer Program（年 $99）と審査が必要です。
  税金の計算を扱うので、審査では「概算であり税務相談ではない」ことが
  はっきりしているかを見られます。アプリ内の「このアプリについて」に
  その記載があります
- **Android**：Google Play Console（初回 $25）。PWA のまま
  [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity)
  で包む方法もあります

## まだできていないこと

- **納付期限のプッシュ通知**。Web Push には送信元のサーバーと
  VAPID 鍵が必要で、静的ホスティングだけでは完結しません。
  iOS ではホーム画面に追加した PWA でのみ受け取れます
- **レシート写真**。画像は保存先が別に要ります（IndexedDB など）。
  いまの「1ファイルにすべて入れる」構成とは相性が悪いので入れていません
- **画面ロック**。データは端末内に平文で置かれるので、
  PIN をつけても見た目だけの安心になります。
  端末自体のロックに任せるのが正直なところです
