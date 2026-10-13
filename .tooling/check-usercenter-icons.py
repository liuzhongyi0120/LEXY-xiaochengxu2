# -*- coding: utf-8 -*-
"""
自证：包内 95 张个人中心 PNG 是不是**有赞字体对应字形的位级重渲染**。

做法：用与 `make-usercenter-icons.py` **完全相同的算法**，从有赞字体
（`.tooling/_yz-font/_yz-mc-icons.ttf`）+ 装修台 CSS 里的码点表重新渲染一遍，
然后与 `miniprogram/images/usercenter/*.png` 做 `ImageChops.difference`：
`getbbox()` 为 None 即「逐像素完全相同」。

为什么值得单跑一次（而不是只靠肉眼看对照图）：
  「先渲染对不对」这件事**肉眼是验不出来的** —— 差一两个像素、抗锯齿差一档，
  并排看一模一样。这条检查把 95 张全部钉到像素级，且顺带回答两个问题：
    · CSS 里的图标规则数（95）与包内文件数是否一一对应（无多、无漏）；
    · 有没有哪个码点在字体里其实没有字形（会被 FreeType 画成 .notdef 空心框）。

用法（需要 Pillow；本机可用 .workbuddy 的 venv 或 Python 3.11 自带的 Pillow）：
    <python> .tooling/check-usercenter-icons.py     # 退出码 0 = 95/95 位级一致
"""
import json
import os
import re
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, '.tooling', '_yz-font', '_yz-mc-icons.ttf')
CSS = os.path.join(ROOT, '.tooling', '_yzmc', 'decorate-usercenter.css')
OUT = os.path.join(ROOT, 'miniprogram', 'images', 'usercenter')

SIZE, FONT_PX, EM_RATIO = 66, 264, 0.86
INK = (0x33, 0x33, 0x33, 255)


CP_JSON = os.path.join(ROOT, '.tooling', '_yz-usercenter-icons.json')


def load_codepoints():
    """优先读入库的码点表（2.7KB）；拿不到再回落到解析原始样式表（约 1MB，不入库）。"""
    if os.path.exists(CP_JSON):
        j = json.load(open(CP_JSON, encoding='utf-8'))
        return {'if_' + k: int(v, 16) for k, v in j['icons'].items()}
    return parse_css()


def parse_css():
    """按规则块切分（合并选择器 `.if_a:before,.if_b:before{…}` 会让「紧跟 {」的正则漏项）。"""
    s = open(CSS, encoding='utf-8').read()
    seen = {}
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', s):
        cm = re.search(r'content\s*:\s*"([^"]*)"', m.group(2))
        if not cm or not cm.group(1):
            continue
        cp = ord(cm.group(1)[0])
        if not (0xE000 <= cp <= 0xF8FF):
            continue
        for sm in re.finditer(r'\.(if_[\w-]+):before', m.group(1)):
            seen.setdefault(sm.group(1), cp)
    return seen


def main():
    cps = load_codepoints()
    font = ImageFont.truetype(FONT, FONT_PX)
    scale = (SIZE * EM_RATIO) / FONT_PX

    def render(cp):
        src = Image.new('L', (FONT_PX * 3, FONT_PX * 3), 0)
        ImageDraw.Draw(src).text((FONT_PX, FONT_PX), chr(cp), font=font, fill=255, anchor='lt')
        bb = src.getbbox()
        if not bb:
            return None
        g = src.crop(bb)
        w, h = max(1, int(round(g.width * scale))), max(1, int(round(g.height * scale)))
        g = g.resize((w, h), Image.LANCZOS)
        if w > SIZE or h > SIZE:
            k = min(SIZE / w, SIZE / h)
            w, h = max(1, int(w * k)), max(1, int(h * k))
            g = g.resize((w, h), Image.LANCZOS)
        c = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
        solid = Image.new('RGBA', (w, h), INK)
        solid.putalpha(g)
        c.paste(solid, ((SIZE - w) // 2, (SIZE - h) // 2), solid)
        return c

    files = sorted(f for f in os.listdir(OUT) if f.endswith('.png'))
    same, bad, nogn = 0, [], []
    for fn in files:
        name = fn[:-4]
        cp = cps.get('if_' + name)
        if cp is None:
            nogn.append(name)
            continue
        a = Image.open(os.path.join(OUT, fn)).convert('RGBA')
        b = render(cp)
        diff = ImageChops.difference(a, b)
        if diff.getbbox() is None:
            same += 1
        else:
            bad.append((name, sum(1 for p in diff.getdata() if p != (0, 0, 0, 0))))

    print('CSS 里的图标规则：%d 条｜包内 PNG：%d 张' % (len(cps), len(files)))
    print('逐像素完全相同：%d 个' % same)
    print('有差异：%d 个 %s' % (len(bad), bad[:10]))
    print('CSS 里找不到对应字形：%d 个 %s' % (len(nogn), nogn[:10]))
    ok = (not bad) and (not nogn) and same == len(files) == len(cps)
    print('\n结论：' + ('✓ 95 张全部是有赞字形的位级重渲染，且与 CSS 规则一一对应'
                     if ok else '✗ 存在差异，需复查'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
