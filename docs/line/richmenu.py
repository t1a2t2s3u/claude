"""LINE リッチメニューの画像を作る。2500x1686 の6分割 (3列 x 2行)。

サイトと同じ配色で作る。ロゴの水色を基調に、いちばん押してほしい
「写真で見積り」だけオレンジにして視線を集める。
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 2500, 1686
COLS, ROWS = 3, 2
CW, CH = W // COLS, H // ROWS  # 833 x 843

BRAND_DEEP = (11, 74, 95)
ACCENT = (226, 102, 31)
WHITE = (255, 255, 255)
INK = (11, 74, 95)
LINE_GRAY = (222, 230, 234)

FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf"


def font(size):
    return ImageFont.truetype(FONT, size)


def centered(draw, box, text, fnt, fill, *, bold=0):
    left, top, right, bottom = box
    l, t, r, b = draw.textbbox((0, 0), text, font=fnt)
    x = left + (right - left - (r - l)) / 2 - l
    y = top + (bottom - top - (b - t)) / 2 - t
    draw.text((x, y), text, font=fnt, fill=fill,
              stroke_width=bold, stroke_fill=fill)


def cell_box(index):
    col, row = index % COLS, index // COLS
    return col * CW, row * CH, (col + 1) * CW, (row + 1) * CH


# --- アイコン。線は太めにしないと、スマホの実寸で消える ---

def icon_camera(d, cx, cy, s, color):
    w, h = s * 1.25, s * 0.9
    d.rounded_rectangle([cx - w / 2, cy - h / 2 + s * 0.06, cx + w / 2, cy + h / 2],
                        radius=s * 0.14, outline=color, width=int(s * 0.09))
    d.rounded_rectangle([cx - s * 0.28, cy - h / 2 - s * 0.12,
                         cx + s * 0.02, cy - h / 2 + s * 0.08],
                        radius=s * 0.06, fill=color)
    d.ellipse([cx - s * 0.27, cy - s * 0.24, cx + s * 0.27, cy + s * 0.3],
              outline=color, width=int(s * 0.09))


def icon_yen(d, cx, cy, s, color):
    r = s * 0.62
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=int(s * 0.09))
    f = font(int(s * 0.95))
    centered(d, (cx - r, cy - r, cx + r, cy + r), "¥", f, color, bold=int(s * 0.02))


def icon_house(d, cx, cy, s, color):
    w = s * 1.24
    top, eaves, base = cy - s * 0.6, cy - s * 0.04, cy + s * 0.58
    lw = int(s * 0.11)
    d.line([(cx - w / 2, eaves), (cx, top), (cx + w / 2, eaves)],
           fill=color, width=lw, joint="curve")
    d.rectangle([cx - w * 0.33, eaves, cx + w * 0.33, base],
                outline=color, width=lw)


def icon_phone(d, cx, cy, s, color):
    """受話器。弧の両端を膨らませた形を傾ける。

    棒の両端に丸を置くとダンベルにしか見えないので、弧で描く。
    """
    pad = int(s * 0.06)
    layer = Image.new("RGBA", (int(s * 2.4), int(s * 2.4)), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    m, rgba = s * 1.2, color + (255,)
    r, lw = s * 0.52, s * 0.2
    ld.arc([m - r, m - r, m + r, m + r], start=0, end=180,
           fill=rgba, width=int(lw))
    cap = s * 0.27
    for ex in (m - r, m + r):
        ld.ellipse([ex - cap, m - cap * 0.82, ex + cap, m + cap * 0.82], fill=rgba)
    layer = layer.rotate(-40, resample=Image.BICUBIC)
    d._image.paste(layer, (int(cx - s * 1.2), int(cy - s * 1.2) - pad), layer)


def icon_building(d, cx, cy, s, color):
    w, h = s * 0.95, s * 1.15
    d.rectangle([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2],
                outline=color, width=int(s * 0.09))
    step = w / 3.4
    for row in range(3):
        for col in range(2):
            x = cx - step * 0.62 + col * step * 1.24
            y = cy - h / 2 + s * 0.26 + row * step * 0.92
            d.rectangle([x - s * 0.1, y - s * 0.1, x + s * 0.1, y + s * 0.1], fill=color)


def icon_instagram(d, cx, cy, s, color):
    r = s * 0.62
    d.rounded_rectangle([cx - r, cy - r, cx + r, cy + r],
                        radius=s * 0.28, outline=color, width=int(s * 0.09))
    d.ellipse([cx - s * 0.28, cy - s * 0.28, cx + s * 0.28, cy + s * 0.28],
              outline=color, width=int(s * 0.09))
    d.ellipse([cx + s * 0.26, cy - s * 0.44, cx + s * 0.4, cy - s * 0.3], fill=color)


CELLS = [
    # (背景, 文字色, アイコン, 見出し, 補足)
    (ACCENT, WHITE, icon_camera, "写真で見積り", "送るだけで概算"),
    (BRAND_DEEP, WHITE, icon_yen, "料金を見る", "パック料金"),
    (BRAND_DEEP, WHITE, icon_house, "施工事例", "before / after"),
    (WHITE, INK, icon_phone, "電話する", "080-7706-5395"),
    (WHITE, INK, icon_building, "会社について", "辰弥塗装工業"),
    (WHITE, INK, icon_instagram, "Instagram", "現場の様子"),
]

img = Image.new("RGB", (W, H), WHITE)
d = ImageDraw.Draw(img)
d._image = img

title_f = font(78)
sub_f = font(46)

for i, (bg, fg, icon, title, sub) in enumerate(CELLS):
    x0, y0, x1, y1 = cell_box(i)
    d.rectangle([x0, y0, x1, y1], fill=bg)
    icon(d, (x0 + x1) / 2, y0 + CH * 0.36, 120, fg)
    centered(d, (x0, y0 + CH * 0.60, x1, y0 + CH * 0.74), title, title_f, fg, bold=1)
    centered(d, (x0, y0 + CH * 0.76, x1, y0 + CH * 0.88), sub, sub_f, fg)

# 白いセル同士の境目。背景が白なので線がないと区切りが見えない
for col in range(1, COLS):
    d.line([(col * CW, CH), (col * CW, H)], fill=LINE_GRAY, width=4)
d.line([(0, CH), (W, CH)], fill=LINE_GRAY, width=4)

out = str(Path(__file__).with_name("richmenu.png"))
img.save(out, "PNG", optimize=True)
print(out, img.size)
