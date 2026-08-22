"""写真の下ごしらえ。

工事現場はお客様の自宅なので、写真に位置情報が残ったまま公開すると
住所を晒すことになる。ここは毎回確実に落ちる必要がある。
"""

from pathlib import Path

import pytest

from seo_meo.site import photos

SITE_ROOT = Path(__file__).resolve().parents[1] / "site"


def make_photo(path: Path, size=(4000, 3000), with_gps: bool = False) -> Path:
    from PIL import Image

    image = Image.new("RGB", size, (120, 140, 160))
    if with_gps:
        exif = Image.Exif()
        # 秋田市あたりの座標。工事現場で撮った写真に入るのと同じ形
        exif[0x8825] = {
            1: "N",
            2: (39.0, 43.0, 0.0),
            3: "E",
            4: (140.0, 6.0, 0.0),
        }
        image.save(path, "JPEG", exif=exif)
    else:
        image.save(path, "JPEG")
    return path


def test_gps_is_detected(tmp_path):
    assert photos.has_gps(make_photo(tmp_path / "gps.jpg", with_gps=True))
    assert not photos.has_gps(make_photo(tmp_path / "clean.jpg"))


def test_prepare_strips_location_data(tmp_path):
    source = make_photo(tmp_path / "src.jpg", with_gps=True)
    result = photos.prepare(source, tmp_path / "out" / "dest.jpg")

    assert result.had_gps is True
    assert not photos.has_gps(result.destination)


def test_prepare_shrinks_large_photos(tmp_path):
    source = make_photo(tmp_path / "src.jpg", size=(4032, 3024))
    result = photos.prepare(source, tmp_path / "dest.jpg")

    assert result.width == photos.MAX_WIDTH
    assert result.height == 1200  # 4:3 が保たれている
    assert result.after_bytes < result.before_bytes


def test_prepare_leaves_small_photos_at_their_size(tmp_path):
    source = make_photo(tmp_path / "src.jpg", size=(800, 600))
    result = photos.prepare(source, tmp_path / "dest.jpg")
    assert (result.width, result.height) == (800, 600)


def test_prepare_all_skips_unsupported_files(tmp_path):
    make_photo(tmp_path / "a.jpg")
    (tmp_path / "notes.txt").write_text("画像ではない", encoding="utf-8")

    results = photos.prepare_all(sorted(tmp_path.iterdir()), tmp_path / "out")
    assert [r.destination.name for r in results] == ["a.jpg"]


def test_find_photos_with_gps_searches_subdirectories(tmp_path):
    make_photo(tmp_path / "clean.jpg")
    nested = tmp_path / "works"
    nested.mkdir()
    make_photo(nested / "bad.jpg", with_gps=True)

    found = photos.find_photos_with_gps(tmp_path)
    assert [path.name for path in found] == ["bad.jpg"]


def test_no_published_photo_carries_location_data():
    """実際に公開する画像に位置情報が残っていないこと。

    施工事例は工事のたびに増える。写真を足したときに消し忘れると
    お客様の住所が公開されるので、テストで毎回確かめる。
    """
    leaking = photos.find_photos_with_gps(SITE_ROOT)
    assert leaking == [], f"位置情報が残っています: {leaking}"
