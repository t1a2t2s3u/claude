# 補助金記事のサムネイルを生成する。
# ストック素材は透かし・ライセンスの問題があるため、看板類と同じく
# 自前で描く。配色はサイト（site/assets/style.css）と共通。
# 一覧では 320x240 で表示されるため、4:3 で作る。
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 960, 720
DEEP = "#0b4a5f"
DEEPEST = "#06333f"
BRAND = "#00a3c9"
ACCENT = "#e2661f"
PAPER = "#f7fbfd"

FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf"


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size)


def center_text(draw, y, text, f, fill):
    w = draw.textlength(text, font=f)
    draw.text(((W - w) / 2, y), text, font=f, fill=fill)


img = Image.new("RGB", (W, H), PAPER)
d = ImageDraw.Draw(img)

# 上下の帯。遠目でもサイトと同じ会社だと分かる色にする
d.rectangle([0, 0, W, 14], fill=DEEP)
d.rectangle([0, H - 14, W, H], fill=ACCENT)

# 家のピクトグラム。写真が無いテーマなので図で内容を示す
hx, hy = W // 2, 200
d.polygon([(hx - 150, hy), (hx, hy - 105), (hx + 150, hy)], fill=DEEP)
d.rectangle([hx - 110, hy, hx + 110, hy + 120], fill="#ffffff", outline=DEEP, width=6)
d.rectangle([hx - 30, hy + 45, hx + 30, hy + 120], fill=BRAND)

# 円形の「¥」バッジ。補助金＝お金の話であることを一目で
bx, by, br = hx + 150, hy + 30, 74
d.ellipse([bx - br, by - br, bx + br, by + br], fill=ACCENT, outline="#ffffff", width=8)
fy = font(84)
yw = d.textlength("¥", font=fy)
d.text((bx - yw / 2, by - 52), "¥", font=fy, fill="#ffffff")

center_text(d, 388, "秋田市・秋田県〈2026年度版〉", font(40), BRAND)
center_text(d, 448, "外壁塗装の", font(64), DEEPEST)
center_text(d, 524, "補助金・助成金", font(96), DEEP)
center_text(d, 648, "対象になる条件と、申し込む前の注意点", font(36), "#5b6b72")

out = Path(__file__).resolve().parents[2] / "site" / "assets" / "blog" / "hojokin.png"
out.parent.mkdir(parents=True, exist_ok=True)
img.save(out, optimize=True)
print(f"書き出しました: {out}")
