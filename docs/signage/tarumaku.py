"""足場に掛ける垂れ幕。1800mm × 1200mm を想定。

同業他社が実際に使っている形に寄せた。白地・太字・大きい文字。足場の
養生シートが薄い灰色なので、白地のほうが遠くから見つけやすい。

上の3つの札は「他社との違い」を一目で伝えるためのもの。ここに書けるのは
事実だけ。建設業許可は未取得なので、それらしい表示はしない。
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

MM = 1.2
W, H = int(1800 * MM), int(1200 * MM)

ROOT = Path(__file__).resolve().parents[2]
MARK = ROOT / "site" / "assets" / "mark.png"
FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf"

DEEP = (11, 74, 95)
CYAN = (0, 163, 201)
ACCENT = (226, 102, 31)
WHITE = (255, 255, 255)

img = Image.new("RGB", (W, H), WHITE)
d = ImageDraw.Draw(img)


def font(size):
    return ImageFont.truetype(FONT, int(size * MM))


def mm(v):
    return int(v * MM)


def text(xy, s, size, fill, anchor="la", bold=0):
    d.text(xy, s, font=font(size), fill=fill, anchor=anchor,
           stroke_width=int(bold * MM), stroke_fill=fill)


def width_of(s, size):
    l, _, r, _ = d.textbbox((0, 0), s, font=font(size))
    return r - l


# 外枠。白地だけだと空とシートに溶けるので輪郭をつける
d.rectangle([0, 0, W - 1, H - 1], outline=DEEP, width=mm(14))

pad = mm(70)

# --- 上段の札 ---
tags = [("自社施工", DEEP), ("一級塗装技能士 在籍", CYAN), ("秋田市・潟上市", ACCENT)]
x, ty, th, ts = pad, mm(72), mm(88), 44
for label, color in tags:
    w = width_of(label, ts) + mm(56)
    d.rounded_rectangle([x, ty, x + w, ty + th], radius=mm(10), fill=color)
    text((x + w / 2, ty + th / 2), label, ts, WHITE, anchor="mm", bold=1)
    x += w + mm(22)

# --- ロゴマーク ---
mark = Image.open(MARK).convert("RGBA")
ms = mm(330)
mark = mark.resize((ms, ms), Image.LANCZOS)
img.paste(mark, (pad, mm(268)), mark)

# --- 主文 ---
tx = pad + ms + mm(56)
text((tx, mm(250)), "屋根・外壁塗装", 150, DEEP, bold=3)
text((tx, mm(430)), "防水工事", 150, DEEP, bold=3)

sw = width_of("防水工事", 150)
cx = tx + sw + mm(40)
cw, ch = width_of("専門店", 116) + mm(56), mm(150)
d.rounded_rectangle([cx, mm(438), cx + cw, mm(438) + ch], radius=mm(12), fill=CYAN)
text((cx + cw / 2, mm(438) + ch / 2), "専門店", 116, WHITE, anchor="mm", bold=2)

# --- 区切りと、無料であること ---
d.rectangle([pad, mm(694), W - pad, mm(704)], fill=CYAN)
text((W / 2, mm(742)), "現地調査・お見積り 無料", 62, DEEP, anchor="ma", bold=1)
# 写真を撮って後から調べる人向け。遠くから読ませるつもりはない
text((W / 2, mm(824)), "tatsumi-tosou.com", 44, CYAN, anchor="ma")

# --- 下帯：社名と電話番号 ---
band_top = mm(880)
d.rectangle([mm(14), band_top, W - mm(14), H - mm(14)], fill=ACCENT)
by = (band_top + H - mm(14)) / 2
text((pad, by), "辰弥塗装工業", 78, WHITE, anchor="lm", bold=2)
text((W - pad, by), "☎ 080-7706-5395", 128, WHITE, anchor="rm", bold=3)

out = str(Path(__file__).with_name("tarumaku.png"))
img.save(out, "PNG", optimize=True)
print(out, img.size)
