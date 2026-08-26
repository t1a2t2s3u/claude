from datetime import date

import pytest

from seo_meo.site import content as c


def test_split_front_matter():
    front, body = c.split_front_matter(
        '+++\ntitle = "外壁塗装"\ndate = 2026-04-15\n+++\n\n本文です。\n'
    )
    assert front["title"] == "外壁塗装"
    assert front["date"] == date(2026, 4, 15)
    assert body.strip() == "本文です。"


def test_split_front_matter_absent():
    front, body = c.split_front_matter("フロントマターなしの本文")
    assert front == {}
    assert body == "フロントマターなしの本文"


def test_split_front_matter_unclosed_is_an_error():
    with pytest.raises(c.ContentError, match="閉じられていません"):
        c.split_front_matter('+++\ntitle = "x"\n\n本文')


def test_split_front_matter_invalid_toml_is_an_error():
    with pytest.raises(c.ContentError, match="TOML"):
        c.split_front_matter("+++\ntitle = これは不正\n+++\n本文")


def test_placeholder_detection():
    assert c.is_placeholder(f"{c.PLACEHOLDER}000-0000")
    assert not c.is_placeholder("06-1234-5678")
    assert not c.is_placeholder(None)
    assert not c.is_placeholder(12345)


def write_site(tmp_path, *, company_extra="", work_body="施工しました。"):
    (tmp_path / "works").mkdir()
    (tmp_path / "posts").mkdir()
    (tmp_path / "pages").mkdir()
    (tmp_path / "site.toml").write_text(
        '[site]\nname = "辰弥塗装工業"\nbase_url = "https://example.jp/"\n'
        'description = "説明"\n',
        encoding="utf-8",
    )
    (tmp_path / "company.toml").write_text(
        '[company]\nname = "辰弥塗装工業"\nphone = "06-1234-5678"\n'
        'postal_code = "000-0000"\nprefecture = "〇〇県"\ncity = "〇〇市"\n'
        'street_address = "〇〇町1-2-3"\nareas = ["〇〇市"]\n' + company_extra,
        encoding="utf-8",
    )
    (tmp_path / "services.toml").write_text(
        '[[service]]\nslug = "gaiheki"\nname = "外壁塗装"\nsummary = "概要"\n'
        'price_from = "80万円〜"\nprice_note = "注記"\nduration = "12日"\n'
        'features = ["3回塗り"]\nbody = "**下塗り**が要ります。"\n',
        encoding="utf-8",
    )
    (tmp_path / "works" / "2026-04-a.md").write_text(
        f'+++\ntitle = "K様邸"\ndate = 2026-04-15\narea = "〇〇市"\n'
        f'service = "外壁塗装"\n+++\n\n{work_body}\n',
        encoding="utf-8",
    )
    (tmp_path / "works" / "2026-06-b.md").write_text(
        '+++\ntitle = "S様邸"\ndate = 2026-06-01\narea = "〇〇市"\n'
        'service = "屋根塗装"\n+++\n\n施工しました。\n',
        encoding="utf-8",
    )
    (tmp_path / "posts" / "2026-05-p.md").write_text(
        '+++\ntitle = "記事"\ndate = 2026-05-12\ntags = ["費用"]\n+++\n\n本文です。\n',
        encoding="utf-8",
    )
    (tmp_path / "pages" / "about.md").write_text(
        '+++\ntitle = "会社概要"\n+++\n\n会社の説明。\n', encoding="utf-8"
    )
    return tmp_path


def test_load_reads_everything(tmp_path):
    content = c.load(write_site(tmp_path))

    assert content.company.name == "辰弥塗装工業"
    assert content.settings.site_name == "辰弥塗装工業"
    assert len(content.services) == 1
    assert len(content.works) == 2
    assert len(content.posts) == 1
    assert content.page("about").title == "会社概要"


def test_works_and_posts_are_newest_first(tmp_path):
    content = c.load(write_site(tmp_path))
    assert [w.slug for w in content.works] == ["2026-06-b", "2026-04-a"]


def test_markdown_is_rendered(tmp_path):
    content = c.load(write_site(tmp_path, work_body="**強調**された文章。"))
    assert "<strong>強調</strong>" in content.works[-1].body_html
    assert "<strong>下塗り</strong>" in content.services[0].body_html


def test_summary_falls_back_to_body_text(tmp_path):
    content = c.load(write_site(tmp_path, work_body="下地補修から行いました。"))
    summary = content.works[-1].summary
    assert "下地補修から行いました。" in summary
    assert "<" not in summary  # タグは落ちている


def test_urls(tmp_path):
    content = c.load(write_site(tmp_path))
    assert content.works[0].url == "/works/2026-06-b/"
    assert content.posts[0].url == "/blog/2026-05-p/"
    assert content.page("about").url == "/about/"


def test_company_address_and_tel_link(tmp_path):
    company = c.load(write_site(tmp_path)).company
    assert company.full_address == "〒000-0000 〇〇県〇〇市〇〇町1-2-3"
    assert company.tel_link == "0612345678"


def test_canonical_base_strips_trailing_slash(tmp_path):
    settings = c.load(write_site(tmp_path)).settings
    assert settings.canonical_base == "https://example.jp"


def test_find_placeholders_reports_unfilled_fields(tmp_path):
    root = write_site(tmp_path, company_extra=f'representative = "{c.PLACEHOLDER}氏名"\n')
    found = c.find_placeholders(c.load(root))
    assert any("representative" in item for item in found)


def test_find_placeholders_checks_list_items(tmp_path):
    root = write_site(tmp_path)
    (root / "company.toml").write_text(
        (root / "company.toml").read_text(encoding="utf-8").replace(
            'areas = ["〇〇市"]', f'areas = ["〇〇市", "{c.PLACEHOLDER}〇〇町"]'
        ),
        encoding="utf-8",
    )
    found = c.find_placeholders(c.load(root))
    assert any("areas[1]" in item for item in found)


def test_find_placeholders_checks_markdown_bodies(tmp_path):
    root = write_site(tmp_path, work_body=f"{c.PLACEHOLDER}ここに工事内容")
    found = c.find_placeholders(c.load(root))
    assert any("2026-04-a" in item for item in found)


def test_clean_site_has_no_placeholders(tmp_path):
    assert c.find_placeholders(c.load(write_site(tmp_path))) == []


def test_missing_date_is_a_clear_error(tmp_path):
    root = write_site(tmp_path)
    (root / "posts" / "bad.md").write_text('+++\ntitle = "x"\n+++\n本文', encoding="utf-8")
    with pytest.raises(c.ContentError, match="date"):
        c.load(root)


def test_missing_file_is_a_clear_error(tmp_path):
    with pytest.raises(c.ContentError, match="見つかりません"):
        c.load(tmp_path)


def test_trust_points_are_loaded(tmp_path):
    root = write_site(tmp_path, company_extra='trust_points = ["お見積り無料", "地域密着"]\n')
    assert c.load(root).company.trust_points == ["お見積り無料", "地域密着"]


def test_unfilled_trust_points_are_reported(tmp_path):
    root = write_site(
        tmp_path, company_extra=f'trust_points = ["{c.PLACEHOLDER}実績"]\n'
    )
    found = c.find_placeholders(c.load(root))
    assert any("trust_points[0]" in item for item in found)


def test_testimonials_are_loaded_from_the_repository(tmp_path):
    root = write_site(tmp_path)
    (root / "testimonials.toml").write_text(
        '[[testimonial]]\nheadline = "丁寧でした"\nbody = "満足しています。"\n',
        encoding="utf-8",
    )
    voices = c.load(root).testimonials
    assert len(voices) == 1
    assert voices[0].headline == "丁寧でした"


def test_testimonials_are_optional(tmp_path):
    assert c.load(write_site(tmp_path)).testimonials == []


def test_placeholder_testimonials_are_reported(tmp_path):
    root = write_site(tmp_path)
    (root / "testimonials.toml").write_text(
        f'[[testimonial]]\nheadline = "{c.PLACEHOLDER}見出し"\nbody = "本文"\n',
        encoding="utf-8",
    )
    assert any("testimonials.toml" in item for item in c.find_placeholders(c.load(root)))


def test_faq_is_loaded_from_the_repository(tmp_path):
    root = write_site(tmp_path)
    (root / "faq.toml").write_text(
        '[[faq]]\nquestion = "無料ですか？"\nanswer = """\n無料です。\n\n断っても構いません。\n"""\n',
        encoding="utf-8",
    )
    faq = c.load(root).faq
    assert len(faq) == 1
    assert faq[0].question == "無料ですか？"
    assert faq[0].paragraphs == ["無料です。", "断っても構いません。"]


def test_faq_is_optional(tmp_path):
    assert c.load(write_site(tmp_path)).faq == []


def test_placeholder_faq_is_reported(tmp_path):
    root = write_site(tmp_path)
    (root / "faq.toml").write_text(
        f'[[faq]]\nquestion = "{c.PLACEHOLDER}質問"\nanswer = "答え"\n',
        encoding="utf-8",
    )
    assert any("faq.toml" in item for item in c.find_placeholders(c.load(root)))


def test_multiple_before_after_pairs(tmp_path):
    """屋根と外壁で1組ずつ、のような複数組を扱えること。"""
    root = write_site(tmp_path)
    (root / "works" / "2026-07-c.md").write_text(
        '+++\ntitle = "C様邸"\ndate = 2026-07-01\narea = "秋田市"\n'
        'service = "外壁塗装"\n'
        '[[pair]]\nlabel = "屋根"\nbefore = "works/c-y-b.jpg"\nafter = "works/c-y-a.jpg"\n'
        '[[pair]]\nlabel = "外壁"\nbefore = "works/c-g-b.jpg"\nafter = "works/c-g-a.jpg"\n'
        "+++\n\n施工しました。\n",
        encoding="utf-8",
    )
    work = next(w for w in c.load(root).works if w.slug == "2026-07-c")

    assert [pair.label for pair in work.pairs] == ["屋根", "外壁"]
    assert work.cover_image == "works/c-y-a.jpg"
    assert len(work.all_images) == 4


def test_single_pair_short_form_still_works(tmp_path):
    """組が1つだけなら before_image / after_image の短い書き方も使える。"""
    root = write_site(tmp_path)
    (root / "works" / "2026-07-d.md").write_text(
        '+++\ntitle = "D様邸"\ndate = 2026-07-02\narea = "秋田市"\n'
        'service = "外壁塗装"\nbefore_image = "works/d-b.jpg"\nafter_image = "works/d-a.jpg"\n'
        "+++\n\n施工しました。\n",
        encoding="utf-8",
    )
    work = next(w for w in c.load(root).works if w.slug == "2026-07-d")

    assert len(work.pairs) == 1
    assert work.pairs[0].label == ""
    assert work.cover_image == "works/d-a.jpg"


def test_work_without_photos_has_no_cover(tmp_path):
    work = c.load(write_site(tmp_path)).works[0]
    assert work.pairs == []
    assert work.cover_image == ""
