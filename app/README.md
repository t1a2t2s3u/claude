# Sonae アプリ版（iOS / Android）

リポジトリ直下の `index.html` を、そのままネイティブアプリとして包んだものです。
本体は書き換えません。アプリ用に手を入れたい場合も `index.html` 側で
`window.Capacitor` の有無を見て分岐させ、1枚ものを保ってください。

## 組み立てかた

```
npm ci
npm run sync          # www/ を作り直して iOS / Android の両方へ流し込む
npm run open:android  # Android Studio で開く
npm run open:ios      # Xcode で開く（Mac が必要）
```

`www/` は毎回 `scripts/build-www.mjs` が作り直すので、Git では追いません。
このスクリプトは `index.html` に記録が埋め込まれたままだと**ビルドを止めます**
（誰かの帳簿が入ったアプリを配ってしまわないため）。

## ビルドはどこで行うか

| | ビルドできる場所 |
| --- | --- |
| Android | GitHub Actions（`.github/workflows/app-android.yml`）。開発コンテナには Android SDK が入りません（`dl.google.com` がネットワークで遮断されています） |
| iOS | Xcode のある Mac、または GitHub Actions の macOS ランナー |

Android は `index.html` / `release/` / `app/` に変更を入れて push するたびに
デバッグ版 APK が作られ、Actions の成果物として残ります。
**ストアを通さず配るなら、この APK をそのまま渡せます。**

## Google Play に出すとき

Play が受け付けるのは APK ではなく **AAB** です。CI は署名鍵が登録されていれば
AAB も作ります。鍵が無いあいだは、その手順だけ自動で飛ばします。

### 1. アップロード鍵を作る

**Play App Signing を使ってください。** 配信用の鍵は Google が預かり、
ここで作るのは「アップロード鍵」です。アップロード鍵を失っても
Google に再設定を申請できます（配信用の鍵を自分で持つ場合、失うと
そのアプリを二度と更新できません）。

Java の入った端末で:

```
keytool -genkeypair -v -keystore upload.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias upload
```

`upload.jks` と入力したパスワードは、**リポジトリに入れず**手元で保管してください。

### 2. GitHub のシークレットに登録する

リポジトリの Settings → Secrets and variables → Actions で4つ登録します。

| 名前 | 中身 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 upload.jks` の出力 |
| `ANDROID_KEYSTORE_PASSWORD` | キーストアのパスワード |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | 鍵のパスワード |

登録すると、次の push から `sonae-release-aab` が成果物に加わります。

### 3. Play Console 側で要るもの

- 開発者登録（25ドル・一度きり）
- **プライバシーポリシーのURL** — `release/privacy.html` を公開した場所を指定します。
  公開前に「お問い合わせ」の連絡先を記入してください
- データセーフティの申告 — 収集・共有ともに「なし」。ただし書体を
  Google Fonts から読み込むため、その通信は privacy.html に書いてあります
- スクリーンショット、アイコン（`assets/icon.png`）、説明文

バージョンを上げるときは `android/app/build.gradle` の `versionCode`（整数、
毎回増やす）と `versionName`（表示用）を変えてください。

## 設定の置き場所

| 変えたいもの | ファイル |
| --- | --- |
| アプリ名・ID | `capacitor.config.json`、`android/app/src/main/res/values/strings.xml` |
| バージョン | `android/app/build.gradle` |
| 画面の向き | `android/app/src/main/AndroidManifest.xml`、`ios/App/App/Info.plist` |
| アイコン・起動画面 | `assets/` に入れ直して `npx capacitor-assets generate` |
