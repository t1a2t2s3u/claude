"""施工事例の写真を、公開できる形に整える。

スマホで撮った写真をそのまま置くと2つの問題がある。

1. **位置情報が埋まっている。** 撮影地の緯度経度が EXIF に入る。工事現場は
   お客様の自宅なので、そのまま公開すると住所を晒すことになる。
2. **重すぎる。** 1枚3〜5MB あると、スマホ回線では表示が目に見えて遅くなる。
   表示速度は検索評価にも効く。

工事のたびに手作業でやると必ず忘れるので、コマンドにしてある。
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

# 施工事例の写真としてはこの幅で十分。これ以上大きくしても画面では見分けが
# つかず、読み込み時間だけ増える。
MAX_WIDTH = 1600

JPEG_QUALITY = 82

SUPPORTED = {".jpg", ".jpeg", ".png", ".heic", ".webp"}


@dataclass
class PreparedPhoto:
    source: Path
    destination: Path
    width: int
    height: int
    before_bytes: int
    after_bytes: int
    had_gps: bool


def has_gps(path: Path) -> bool:
    """EXIF に位置情報が入っているか。"""
    from PIL import Image

    try:
        exif = Image.open(path).getexif()
    except Exception:  # 画像として開けないものは対象外
        return False
    if not exif:
        return False
    # 0x8825 = GPSInfo
    return bool(exif.get_ifd(0x8825))


def prepare(source: Path, destination: Path, *, max_width: int = MAX_WIDTH) -> PreparedPhoto:
    """1枚を縮小し、EXIF を落として保存する。"""
    from PIL import Image, ImageOps

    before_bytes = source.stat().st_size
    gps = has_gps(source)

    image = Image.open(source)
    # 撮影時の向きを画素に反映してから EXIF を捨てる (捨てると向きの情報も
    # 消えるため、先に適用しないと横倒しになる)
    image = ImageOps.exif_transpose(image)
    image = image.convert("RGB")

    if image.width > max_width:
        height = round(image.height * max_width / image.width)
        image = image.resize((max_width, height), Image.LANCZOS)

    destination.parent.mkdir(parents=True, exist_ok=True)
    # 新しい画像として保存するので EXIF は引き継がれない
    image.save(destination, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)

    return PreparedPhoto(
        source=source,
        destination=destination,
        width=image.width,
        height=image.height,
        before_bytes=before_bytes,
        after_bytes=destination.stat().st_size,
        had_gps=gps,
    )


def prepare_all(sources: list[Path], out_dir: Path) -> list[PreparedPhoto]:
    """複数枚をまとめて処理する。出力は元のファイル名 + .jpg。"""
    results = []
    for source in sources:
        if source.suffix.lower() not in SUPPORTED:
            continue
        results.append(prepare(source, out_dir / f"{source.stem}.jpg"))
    return results


def find_photos_with_gps(root: Path) -> list[Path]:
    """``root`` 以下で位置情報が残っている画像を探す。"""
    found = []
    for path in sorted(root.rglob("*")):
        if path.suffix.lower() in {".jpg", ".jpeg"} and has_gps(path):
            found.append(path)
    return found
