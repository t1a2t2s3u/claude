"""現場看板（足場用メッシュ幕）のデザイン案。3000mm × 900mm を想定。

道路を歩いて通る人が3秒で読み終える量に絞る。文字を詰めると
遠くからは何も読めない。載せるのは「何の工事か」「誰がやっているか」
「どこに連絡するか」の3つだけ。
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

MM = 1.2                      # 1mm あたりのピクセル数
W, H = int(3000 * MM), int(900 * MM)

ROOT = Path(__file__).resolve().parents[2]
LOGO = ROOT / "site" / "assets" / "logo.png"
QR = ROOT / "site" / "assets" / "line-qr.png"
FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf"

DEEP = (11, 74, 95)
ACCENT = (226, 102, 31)
WHITE = (255, 255, 255)
PALE = (198, 226, 235)

BAND = int(H * 0.30)          # 下のオレンジ帯


def font(size):
    return ImageFont.truetype(FONT, size)


def text(d, xy, s, fnt, fill, anchor="la", bold=0):
    d.text(xy, s, font=fnt, fill=fill, anchor=anchor,
           stroke_width=bold, stroke_fill=fill)


img = Image.new("RGB", (W, H), DEEP)
d = ImageDraw.Draw(img)
d.rectangle([0, H - BAND, W, H], fill=ACCENT)

pad = int(70 * MM)

# --- ロゴ（白抜き）。看板では色より形で認識されるので大きめに置く ---
logo = Image.open(LOGO).convert("RGBA")
lw = int(520 * MM)
logo = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
white_logo = Image.new("RGBA", logo.size, (255, 255, 255, 0))
white_logo.putalpha(logo.getchannel("A"))
img.paste(white_logo, (pad, int(120 * MM)), white_logo)

text(d, (pad, int(420 * MM)), "秋田市・潟上市の", font(int(44 * MM)), PALE)
text(d, (pad, int(486 * MM)), "外壁・屋根塗装", font(int(44 * MM)), PALE)

# --- 主文。ここだけ遠くから読めればよい ---
main_x = int(830 * MM)
text(d, (main_x, int(96 * MM)), "外壁・屋根塗装", font(int(126 * MM)), WHITE, bold=2)
text(d, (main_x, int(250 * MM)), "施工中", font(int(186 * MM)), WHITE, bold=3)
# ご近所に向けた一文。看板を見た人が問い合わせる理由になるのはここ
text(d, (main_x, int(500 * MM)), "同じ工事のご相談も承っております",
     font(int(48 * MM)), PALE)

# --- QR。近くまで来た人だけが使うので小さくてよい ---
qr_side = int(230 * MM)
qr = Image.open(QR).convert("RGB").resize((qr_side, qr_side), Image.LANCZOS)
card = int(28 * MM)
qx = W - pad - qr_side - card * 2
qy = int(84 * MM)
d.rounded_rectangle([qx, qy, qx + qr_side + card * 2, qy + qr_side + card * 2 + int(46 * MM)],
                    radius=int(16 * MM), fill=WHITE)
img.paste(qr, (qx + card, qy + card))
text(d, (qx + card + qr_side // 2, qy + card + qr_side + int(10 * MM)),
     "LINEで相談", font(int(34 * MM)), DEEP, anchor="ma")

# --- 下帯：連絡先 ---
by = H - BAND + BAND // 2
text(d, (pad, by), "辰弥塗装工業", font(int(64 * MM)), WHITE, anchor="lm", bold=1)
text(d, (int(1120 * MM), by), "☎ 080-7706-5395", font(int(86 * MM)), WHITE,
     anchor="lm", bold=2)
text(d, (W - pad, by), "現地調査・お見積り無料 ／ tatsumi-tosou.com",
     font(int(40 * MM)), WHITE, anchor="rm")

out = str(Path(__file__).with_name("kanban.png"))
img.save(out, "PNG", optimize=True)
print(out, img.size)
