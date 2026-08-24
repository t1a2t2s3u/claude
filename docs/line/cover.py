"""LINE 公式アカウントのプロフィール背景画像を作る。1080 x 878。

サイトのヒーローと同じ写真・同じ配色にして、サイトから来た人が
「同じ会社だ」と一目で分かるようにする。
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont

W, H = 1080, 878
ROOT = Path(__file__).resolve().parents[2]
PHOTO = ROOT / "site" / "assets" / "works" / "gaiheki-green.jpg"
LOGO = ROOT / "site" / "assets" / "logo.png"
FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf"

BRAND_DEEP = (11, 74, 95)
ACCENT = (226, 102, 31)


def font(size):
    return ImageFont.truetype(FONT, size)


def cover(photo, size):
    """短辺に合わせて拡大し、中央で切り抜く。"""
    tw, th = size
    scale = max(tw / photo.width, th / photo.height)
    resized = photo.resize((round(photo.width * scale), round(photo.height * scale)),
                           Image.LANCZOS)
    left = (resized.width - tw) // 2
    top = (resized.height - th) // 2
    return resized.crop((left, top, left + tw, top + th))


img = cover(Image.open(PHOTO).convert("RGB"), (W, H))
img = ImageEnhance.Color(img).enhance(0.75)

# 文字を読ませるために、深い青緑を重ねる。写真をそのまま使うと白文字が沈む。
veil = Image.new("RGB", (W, H), BRAND_DEEP)
img = Image.blend(img, veil, 0.62)

d = ImageDraw.Draw(img)

logo = Image.open(LOGO).convert("RGBA")
lw = 360
logo = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
# ロゴは水色。重ねた青緑の上では沈むので、白に置き換えて使う。
white_logo = Image.new("RGBA", logo.size, (255, 255, 255, 0))
white_logo.putalpha(logo.getchannel("A"))
img.paste(white_logo, ((W - lw) // 2, 96), white_logo)


def centered(text, y, fnt, fill, bold=0):
    l, t, r, b = d.textbbox((0, 0), text, font=fnt)
    d.text(((W - (r - l)) / 2 - l, y), text, font=fnt, fill=fill,
           stroke_width=bold, stroke_fill=fill)


centered("秋田市・潟上市の", 348, font(64), (255, 255, 255), 1)
centered("外壁・屋根塗装", 442, font(64), (255, 255, 255), 1)

# 帯にして、無料であることだけを最後に残す
bar_h, bar_w = 96, 660
bx, by = (W - bar_w) // 2, 604
d.rounded_rectangle([bx, by, bx + bar_w, by + bar_h], radius=bar_h // 2, fill=ACCENT)
f = font(46)
l, t, r, b = d.textbbox((0, 0), "現地調査・お見積り無料", font=f)
d.text((W / 2 - (r - l) / 2 - l, by + (bar_h - (b - t)) / 2 - t),
       "現地調査・お見積り無料", font=f, fill=(255, 255, 255), stroke_width=1,
       stroke_fill=(255, 255, 255))

centered("一級塗装技能士在籍 ／ 完全自社施工 ／ 保証 最大5年",
         742, font(34), (216, 234, 240))

out = str(Path(__file__).with_name("cover.png"))
img.save(out, "PNG", optimize=True)
print(out, img.size)
