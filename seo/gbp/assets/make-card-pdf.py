"""口コミのお願いカードの印刷用PDFを作る。

名刺サイズ（91×55mm）を A4 に 2列×5段＝10面付け。トンボの代わりに
細い灰色の枠を引き、ハサミやカッターで切れるようにしている。

文面は seo/gbp/review-request.md のカード版（2026-10-15 オーナーOK済み）を
そのまま使う。QRは seo/gbp/assets/review-qr.png（クチコミを書く直リンク入り）。

使い方:
    apt-get install -y fonts-noto-cjk
    pip install playwright
    python3 seo/gbp/assets/make-card-pdf.py \
        seo/gbp/assets/review-qr.png \
        seo/gbp/assets/review-card-a4.pdf \
        /tmp/preview.png
"""

import base64
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

QR = Path(sys.argv[1])
OUT_PDF = Path(sys.argv[2])
OUT_PNG = Path(sys.argv[3])

qr_b64 = base64.b64encode(QR.read_bytes()).decode()

CARD = f"""
<div class="card">
  <div class="name">辰弥塗装工業</div>
  <p>このたびは工事をご依頼いただき、ありがとうございました。</p>
  <p>もしよろしければ、Googleに工事のご感想をお寄せください。良かった点も、気になった点も、
     そのままのお言葉でかまいません。これから塗り替えを考える方の参考になります。</p>
  <p class="opt">ご投稿は任意です。書かなくても、今後の対応は何も変わりません。</p>
  <div class="foot">
    <img class="qr" src="data:image/png;base64,{qr_b64}" alt="">
    <div class="foot-text">スマートフォンで読み取ると、<br>感想を書く画面が開きます。</div>
  </div>
</div>
"""

HTML = """<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Noto Sans CJK JP", sans-serif;
    color: #111;
    -webkit-font-smoothing: antialiased;
  }
  .sheet {
    width: 210mm; height: 297mm;
    padding: 11mm 7mm;
    display: grid;
    grid-template-columns: 91mm 91mm;
    grid-template-rows: repeat(5, 55mm);
    column-gap: 14mm;
  }
  .card {
    width: 91mm; height: 55mm;
    border: 0.2mm solid #d8d8d8;
    padding: 4.0mm 4.5mm 3.4mm;
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .name {
    font-size: 8.4pt; font-weight: 700; letter-spacing: .04em;
    margin-bottom: 2.2mm;
  }
  p { margin: 0 0 1.7mm; font-size: 6.4pt; line-height: 1.62; }
  .opt { color: #555; font-size: 6.0pt; }
  .foot {
    margin-top: auto;
    display: flex; align-items: center; gap: 2.8mm;
  }
  /* 画像の約78%が符号部分。符号を16mm以上にするため画像は20.5mmで置く
     （まわりの白い余白＝クワイエットゾーンは切らない） */
  .qr { width: 20.5mm; height: 20.5mm; display: block; }
  .foot-text { font-size: 6.2pt; line-height: 1.55; }
</style></head>
<body><div class="sheet">__CARDS__</div></body></html>
""".replace("__CARDS__", CARD * 10)

with sync_playwright() as pw:
    import glob
    exe = (glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome") or [None])[0]
    browser = pw.chromium.launch(executable_path=exe) if exe else pw.chromium.launch()
    page = browser.new_page()
    page.set_content(HTML, wait_until="load")
    page.pdf(path=str(OUT_PDF), width="210mm", height="297mm", print_background=True)
    page.set_viewport_size({"width": 794, "height": 1123})
    page.screenshot(path=str(OUT_PNG), full_page=True)
    browser.close()

print("PDF:", OUT_PDF, OUT_PDF.stat().st_size, "bytes")
print("PNG:", OUT_PNG, OUT_PNG.stat().st_size, "bytes")
