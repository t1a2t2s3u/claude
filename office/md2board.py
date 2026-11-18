"""記事の Markdown を、ブログ記事ボードの <details> に入れる HTML に変換する。

使い方:
    python3 office/md2board.py seo/articles/drafts/<記事>.md > /tmp/body.html

出力した HTML を `office/blog-board.html` のカードの
`<div class="body-text">` の中に入れる。

**画像について**: 出力は `https://tatsumi-tosou.com/assets/...` の絶対URLになる。
ブログ記事ボード（Claude の artifact）は外部画像を読み込めないので、
**貼り付ける前に data: URI の縮小版に置き換えること**（640px・quality 72 程度）。
置き換えないと、ボード上で画像が表示されない。

2026-11-17: 作業用ディレクトリに置いていたらコンテナの再起動で消えたので、
リポジトリに移した（ブログライター）。
"""
import re
import sys
import html as H

SITE = "https://tatsumi-tosou.com"


def inline(t):
    t = H.escape(t)
    # **太字**{.marker} -> <mark><strong>
    t = re.sub(r'\*\*(.+?)\*\*\{\.marker\}', r'<mark><strong>\1</strong></mark>', t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)

    # 画像はリンクより先に処理する（![alt](url) が [alt](url) に食われるため）
    def image(m):
        alt, url = m.group(1), m.group(2)
        if url.startswith('/'):
            url = SITE + url
        return f'<img src="{url}" alt="{alt}" loading="lazy">'

    t = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', image, t)

    def link(m):
        label, url = m.group(1), m.group(2)
        if url.startswith('/'):
            url = SITE + url
        return f'<a href="{url}">{label}</a>'

    t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', link, t)
    t = re.sub(r'【要確認: ([^】]+)】', r'<span class="ng">【要確認: \1】</span>', t)
    return t


def convert(md):
    body = md.split('+++', 2)[2].strip()
    out, i = [], 0
    lines = body.split('\n')
    para, ul, ol, tbl = [], [], [], []

    def flush_para():
        if para:
            out.append('<p>' + inline(''.join(para).strip()) + '</p>')
            para.clear()

    def flush_ul():
        if ul:
            out.append('<ul>' + ''.join(f'<li>{inline(x)}</li>' for x in ul) + '</ul>')
            ul.clear()

    def flush_ol():
        if ol:
            out.append('<ol>' + ''.join(f'<li>{inline(x)}</li>' for x in ol) + '</ol>')
            ol.clear()

    def flush_tbl():
        if tbl:
            head = [c.strip() for c in tbl[0].strip('|').split('|')]
            rows = [[c.strip() for c in r.strip('|').split('|')] for r in tbl[2:]]
            t = '<div class="tbl"><table><thead><tr>'
            t += ''.join(f'<th>{inline(c)}</th>' for c in head)
            t += '</tr></thead><tbody>'
            for r in rows:
                t += '<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>'
            t += '</tbody></table></div>'
            out.append(t)
            tbl.clear()

    def flush_all():
        flush_para(); flush_ul(); flush_ol(); flush_tbl()

    while i < len(lines):
        ln = lines[i]
        s = ln.strip()
        if not s:
            flush_all()
        elif s.startswith('## '):
            flush_all(); out.append(f'<h4>{inline(s[3:])}</h4>')
        elif s.startswith('### '):
            flush_all(); out.append(f'<h5>{inline(s[4:])}</h5>')
        elif s.startswith('|'):
            flush_para(); flush_ul(); flush_ol(); tbl.append(s)
        elif re.match(r'^\d+\. ', s):
            flush_para(); flush_ul(); flush_tbl(); ol.append(re.sub(r'^\d+\. ', '', s))
        elif s.startswith('- '):
            flush_para(); flush_ol(); flush_tbl(); ul.append(s[2:])
        elif (ul or ol) and ln.startswith('  '):
            (ul or ol)[-1] += s
        else:
            flush_ul(); flush_ol(); flush_tbl(); para.append(s)
        i += 1
    flush_all()
    return '\n        '.join(out)


if __name__ == '__main__':
    print(convert(open(sys.argv[1], encoding='utf-8').read()))
