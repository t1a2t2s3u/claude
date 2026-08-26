# data/

`npm run fetch` が実際の株価（日足）を書き出す場所です。中身は生成物なので
Git では追跡していません（提供元の利用条件もあるため再配布しません）。

```
data/
  universe.json        銘柄一覧・営業日カレンダー・取得メタ情報
  prices/<code>.json   1 銘柄ぶんの日足と配当
```

取得コマンドの例:

```bash
npm run fetch                                  # 日本の主要 40 銘柄・過去 10 年
npm run fetch -- --preset all --years 5        # 日米 60 銘柄・過去 5 年
npm run fetch -- --symbols 7203,6758,AAPL      # 銘柄を指定
npm run fetch -- --source stooq                # 取得元を Stooq に切り替え
```

外貨建ての銘柄は、取得時点の為替レートで基準通貨（既定は円）に換算して保存します。
